<?php
/**
 * Admin UI — dashboard, feed health, and settings page.
 *
 * @package KlynaFeed
 */

namespace KlynaFeed;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Admin {

	private const MENU_SLUG = 'wp-feed';

	public function register(): void {
		add_action( 'admin_menu', array( $this, 'register_menu' ) );
		add_action( 'admin_init', array( $this, 'register_settings' ) );
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue_assets' ) );
		add_filter(
			'plugin_action_links_' . plugin_basename( KLYNA_FEED_PLUGIN_FILE ),
			array( $this, 'add_settings_link' )
		);
		// Bulk action on the Products list to optimize titles via AI.
		add_filter( 'bulk_actions-edit-product', array( $this, 'register_bulk_action' ) );
		add_filter( 'handle_bulk_actions-edit-product', array( $this, 'handle_bulk_action' ), 10, 3 );
		add_action( 'admin_notices', array( $this, 'bulk_action_notice' ) );
	}

	public function register_bulk_action( array $bulk_actions ): array {
		$bulk_actions['klyna_feed_optimize_titles'] = __( 'Optimize titles (Klyna AI)', 'wp-feed' );
		return $bulk_actions;
	}

	/**
	 * Redirect-only handler — the heavy lifting runs from the REST endpoint
	 * triggered by the Title Variants admin page so the bulk action gives the
	 * admin a visible progress UI instead of timing out a list-table request.
	 */
	public function handle_bulk_action( string $redirect_to, string $doaction, array $post_ids ): string {
		if ( 'klyna_feed_optimize_titles' !== $doaction ) {
			return $redirect_to;
		}
		$ids = array_map( 'absint', $post_ids );
		$ids = array_values( array_filter( $ids ) );
		if ( ! $ids ) {
			return $redirect_to;
		}
		$url = add_query_arg(
			array(
				'page' => 'wp-feed-titles',
				'ids'  => implode( ',', $ids ),
				'run'  => '1',
			),
			admin_url( 'admin.php' )
		);
		return $url;
	}

	public function bulk_action_notice(): void {
		if ( ! isset( $_GET['klyna_feed_optimized'] ) ) {
			return;
		}
		$count = (int) $_GET['klyna_feed_optimized'];
		printf(
			'<div class="notice notice-success is-dismissible"><p>%s</p></div>',
			esc_html(
				sprintf(
					/* translators: %d: number of products. */
					_n( 'Optimized titles for %d product.', 'Optimized titles for %d products.', $count, 'wp-feed' ),
					$count
				)
			)
		);
	}

	public function register_menu(): void {
		add_menu_page(
			__( 'Klyna Product Feed', 'wp-feed' ),
			__( 'Klyna Feed', 'wp-feed' ),
			'manage_options',
			self::MENU_SLUG,
			array( $this, 'render_dashboard' ),
			'data:image/svg+xml;base64,' . base64_encode(
				'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#9ca3af"><rect x="2" y="2" width="20" height="20" rx="5"/><path d="M7 16a5 5 0 0 1 5-5M7 16a9 9 0 0 1 9-9" stroke="white" stroke-width="2" stroke-linecap="round" fill="none"/><rect x="6.5" y="13.5" width="3.5" height="3.5" rx="1" fill="white"/></svg>'
			),
			66
		);
		add_submenu_page(
			self::MENU_SLUG,
			__( 'Dashboard', 'wp-feed' ),
			__( 'Dashboard', 'wp-feed' ),
			'manage_options',
			self::MENU_SLUG,
			array( $this, 'render_dashboard' )
		);
		add_submenu_page(
			self::MENU_SLUG,
			__( 'Feed health', 'wp-feed' ),
			__( 'Feed health', 'wp-feed' ),
			'manage_options',
			'wp-feed-health',
			array( $this, 'render_health' )
		);
		add_submenu_page(
			self::MENU_SLUG,
			__( 'AI title variants', 'wp-feed' ),
			__( 'AI titles', 'wp-feed' ),
			'manage_options',
			'wp-feed-titles',
			array( $this, 'render_titles' )
		);
		add_submenu_page(
			self::MENU_SLUG,
			__( 'Settings', 'wp-feed' ),
			__( 'Settings', 'wp-feed' ),
			'manage_options',
			'wp-feed-settings',
			array( $this, 'render_settings' )
		);
	}

