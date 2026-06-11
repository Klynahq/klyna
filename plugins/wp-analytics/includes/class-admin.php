<?php
/**
 * Admin UI — analytics dashboard report + settings page.
 *
 * @package KlynaAnalytics
 */

namespace KlynaAnalytics;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Admin {

	private const MENU_SLUG = 'wp-analytics';

	public function register(): void {
		add_action( 'admin_menu', array( $this, 'register_menu' ) );
		add_action( 'admin_init', array( $this, 'register_settings' ) );
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue_assets' ) );
		add_filter(
			'plugin_action_links_' . plugin_basename( KLYNA_ANALYTICS_PLUGIN_FILE ),
			array( $this, 'add_settings_link' )
		);
	}

	public function register_menu(): void {
		add_menu_page(
			__( 'Klyna Analytics', 'wp-analytics' ),
			__( 'Analytics', 'wp-analytics' ),
			'manage_options',
			self::MENU_SLUG,
			array( $this, 'render_dashboard' ),
			'data:image/svg+xml;base64,' . base64_encode(
				'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#9ca3af"><rect x="2" y="2" width="20" height="20" rx="5"/><path d="M7 16v-3M12 16V9M17 16V6" stroke="white" stroke-width="2" stroke-linecap="round" fill="none"/></svg>'
			),
			66
		);
		add_submenu_page(
			self::MENU_SLUG,
			__( 'Dashboard', 'wp-analytics' ),
			__( 'Dashboard', 'wp-analytics' ),
			'manage_options',
			self::MENU_SLUG,
			array( $this, 'render_dashboard' )
		);
		add_submenu_page(
			self::MENU_SLUG,
			__( 'Settings', 'wp-analytics' ),
			__( 'Settings', 'wp-analytics' ),
			'manage_options',
			'wp-analytics-settings',
			array( $this, 'render_settings' )
		);
	}

