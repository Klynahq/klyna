<?php
/**
 * Admin UI — dashboard, moderation queue, settings, request-email tool.
 *
 * @package KlynaReviews
 */

namespace KlynaReviews;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Admin {

	private const MENU_SLUG = 'klyna-reviews';

	private Reviews $reviews;

	public function __construct() {
		$this->reviews = new Reviews();
	}

	public function register(): void {
		add_action( 'admin_menu', array( $this, 'register_menu' ) );
		add_action( 'admin_init', array( $this, 'register_settings' ) );
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue_assets' ) );
		add_action( 'admin_post_klyna_reviews_send_request', array( $this, 'handle_send_request' ) );
		add_filter(
			'plugin_action_links_' . plugin_basename( KLYNA_REVIEWS_PLUGIN_FILE ),
			array( $this, 'add_settings_link' )
		);
	}

	public function register_menu(): void {
		$pending = $this->reviews->pending_count();
		$bubble  = $pending > 0
			? ' <span class="awaiting-mod"><span class="pending-count">' . esc_html( number_format_i18n( $pending ) ) . '</span></span>'
			: '';

		add_menu_page(
			__( 'Klyna Reviews', 'wp-reviews' ),
			__( 'Reviews', 'wp-reviews' ) . $bubble,
			'edit_posts',
			self::MENU_SLUG,
			array( $this, 'render_dashboard' ),
			'data:image/svg+xml;base64,' . base64_encode(
				'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#9ca3af"><rect x="2" y="2" width="20" height="20" rx="5"/><path d="M12 6.5l1.7 3.4 3.8.6-2.8 2.6.7 3.7L12 15.6 8.6 16.8l.7-3.7-2.8-2.6 3.8-.6z" fill="#fff"/></svg>'
			),
			58
		);
		add_submenu_page(
			self::MENU_SLUG,
			__( 'Dashboard', 'wp-reviews' ),
			__( 'Dashboard', 'wp-reviews' ),
			'edit_posts',
			self::MENU_SLUG,
			array( $this, 'render_dashboard' )
		);
		add_submenu_page(
			self::MENU_SLUG,
			__( 'Moderation', 'wp-reviews' ),
			__( 'Moderation', 'wp-reviews' ) . $bubble,
			'manage_options',
			'klyna-reviews-moderation',
			array( $this, 'render_moderation' )
		);
		add_submenu_page(
			self::MENU_SLUG,
			__( 'Request reviews', 'wp-reviews' ),
			__( 'Request reviews', 'wp-reviews' ),
			'manage_options',
			'klyna-reviews-request',
			array( $this, 'render_request' )
		);
		add_submenu_page(
			self::MENU_SLUG,
			__( 'Settings', 'wp-reviews' ),
			__( 'Settings', 'wp-reviews' ),
			'manage_options',
			'klyna-reviews-settings',
			array( $this, 'render_settings' )
		);
	}

	/* ---------------------------------------------------------------------
	 * Settings API
	 * ------------------------------------------------------------------- */

	public function register_settings(): void {
		register_setting(
			'klyna_reviews_settings_group',
			KLYNA_REVIEWS_OPTION_KEY,
			array(
				'type'              => 'array',
				'sanitize_callback' => array( $this, 'sanitize_settings' ),
				'default'           => array(),
			)
		);
	}

	/**
	 * @param mixed $input Raw POSTed settings.
	 * @return array<string,mixed>
	 */
	public function sanitize_settings( $input ): array {
		$input = is_array( $input ) ? $input : array();
		$out   = array();

		$bool_keys = array(
			'enable_aggregate_schema',
			'enable_review_schema',
			'auto_approve',
			'require_email',
			'request_email_enabled',
		);
		foreach ( $bool_keys as $k ) {
			$out[ $k ] = ! empty( $input[ $k ] );
		}

		$out['min_rating']       = $this->clamp_int( $input['min_rating'] ?? 1, 1, 5, 1 );
		$out['max_rating']       = $this->clamp_int( $input['max_rating'] ?? 5, $out['min_rating'], 5, 5 );
		$out['reviews_per_page'] = $this->clamp_int( $input['reviews_per_page'] ?? 10, 1, 50, 10 );

		$out['product_name']          = sanitize_text_field( (string) ( $input['product_name'] ?? '' ) );
		$out['request_email_subject'] = sanitize_text_field( (string) ( $input['request_email_subject'] ?? '' ) );
		$out['request_email_body']    = sanitize_textarea_field( (string) ( $input['request_email_body'] ?? '' ) );

		return $out;
	}

