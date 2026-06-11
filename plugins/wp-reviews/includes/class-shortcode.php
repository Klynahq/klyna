<?php
/**
 * Front-end shortcodes (+ a server-rendered block).
 *
 *   [klyna_reviews target="site" form="true" limit="10"]
 *     Renders the star aggregate, the approved review list, and (optionally)
 *     the submission form.
 *
 *   [klyna_review_form target="site"]
 *     Renders just the submission form.
 *
 *   [klyna_review_stars target="site"]
 *     Renders just the aggregate star badge (great for headers / sidebars).
 *
 * All markup is escaped on output. The form posts to the REST endpoint via the
 * front-end script with a nonce + honeypot; no page reload, no jQuery.
 *
 * @package KlynaReviews
 */

namespace KlynaReviews;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Shortcode {

	private Reviews $reviews;

	public function __construct() {
		$this->reviews = new Reviews();
	}

	public function register(): void {
		add_action( 'init', array( $this, 'register_shortcodes' ) );
		add_action( 'init', array( $this, 'register_block' ) );
		add_action( 'wp_enqueue_scripts', array( $this, 'register_assets' ) );
	}

	public function register_shortcodes(): void {
		add_shortcode( 'klyna_reviews', array( $this, 'render_reviews' ) );
		add_shortcode( 'klyna_review_form', array( $this, 'render_form_shortcode' ) );
		add_shortcode( 'klyna_review_stars', array( $this, 'render_stars_shortcode' ) );
	}

	/**
	 * Register a thin server-rendered block that reuses the shortcode renderer.
	 */
	public function register_block(): void {
		if ( ! function_exists( 'register_block_type' ) ) {
			return;
		}
		register_block_type(
			'klyna/reviews',
			array(
				'api_version'     => 2,
				'title'           => __( 'Klyna Reviews', 'wp-reviews' ),
				'category'        => 'widgets',
				'icon'            => 'star-filled',
				'render_callback' => array( $this, 'render_block' ),
				'attributes'      => array(
					'target' => array(
						'type'    => 'string',
						'default' => 'site',
					),
					'form'   => array(
						'type'    => 'boolean',
						'default' => true,
					),
					'limit'  => array(
						'type'    => 'number',
						'default' => 10,
					),
				),
			)
		);
	}

	/**
	 * Register front-end CSS/JS. Enqueued lazily by the renderers so pages
	 * without a review block stay lean.
	 */
	public function register_assets(): void {
		wp_register_style(
			'klyna-reviews',
			KLYNA_REVIEWS_PLUGIN_URL . 'assets/css/reviews.css',
			array(),
			KLYNA_REVIEWS_VERSION
		);
		wp_register_script(
			'klyna-reviews',
			KLYNA_REVIEWS_PLUGIN_URL . 'assets/js/reviews.js',
			array(),
			KLYNA_REVIEWS_VERSION,
			true
		);
		wp_localize_script(
			'klyna-reviews',
			'KLYNA_REVIEWS',
			array(
				'restUrl' => esc_url_raw( rest_url( 'klyna-reviews/v1/reviews' ) ),
				'nonce'   => wp_create_nonce( 'klyna_reviews_submit' ),
				'i18n'    => array(
					'submitting' => __( 'Submitting…', 'wp-reviews' ),
					'submit'     => __( 'Submit review', 'wp-reviews' ),
					'error'      => __( 'Something went wrong. Please try again.', 'wp-reviews' ),
				),
			)
		);
	}

	private function enqueue(): void {
		wp_enqueue_style( 'klyna-reviews' );
		wp_enqueue_script( 'klyna-reviews' );
	}

	/* ---------------------------------------------------------------------
	 * Renderers
	 * ------------------------------------------------------------------- */