	public function register_settings(): void {
		register_setting(
			'wp_analytics_settings_group',
			KLYNA_ANALYTICS_OPTION_KEY,
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

		$bool_keys = array( 'enabled', 'respect_dnt', 'track_logged_in', 'exclude_admins' );
		foreach ( $bool_keys as $k ) {
			$out[ $k ] = ! empty( $input[ $k ] );
		}

		$days                  = isset( $input['retention_days'] ) ? absint( $input['retention_days'] ) : 365;
		$out['retention_days'] = max( 1, min( 3650, $days ) );

		// The salt is generated once and never exposed in the form; preserve it.
		$out['hash_salt'] = ! empty( $existing['hash_salt'] )
			? (string) $existing['hash_salt']
			: wp_generate_password( 32, false, false );

		// AI assistant settings.
		$catalog       = Ai::provider_catalog();
		$valid_keys    = array_keys( $catalog );
		$valid_keys[]  = 'off';
		$provider_in   = isset( $input['ai_provider'] ) ? sanitize_key( (string) $input['ai_provider'] ) : 'off';
		$out['ai_provider'] = in_array( $provider_in, $valid_keys, true ) ? $provider_in : 'off';

		// API key: a placeholder of asterisks means "leave unchanged".
		$incoming_key = isset( $input['ai_api_key'] ) ? (string) $input['ai_api_key'] : '';
		if ( '' === $incoming_key || preg_match( '/^\*+$/', $incoming_key ) ) {
			$out['ai_api_key'] = (string) ( $existing['ai_api_key'] ?? '' );
		} else {
			$out['ai_api_key'] = sanitize_text_field( $incoming_key );
		}

		$out['ai_model']    = isset( $input['ai_model'] ) ? sanitize_text_field( (string) $input['ai_model'] ) : '';
		$out['ai_endpoint'] = isset( $input['ai_endpoint'] ) ? esc_url_raw( (string) $input['ai_endpoint'] ) : '';
		$cap                = isset( $input['ai_daily_cap'] ) ? absint( $input['ai_daily_cap'] ) : 100;
		$out['ai_daily_cap'] = max( 1, min( 10000, $cap ) );

		return $out;
	}

	public function enqueue_assets( string $hook ): void {
		if ( strpos( $hook, 'wp-analytics' ) === false ) {
			return;
		}
		wp_enqueue_style(
			'klyna-analytics-admin',
			KLYNA_ANALYTICS_PLUGIN_URL . 'assets/admin/admin.css',
			array(),
			KLYNA_ANALYTICS_VERSION
		);
		wp_enqueue_script(
			'klyna-analytics-admin',
			KLYNA_ANALYTICS_PLUGIN_URL . 'assets/admin/admin.js',
			array( 'wp-api-fetch' ),
			KLYNA_ANALYTICS_VERSION,
			true
		);
		wp_localize_script(
			'klyna-analytics-admin',
			'KlynaAnalyticsAdmin',
			array(
				'apiBase' => esc_url_raw( rest_url( 'klyna-analytics/v1' ) ),
				'nonce'   => wp_create_nonce( 'wp_rest' ),
			)
		);
	}

	public function render_dashboard(): void {
		$reports = new Reports();
		$days    = 30;
		$series  = $reports->daily_series( $days );
		$totals  = $reports->totals( $days );
		?>
		<div class="wrap klyna-an-wrap" id="klyna-analytics-app" data-days="<?php echo esc_attr( (string) $days ); ?>">
			<div class="klyna-an-header">
				<div class="klyna-an-brand">
					<?php echo self::logo_svg(); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- static trusted SVG. ?>
					<div>
						<h1><?php esc_html_e( 'Klyna Analytics', 'wp-analytics' ); ?></h1>
						<p class="klyna-an-tagline"><?php esc_html_e( 'Privacy-first, cookieless analytics. Your data never leaves this server.', 'wp-analytics' ); ?></p>
					</div>
				</div>
				<label class="klyna-an-range">
					<span class="screen-reader-text"><?php esc_html_e( 'Date range', 'wp-analytics' ); ?></span>
					<select id="klyna-an-range">
						<option value="7"><?php esc_html_e( 'Last 7 days', 'wp-analytics' ); ?></option>
						<option value="30" selected><?php esc_html_e( 'Last 30 days', 'wp-analytics' ); ?></option>
						<option value="90"><?php esc_html_e( 'Last 90 days', 'wp-analytics' ); ?></option>
						<option value="365"><?php esc_html_e( 'Last 12 months', 'wp-analytics' ); ?></option>
					</select>
				</label>
			</div>

			<div class="klyna-an-stats">
				<div class="klyna-an-stat">
					<span class="klyna-an-stat-label"><?php esc_html_e( 'Pageviews', 'wp-analytics' ); ?></span>
					<span class="klyna-an-stat-value" id="klyna-an-views"><?php echo esc_html( number_format_i18n( $totals['views'] ) ); ?></span>
				</div>
				<div class="klyna-an-stat">
					<span class="klyna-an-stat-label"><?php esc_html_e( 'Unique visitors', 'wp-analytics' ); ?></span>
					<span class="klyna-an-stat-value" id="klyna-an-visitors"><?php echo esc_html( number_format_i18n( $totals['visitors'] ) ); ?></span>
				</div>
				<div class="klyna-an-stat">
					<span class="klyna-an-stat-label"><?php esc_html_e( 'Views / visitor', 'wp-analytics' ); ?></span>
					<span class="klyna-an-stat-value" id="klyna-an-ratio">
						<?php
						$ratio = $totals['visitors'] > 0 ? $totals['views'] / $totals['visitors'] : 0;
						echo esc_html( number_format_i18n( $ratio, 1 ) );
						?>
					</span>
				</div>
			</div>

			<?php $this->render_insight_card(); ?>

			<div class="klyna-an-card klyna-an-chart-card">
				<div class="klyna-an-card-head">
					<h2><?php esc_html_e( 'Views over time', 'wp-analytics' ); ?></h2>
				</div>
				<canvas id="klyna-an-chart" height="220" aria-hidden="true"></canvas>
				<noscript>
					<?php echo Reports::sparkline_svg( $series ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- self-built SVG. ?>
				</noscript>
			</div>

			<div class="klyna-an-grid">
				<div class="klyna-an-card">
					<div class="klyna-an-card-head">
						<h2><?php esc_html_e( 'Top pages', 'wp-analytics' ); ?></h2>
					</div>
					<table class="klyna-an-table" id="klyna-an-pages">
						<tbody>
							<tr class="klyna-an-empty"><td><?php esc_html_e( 'Loading…', 'wp-analytics' ); ?></td></tr>
						</tbody>
					</table>
				</div>

				<div class="klyna-an-card">
					<div class="klyna-an-card-head">
						<h2><?php esc_html_e( 'Top referrers', 'wp-analytics' ); ?></h2>
					</div>
					<table class="klyna-an-table" id="klyna-an-referrers">
						<tbody>
							<tr class="klyna-an-empty"><td><?php esc_html_e( 'Loading…', 'wp-analytics' ); ?></td></tr>
						</tbody>
					</table>
				</div>

				<div class="klyna-an-card">
					<div class="klyna-an-card-head">
						<h2><?php esc_html_e( 'Custom events', 'wp-analytics' ); ?></h2>
					</div>
					<table class="klyna-an-table" id="klyna-an-events">
						<tbody>
							<tr class="klyna-an-empty"><td><?php esc_html_e( 'No events yet.', 'wp-analytics' ); ?></td></tr>
						</tbody>
					</table>
				</div>
			</div>

			<p class="klyna-an-foot">
				<?php esc_html_e( 'Cookieless. No personal data is stored — only aggregated daily counters. Respects Do-Not-Track and Global Privacy Control.', 'wp-analytics' ); ?>
			</p>
		</div>
		<?php
	}

	public function render_settings(): void {
		$settings = Plugin::settings();
		$snippet  = "wpAnalytics( 'signup', 'newsletter' );";
		?>
		<div class="wrap klyna-an-wrap">
			<div class="klyna-an-header">
				<div class="klyna-an-brand">
					<?php echo self::logo_svg(); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- static trusted SVG. ?>
					<div>
						<h1><?php esc_html_e( 'Analytics settings', 'wp-analytics' ); ?></h1>
						<p class="klyna-an-tagline"><?php esc_html_e( 'Control what gets counted. Nothing here phones home.', 'wp-analytics' ); ?></p>
					</div>
				</div>
			</div>

			<form method="post" action="options.php" class="klyna-an-card klyna-an-form">
				<?php settings_fields( 'wp_analytics_settings_group' ); ?>
				<table class="form-table" role="presentation">
					<tbody>
						<tr>
							<th scope="row"><?php esc_html_e( 'Tracking', 'wp-analytics' ); ?></th>
							<td>
								<?php
								$toggles = array(
									'enabled'         => __( 'Enable analytics collection', 'wp-analytics' ),
									'respect_dnt'     => __( 'Respect Do-Not-Track & Global Privacy Control (recommended)', 'wp-analytics' ),
									'exclude_admins'  => __( 'Do not track administrators', 'wp-analytics' ),
									'track_logged_in' => __( 'Track logged-in users', 'wp-analytics' ),
								);
								foreach ( $toggles as $key => $label ) {
									printf(
										'<label class="klyna-an-check"><input type="checkbox" name="%1$s[%2$s]" value="1" %3$s> %4$s</label>',
										esc_attr( KLYNA_ANALYTICS_OPTION_KEY ),
										esc_attr( $key ),
										checked( ! empty( $settings[ $key ] ), true, false ),
										esc_html( $label )
									);
								}
								?>
							</td>
						</tr>
						<tr>
							<th scope="row"><label for="retention_days"><?php esc_html_e( 'Data retention', 'wp-analytics' ); ?></label></th>
							<td>
								<input type="number" id="retention_days" min="1" max="3650" step="1"
									name="<?php echo esc_attr( KLYNA_ANALYTICS_OPTION_KEY ); ?>[retention_days]"
									value="<?php echo esc_attr( (string) $settings['retention_days'] ); ?>" class="small-text">
								<span class="description"><?php esc_html_e( 'days. Older aggregates are pruned automatically.', 'wp-analytics' ); ?></span>
							</td>
						</tr>
						<?php $this->render_ai_settings_rows( $settings ); ?>
					</tbody>
				</table>
				<?php submit_button(); ?>
			</form>

			<div class="klyna-an-card">
				<div class="klyna-an-card-head">
					<h2><?php esc_html_e( 'Track custom events', 'wp-analytics' ); ?></h2>
				</div>
				<p class="klyna-an-muted">
					<?php esc_html_e( 'Pageviews are tracked automatically. To record a custom event (a signup, a download, a CTA click), call the global beacon from your theme or block:', 'wp-analytics' ); ?>
				</p>
				<pre class="klyna-an-code"><code><?php echo esc_html( $snippet ); ?></code></pre>
				<p class="klyna-an-muted">
					<?php esc_html_e( 'Event names are lowercase slugs. No arguments beyond the event name are stored.', 'wp-analytics' ); ?>
				</p>
			</div>
		</div>
		<?php
	}

	/**
	 * @param string[] $links
	 * @return string[]
	 */
	public function add_settings_link( array $links ): array {
		$url   = admin_url( 'admin.php?page=wp-analytics-settings' );
		$label = __( 'Settings', 'wp-analytics' );
		$first = sprintf( '<a href="%s">%s</a>', esc_url( $url ), esc_html( $label ) );
		array_unshift( $links, $first );
		return $links;
	}

	/**
	 * AI assistant settings rows, injected into the main settings form so
	 * everything saves through one option array.
	 *
	 * @param array<string,mixed> $settings
	 */
	private function render_ai_settings_rows( array $settings ): void {
		$catalog        = Ai::provider_catalog();
		$current        = (string) ( $settings['ai_provider'] ?? 'off' );
		$has_key        = ! empty( $settings['ai_api_key'] );
		$key_placeholder = $has_key ? str_repeat( '*', 12 ) : '';
		$model          = (string) ( $settings['ai_model'] ?? '' );
		$endpoint       = (string) ( $settings['ai_endpoint'] ?? '' );
		$cap            = (int) ( $settings['ai_daily_cap'] ?? 100 );
		$test_url       = esc_url_raw( rest_url( 'klyna-analytics/v1/ai/test' ) );
		$nonce          = wp_create_nonce( 'wp_rest' );
		$opt            = KLYNA_ANALYTICS_OPTION_KEY;
		?>
		<tr id="klyna-an-ai">
			<th scope="row"><?php esc_html_e( 'AI assistant', 'wp-analytics' ); ?></th>
			<td>
				<p class="description">
					<?php esc_html_e( 'Optional. Powers the weekly traffic narrative on the dashboard. Default is Off; the plugin works without an AI key.', 'wp-analytics' ); ?>
				</p>
				<p>
					<label for="klyna-an-ai-provider"><strong><?php esc_html_e( 'Provider', 'wp-analytics' ); ?></strong></label><br>
					<select id="klyna-an-ai-provider" name="<?php echo esc_attr( $opt ); ?>[ai_provider]">
						<option value="off" <?php selected( $current, 'off' ); ?>><?php esc_html_e( 'Off', 'wp-analytics' ); ?></option>
						<?php foreach ( $catalog as $key => $info ) : ?>
							<option value="<?php echo esc_attr( $key ); ?>" <?php selected( $current, $key ); ?>>
								<?php echo esc_html( (string) $info['label'] ); ?>
							</option>
						<?php endforeach; ?>
					</select>
				</p>
				<p>
					<label for="klyna-an-ai-key"><strong><?php esc_html_e( 'API key', 'wp-analytics' ); ?></strong></label><br>
					<input type="password" id="klyna-an-ai-key" class="regular-text"
						name="<?php echo esc_attr( $opt ); ?>[ai_api_key]"
						value=""
						placeholder="<?php echo esc_attr( $key_placeholder ); ?>"
						autocomplete="new-password">
					<span class="description"><?php esc_html_e( 'Leave blank to keep the saved key.', 'wp-analytics' ); ?></span>
				</p>
				<p>
					<label for="klyna-an-ai-model"><strong><?php esc_html_e( 'Model', 'wp-analytics' ); ?></strong></label><br>
					<input type="text" id="klyna-an-ai-model" class="regular-text"
						name="<?php echo esc_attr( $opt ); ?>[ai_model]"
						value="<?php echo esc_attr( $model ); ?>"
						placeholder="<?php esc_attr_e( 'optional - leave blank to use the provider default', 'wp-analytics' ); ?>">
				</p>
				<p>
					<label for="klyna-an-ai-endpoint"><strong><?php esc_html_e( 'Endpoint / Account ID', 'wp-analytics' ); ?></strong></label><br>
					<input type="text" id="klyna-an-ai-endpoint" class="regular-text"
						name="<?php echo esc_attr( $opt ); ?>[ai_endpoint]"
						value="<?php echo esc_attr( $endpoint ); ?>"
						placeholder="<?php esc_attr_e( 'Required for Cloudflare (Account ID) or Ollama (http://localhost:11434)', 'wp-analytics' ); ?>">
				</p>
				<p>
					<label for="klyna-an-ai-cap"><strong><?php esc_html_e( 'Daily call cap', 'wp-analytics' ); ?></strong></label><br>
					<input type="number" id="klyna-an-ai-cap" min="1" max="10000" step="1" class="small-text"
						name="<?php echo esc_attr( $opt ); ?>[ai_daily_cap]"
						value="<?php echo esc_attr( (string) $cap ); ?>">
					<span class="description"><?php esc_html_e( 'Resets at 00:00 UTC. Default 100.', 'wp-analytics' ); ?></span>
				</p>
				<p>
					<button type="button" class="button button-secondary" id="klyna-an-ai-test"
						data-rest="<?php echo esc_attr( $test_url ); ?>"
						data-nonce="<?php echo esc_attr( $nonce ); ?>">
						<?php esc_html_e( 'Test connection', 'wp-analytics' ); ?>
					</button>
					<span id="klyna-an-ai-test-status" class="description" style="margin-left:.5em;"></span>
				</p>
				<script>
				( function () {
					var b = document.getElementById( 'klyna-an-ai-test' );
					if ( ! b ) { return; }
					var s = document.getElementById( 'klyna-an-ai-test-status' );
					b.addEventListener( 'click', function () {
						b.disabled = true;
						if ( s ) { s.textContent = <?php echo wp_json_encode( __( 'Testing...', 'wp-analytics' ) ); ?>; }
						fetch( b.getAttribute( 'data-rest' ), {
							method: 'POST',
							credentials: 'same-origin',
							headers: {
								'Content-Type': 'application/json',
								'X-WP-Nonce': b.getAttribute( 'data-nonce' )
							},
							body: '{}'
						} ).then( function ( r ) { return r.json().then( function ( j ) { return { status: r.status, body: j }; } ); } )
						.then( function ( res ) {
							var ok = res.status >= 200 && res.status < 300 && res.body && res.body.ok;
							if ( s ) {
								s.textContent = ok
									? ( <?php echo wp_json_encode( __( 'Connection OK. Reply: ', 'wp-analytics' ) ); ?> + ( res.body.text || '' ) )
									: ( <?php echo wp_json_encode( __( 'Failed: ', 'wp-analytics' ) ); ?> + ( ( res.body && ( res.body.text || res.body.message ) ) || 'unknown error' ) );
							}
						} ).catch( function () {
							if ( s ) { s.textContent = <?php echo wp_json_encode( __( 'Network error.', 'wp-analytics' ) ); ?>; }
						} ).finally( function () { b.disabled = false; } );
					} );
				} )();
				</script>
			</td>
		</tr>
		<?php
	}

	/**
	 * AI weekly traffic narrative card. Renders the cached insight (if any),
	 * a regenerate button, and inline JS that talks to the REST endpoints.
	 */
	private function render_insight_card(): void {
		$settings = Plugin::settings();
		$provider = (string) ( $settings['ai_provider'] ?? 'off' );
		$cached   = Insight::get_cached();
		$nonce    = wp_create_nonce( 'wp_rest' );
		$rest_url = esc_url_raw( rest_url( 'klyna-analytics/v1/insight/weekly' ) );
		$regen    = esc_url_raw( rest_url( 'klyna-analytics/v1/insight/weekly/regenerate' ) );
		$ai_off   = ( 'off' === $provider || '' === $provider );
		?>
		<div class="klyna-an-card klyna-an-insight" id="klyna-an-insight">
			<div class="klyna-an-card-head">
				<h2>
					<?php esc_html_e( 'AI weekly insight', 'wp-analytics' ); ?>
					<span class="klyna-an-badge"><?php esc_html_e( '7-day narrative', 'wp-analytics' ); ?></span>
				</h2>
				<button
					type="button"
					class="button button-secondary klyna-an-insight-regen"
					<?php disabled( $ai_off, true ); ?>
					data-rest="<?php echo esc_attr( $regen ); ?>"
					data-nonce="<?php echo esc_attr( $nonce ); ?>"
				>
					<?php esc_html_e( 'Regenerate', 'wp-analytics' ); ?>
				</button>
			</div>
			<?php if ( $ai_off ) : ?>
				<p class="klyna-an-muted">
					<?php
					printf(
						/* translators: %s settings link */
						esc_html__( 'Turn on an AI provider in %s to get a weekly traffic narrative right here.', 'wp-analytics' ),
						'<a href="' . esc_url( admin_url( 'admin.php?page=wp-analytics-settings#klyna-an-ai' ) ) . '">' . esc_html__( 'Settings', 'wp-analytics' ) . '</a>'
					);
					?>
				</p>
			<?php elseif ( null === $cached ) : ?>
				<p class="klyna-an-muted klyna-an-insight-empty">
					<?php esc_html_e( 'No insight yet. Click Regenerate to write the first weekly narrative.', 'wp-analytics' ); ?>
				</p>
			<?php else : ?>
				<p class="klyna-an-insight-text"><?php echo esc_html( $cached['text'] ); ?></p>
				<p class="klyna-an-muted klyna-an-insight-meta">
					<?php
					printf(
						/* translators: %s human-readable time */
						esc_html__( 'Generated %s ago. Cached for 24 hours.', 'wp-analytics' ),
						esc_html( human_time_diff( $cached['generated_at'], time() ) )
					);
					?>
				</p>
			<?php endif; ?>
			<p class="klyna-an-insight-status" aria-live="polite" hidden></p>
		</div>
		<script>
		( function () {
			var card = document.getElementById( 'klyna-an-insight' );
			if ( ! card ) { return; }
			var btn = card.querySelector( '.klyna-an-insight-regen' );
			if ( ! btn ) { return; }
			btn.addEventListener( 'click', function () {
				var rest  = btn.getAttribute( 'data-rest' );
				var nonce = btn.getAttribute( 'data-nonce' );
				var status = card.querySelector( '.klyna-an-insight-status' );
				btn.disabled = true;
				if ( status ) { status.hidden = false; status.textContent = <?php echo wp_json_encode( __( 'Thinking...', 'wp-analytics' ) ); ?>; }
				fetch( rest, {
					method: 'POST',
					credentials: 'same-origin',
					headers: {
						'Content-Type': 'application/json',
						'X-WP-Nonce': nonce
					},
					body: '{}'
				} ).then( function ( r ) { return r.json().then( function ( j ) { return { status: r.status, body: j }; } ); } )
				.then( function ( res ) {
					if ( res.status >= 200 && res.status < 300 && res.body && res.body.ok ) {
						var p = card.querySelector( '.klyna-an-insight-text' );
						if ( ! p ) {
							p = document.createElement( 'p' );
							p.className = 'klyna-an-insight-text';
							var empty = card.querySelector( '.klyna-an-insight-empty' );
							if ( empty && empty.parentNode ) { empty.parentNode.replaceChild( p, empty ); }
							else { card.insertBefore( p, status ); }
						}
						p.textContent = res.body.text || '';
						if ( status ) { status.textContent = <?php echo wp_json_encode( __( 'Updated.', 'wp-analytics' ) ); ?>; }
					} else {
						var msg = ( res.body && ( res.body.text || res.body.message ) ) || <?php echo wp_json_encode( __( 'Could not generate insight.', 'wp-analytics' ) ); ?>;
						if ( status ) { status.textContent = msg; }
					}
				} ).catch( function () {
					if ( status ) { status.textContent = <?php echo wp_json_encode( __( 'Network error.', 'wp-analytics' ) ); ?>; }
				} ).finally( function () {
					btn.disabled = false;
				} );
			} );
		} )();
		</script>
		<?php
	}

	/**
	 * The Klyna Analytics logo mark (gradient square + ascending bars).
	 */
	private static function logo_svg(): string {
		return '<svg class="klyna-an-logo" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="36" height="36" aria-hidden="true" focusable="false">'
			. '<defs><linearGradient id="klynaAnLogo" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#9277ff"/><stop offset="100%" stop-color="#5b3df0"/></linearGradient></defs>'
			. '<rect x="2" y="2" width="28" height="28" rx="7" fill="url(#klynaAnLogo)"/>'
			. '<path d="M10 22v-4M16 22v-8M22 22v-12" stroke="#fff" stroke-width="2.5" stroke-linecap="round" fill="none"/>'
			. '</svg>';
	}
}