	public function register_settings(): void {
		register_setting(
			'wp_feed_settings_group',
			KLYNA_FEED_OPTION_KEY,
			array(
				'type'              => 'array',
				'sanitize_callback' => array( $this, 'sanitize_settings' ),
				'default'           => array(),
			)
		);
	}

	/**
	 * @param mixed $input
	 * @return array<string,mixed>
	 */
	public function sanitize_settings( $input ): array {
		$input    = is_array( $input ) ? $input : array();
		$existing = Plugin::settings();
		$out      = array();

		$bool_keys = array( 'enable_google', 'enable_meta', 'in_stock_only' );
		foreach ( $bool_keys as $k ) {
			$out[ $k ] = ! empty( $input[ $k ] );
		}

		$text_keys = array( 'default_brand', 'gtin_meta_key', 'brand_meta_key', 'google_category' );
		foreach ( $text_keys as $k ) {
			$out[ $k ] = isset( $input[ $k ] ) ? sanitize_text_field( (string) $input[ $k ] ) : '';
		}

		// AI assistant settings. Default to off ('' provider).
		$providers          = array( '', 'openrouter', 'groq', 'gemini', 'cloudflare', 'ollama' );
		$ai_provider        = isset( $input['ai_provider'] ) ? sanitize_key( (string) $input['ai_provider'] ) : '';
		$out['ai_provider'] = in_array( $ai_provider, $providers, true ) ? $ai_provider : '';
		$out['ai_model']    = isset( $input['ai_model'] ) ? sanitize_text_field( (string) $input['ai_model'] ) : '';
		$out['ai_api_key']  = isset( $input['ai_api_key'] ) ? sanitize_text_field( (string) $input['ai_api_key'] ) : '';
		$out['ai_endpoint'] = isset( $input['ai_endpoint'] ) ? sanitize_text_field( (string) $input['ai_endpoint'] ) : '';
		$out['ai_daily_cap'] = isset( $input['ai_daily_cap'] ) ? max( 1, (int) $input['ai_daily_cap'] ) : 100;

		$condition           = isset( $input['default_condition'] ) ? sanitize_key( (string) $input['default_condition'] ) : 'new';
		$out['default_condition'] = in_array( $condition, array( 'new', 'refurbished', 'used' ), true ) ? $condition : 'new';

		$schedule         = isset( $input['schedule'] ) ? sanitize_key( (string) $input['schedule'] ) : 'daily';
		$out['schedule']  = in_array( $schedule, array( 'hourly', 'twicedaily', 'daily', 'off' ), true ) ? $schedule : 'daily';

		$out['include_categories'] = $this->sanitize_term_list( $input['include_categories'] ?? array() );
		$out['exclude_categories'] = $this->sanitize_term_list( $input['exclude_categories'] ?? array() );

		// Preserve the feed token (it is not exposed as an editable field), or
		// mint a fresh one if the user clicked "Regenerate token".
		if ( ! empty( $input['regenerate_token'] ) ) {
			$out['feed_token'] = wp_generate_password( 20, false, false );
		} else {
			$out['feed_token'] = isset( $existing['feed_token'] ) && '' !== $existing['feed_token']
				? (string) $existing['feed_token']
				: wp_generate_password( 20, false, false );
		}

		return $out;
	}

	/**
	 * @param mixed $value
	 * @return int[]
	 */
	private function sanitize_term_list( $value ): array {
		if ( ! is_array( $value ) ) {
			return array();
		}
		return array_values( array_unique( array_filter( array_map( 'absint', $value ) ) ) );
	}