	private function clamp_int( $value, int $min, int $max, int $default ): int {
		$value = is_numeric( $value ) ? (int) $value : $default;
		return max( $min, min( $max, $value ) );
	}

	/* ---------------------------------------------------------------------
	 * Assets
	 * ------------------------------------------------------------------- */

	public function enqueue_assets( string $hook ): void {
		if ( strpos( $hook, 'klyna-reviews' ) === false ) {
			return;
		}
		wp_enqueue_style(
			'klyna-reviews-admin',
			KLYNA_REVIEWS_PLUGIN_URL . 'assets/admin/admin.css',
			array(),
			KLYNA_REVIEWS_VERSION
		);
		wp_enqueue_script(
			'klyna-reviews-admin',
			KLYNA_REVIEWS_PLUGIN_URL . 'assets/admin/admin.js',
			array( 'wp-api-fetch' ),
			KLYNA_REVIEWS_VERSION,
			true
		);
		wp_localize_script(
			'klyna-reviews-admin',
			'KLYNA_REVIEWS_ADMIN',
			array(
				'apiBase' => esc_url_raw( rest_url( 'klyna-reviews/v1' ) ),
				'nonce'   => wp_create_nonce( 'wp_rest' ),
				'i18n'    => array(
					'approve'   => __( 'Approve', 'wp-reviews' ),
					'unapprove' => __( 'Unapprove', 'wp-reviews' ),
					'delete'    => __( 'Delete', 'wp-reviews' ),
					'confirm'   => __( 'Delete this review? It will be moved to Trash.', 'wp-reviews' ),
					'empty'     => __( 'Nothing waiting for moderation. Nice and clean.', 'wp-reviews' ),
					'loading'   => __( 'Loading…', 'wp-reviews' ),
					'error'     => __( 'Could not load the queue. Reload and try again.', 'wp-reviews' ),
				),
			)
		);
	}

	/* ---------------------------------------------------------------------
	 * Pages
	 * ------------------------------------------------------------------- */

	public function render_dashboard(): void {
		$aggregate = $this->reviews->aggregate( 'site' );
		$pending   = $this->reviews->pending_count();
		?>
		<div class="wrap klyna-reviews-wrap">
			<h1><?php esc_html_e( 'Klyna Reviews', 'wp-reviews' ); ?></h1>
			<p class="klyna-reviews-tagline"><?php esc_html_e( 'Collect & display reviews with rich-snippet stars and moderation. Tools that help your work get found.', 'wp-reviews' ); ?></p>

			<div class="klyna-reviews-stats">
				<div class="klyna-reviews-stat">
					<span class="klyna-reviews-stat__value"><?php echo esc_html( number_format_i18n( $aggregate['average'], 1 ) ); ?></span>
					<span class="klyna-reviews-stat__label"><?php esc_html_e( 'Average rating (site)', 'wp-reviews' ); ?></span>
				</div>
				<div class="klyna-reviews-stat">
					<span class="klyna-reviews-stat__value"><?php echo esc_html( number_format_i18n( $aggregate['count'] ) ); ?></span>
					<span class="klyna-reviews-stat__label"><?php esc_html_e( 'Published reviews', 'wp-reviews' ); ?></span>
				</div>
				<div class="klyna-reviews-stat <?php echo $pending > 0 ? 'is-pending' : ''; ?>">
					<span class="klyna-reviews-stat__value"><?php echo esc_html( number_format_i18n( $pending ) ); ?></span>
					<span class="klyna-reviews-stat__label"><?php esc_html_e( 'Awaiting moderation', 'wp-reviews' ); ?></span>
				</div>
			</div>

			<div class="klyna-reviews-cards">
				<div class="klyna-reviews-card">
					<h2><?php esc_html_e( 'Embed reviews', 'wp-reviews' ); ?></h2>
					<p><?php esc_html_e( 'Drop the shortcode anywhere — the rating badge, the review list, and the submission form render together.', 'wp-reviews' ); ?></p>
					<code class="klyna-reviews-code">[klyna_reviews target="site"]</code>
					<p class="klyna-reviews-hint"><?php esc_html_e( 'Use a unique target per product or page to keep ratings separate.', 'wp-reviews' ); ?></p>
				</div>
				<div class="klyna-reviews-card">
					<h2><?php esc_html_e( 'Just the stars', 'wp-reviews' ); ?></h2>
					<p><?php esc_html_e( 'Show the aggregate star badge in a header or sidebar.', 'wp-reviews' ); ?></p>
					<code class="klyna-reviews-code">[klyna_review_stars target="site"]</code>
				</div>
				<div class="klyna-reviews-card">
					<h2><?php esc_html_e( 'Rich snippets', 'wp-reviews' ); ?></h2>
					<p><?php esc_html_e( 'AggregateRating + Review JSON-LD is auto-injected on any page that shows reviews — the stars Google can show always match what visitors see.', 'wp-reviews' ); ?></p>
					<a class="button" href="<?php echo esc_url( admin_url( 'admin.php?page=klyna-reviews-settings' ) ); ?>"><?php esc_html_e( 'Schema settings', 'wp-reviews' ); ?></a>
				</div>
				<div class="klyna-reviews-card">
					<h2><?php esc_html_e( 'Moderate', 'wp-reviews' ); ?></h2>
					<p><?php esc_html_e( 'Approve or remove submissions before they go live. Honeypot spam guard is always on.', 'wp-reviews' ); ?></p>
					<a class="button button-primary" href="<?php echo esc_url( admin_url( 'admin.php?page=klyna-reviews-moderation' ) ); ?>"><?php esc_html_e( 'Open queue', 'wp-reviews' ); ?></a>
				</div>
			</div>
		</div>
		<?php
	}

