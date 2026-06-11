<?php
/**
 * Admin UI — settings page + cache dashboard.
 *
 * @package KlynaSpeed
 */

namespace KlynaSpeed;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Admin {

	private const MENU_SLUG = 'wp-speed';

	public function register(): void {
		add_action( 'admin_menu', array( $this, 'register_menu' ) );
		add_action( 'admin_init', array( $this, 'register_settings' ) );
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue_assets' ) );
		add_action( 'admin_bar_menu', array( $this, 'admin_bar_purge' ), 100 );
		add_filter(
			'plugin_action_links_' . plugin_basename( KLYNA_SPEED_PLUGIN_FILE ),
			array( $this, 'add_settings_link' )
		);
	}

	public function register_menu(): void {
		add_menu_page(
			__( 'Klyna Speed', 'wp-speed' ),
			__( 'Klyna Speed', 'wp-speed' ),
			'manage_options',
			self::MENU_SLUG,
			array( $this, 'render_dashboard' ),
			'data:image/svg+xml;base64,' . base64_encode(
				'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#9ca3af"><rect x="2" y="2" width="20" height="20" rx="5"/><path d="M12 18a6 6 0 1 1 6-6" stroke="white" stroke-width="2" stroke-linecap="round" fill="none"/><path d="M12 12l3.5-3" stroke="white" stroke-width="2" stroke-linecap="round" fill="none"/><circle cx="12" cy="12" r="1.4" fill="white"/></svg>'
			),
			65
		);
		add_submenu_page(
			self::MENU_SLUG,
			__( 'Dashboard', 'wp-speed' ),
			__( 'Dashboard', 'wp-speed' ),
			'manage_options',
			self::MENU_SLUG,
			array( $this, 'render_dashboard' )
		);
		add_submenu_page(
			self::MENU_SLUG,
			__( 'Settings', 'wp-speed' ),
			__( 'Settings', 'wp-speed' ),
			'manage_options',
			'wp-speed-settings',
			array( $this, 'render_settings' )
		);
	}

	public function register_settings(): void {
		register_setting(
			'wp_speed_settings_group',
			KLYNA_SPEED_OPTION_KEY,
			array(
				'type'              => 'array',
				'sanitize_callback' => array( $this, 'sanitize_settings' ),
				'default'           => Plugin::defaults(),
			)
		);
	}

	/**
	 * @param mixed $input
	 * @return array<string,mixed>
	 */
	public function sanitize_settings( $input ): array {
		$input = is_array( $input ) ? $input : array();
		$out   = array();

		$bool_keys = array(
			'enable_page_cache',
			'cache_logged_in',
			'enable_lazyload',
			'lazyload_iframes',
			'enable_defer_js',
			'enable_minify_css',
			'enable_minify_html',
			'enable_preload',
		);
		foreach ( $bool_keys as $k ) {
			$out[ $k ] = ! empty( $input[ $k ] );
		}

		$out['cache_ttl_hours'] = isset( $input['cache_ttl_hours'] )
			? max( 1, min( 720, (int) $input['cache_ttl_hours'] ) )
			: 10;

		$allowed_modes        = array( 'default', 'slow', 'editor', 'off' );
		$mode                 = isset( $input['heartbeat_mode'] ) ? sanitize_key( (string) $input['heartbeat_mode'] ) : 'slow';
		$out['heartbeat_mode'] = in_array( $mode, $allowed_modes, true ) ? $mode : 'slow';

		$out['preload_urls'] = isset( $input['preload_urls'] )
			? sanitize_textarea_field( (string) $input['preload_urls'] )
			: '';
		$out['exclude_urls'] = isset( $input['exclude_urls'] )
			? sanitize_textarea_field( (string) $input['exclude_urls'] )
			: '';

		// Note: the whole cache is purged via the `update_option_` hook in
		// Cache::register() once the new settings are persisted, so nothing
		// stale survives a settings change.
		return $out;
	}