	public function enqueue_assets( string $hook ): void {
		if ( strpos( $hook, 'wp-feed' ) === false ) {
			return;
		}
		wp_enqueue_style(
			'klyna-feed-admin',
			KLYNA_FEED_PLUGIN_URL . 'assets/admin/admin.css',
			array(),
			KLYNA_FEED_VERSION
		);
		wp_enqueue_script(
			'klyna-feed-admin',
			KLYNA_FEED_PLUGIN_URL . 'assets/admin/admin.js',
			array( 'wp-api-fetch' ),
			KLYNA_FEED_VERSION,
			true
		);
		wp_localize_script(
			'klyna-feed-admin',
			'KLYNA_FEED',
			array(
				'apiBase' => esc_url_raw( rest_url( 'klyna-feed/v1' ) ),
				'nonce'   => wp_create_nonce( 'wp_rest' ),
				'i18n'    => array(
					'regenerating' => __( 'Regenerating…', 'wp-feed' ),
					'regenerate'   => __( 'Regenerate now', 'wp-feed' ),
					'done'         => __( 'Feeds regenerated.', 'wp-feed' ),
					'error'        => __( 'Something went wrong. Check the logs.', 'wp-feed' ),
					'copied'       => __( 'Copied!', 'wp-feed' ),
					'scanning'     => __( 'Scanning catalog…', 'wp-feed' ),
					'noWarnings'   => __( 'No issues found. Every product has its required fields.', 'wp-feed' ),
				),
			)
		);
	}

	public function render_dashboard(): void {
		$settings  = Plugin::settings();
		$wc_active = Plugin::woocommerce_active();
		$stats     = Storage::all_stats();
		?>
		<div class="wrap klyna-feed-wrap">
			<h1><?php esc_html_e( 'Klyna Product Feed', 'wp-feed' ); ?></h1>
			<p class="klyna-feed-tagline"><?php esc_html_e( 'WooCommerce product feeds for Google Shopping & Meta, auto-refreshed. Tools that help your work get found.', 'wp-feed' ); ?></p>

			<?php if ( ! $wc_active ) : ?>
				<div class="klyna-feed-notice klyna-feed-notice--warning">
					<strong><?php esc_html_e( 'WooCommerce is not active.', 'wp-feed' ); ?></strong>
					<?php esc_html_e( 'Klyna Product Feed needs WooCommerce to read your catalog. Install and activate WooCommerce, then return here.', 'wp-feed' ); ?>
				</div>
			<?php endif; ?>

			<div class="klyna-feed-toolbar">
				<button id="klyna-feed-regenerate" class="button button-primary" <?php disabled( ! $wc_active ); ?>>
					<?php esc_html_e( 'Regenerate now', 'wp-feed' ); ?>
				</button>
				<span id="klyna-feed-status" class="klyna-feed-status" role="status"></span>
			</div>

			<div class="klyna-feed-cards">
				<?php
				$this->feed_card(
					'google',
					__( 'Google Shopping', 'wp-feed' ),
					__( 'RSS 2.0 XML feed for Google Merchant Center.', 'wp-feed' ),
					! empty( $settings['enable_google'] ),
					$stats['google'] ?? null
				);
				$this->feed_card(
					'meta',
					__( 'Meta (Facebook & Instagram)', 'wp-feed' ),
					__( 'Product CSV for Meta Commerce Manager.', 'wp-feed' ),
					! empty( $settings['enable_meta'] ),
					$stats['meta'] ?? null
				);
				?>
			</div>

			<div class="klyna-feed-meta-row">
				<span>
					<?php
					$last = Scheduler::last_run();
					if ( $last ) {
						printf(
							/* translators: %s: human-readable time difference. */
							esc_html__( 'Last regenerated %s ago.', 'wp-feed' ),
							esc_html( human_time_diff( strtotime( $last . ' UTC' ), time() ) )
						);
					} else {
						esc_html_e( 'Feeds have not been generated yet.', 'wp-feed' );
					}
					?>
				</span>
				<a class="button" href="<?php echo esc_url( admin_url( 'admin.php?page=wp-feed-settings' ) ); ?>">
					<?php esc_html_e( 'Settings', 'wp-feed' ); ?>
				</a>
				<a class="button" href="<?php echo esc_url( admin_url( 'admin.php?page=wp-feed-health' ) ); ?>">
					<?php esc_html_e( 'Feed health', 'wp-feed' ); ?>
				</a>
			</div>
		</div>
		<?php
	}