	public function render_moderation(): void {
		?>
		<div class="wrap klyna-reviews-wrap">
			<h1><?php esc_html_e( 'Moderation queue', 'wp-reviews' ); ?></h1>
			<p class="klyna-reviews-tagline"><?php esc_html_e( 'Reviews awaiting approval. Approve to publish, or delete to move to Trash.', 'wp-reviews' ); ?></p>
			<div id="klyna-reviews-queue" class="klyna-reviews-queue"></div>
		</div>
		<?php
	}

	public function render_request(): void {
		$settings = Plugin::settings();
		$enabled  = ! empty( $settings['request_email_enabled'] );
		?>
		<div class="wrap klyna-reviews-wrap">
			<h1><?php esc_html_e( 'Request a review', 'wp-reviews' ); ?></h1>
			<p class="klyna-reviews-tagline"><?php esc_html_e( 'Send a customer a personal request to leave a review. Plain email via your site — no third-party service.', 'wp-reviews' ); ?></p>

			<?php if ( ! $enabled ) : ?>
				<div class="notice notice-warning inline"><p>
					<?php
					printf(
						/* translators: %s: settings page link */
						wp_kses_post( __( 'Review-request emails are disabled. Enable them in <a href="%s">Settings</a> first.', 'wp-reviews' ) ),
						esc_url( admin_url( 'admin.php?page=klyna-reviews-settings' ) )
					);
					?>
				</p></div>
			<?php endif; ?>

			<?php $this->maybe_render_request_notice(); ?>

			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" class="klyna-reviews-request-form">
				<input type="hidden" name="action" value="klyna_reviews_send_request">
				<?php wp_nonce_field( 'klyna_reviews_send_request', 'klyna_reviews_request_nonce' ); ?>
				<table class="form-table" role="presentation">
					<tbody>
						<tr>
							<th scope="row"><label for="kr-email"><?php esc_html_e( 'Customer email', 'wp-reviews' ); ?></label></th>
							<td><input type="email" id="kr-email" name="email" class="regular-text" required <?php disabled( ! $enabled ); ?>></td>
						</tr>
						<tr>
							<th scope="row"><label for="kr-name"><?php esc_html_e( 'Customer name', 'wp-reviews' ); ?></label></th>
							<td><input type="text" id="kr-name" name="name" class="regular-text" <?php disabled( ! $enabled ); ?>></td>
						</tr>
						<tr>
							<th scope="row"><label for="kr-target"><?php esc_html_e( 'Review target', 'wp-reviews' ); ?></label></th>
							<td>
								<input type="text" id="kr-target" name="target" class="regular-text" value="site" <?php disabled( ! $enabled ); ?>>
								<p class="description"><?php esc_html_e( 'Must match the target used in the shortcode/block on your review page.', 'wp-reviews' ); ?></p>
							</td>
						</tr>
						<tr>
							<th scope="row"><label for="kr-url"><?php esc_html_e( 'Review page URL', 'wp-reviews' ); ?></label></th>
							<td>
								<input type="url" id="kr-url" name="review_url" class="regular-text" placeholder="<?php echo esc_attr( home_url( '/reviews/' ) ); ?>" <?php disabled( ! $enabled ); ?>>
								<p class="description"><?php esc_html_e( 'Where the customer should land to leave their review.', 'wp-reviews' ); ?></p>
							</td>
						</tr>
					</tbody>
				</table>
				<?php submit_button( __( 'Send request', 'wp-reviews' ), 'primary', 'submit', true, $enabled ? array() : array( 'disabled' => 'disabled' ) ); ?>
			</form>
		</div>
		<?php
	}