	public function enqueue_assets( string $hook ): void {
		if ( strpos( $hook, 'wp-speed' ) === false ) {
			return;
		}
		wp_enqueue_style(
			'klyna-speed-admin',
			KLYNA_SPEED_PLUGIN_URL . 'assets/admin/admin.css',
			array(),
			KLYNA_SPEED_VERSION
		);
		wp_enqueue_script(
			'klyna-speed-admin',
			KLYNA_SPEED_PLUGIN_URL . 'assets/admin/admin.js',
			array( 'wp-api-fetch' ),
			KLYNA_SPEED_VERSION,
			true
		);
		wp_localize_script(
			'klyna-speed-admin',
			'KLYNA_SPEED',
			array(
				'apiBase' => esc_url_raw( rest_url( 'klyna-speed/v1' ) ),
				'nonce'   => wp_create_nonce( 'wp_rest' ),
				'i18n'    => array(
					'purging'  => __( 'Purging…', 'wp-speed' ),
					'purged'   => __( 'Cache purged.', 'wp-speed' ),
					'failed'   => __( 'Something went wrong. Try again.', 'wp-speed' ),
					'purgeAll' => __( 'Purge all cache', 'wp-speed' ),
				),
			)
		);
	}

	/**
	 * Add a "Purge Klyna cache" item to the front-end admin bar.
	 *
	 * @param \WP_Admin_Bar $bar Admin bar instance.
	 */
	public function admin_bar_purge( $bar ): void {
		if ( ! current_user_can( 'manage_options' ) || ! $bar instanceof \WP_Admin_Bar ) {
			return;
		}
		$bar->add_node(
			array(
				'id'    => 'klyna-speed-purge',
				'title' => __( 'Purge Klyna cache', 'wp-speed' ),
				'href'  => wp_nonce_url( admin_url( 'admin.php?page=wp-speed&klyna_purge=1' ), 'klyna_speed_purge' ),
				'meta'  => array( 'title' => __( 'Clear all cached pages', 'wp-speed' ) ),
			)
		);
	}