	/**
	 * Render one feed status card with its public URL.
	 *
	 * @param array<string,mixed>|null $stat
	 */
	private function feed_card( string $format, string $title, string $desc, bool $enabled, ?array $stat ): void {
		$url = Plugin::feed_url( $format );
		?>
		<div class="klyna-feed-card">
			<div class="klyna-feed-card__head">
				<h2><?php echo esc_html( $title ); ?></h2>
				<span class="klyna-feed-badge <?php echo $enabled ? 'is-on' : 'is-off'; ?>">
					<?php echo $enabled ? esc_html__( 'Enabled', 'wp-feed' ) : esc_html__( 'Disabled', 'wp-feed' ); ?>
				</span>
			</div>
			<p class="klyna-feed-card__desc"><?php echo esc_html( $desc ); ?></p>
			<?php if ( $stat ) : ?>
				<ul class="klyna-feed-stats">
					<li><strong><?php echo esc_html( number_format_i18n( (int) $stat['item_count'] ) ); ?></strong> <?php esc_html_e( 'items', 'wp-feed' ); ?></li>
					<li><strong><?php echo esc_html( number_format_i18n( (int) $stat['warning_count'] ) ); ?></strong> <?php esc_html_e( 'warnings', 'wp-feed' ); ?></li>
					<li><strong><?php echo esc_html( size_format( (int) $stat['byte_size'] ) ); ?></strong></li>
				</ul>
			<?php else : ?>
				<p class="klyna-feed-card__empty"><?php esc_html_e( 'Not generated yet.', 'wp-feed' ); ?></p>
			<?php endif; ?>
			<?php if ( $enabled ) : ?>
				<div class="klyna-feed-url">
					<input type="text" readonly value="<?php echo esc_attr( $url ); ?>" class="klyna-feed-url__input" aria-label="<?php esc_attr_e( 'Public feed URL', 'wp-feed' ); ?>">
					<button type="button" class="button klyna-feed-copy" data-clipboard="<?php echo esc_attr( $url ); ?>"><?php esc_html_e( 'Copy', 'wp-feed' ); ?></button>
				</div>
			<?php endif; ?>
		</div>
		<?php
	}

	public function render_health(): void {
		?>
		<div class="wrap klyna-feed-wrap">
			<h1><?php esc_html_e( 'Feed health', 'wp-feed' ); ?></h1>
			<p><?php esc_html_e( 'Klyna scans your catalog for products missing the fields Google and Meta require — GTIN, brand, images, price, and more. Fix these before submitting your feed to avoid disapprovals.', 'wp-feed' ); ?></p>
			<?php if ( ! Plugin::woocommerce_active() ) : ?>
				<div class="klyna-feed-notice klyna-feed-notice--warning">
					<?php esc_html_e( 'WooCommerce is not active, so there is no catalog to scan.', 'wp-feed' ); ?>
				</div>
			<?php else : ?>
				<button id="klyna-feed-scan" class="button button-primary"><?php esc_html_e( 'Scan catalog', 'wp-feed' ); ?></button>
				<span id="klyna-feed-scan-status" class="klyna-feed-status" role="status"></span>
				<div id="klyna-feed-health-output" class="klyna-feed-health-output"></div>
			<?php endif; ?>
		</div>
		<?php
	}