	/**
	 * @param array<string,mixed>|string $atts Shortcode attributes.
	 */
	public function render_reviews( $atts ): string {
		$atts = shortcode_atts(
			array(
				'target' => 'site',
				'form'   => 'true',
				'limit'  => (int) Plugin::setting( 'reviews_per_page', 10 ),
			),
			(array) $atts,
			'klyna_reviews'
		);

		$this->enqueue();

		$target    = sanitize_text_field( (string) $atts['target'] );
		$show_form = filter_var( $atts['form'], FILTER_VALIDATE_BOOLEAN );
		$limit     = max( 1, (int) $atts['limit'] );

		$aggregate = $this->reviews->aggregate( $target );
		$list      = $this->reviews->get_for_target( $target, $limit, 1 );

		ob_start();
		?>
		<div class="klyna-reviews" data-target="<?php echo esc_attr( $target ); ?>">
			<?php echo $this->stars_badge( $aggregate ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>
			<?php echo $this->review_list( $list ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>
			<?php if ( $show_form ) : ?>
				<?php echo $this->review_form( $target ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>
			<?php endif; ?>
		</div>
		<?php
		return (string) ob_get_clean();
	}

	/**
	 * @param array<string,mixed>|string $atts Shortcode attributes.
	 */
	public function render_form_shortcode( $atts ): string {
		$atts = shortcode_atts( array( 'target' => 'site' ), (array) $atts, 'klyna_review_form' );
		$this->enqueue();
		return '<div class="klyna-reviews">' . $this->review_form( sanitize_text_field( (string) $atts['target'] ) ) . '</div>';
	}

	/**
	 * @param array<string,mixed>|string $atts Shortcode attributes.
	 */
	public function render_stars_shortcode( $atts ): string {
		$atts = shortcode_atts( array( 'target' => 'site' ), (array) $atts, 'klyna_review_stars' );
		$this->enqueue();
		$target = sanitize_text_field( (string) $atts['target'] );
		return '<div class="klyna-reviews">' . $this->stars_badge( $this->reviews->aggregate( $target ) ) . '</div>';
	}

	/**
	 * Block render callback — delegates to the shortcode renderer.
	 *
	 * @param array<string,mixed> $attributes Block attributes.
	 */
	public function render_block( array $attributes ): string {
		return $this->render_reviews(
			array(
				'target' => $attributes['target'] ?? 'site',
				'form'   => ! empty( $attributes['form'] ) ? 'true' : 'false',
				'limit'  => $attributes['limit'] ?? 10,
			)
		);
	}

	/* ---------------------------------------------------------------------
	 * Markup partials
	 * ------------------------------------------------------------------- */

	/**
	 * @param array{count:int, average:float} $aggregate Aggregate data.
	 */
	private function stars_badge( array $aggregate ): string {
		$average = (float) $aggregate['average'];
		$count   = (int) $aggregate['count'];

		ob_start();
		?>
		<div class="klyna-reviews__badge">
			<?php echo $this->stars_svg( $average ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>
			<span class="klyna-reviews__avg"><?php echo esc_html( number_format_i18n( $average, 1 ) ); ?></span>
			<span class="klyna-reviews__count">
				<?php
				printf(
					/* translators: %s: number of reviews */
					esc_html( _n( '%s review', '%s reviews', $count, 'wp-reviews' ) ),
					esc_html( number_format_i18n( $count ) )
				);
				?>
			</span>
		</div>
		<?php
		return (string) ob_get_clean();
	}

	/**
	 * Render a 5-star row with a partial fill for the fractional average.
	 *
	 * @param float $value Average rating (0–5).
	 */
	private function stars_svg( float $value ): string {
		$percent = max( 0, min( 100, ( $value / 5 ) * 100 ) );
		$star    = '<path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 15.9 4.8 17.6l1-5.8L1.5 7.7l5.9-.9z"/>';

		ob_start();
		?>
		<span class="klyna-stars" role="img" aria-label="<?php echo esc_attr( sprintf( /* translators: %s: rating */ __( 'Rated %s out of 5', 'wp-reviews' ), number_format_i18n( $value, 1 ) ) ); ?>">
			<span class="klyna-stars__track">
				<?php for ( $i = 0; $i < 5; $i++ ) : ?>
					<svg viewBox="0 0 20 20" aria-hidden="true"><?php echo $star; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?></svg>
				<?php endfor; ?>
			</span>
			<span class="klyna-stars__fill" style="width:<?php echo esc_attr( (string) $percent ); ?>%">
				<?php for ( $i = 0; $i < 5; $i++ ) : ?>
					<svg viewBox="0 0 20 20" aria-hidden="true"><?php echo $star; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?></svg>
				<?php endfor; ?>
			</span>
		</span>
		<?php
		return (string) ob_get_clean();
	}

	/**
	 * @param array<int, array<string,mixed>> $list Reviews.
	 */
	private function review_list( array $list ): string {
		if ( empty( $list ) ) {
			return '<p class="klyna-reviews__empty">' . esc_html__( 'No reviews yet. Be the first to write one!', 'wp-reviews' ) . '</p>';
		}

		ob_start();
		echo '<ul class="klyna-reviews__list">';
		foreach ( $list as $review ) {
			?>
			<li class="klyna-reviews__item">
				<div class="klyna-reviews__item-head">
					<?php echo $this->stars_svg( (float) $review['rating'] ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>
					<?php if ( ! empty( $review['title'] ) ) : ?>
						<strong class="klyna-reviews__item-title"><?php echo esc_html( $review['title'] ); ?></strong>
					<?php endif; ?>
				</div>
				<p class="klyna-reviews__item-body"><?php echo esc_html( $review['body'] ); ?></p>
				<p class="klyna-reviews__item-meta">
					<span class="klyna-reviews__item-author"><?php echo esc_html( $review['author'] ); ?></span>
					<time datetime="<?php echo esc_attr( $review['date'] ); ?>"><?php echo esc_html( date_i18n( get_option( 'date_format' ), strtotime( $review['date'] ) ) ); ?></time>
				</p>
			</li>
			<?php
		}
		echo '</ul>';
		return (string) ob_get_clean();
	}

	private function review_form( string $target ): string {
		$settings      = Plugin::settings();
		$require_email = ! empty( $settings['require_email'] );
		$max           = (int) ( $settings['max_rating'] ?? 5 );

		ob_start();
		?>
		<form class="klyna-reviews__form" data-target="<?php echo esc_attr( $target ); ?>" novalidate>
			<h3 class="klyna-reviews__form-title"><?php esc_html_e( 'Write a review', 'wp-reviews' ); ?></h3>

			<div class="klyna-reviews__field">
				<span class="klyna-reviews__label"><?php esc_html_e( 'Your rating', 'wp-reviews' ); ?></span>
				<div class="klyna-reviews__rating" role="radiogroup" aria-label="<?php esc_attr_e( 'Star rating', 'wp-reviews' ); ?>">
					<?php for ( $i = $max; $i >= 1; $i-- ) : ?>
						<input type="radio" id="klyna-star-<?php echo esc_attr( (string) $i ); ?>" name="rating" value="<?php echo esc_attr( (string) $i ); ?>" required>
						<label for="klyna-star-<?php echo esc_attr( (string) $i ); ?>" title="<?php echo esc_attr( sprintf( /* translators: %d: number of stars */ _n( '%d star', '%d stars', $i, 'wp-reviews' ), $i ) ); ?>">
							<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 15.9 4.8 17.6l1-5.8L1.5 7.7l5.9-.9z"/></svg>
						</label>
					<?php endfor; ?>
				</div>
			</div>

			<div class="klyna-reviews__field">
				<label class="klyna-reviews__label" for="klyna-author"><?php esc_html_e( 'Your name', 'wp-reviews' ); ?></label>
				<input type="text" id="klyna-author" name="author" required maxlength="120">
			</div>

			<div class="klyna-reviews__field">
				<label class="klyna-reviews__label" for="klyna-email">
					<?php esc_html_e( 'Email', 'wp-reviews' ); ?>
					<?php if ( ! $require_email ) : ?>
						<span class="klyna-reviews__optional"><?php esc_html_e( '(optional)', 'wp-reviews' ); ?></span>
					<?php endif; ?>
				</label>
				<input type="email" id="klyna-email" name="email" <?php echo $require_email ? 'required' : ''; ?> maxlength="200">
			</div>

			<div class="klyna-reviews__field">
				<label class="klyna-reviews__label" for="klyna-title"><?php esc_html_e( 'Headline', 'wp-reviews' ); ?> <span class="klyna-reviews__optional"><?php esc_html_e( '(optional)', 'wp-reviews' ); ?></span></label>
				<input type="text" id="klyna-title" name="title" maxlength="160">
			</div>

			<div class="klyna-reviews__field">
				<label class="klyna-reviews__label" for="klyna-body"><?php esc_html_e( 'Your review', 'wp-reviews' ); ?></label>
				<textarea id="klyna-body" name="body" rows="4" required maxlength="2000"></textarea>
			</div>

			<?php // Honeypot — visually hidden, must stay empty. ?>
			<div class="klyna-reviews__hp" aria-hidden="true">
				<label for="klyna-website"><?php esc_html_e( 'Website', 'wp-reviews' ); ?></label>
				<input type="text" id="klyna-website" name="website" tabindex="-1" autocomplete="off">
			</div>

			<input type="hidden" name="target" value="<?php echo esc_attr( $target ); ?>">
			<input type="hidden" name="_wpnonce" value="<?php echo esc_attr( wp_create_nonce( 'klyna_reviews_submit' ) ); ?>">

			<button type="submit" class="klyna-reviews__submit"><?php esc_html_e( 'Submit review', 'wp-reviews' ); ?></button>
			<p class="klyna-reviews__notice" role="status" aria-live="polite"></p>
		</form>
		<?php
		return (string) ob_get_clean();
	}
}