	public function render_dashboard(): void {
		$this->maybe_handle_quick_purge();

		$stats   = Cache::stats();
		$enabled = (bool) Plugin::get( 'enable_page_cache', true );
		?>
		<div class="wrap klyna-speed-wrap">
			<div class="klyna-speed-head">
				<span class="klyna-speed-logo" aria-hidden="true"><?php echo $this->logo_svg(); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Static, trusted inline SVG. ?></span>
				<div>
					<h1><?php esc_html_e( 'Klyna Speed', 'wp-speed' ); ?></h1>
					<p class="klyna-speed-tagline"><?php esc_html_e( 'Performance & Core Web Vitals — page cache, lazyload, defer, minify.', 'wp-speed' ); ?></p>
				</div>
			</div>

			<div class="klyna-speed-cards">
				<div class="klyna-speed-card klyna-speed-stat">
					<span class="klyna-speed-stat-num" id="klyna-speed-files"><?php echo esc_html( number_format_i18n( $stats['files'] ) ); ?></span>
					<span class="klyna-speed-stat-label"><?php esc_html_e( 'Cached pages', 'wp-speed' ); ?></span>
				</div>
				<div class="klyna-speed-card klyna-speed-stat">
					<span class="klyna-speed-stat-num" id="klyna-speed-size"><?php echo esc_html( size_format( $stats['bytes'], 1 ) ); ?></span>
					<span class="klyna-speed-stat-label"><?php esc_html_e( 'On disk', 'wp-speed' ); ?></span>
				</div>
				<div class="klyna-speed-card klyna-speed-stat">
					<span class="klyna-speed-stat-num klyna-speed-badge <?php echo $enabled ? 'is-on' : 'is-off'; ?>">
						<?php echo $enabled ? esc_html__( 'On', 'wp-speed' ) : esc_html__( 'Off', 'wp-speed' ); ?>
					</span>
					<span class="klyna-speed-stat-label"><?php esc_html_e( 'Page cache', 'wp-speed' ); ?></span>
				</div>
			</div>

			<div class="klyna-speed-actions">
				<button id="klyna-speed-purge" class="button button-primary klyna-speed-btn">
					<?php esc_html_e( 'Purge all cache', 'wp-speed' ); ?>
				</button>
				<a class="button klyna-speed-btn-ghost" href="<?php echo esc_url( admin_url( 'admin.php?page=wp-speed-settings' ) ); ?>">
					<?php esc_html_e( 'Settings', 'wp-speed' ); ?>
				</a>
				<span id="klyna-speed-status" class="klyna-speed-status" role="status" aria-live="polite"></span>
			</div>

			<div class="klyna-speed-cards klyna-speed-features">
				<?php
				$features = array(
					array( __( 'Full-page cache', 'wp-speed' ), 'enable_page_cache', __( 'Serves static HTML from disk with smart invalidation on every save.', 'wp-speed' ) ),
					array( __( 'Lazy-load', 'wp-speed' ), 'enable_lazyload', __( 'Defers off-screen images and iframes; never the LCP image.', 'wp-speed' ) ),
					array( __( 'Defer JS', 'wp-speed' ), 'enable_defer_js', __( 'Adds defer to non-critical external scripts to unblock render.', 'wp-speed' ) ),
					array( __( 'Minify CSS & HTML', 'wp-speed' ), 'enable_minify_css', __( 'Strips comments and whitespace from local CSS and the page HTML.', 'wp-speed' ) ),
					array( __( 'Preload key assets', 'wp-speed' ), 'enable_preload', __( 'Emits <link rel="preload"> for the fonts and assets you choose.', 'wp-speed' ) ),
					array( __( 'Heartbeat control', 'wp-speed' ), null, __( 'Throttles or disables admin-ajax polling to save CPU.', 'wp-speed' ) ),
				);
				foreach ( $features as $feature ) {
					list( $title, $flag, $desc ) = $feature;
					$on = null === $flag ? ( 'default' !== Plugin::get( 'heartbeat_mode', 'slow' ) ) : (bool) Plugin::get( $flag, true );
					?>
					<div class="klyna-speed-card klyna-speed-feature">
						<div class="klyna-speed-feature-head">
							<h2><?php echo esc_html( $title ); ?></h2>
							<span class="klyna-speed-dot <?php echo $on ? 'is-on' : 'is-off'; ?>" aria-hidden="true"></span>
						</div>
						<p><?php echo esc_html( $desc ); ?></p>
					</div>
					<?php
				}
				?>
			</div>
		</div>
		<?php
	}