	public function render_settings(): void {
		$settings = Plugin::settings();
		$option   = KLYNA_FEED_OPTION_KEY;
		?>
		<div class="wrap klyna-feed-wrap">
			<h1><?php esc_html_e( 'Klyna Product Feed settings', 'wp-feed' ); ?></h1>
			<form method="post" action="options.php">
				<?php settings_fields( 'wp_feed_settings_group' ); ?>
				<table class="form-table" role="presentation">
					<tbody>
						<tr>
							<th scope="row"><?php esc_html_e( 'Feeds', 'wp-feed' ); ?></th>
							<td>
								<?php
								$this->checkbox( $option, 'enable_google', __( 'Generate Google Shopping XML feed', 'wp-feed' ), ! empty( $settings['enable_google'] ) );
								$this->checkbox( $option, 'enable_meta', __( 'Generate Meta (Facebook/Instagram) CSV feed', 'wp-feed' ), ! empty( $settings['enable_meta'] ) );
								?>
							</td>
						</tr>
						<tr>
							<th scope="row"><label for="schedule"><?php esc_html_e( 'Auto-refresh', 'wp-feed' ); ?></label></th>
							<td>
								<select id="schedule" name="<?php echo esc_attr( $option ); ?>[schedule]">
									<?php
									$schedules = array(
										'hourly'     => __( 'Every hour', 'wp-feed' ),
										'twicedaily' => __( 'Twice daily', 'wp-feed' ),
										'daily'      => __( 'Once a day', 'wp-feed' ),
										'off'        => __( 'Off (manual only)', 'wp-feed' ),
									);
									$current = $settings['schedule'] ?? 'daily';
									foreach ( $schedules as $value => $label ) {
										printf(
											'<option value="%1$s" %2$s>%3$s</option>',
											esc_attr( $value ),
											selected( $current, $value, false ),
											esc_html( $label )
										);
									}
									?>
								</select>
								<p class="description"><?php esc_html_e( 'Feeds regenerate on this schedule via WP-Cron. The public feed URL always serves the latest cached copy.', 'wp-feed' ); ?></p>
							</td>
						</tr>

						<tr>
							<th scope="row"><?php esc_html_e( 'Catalog filters', 'wp-feed' ); ?></th>
							<td>
								<?php $this->checkbox( $option, 'in_stock_only', __( 'Include in-stock products only', 'wp-feed' ), ! empty( $settings['in_stock_only'] ) ); ?>
								<?php $this->category_selects( $option, $settings ); ?>
							</td>
						</tr>

						<tr>
							<th scope="row"><label for="default_brand"><?php esc_html_e( 'Default brand', 'wp-feed' ); ?></label></th>
							<td>
								<input type="text" id="default_brand" name="<?php echo esc_attr( $option ); ?>[default_brand]" class="regular-text" value="<?php echo esc_attr( $settings['default_brand'] ?? '' ); ?>">
								<p class="description"><?php esc_html_e( 'Used when a product has no brand meta value.', 'wp-feed' ); ?></p>
							</td>
						</tr>
						<tr>
							<th scope="row"><label for="default_condition"><?php esc_html_e( 'Default condition', 'wp-feed' ); ?></label></th>
							<td>
								<select id="default_condition" name="<?php echo esc_attr( $option ); ?>[default_condition]">
									<?php
									$conditions = array(
										'new'         => __( 'New', 'wp-feed' ),
										'refurbished' => __( 'Refurbished', 'wp-feed' ),
										'used'        => __( 'Used', 'wp-feed' ),
									);
									$current_c  = $settings['default_condition'] ?? 'new';
									foreach ( $conditions as $value => $label ) {
										printf(
											'<option value="%1$s" %2$s>%3$s</option>',
											esc_attr( $value ),
											selected( $current_c, $value, false ),
											esc_html( $label )
										);
									}
									?>
								</select>
							</td>
						</tr>
						<tr>
							<th scope="row"><label for="google_category"><?php esc_html_e( 'Google product category', 'wp-feed' ); ?></label></th>
							<td>
								<input type="text" id="google_category" name="<?php echo esc_attr( $option ); ?>[google_category]" class="regular-text" value="<?php echo esc_attr( $settings['google_category'] ?? '' ); ?>" placeholder="<?php esc_attr_e( 'e.g. Apparel & Accessories > Clothing', 'wp-feed' ); ?>">
								<p class="description"><?php esc_html_e( 'Default Google product category. Per-product override: set the _google_product_category meta key.', 'wp-feed' ); ?></p>
							</td>
						</tr>

						<tr>
							<th scope="row"><label for="gtin_meta_key"><?php esc_html_e( 'GTIN meta key', 'wp-feed' ); ?></label></th>
							<td>
								<input type="text" id="gtin_meta_key" name="<?php echo esc_attr( $option ); ?>[gtin_meta_key]" class="regular-text code" value="<?php echo esc_attr( $settings['gtin_meta_key'] ?? '_gtin' ); ?>">
								<p class="description"><?php esc_html_e( 'The product meta key holding each product GTIN/UPC/EAN.', 'wp-feed' ); ?></p>
							</td>
						</tr>
						<tr>
							<th scope="row"><label for="brand_meta_key"><?php esc_html_e( 'Brand meta key', 'wp-feed' ); ?></label></th>
							<td>
								<input type="text" id="brand_meta_key" name="<?php echo esc_attr( $option ); ?>[brand_meta_key]" class="regular-text code" value="<?php echo esc_attr( $settings['brand_meta_key'] ?? '_brand' ); ?>">
								<p class="description"><?php esc_html_e( 'The product meta key holding each product brand. Falls back to the default brand above.', 'wp-feed' ); ?></p>
							</td>
						</tr>

						<tr>
							<th scope="row" colspan="2">
								<h2 style="margin:24px 0 4px;"><?php esc_html_e( 'AI title assistant', 'wp-feed' ); ?></h2>
								<p class="description" style="font-weight:400;">
									<?php esc_html_e( 'Optional. When configured, Klyna can generate per-channel optimized product titles (Google / Meta / Pinterest) from the Products list bulk action. Defaults to off; the plugin works without an AI key.', 'wp-feed' ); ?>
								</p>
							</th>
						</tr>
						<tr>
							<th scope="row"><label for="ai_provider"><?php esc_html_e( 'Provider', 'wp-feed' ); ?></label></th>
							<td>
								<select id="ai_provider" name="<?php echo esc_attr( $option ); ?>[ai_provider]">
									<?php
									$providers = array(
										''           => __( 'Off', 'wp-feed' ),
										'openrouter' => 'OpenRouter (free models)',
										'groq'       => 'Groq (fast & free)',
										'gemini'     => 'Google Gemini',
										'cloudflare' => 'Cloudflare Workers AI',
										'ollama'     => 'Ollama (self-hosted)',
									);
									$current_p = (string) ( $settings['ai_provider'] ?? '' );
									foreach ( $providers as $value => $label ) {
										printf(
											'<option value="%1$s" %2$s>%3$s</option>',
											esc_attr( $value ),
											selected( $current_p, $value, false ),
											esc_html( $label )
										);
									}
									?>
								</select>
								<p class="description"><?php esc_html_e( 'All listed providers offer free tiers. Leave on Off to disable the AI feature entirely.', 'wp-feed' ); ?></p>
							</td>
						</tr>
						<tr>
							<th scope="row"><label for="ai_api_key"><?php esc_html_e( 'API key', 'wp-feed' ); ?></label></th>
							<td>
								<input type="password" id="ai_api_key" name="<?php echo esc_attr( $option ); ?>[ai_api_key]" class="regular-text" value="<?php echo esc_attr( (string) ( $settings['ai_api_key'] ?? '' ) ); ?>" autocomplete="off">
								<p class="description"><?php esc_html_e( 'Stored only on this site. Ollama does not need a key.', 'wp-feed' ); ?></p>
							</td>
						</tr>
						<tr>
							<th scope="row"><label for="ai_model"><?php esc_html_e( 'Model (optional)', 'wp-feed' ); ?></label></th>
							<td>
								<input type="text" id="ai_model" name="<?php echo esc_attr( $option ); ?>[ai_model]" class="regular-text code" value="<?php echo esc_attr( (string) ( $settings['ai_model'] ?? '' ) ); ?>">
								<p class="description"><?php esc_html_e( 'Leave blank to use the provider default (e.g. Llama 3.3 70B for OpenRouter, gemini-2.0-flash for Gemini).', 'wp-feed' ); ?></p>
							</td>
						</tr>
						<tr>
							<th scope="row"><label for="ai_endpoint"><?php esc_html_e( 'Endpoint / Account ID', 'wp-feed' ); ?></label></th>
							<td>
								<input type="text" id="ai_endpoint" name="<?php echo esc_attr( $option ); ?>[ai_endpoint]" class="regular-text code" value="<?php echo esc_attr( (string) ( $settings['ai_endpoint'] ?? '' ) ); ?>">
								<p class="description"><?php esc_html_e( 'Cloudflare account ID, or Ollama URL (e.g. http://localhost:11434). Ignored for the other providers.', 'wp-feed' ); ?></p>
							</td>
						</tr>
						<tr>
							<th scope="row"><label for="ai_daily_cap"><?php esc_html_e( 'Daily call cap', 'wp-feed' ); ?></label></th>
							<td>
								<input type="number" id="ai_daily_cap" name="<?php echo esc_attr( $option ); ?>[ai_daily_cap]" min="1" step="1" value="<?php echo esc_attr( (string) ( $settings['ai_daily_cap'] ?? 100 ) ); ?>">
								<p class="description"><?php esc_html_e( 'Safety brake against runaway quota use. Resets at 00:00 UTC.', 'wp-feed' ); ?></p>
							</td>
						</tr>
						<tr>
							<th scope="row"><?php esc_html_e( 'Test connection', 'wp-feed' ); ?></th>
							<td>
								<button type="button" id="klyna-feed-ai-test" class="button"><?php esc_html_e( 'Test connection', 'wp-feed' ); ?></button>
								<span id="klyna-feed-ai-test-status" class="klyna-feed-status" role="status"></span>
								<p class="description"><?php esc_html_e( 'Sends a tiny prompt to the provider using the saved settings. Save first if you just changed them.', 'wp-feed' ); ?></p>
							</td>
						</tr>

						<tr>
							<th scope="row"><?php esc_html_e( 'Feed security token', 'wp-feed' ); ?></th>
							<td>
								<code class="klyna-feed-token"><?php echo esc_html( $settings['feed_token'] ?? '' ); ?></code>
								<label class="klyna-feed-regen-token">
									<input type="checkbox" name="<?php echo esc_attr( $option ); ?>[regenerate_token]" value="1">
									<?php esc_html_e( 'Regenerate token on save (invalidates the current public feed URLs)', 'wp-feed' ); ?>
								</label>
								<p class="description"><?php esc_html_e( 'The token is appended to every public feed URL so the feed is not guessable. Rotate it if a URL leaks.', 'wp-feed' ); ?></p>
							</td>
						</tr>
					</tbody>
				</table>
				<?php submit_button(); ?>
			</form>
		</div>
		<?php
	}

