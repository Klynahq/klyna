<?php
/**
 * Front-end rendering — shortcode + Gutenberg block + the HTML form markup.
 *
 * One renderer powers both surfaces:
 *  - `[klyna_form id="123"]`
 *  - the `klyna/form` dynamic block (server-rendered via this same method).
 *
 * The markup carries the anti-spam fields (honeypot + render timestamp) and a
 * nonce. Submission is handled by the Submission class over REST; the form also
 * degrades to a normal POST when JavaScript is unavailable.
 *
 * @package KlynaForms
 */

namespace KlynaForms;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Render {

	/**
	 * Honeypot field name. A real human never fills this; bots fill everything.
	 */
	public const HONEYPOT = 'klyna_hp_url';

	/**
	 * Render-timestamp field name for the time-trap.
	 */
	public const TIMESTAMP = 'klyna_rendered_at';

	public function register(): void {
		add_action( 'init', array( $this, 'register_shortcode' ) );
		add_action( 'init', array( $this, 'register_block' ) );
		add_action( 'wp_enqueue_scripts', array( $this, 'register_assets' ) );
	}

	public function register_shortcode(): void {
		add_shortcode( 'klyna_form', array( $this, 'shortcode' ) );
	}

	public function register_block(): void {
		// Editor script that registers the block in JS.
		wp_register_script(
			'klyna-forms-block',
			KLYNA_FORMS_PLUGIN_URL . 'assets/js/block.js',
			array( 'wp-blocks', 'wp-element', 'wp-block-editor', 'wp-components', 'wp-data', 'wp-i18n' ),
			KLYNA_FORMS_VERSION,
			true
		);

		register_block_type(
			'klyna/form',
			array(
				'api_version'     => 2,
				'editor_script'   => 'klyna-forms-block',
				'render_callback' => array( $this, 'render_block' ),
				'attributes'      => array(
					'formId' => array(
						'type'    => 'integer',
						'default' => 0,
					),
				),
			)
		);
	}

	/**
	 * Register (but do not force-enqueue) the front-end CSS/JS. We enqueue on
	 * demand the first time a form renders so pages without a form stay clean.
	 */
	public function register_assets(): void {
		wp_register_style(
			'klyna-forms',
			KLYNA_FORMS_PLUGIN_URL . 'assets/css/forms.css',
			array(),
			KLYNA_FORMS_VERSION
		);
		wp_register_script(
			'klyna-forms',
			KLYNA_FORMS_PLUGIN_URL . 'assets/js/forms.js',
			array(),
			KLYNA_FORMS_VERSION,
			true
		);
		wp_localize_script(
			'klyna-forms',
			'KlynaForms',
			array(
				'endpoint' => esc_url_raw( rest_url( 'klyna-forms/v1/submit' ) ),
				'nonce'    => wp_create_nonce( 'wp_rest' ),
				'i18n'     => array(
					'sending' => __( 'Sending…', 'wp-forms' ),
					'error'   => __( 'Something went wrong. Please try again.', 'wp-forms' ),
				),
			)
		);
	}

	/**
	 * Shortcode handler.
	 *
	 * @param array<string,mixed>|string $atts Shortcode attributes.
	 */
	public function shortcode( $atts ): string {
		$atts    = shortcode_atts( array( 'id' => 0 ), $atts, 'klyna_form' );
		$form_id = (int) $atts['id'];
		return $this->render_form( $form_id );
	}

	/**
	 * Dynamic block render callback.
	 *
	 * @param array<string,mixed> $attributes Block attributes.
	 */
	public function render_block( array $attributes ): string {
		$form_id = (int) ( $attributes['formId'] ?? 0 );
		return $this->render_form( $form_id );
	}