	public function render_settings(): void {
		$s = wp_parse_args( Plugin::settings(), Plugin::defaults() );
		?>
		<div class="wrap klyna-speed-wrap">
			<div class="klyna-speed-head">
				<span class="klyna-speed-logo" aria-hidden="true"><?php echo $this->logo_svg(); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Static, trusted inline SVG. ?></span>
				<div>
					<h1><?php esc_html_e( 'Klyna Speed settings', 'wp-speed' ); ?></h1>
					<p class="klyna-speed-tagline"><?php esc_html_e( 'Toggle each optimization. Saving any setting clears the cache automatically.', 'wp-speed' ); ?></p>
				</div>
			</div>

			<form method="post" action="options.php" class="klyna-speed-form">
				<?php settings_fields( 'wp_speed_settings_group' ); ?>
				<?php $opt = KLYNA_SPEED_OPTION_KEY; ?>

				<h2 class="klyna-speed-section"><?php esc_html_e( 'Page cache', 'wp-speed' ); ?></h2>
				<table class="form-table" role="presentation">
					<tbody>
						<tr>
							<th scope="row"><?php esc_html_e( 'Full-page cache', 'wp-speed' ); ?></th>
							<td>
								<?php $this->checkbox( $opt, 'enable_page_cache', __( 'Cache rendered pages to disk and serve them statically', 'wp-speed' ), $s ); ?>
								<?php $this->checkbox( $opt, 'cache_logged_in', __( 'Also cache pages for logged-in users (not recommended on membership sites)', 'wp-speed' ), $s ); ?>
							</td>
						</tr>
						<tr>
							<th scope="row"><label for="cache_ttl_hours"><?php esc_html_e( 'Cache lifetime (hours)', 'wp-speed' ); ?></label></th>
							<td>
								<input type="number" min="1" max="720" id="cache_ttl_hours" name="<?php echo esc_attr( $opt ); ?>[cache_ttl_hours]" value="<?php echo esc_attr( (string) $s['cache_ttl_hours'] ); ?>" class="small-text">
								<p class="description"><?php esc_html_e( 'How long a cached page stays fresh before it is rebuilt. Default 10.', 'wp-speed' ); ?></p>
							</td>
						</tr>
						<tr>
							<th scope="row"><label for="exclude_urls"><?php esc_html_e( 'Never cache these paths', 'wp-speed' ); ?></label></th>
							<td>
								<textarea id="exclude_urls" name="<?php echo esc_attr( $opt ); ?>[exclude_urls]" rows="3" class="large-text code" placeholder="/cart&#10;/checkout&#10;/account/*"><?php echo esc_textarea( (string) $s['exclude_urls'] ); ?></textarea>
								<p class="description"><?php esc_html_e( 'One path per line. Use * as a wildcard (e.g. /account/*).', 'wp-speed' ); ?></p>
							</td>
						</tr>
					</tbody>
				</table>

				<h2 class="klyna-speed-section"><?php esc_html_e( 'Front-end optimization', 'wp-speed' ); ?></h2>
				<table class="form-table" role="presentation">
					<tbody>
						<tr>
							<th scope="row"><?php esc_html_e( 'Lazy-load', 'wp-speed' ); ?></th>
							<td>
								<?php $this->checkbox( $opt, 'enable_lazyload', __( 'Lazy-load off-screen images (the first image is always eager for LCP)', 'wp-speed' ), $s ); ?>
								<?php $this->checkbox( $opt, 'lazyload_iframes', __( 'Lazy-load iframes (YouTube, maps, embeds)', 'wp-speed' ), $s ); ?>
							</td>
						</tr>
						<tr>
							<th scope="row"><?php esc_html_e( 'JavaScript', 'wp-speed' ); ?></th>
							<td>
								<?php $this->checkbox( $opt, 'enable_defer_js', __( 'Defer non-critical external scripts (jQuery core is left untouched)', 'wp-speed' ), $s ); ?>
							</td>
						</tr>
						<tr>
							<th scope="row"><?php esc_html_e( 'Minify', 'wp-speed' ); ?></th>
							<td>
								<?php $this->checkbox( $opt, 'enable_minify_css', __( 'Minify local CSS files (cached on disk)', 'wp-speed' ), $s ); ?>
								<?php $this->checkbox( $opt, 'enable_minify_html', __( 'Minify the page HTML (whitespace + comments)', 'wp-speed' ), $s ); ?>
							</td>
						</tr>
					</tbody>
				</table>

				<h2 class="klyna-speed-section"><?php esc_html_e( 'Preloading & Heartbeat', 'wp-speed' ); ?></h2>
				<table class="form-table" role="presentation">
					<tbody>
						<tr>
							<th scope="row"><?php esc_html_e( 'Preload key assets', 'wp-speed' ); ?></th>
							<td>
								<?php $this->checkbox( $opt, 'enable_preload', __( 'Emit preload hints for the URLs below', 'wp-speed' ), $s ); ?>
								<textarea id="preload_urls" name="<?php echo esc_attr( $opt ); ?>[preload_urls]" rows="3" class="large-text code" placeholder="https://example.com/fonts/geist.woff2&#10;https://example.com/hero.webp"><?php echo esc_textarea( (string) $s['preload_urls'] ); ?></textarea>
								<p class="description"><?php esc_html_e( 'One absolute URL per line. The resource type is detected from the extension; fonts get crossorigin automatically.', 'wp-speed' ); ?></p>
							</td>
						</tr>
						<tr>
							<th scope="row"><label for="heartbeat_mode"><?php esc_html_e( 'Heartbeat', 'wp-speed' ); ?></label></th>
							<td>
								<?php
								$modes = array(
									'default' => __( 'Default (leave WordPress alone)', 'wp-speed' ),
									'slow'    => __( 'Slow — 60s interval everywhere', 'wp-speed' ),
									'editor'  => __( 'Editor only — disable elsewhere', 'wp-speed' ),
									'off'     => __( 'Off — disable Heartbeat entirely', 'wp-speed' ),
								);
								?>
								<select id="heartbeat_mode" name="<?php echo esc_attr( $opt ); ?>[heartbeat_mode]">
									<?php foreach ( $modes as $value => $label ) : ?>
										<option value="<?php echo esc_attr( $value ); ?>" <?php selected( $s['heartbeat_mode'], $value ); ?>>
											<?php echo esc_html( $label ); ?>
										</option>
									<?php endforeach; ?>
								</select>
								<p class="description"><?php esc_html_e( 'The Heartbeat API polls the server on a timer. Slowing it down saves CPU on busy dashboards.', 'wp-speed' ); ?></p>
							</td>
						</tr>
					</tbody>
				</table>

				<?php submit_button( __( 'Save changes', 'wp-speed' ) ); ?>
			</form>
		</div>
		<?php
	}