	/**
	 * Title-variants admin page. Shows AI-generated per-channel title
	 * previews for any product set, with an "Optimize now" button that
	 * runs the three-call sequence over the REST endpoint.
	 */
	public function render_titles(): void {
		$ids_raw = isset( $_GET['ids'] ) ? sanitize_text_field( wp_unslash( (string) $_GET['ids'] ) ) : '';
		$ids     = array();
		if ( '' !== $ids_raw ) {
			foreach ( explode( ',', $ids_raw ) as $piece ) {
				$id = absint( $piece );
				if ( $id > 0 ) {
					$ids[] = $id;
				}
			}
		}
		$auto_run = ! empty( $_GET['run'] );
		?>
		<div class="wrap klyna-feed-wrap">
			<h1><?php esc_html_e( 'AI title variants', 'wp-feed' ); ?></h1>
			<p>
				<?php esc_html_e( 'Three optimized titles per product — keyword-dense for Google (70 chars), conversational for Meta (60), lifestyle for Pinterest (50). The active channel feed uses the override; the original WooCommerce title stays untouched.', 'wp-feed' ); ?>
			</p>
			<?php
			$ai_provider = (string) ( Plugin::settings()['ai_provider'] ?? '' );
			if ( '' === $ai_provider ) :
				?>
				<div class="klyna-feed-notice klyna-feed-notice--warning">
					<?php
					printf(
						/* translators: %s: settings link. */
						wp_kses(
							__( 'AI is currently off. Pick a provider on the <a href="%s">Settings</a> page first.', 'wp-feed' ),
							array( 'a' => array( 'href' => array() ) )
						),
						esc_url( admin_url( 'admin.php?page=wp-feed-settings' ) )
					);
					?>
				</div>
			<?php endif; ?>
			<?php if ( ! Plugin::woocommerce_active() ) : ?>
				<div class="klyna-feed-notice klyna-feed-notice--warning">
					<?php esc_html_e( 'WooCommerce is not active.', 'wp-feed' ); ?>
				</div>
			<?php endif; ?>

			<div
				id="klyna-feed-titles-root"
				data-ids="<?php echo esc_attr( wp_json_encode( $ids ) ); ?>"
				data-autorun="<?php echo esc_attr( $auto_run ? '1' : '0' ); ?>"
				data-products="<?php echo esc_attr( wp_json_encode( $this->titles_preview_payload( $ids ) ) ); ?>"
			>
				<?php if ( $ids ) : ?>
					<div class="klyna-feed-toolbar" style="margin:16px 0;">
						<button type="button" id="klyna-feed-titles-run" class="button button-primary">
							<?php esc_html_e( 'Optimize selected products', 'wp-feed' ); ?>
						</button>
						<span id="klyna-feed-titles-status" class="klyna-feed-status" role="status"></span>
					</div>
				<?php else : ?>
					<p>
						<?php
						printf(
							/* translators: %s: products list link. */
							wp_kses(
								__( 'Pick products on the <a href="%s">Products</a> screen and choose "Optimize titles (Klyna AI)" in the bulk-action dropdown.', 'wp-feed' ),
								array( 'a' => array( 'href' => array() ) )
							),
							esc_url( admin_url( 'edit.php?post_type=product' ) )
						);
						?>
					</p>
				<?php endif; ?>
				<div id="klyna-feed-titles-table"></div>
			</div>
		</div>
		<?php
	}