	public function render_settings(): void {
		$settings = Plugin::settings();
		?>
		<div class="wrap klyna-reviews-wrap">
			<h1><?php esc_html_e( 'Klyna Reviews settings', 'wp-reviews' ); ?></h1>
			<form method="post" action="options.php">
				<?php settings_fields( 'klyna_reviews_settings_group' ); ?>
				<table class="form-table" role="presentation">
					<tbody>
						<tr>
							<th scope="row"><?php esc_html_e( 'Moderation', 'wp-reviews' ); ?></th>
							<td>
								<?php
								$this->checkbox( 'auto_approve', __( 'Auto-approve new reviews (skip the queue)', 'wp-reviews' ), $settings );
								$this->checkbox( 'require_email', __( 'Require an email address to submit', 'wp-reviews' ), $settings );
								?>
							</td>
						</tr>
						<tr>
							<th scope="row"><?php esc_html_e( 'Rich snippets', 'wp-reviews' ); ?></th>
							<td>
								<?php
								$this->checkbox( 'enable_aggregate_schema', __( 'Emit AggregateRating JSON-LD', 'wp-reviews' ), $settings );
								$this->checkbox( 'enable_review_schema', __( 'Emit individual Review JSON-LD', 'wp-reviews' ), $settings );
								?>
							</td>
						</tr>
						<tr>
							<th scope="row"><label for="product_name"><?php esc_html_e( 'Product / business name', 'wp-reviews' ); ?></label></th>
							<td>
								<input type="text" id="product_name" name="<?php echo esc_attr( KLYNA_REVIEWS_OPTION_KEY ); ?>[product_name]" class="regular-text" value="<?php echo esc_attr( $settings['product_name'] ?? '' ); ?>">
								<p class="description"><?php esc_html_e( 'Used as the schema item name. Defaults to the page title when blank.', 'wp-reviews' ); ?></p>
							</td>
						</tr>
						<tr>
							<th scope="row"><label for="reviews_per_page"><?php esc_html_e( 'Reviews per page', 'wp-reviews' ); ?></label></th>
							<td><input type="number" id="reviews_per_page" name="<?php echo esc_attr( KLYNA_REVIEWS_OPTION_KEY ); ?>[reviews_per_page]" class="small-text" min="1" max="50" value="<?php echo esc_attr( (string) ( $settings['reviews_per_page'] ?? 10 ) ); ?>"></td>
						</tr>
						<tr>
							<th scope="row"><?php esc_html_e( 'Rating scale', 'wp-reviews' ); ?></th>
							<td>
								<label><?php esc_html_e( 'Min', 'wp-reviews' ); ?>
									<input type="number" name="<?php echo esc_attr( KLYNA_REVIEWS_OPTION_KEY ); ?>[min_rating]" class="small-text" min="1" max="5" value="<?php echo esc_attr( (string) ( $settings['min_rating'] ?? 1 ) ); ?>">
								</label>
								&nbsp;
								<label><?php esc_html_e( 'Max', 'wp-reviews' ); ?>
									<input type="number" name="<?php echo esc_attr( KLYNA_REVIEWS_OPTION_KEY ); ?>[max_rating]" class="small-text" min="1" max="5" value="<?php echo esc_attr( (string) ( $settings['max_rating'] ?? 5 ) ); ?>">
								</label>
							</td>
						</tr>
						<tr>
							<th scope="row"><?php esc_html_e( 'Review requests', 'wp-reviews' ); ?></th>
							<td>
								<?php $this->checkbox( 'request_email_enabled', __( 'Enable review-request emails', 'wp-reviews' ), $settings ); ?>
								<p class="description"><?php esc_html_e( 'Placeholders: {name}, {site}, {link}.', 'wp-reviews' ); ?></p>
							</td>
						</tr>
						<tr>
							<th scope="row"><label for="request_email_subject"><?php esc_html_e( 'Request subject', 'wp-reviews' ); ?></label></th>
							<td><input type="text" id="request_email_subject" name="<?php echo esc_attr( KLYNA_REVIEWS_OPTION_KEY ); ?>[request_email_subject]" class="large-text" value="<?php echo esc_attr( $settings['request_email_subject'] ?? '' ); ?>"></td>
						</tr>
						<tr>
							<th scope="row"><label for="request_email_body"><?php esc_html_e( 'Request body', 'wp-reviews' ); ?></label></th>
							<td><textarea id="request_email_body" name="<?php echo esc_attr( KLYNA_REVIEWS_OPTION_KEY ); ?>[request_email_body]" rows="8" class="large-text"><?php echo esc_textarea( $settings['request_email_body'] ?? '' ); ?></textarea></td>
						</tr>
					</tbody>
				</table>
				<?php submit_button(); ?>
			</form>
		</div>
		<?php
	}