	/**
	 * Build the complete form HTML for a given form ID.
	 */
	public function render_form( int $form_id ): string {
		$post = $form_id ? get_post( $form_id ) : null;
		if ( ! $post || KLYNA_FORMS_POST_TYPE !== $post->post_type || 'publish' !== $post->post_status ) {
			if ( current_user_can( 'edit_posts' ) ) {
				return '<p class="klyna-form-error">' . esc_html__( 'Klyna Forms: form not found or not published.', 'wp-forms' ) . '</p>';
			}
			return '';
		}

		$fields = Forms::get_fields( $form_id );
		$config = Forms::get_config( $form_id );

		// On-demand asset enqueue.
		wp_enqueue_style( 'klyna-forms' );
		wp_enqueue_script( 'klyna-forms' );

		$form_uid = 'klyna-form-' . $form_id . '-' . wp_rand( 1000, 9999 );

		ob_start();
		?>
		<form class="klyna-form" id="<?php echo esc_attr( $form_uid ); ?>" data-form-id="<?php echo esc_attr( (string) $form_id ); ?>" method="post" novalidate>
			<div class="klyna-form__status" role="status" aria-live="polite" hidden></div>
			<input type="hidden" name="form_id" value="<?php echo esc_attr( (string) $form_id ); ?>">
			<input type="hidden" name="<?php echo esc_attr( self::TIMESTAMP ); ?>" value="<?php echo esc_attr( (string) time() ); ?>">
			<?php wp_nonce_field( 'klyna_form_submit_' . $form_id, '_klyna_nonce' ); ?>

			<?php // Honeypot: visually hidden, off-screen, not display:none (some bots skip those). ?>
			<div class="klyna-form__hp" aria-hidden="true">
				<label><?php esc_html_e( 'Leave this field empty', 'wp-forms' ); ?>
					<input type="text" name="<?php echo esc_attr( self::HONEYPOT ); ?>" tabindex="-1" autocomplete="off" value="">
				</label>
			</div>

			<?php
			foreach ( $fields as $field ) {
				echo $this->render_field( $field, $form_uid ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- render_field escapes internally.
			}
			?>

			<div class="klyna-form__actions">
				<button type="submit" class="klyna-form__submit"><?php echo esc_html( $config['submit_label'] ); ?></button>
			</div>
		</form>
		<?php
		return (string) ob_get_clean();
	}

	/**
	 * Render a single field row. Always escapes its own output.
	 *
	 * @param array<string,mixed> $field    Normalized field definition.
	 * @param string              $form_uid Unique form id for label/input pairing.
	 */
	private function render_field( array $field, string $form_uid ): string {
		$key      = (string) $field['key'];
		$type     = (string) $field['type'];
		$label    = (string) $field['label'];
		$required = ! empty( $field['required'] );
		$ph       = (string) ( $field['placeholder'] ?? '' );
		$id       = $form_uid . '-' . $key;
		$name     = 'fields[' . $key . ']';
		$req_attr = $required ? ' required' : '';
		$req_mark = $required ? ' <span class="klyna-form__req" aria-hidden="true">*</span>' : '';

		ob_start();
		?>
		<div class="klyna-form__field klyna-form__field--<?php echo esc_attr( $type ); ?>">
			<?php if ( 'checkbox' === $type && empty( $field['options'] ) ) : ?>
				<?php // Single boolean checkbox (consent-style). ?>
				<label class="klyna-form__check" for="<?php echo esc_attr( $id ); ?>">
					<input type="checkbox" id="<?php echo esc_attr( $id ); ?>" name="<?php echo esc_attr( $name ); ?>" value="1"<?php echo $req_attr; // phpcs:ignore ?>>
					<span><?php echo esc_html( $label ); ?><?php echo wp_kses_post( $req_mark ); ?></span>
				</label>
			<?php else : ?>
				<label class="klyna-form__label" for="<?php echo esc_attr( $id ); ?>"><?php echo esc_html( $label ); ?><?php echo wp_kses_post( $req_mark ); ?></label>
				<?php echo $this->render_control( $field, $id, $name, $ph, $req_attr ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escapes internally. ?>
			<?php endif; ?>
		</div>
		<?php
		return (string) ob_get_clean();
	}

	/**
	 * Render the input control for a field (everything except the single checkbox).
	 *
	 * @param array<string,mixed> $field    Normalized field definition.
	 * @param string              $id       Input id.
	 * @param string              $name     Input name.
	 * @param string              $ph       Placeholder.
	 * @param string              $req_attr ' required' or ''.
	 */
	private function render_control( array $field, string $id, string $name, string $ph, string $req_attr ): string {
		$type    = (string) $field['type'];
		$options = is_array( $field['options'] ?? null ) ? $field['options'] : array();

		ob_start();
		switch ( $type ) {
			case 'textarea':
				printf(
					'<textarea id="%1$s" name="%2$s" rows="5" placeholder="%3$s"%4$s></textarea>',
					esc_attr( $id ),
					esc_attr( $name ),
					esc_attr( $ph ),
					$req_attr // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- literal ' required'.
				);
				break;

			case 'select':
				printf( '<select id="%1$s" name="%2$s"%3$s>', esc_attr( $id ), esc_attr( $name ), $req_attr ); // phpcs:ignore
				echo '<option value="">' . esc_html__( 'Select…', 'wp-forms' ) . '</option>';
				foreach ( $options as $opt ) {
					printf( '<option value="%1$s">%1$s</option>', esc_attr( $opt ) );
				}
				echo '</select>';
				break;

			case 'radio':
				echo '<div class="klyna-form__options" role="radiogroup">';
				foreach ( $options as $i => $opt ) {
					$opt_id = $id . '-' . $i;
					printf(
						'<label class="klyna-form__check" for="%1$s"><input type="radio" id="%1$s" name="%2$s" value="%3$s"%4$s> <span>%3$s</span></label>',
						esc_attr( $opt_id ),
						esc_attr( $name ),
						esc_attr( $opt ),
						0 === $i ? $req_attr : '' // phpcs:ignore
					);
				}
				echo '</div>';
				break;

			case 'checkbox':
				// Multi-checkbox group (collects an array).
				echo '<div class="klyna-form__options">';
				foreach ( $options as $i => $opt ) {
					$opt_id = $id . '-' . $i;
					printf(
						'<label class="klyna-form__check" for="%1$s"><input type="checkbox" id="%1$s" name="%2$s[]" value="%3$s"> <span>%3$s</span></label>',
						esc_attr( $opt_id ),
						esc_attr( $name ),
						esc_attr( $opt )
					);
				}
				echo '</div>';
				break;

			default:
				// text | email | tel | url | number.
				printf(
					'<input type="%1$s" id="%2$s" name="%3$s" placeholder="%4$s"%5$s>',
					esc_attr( $type ),
					esc_attr( $id ),
					esc_attr( $name ),
					esc_attr( $ph ),
					$req_attr // phpcs:ignore
				);
				break;
		}
		return (string) ob_get_clean();
	}
}