	/**
	 * Build the per-product preview payload sent to the React-free JS UI.
	 *
	 * @param int[] $ids
	 * @return array<int,array<string,mixed>>
	 */
	private function titles_preview_payload( array $ids ): array {
		if ( ! $ids || ! Plugin::woocommerce_active() ) {
			return array();
		}
		$out = array();
		foreach ( $ids as $id ) {
			$product = function_exists( 'wc_get_product' ) ? wc_get_product( $id ) : null;
			if ( ! $product instanceof \WC_Product ) {
				continue;
			}
			$stored = Titles::get( $id );
			$out[]  = array(
				'id'        => (int) $id,
				'name'      => $product->get_name(),
				'edit_link' => get_edit_post_link( $id, 'raw' ),
				'variants'  => $stored,
			);
		}
		return $out;
	}

	/**
	 * Render a single labelled checkbox bound to the option array.
	 */
	private function checkbox( string $option, string $key, string $label, bool $checked ): void {
		printf(
			'<label style="display:block;margin-bottom:8px;"><input type="checkbox" name="%1$s[%2$s]" value="1" %3$s> %4$s</label>',
			esc_attr( $option ),
			esc_attr( $key ),
			checked( $checked, true, false ),
			esc_html( $label )
		);
	}

	/**
	 * Render include/exclude product-category multi-selects.
	 *
	 * @param array<string,mixed> $settings
	 */
	private function category_selects( string $option, array $settings ): void {
		$terms = array();
		if ( taxonomy_exists( 'product_cat' ) ) {
			$terms = get_terms(
				array(
					'taxonomy'   => 'product_cat',
					'hide_empty' => false,
				)
			);
		}
		if ( ! is_array( $terms ) || ! $terms ) {
			echo '<p class="description">' . esc_html__( 'No product categories found yet.', 'wp-feed' ) . '</p>';
			return;
		}

		$pairs = array(
			'include_categories' => __( 'Include only these categories (leave empty for all)', 'wp-feed' ),
			'exclude_categories' => __( 'Exclude these categories', 'wp-feed' ),
		);
		foreach ( $pairs as $key => $label ) {
			$selected = array_map( 'absint', (array) ( $settings[ $key ] ?? array() ) );
			echo '<p style="margin-top:12px;"><label for="' . esc_attr( $key ) . '"><strong>' . esc_html( $label ) . '</strong></label></p>';
			echo '<select id="' . esc_attr( $key ) . '" name="' . esc_attr( $option ) . '[' . esc_attr( $key ) . '][]" multiple size="5" class="klyna-feed-multiselect">';
			foreach ( $terms as $term ) {
				printf(
					'<option value="%1$d" %2$s>%3$s</option>',
					(int) $term->term_id,
					selected( in_array( (int) $term->term_id, $selected, true ), true, false ),
					esc_html( $term->name )
				);
			}
			echo '</select>';
		}
	}

	/**
	 * @param string[] $links
	 * @return string[]
	 */
	public function add_settings_link( array $links ): array {
		$url   = admin_url( 'admin.php?page=wp-feed-settings' );
		$label = __( 'Settings', 'wp-feed' );
		$first = sprintf( '<a href="%s">%s</a>', esc_url( $url ), esc_html( $label ) );
		array_unshift( $links, $first );
		return $links;
	}
}