	/**
	 * Render a single checkbox bound to a settings key.
	 *
	 * @param string              $opt      Option key.
	 * @param string              $key      Setting key.
	 * @param string              $label    Label text.
	 * @param array<string,mixed> $settings Current settings.
	 */
	private function checkbox( string $opt, string $key, string $label, array $settings ): void {
		printf(
			'<label class="klyna-speed-check"><input type="checkbox" name="%1$s[%2$s]" value="1" %3$s> %4$s</label>',
			esc_attr( $opt ),
			esc_attr( $key ),
			checked( ! empty( $settings[ $key ] ), true, false ),
			esc_html( $label )
		);
	}

	/**
	 * Handle the admin-bar / quick "purge all" link (nonce-protected GET).
	 */
	private function maybe_handle_quick_purge(): void {
		if ( ! isset( $_GET['klyna_purge'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended
			return;
		}
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		$nonce = isset( $_GET['_wpnonce'] ) ? sanitize_text_field( wp_unslash( $_GET['_wpnonce'] ) ) : '';
		if ( ! wp_verify_nonce( $nonce, 'klyna_speed_purge' ) ) {
			return;
		}
		$removed = Cache::purge_all();
		add_action(
			'admin_notices',
			static function () use ( $removed ) {
				printf(
					'<div class="notice notice-success is-dismissible"><p>%s</p></div>',
					esc_html(
						sprintf(
							/* translators: %d: number of cached pages removed. */
							_n( 'Purged %d cached page.', 'Purged %d cached pages.', $removed, 'wp-speed' ),
							$removed
						)
					)
				);
			}
		);
	}

	/**
	 * Inline brand logo for admin headers.
	 */
	private function logo_svg(): string {
		return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" role="img" aria-label="Klyna Speed">'
			. '<defs><linearGradient id="klyna-speed-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#9277ff"/><stop offset="100%" stop-color="#5b3df0"/></linearGradient></defs>'
			. '<rect x="2" y="2" width="28" height="28" rx="7" fill="url(#klyna-speed-grad)"/>'
			. '<path d="M16 23a7 7 0 1 1 7-7" stroke="#fff" stroke-width="2.5" stroke-linecap="round" fill="none"/>'
			. '<path d="M16 16l5-4.5" stroke="#fff" stroke-width="2.5" stroke-linecap="round" fill="none"/>'
			. '<circle cx="16" cy="16" r="1.9" fill="#fff"/>'
			. '</svg>';
	}

	/**
	 * @param string[] $links
	 * @return string[]
	 */
	public function add_settings_link( array $links ): array {
		$url   = admin_url( 'admin.php?page=wp-speed-settings' );
		$label = __( 'Settings', 'wp-speed' );
		$first = sprintf( '<a href="%s">%s</a>', esc_url( $url ), esc_html( $label ) );
		array_unshift( $links, $first );
		return $links;
	}
}