	/* ---------------------------------------------------------------------
	 * admin-post handler: send a review request
	 * ------------------------------------------------------------------- */

	public function handle_send_request(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You are not allowed to do this.', 'wp-reviews' ) );
		}
		check_admin_referer( 'klyna_reviews_send_request', 'klyna_reviews_request_nonce' );

		$enabled = ! empty( Plugin::setting( 'request_email_enabled' ) );
		$email   = isset( $_POST['email'] ) ? sanitize_email( wp_unslash( $_POST['email'] ) ) : '';
		$name    = isset( $_POST['name'] ) ? sanitize_text_field( wp_unslash( $_POST['name'] ) ) : '';
		$target  = isset( $_POST['target'] ) ? sanitize_text_field( wp_unslash( $_POST['target'] ) ) : 'site';
		$url     = isset( $_POST['review_url'] ) ? esc_url_raw( wp_unslash( $_POST['review_url'] ) ) : '';

		$status = 'error';
		if ( $enabled && is_email( $email ) ) {
			$sent   = ( new RequestEmail() )->send( $email, $name, $target, $url );
			$status = $sent ? 'sent' : 'failed';
		}

		wp_safe_redirect(
			add_query_arg(
				array(
					'page'        => 'klyna-reviews-request',
					'kr_notice'   => $status,
				),
				admin_url( 'admin.php' )
			)
		);
		exit;
	}

	private function maybe_render_request_notice(): void {
		$notice = isset( $_GET['kr_notice'] ) ? sanitize_key( wp_unslash( $_GET['kr_notice'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		if ( '' === $notice ) {
			return;
		}
		$map = array(
			'sent'   => array( 'success', __( 'Review request sent.', 'wp-reviews' ) ),
			'failed' => array( 'error', __( 'WordPress could not send the email. Check your mail configuration.', 'wp-reviews' ) ),
			'error'  => array( 'error', __( 'Please provide a valid email address (and enable requests in Settings).', 'wp-reviews' ) ),
		);
		if ( ! isset( $map[ $notice ] ) ) {
			return;
		}
		printf(
			'<div class="notice notice-%1$s is-dismissible"><p>%2$s</p></div>',
			esc_attr( $map[ $notice ][0] ),
			esc_html( $map[ $notice ][1] )
		);
	}

	/* ---------------------------------------------------------------------
	 * Helpers
	 * ------------------------------------------------------------------- */

	/**
	 * @param string              $key      Setting key.
	 * @param string              $label    Visible label.
	 * @param array<string,mixed> $settings Current settings.
	 */
	private function checkbox( string $key, string $label, array $settings ): void {
		printf(
			'<label style="display:block;margin-bottom:8px;"><input type="checkbox" name="%1$s[%2$s]" value="1" %3$s> %4$s</label>',
			esc_attr( KLYNA_REVIEWS_OPTION_KEY ),
			esc_attr( $key ),
			checked( ! empty( $settings[ $key ] ), true, false ),
			esc_html( $label )
		);
	}

	/**
	 * @param string[] $links Existing action links.
	 * @return string[]
	 */
	public function add_settings_link( array $links ): array {
		$url   = admin_url( 'admin.php?page=klyna-reviews-settings' );
		$label = __( 'Settings', 'wp-reviews' );
		$first = sprintf( '<a href="%s">%s</a>', esc_url( $url ), esc_html( $label ) );
		array_unshift( $links, $first );
		return $links;
	}
}
