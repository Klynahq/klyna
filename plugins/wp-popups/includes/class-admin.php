<?php
/**
 * Admin UI — dashboard, popups list, entries inbox, settings.
 *
 * @package KlynaPopups
 */

namespace KlynaPopups;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Admin {

	private const MENU_SLUG     = 'klyna-popups';
	private const SETTINGS_PAGE = 'klyna-popups-settings';
	private const ENTRIES_PAGE  = 'klyna-popups-entries';

	public function register(): void {
		add_action( 'admin_menu', array( $this, 'register_menu' ) );
		add_action( 'admin_init', array( $this, 'register_settings' ) );
		add_action( 'admin_init', array( $this, 'maybe_export_csv' ) );
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue_assets' ) );
		add_filter(
			'plugin_action_links_' . plugin_basename( KLYNA_POPUPS_PLUGIN_FILE ),
			array( $this, 'add_settings_link' )
		);
	}

	public function register_menu(): void {
		add_menu_page(
			__( 'Klyna Popups', 'wp-popups' ),
			__( 'Klyna Popups', 'wp-popups' ),
			'edit_posts',
			self::MENU_SLUG,
			array( $this, 'render_dashboard' ),
			'data:image/svg+xml;base64,' . base64_encode( $this->menu_icon_svg() ),
			66
		);
		add_submenu_page(
			self::MENU_SLUG,
			__( 'Dashboard', 'wp-popups' ),
			__( 'Dashboard', 'wp-popups' ),
			'edit_posts',
			self::MENU_SLUG,
			array( $this, 'render_dashboard' )
		);
		add_submenu_page(
			self::MENU_SLUG,
			__( 'All popups', 'wp-popups' ),
			__( 'All popups', 'wp-popups' ),
			'edit_posts',
			'edit.php?post_type=' . Popups::POST_TYPE
		);
		add_submenu_page(
			self::MENU_SLUG,
			__( 'Add popup', 'wp-popups' ),
			__( 'Add popup', 'wp-popups' ),
			'edit_posts',
			'post-new.php?post_type=' . Popups::POST_TYPE
		);
		add_submenu_page(
			self::MENU_SLUG,
			__( 'Entries', 'wp-popups' ),
			__( 'Entries', 'wp-popups' ),
			'manage_options',
			self::ENTRIES_PAGE,
			array( $this, 'render_entries' )
		);
		add_submenu_page(
			self::MENU_SLUG,
			__( 'Settings', 'wp-popups' ),
			__( 'Settings', 'wp-popups' ),
			'manage_options',
			self::SETTINGS_PAGE,
			array( $this, 'render_settings' )
		);
	}

	public function register_settings(): void {
		register_setting(
			'klyna_popups_settings_group',
			KLYNA_POPUPS_OPTION_KEY,
			array(
				'type'              => 'array',
				'sanitize_callback' => array( $this, 'sanitize_settings' ),
				'default'           => array(),
			)
		);
	}

	/**
	 * @param mixed $input Raw posted settings.
	 * @return array<string,mixed>
	 */
	public function sanitize_settings( $input ): array {
		$input = is_array( $input ) ? $input : array();
		$out   = array();

		$out['enabled']     = ! empty( $input['enabled'] );
		$out['respect_dnt'] = ! empty( $input['respect_dnt'] );

		$out['default_position']  = sanitize_key( (string) ( $input['default_position'] ?? 'center' ) );
		$out['default_animation'] = sanitize_key( (string) ( $input['default_animation'] ?? 'fade' ) );
		$out['cookie_days']       = max( 1, min( 365, (int) ( $input['cookie_days'] ?? 7 ) ) );

		$out['from_name']       = sanitize_text_field( (string) ( $input['from_name'] ?? '' ) );
		$out['success_message'] = sanitize_text_field( (string) ( $input['success_message'] ?? '' ) );
		$out['webhook_secret']  = sanitize_text_field( (string) ( $input['webhook_secret'] ?? '' ) );

		$webhook            = esc_url_raw( (string) ( $input['webhook_url'] ?? '' ) );
		$out['webhook_url'] = ( '' === $webhook || wp_http_validate_url( $webhook ) ) ? $webhook : '';

		// AI assistant fields.
		$allowed_providers   = array( 'off', 'openrouter', 'groq', 'gemini', 'cloudflare', 'ollama' );
		$provider            = sanitize_key( (string) ( $input['ai_provider'] ?? 'off' ) );
		$out['ai_provider']  = in_array( $provider, $allowed_providers, true ) ? $provider : 'off';
		$out['ai_api_key']   = sanitize_text_field( (string) ( $input['ai_api_key'] ?? '' ) );
		$out['ai_model']     = sanitize_text_field( (string) ( $input['ai_model'] ?? '' ) );
		$out['ai_endpoint']  = esc_url_raw( (string) ( $input['ai_endpoint'] ?? '' ) );
		$out['ai_daily_cap'] = max( 1, min( 10000, (int) ( $input['ai_daily_cap'] ?? 100 ) ) );

		return $out;
	}

	public function enqueue_assets( string $hook ): void {
		$is_klyna_page = strpos( $hook, 'klyna-popups' ) !== false;
		$is_popup_edit = function_exists( 'get_current_screen' )
			&& get_current_screen()
			&& Popups::POST_TYPE === get_current_screen()->post_type;

		if ( ! $is_klyna_page && ! $is_popup_edit ) {
			return;
		}

		wp_enqueue_style(
			'klyna-popups-admin',
			KLYNA_POPUPS_PLUGIN_URL . 'assets/admin/admin.css',
			array(),
			KLYNA_POPUPS_VERSION
		);
		wp_enqueue_script(
			'klyna-popups-admin',
			KLYNA_POPUPS_PLUGIN_URL . 'assets/admin/admin.js',
			array( 'wp-api-fetch' ),
			KLYNA_POPUPS_VERSION,
			true
		);
		wp_localize_script(
			'klyna-popups-admin',
			'KLYNA_POPUPS_ADMIN',
			array(
				'apiBase' => esc_url_raw( rest_url( 'klyna-popups/v1' ) ),
				'nonce'   => wp_create_nonce( 'wp_rest' ),
			)
		);
	}

	public function render_dashboard(): void {
		$total_popups = (int) wp_count_posts( Popups::POST_TYPE )->publish;
		$total_emails = Entries::total_count();
		?>
		<div class="wrap klyna-wrap">
			<h1><?php esc_html_e( 'Klyna Popups', 'wp-popups' ); ?></h1>
			<p class="klyna-tagline"><?php esc_html_e( 'Email-capture popups, exit-intent triggers, and targeted on-site offers. Built to help your work get found.', 'wp-popups' ); ?></p>

			<div class="klyna-stat-row">
				<div class="klyna-stat">
					<span class="klyna-stat-value"><?php echo esc_html( number_format_i18n( $total_popups ) ); ?></span>
					<span class="klyna-stat-label"><?php esc_html_e( 'Live popups', 'wp-popups' ); ?></span>
				</div>
				<div class="klyna-stat">
					<span class="klyna-stat-value"><?php echo esc_html( number_format_i18n( $total_emails ) ); ?></span>
					<span class="klyna-stat-label"><?php esc_html_e( 'Emails captured', 'wp-popups' ); ?></span>
				</div>
			</div>

			<div class="klyna-cards">
				<div class="klyna-card">
					<h2><?php esc_html_e( 'Create a popup', 'wp-popups' ); ?></h2>
					<p><?php esc_html_e( 'Write the body in the editor, then pick a trigger, design, and display rules. Time, scroll, exit-intent, or click.', 'wp-popups' ); ?></p>
					<a class="button button-primary" href="<?php echo esc_url( admin_url( 'post-new.php?post_type=' . Popups::POST_TYPE ) ); ?>">
						<?php esc_html_e( 'New popup', 'wp-popups' ); ?>
					</a>
				</div>

				<div class="klyna-card">
					<h2><?php esc_html_e( 'Captured emails', 'wp-popups' ); ?></h2>
					<p><?php esc_html_e( 'Every capture is stored locally and (optionally) forwarded to your webhook. Export to CSV any time.', 'wp-popups' ); ?></p>
					<a class="button" href="<?php echo esc_url( admin_url( 'admin.php?page=' . self::ENTRIES_PAGE ) ); ?>">
						<?php esc_html_e( 'View entries', 'wp-popups' ); ?>
					</a>
				</div>

				<div class="klyna-card">
					<h2><?php esc_html_e( 'Targeting & webhook', 'wp-popups' ); ?></h2>
					<p><?php esc_html_e( 'Frequency caps, new vs returning visitors, device rules, and a signed webhook for your CRM — no paid APIs.', 'wp-popups' ); ?></p>
					<a class="button" href="<?php echo esc_url( admin_url( 'admin.php?page=' . self::SETTINGS_PAGE ) ); ?>">
						<?php esc_html_e( 'Open settings', 'wp-popups' ); ?>
					</a>
				</div>
			</div>
		</div>
		<?php
	}

	public function render_entries(): void {
		$entries = Entries::recent( 0, 200 );
		$export  = wp_nonce_url(
			admin_url( 'admin.php?page=' . self::ENTRIES_PAGE . '&klyna_export=1' ),
			'klyna_popups_export',
			'klyna_export_nonce'
		);
		?>
		<div class="wrap klyna-wrap">
			<h1 class="klyna-page-head">
				<?php esc_html_e( 'Captured emails', 'wp-popups' ); ?>
				<a class="button button-primary" href="<?php echo esc_url( $export ); ?>"><?php esc_html_e( 'Export CSV', 'wp-popups' ); ?></a>
			</h1>
			<p class="klyna-tagline"><?php esc_html_e( 'Newest first. Up to 200 shown — use Export CSV for the full list.', 'wp-popups' ); ?></p>

			<?php if ( empty( $entries ) ) : ?>
				<div class="klyna-empty">
					<p><?php esc_html_e( 'No captures yet. Once a visitor submits a popup, their email will appear here.', 'wp-popups' ); ?></p>
				</div>
			<?php else : ?>
				<table class="widefat striped klyna-entries">
					<thead>
						<tr>
							<th><?php esc_html_e( 'Email', 'wp-popups' ); ?></th>
							<th><?php esc_html_e( 'Name', 'wp-popups' ); ?></th>
							<th><?php esc_html_e( 'Popup', 'wp-popups' ); ?></th>
							<th><?php esc_html_e( 'Page', 'wp-popups' ); ?></th>
							<th><?php esc_html_e( 'Captured', 'wp-popups' ); ?></th>
						</tr>
					</thead>
					<tbody>
						<?php foreach ( $entries as $entry ) : ?>
							<tr>
								<td><?php echo esc_html( (string) $entry['email'] ); ?></td>
								<td><?php echo esc_html( (string) $entry['name'] ); ?></td>
								<td><?php echo esc_html( get_the_title( (int) $entry['popup_id'] ) ); ?></td>
								<td class="klyna-cell-url"><?php echo esc_html( (string) $entry['page_url'] ); ?></td>
								<td><?php echo esc_html( (string) $entry['created_at'] ); ?></td>
							</tr>
						<?php endforeach; ?>
					</tbody>
				</table>
			<?php endif; ?>
		</div>
		<?php
	}

	/**
	 * Stream a CSV export of all entries when requested with a valid nonce.
	 */
	public function maybe_export_csv(): void {
		if ( empty( $_GET['klyna_export'] ) ) {
			return;
		}
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to export entries.', 'wp-popups' ) );
		}
		$nonce = isset( $_GET['klyna_export_nonce'] ) ? sanitize_text_field( wp_unslash( (string) $_GET['klyna_export_nonce'] ) ) : '';
		if ( ! wp_verify_nonce( $nonce, 'klyna_popups_export' ) ) {
			wp_die( esc_html__( 'Security check failed.', 'wp-popups' ) );
		}

		$rows     = Entries::export_rows();
		$filename = 'klyna-popups-entries-' . gmdate( 'Y-m-d' ) . '.csv';

		nocache_headers();
		header( 'Content-Type: text/csv; charset=utf-8' );
		header( 'Content-Disposition: attachment; filename=' . $filename );

		$handle = fopen( 'php://output', 'w' );
		foreach ( $rows as $row ) {
			fputcsv( $handle, $row );
		}
		fclose( $handle );
		exit;
	}

	public function render_settings(): void {
		$settings = Plugin::settings();
		?>
		<div class="wrap klyna-wrap">
			<h1><?php esc_html_e( 'Klyna Popups settings', 'wp-popups' ); ?></h1>
			<form method="post" action="options.php">
				<?php settings_fields( 'klyna_popups_settings_group' ); ?>
				<table class="form-table" role="presentation">
					<tbody>
						<tr>
							<th scope="row"><?php esc_html_e( 'Master switch', 'wp-popups' ); ?></th>
							<td>
								<label>
									<input type="checkbox" name="<?php echo esc_attr( KLYNA_POPUPS_OPTION_KEY ); ?>[enabled]" value="1" <?php checked( ! empty( $settings['enabled'] ) ); ?>>
									<?php esc_html_e( 'Serve popups on the front end', 'wp-popups' ); ?>
								</label>
								<p class="description"><?php esc_html_e( 'Turn everything off without un-publishing individual popups.', 'wp-popups' ); ?></p>
							</td>
						</tr>
						<tr>
							<th scope="row"><?php esc_html_e( 'Privacy', 'wp-popups' ); ?></th>
							<td>
								<label>
									<input type="checkbox" name="<?php echo esc_attr( KLYNA_POPUPS_OPTION_KEY ); ?>[respect_dnt]" value="1" <?php checked( ! empty( $settings['respect_dnt'] ) ); ?>>
									<?php esc_html_e( 'Respect the browser Do Not Track signal', 'wp-popups' ); ?>
								</label>
							</td>
						</tr>
						<tr>
							<th scope="row"><label for="cookie_days"><?php esc_html_e( 'Frequency cookie lifetime (days)', 'wp-popups' ); ?></label></th>
							<td>
								<input type="number" min="1" max="365" id="cookie_days" name="<?php echo esc_attr( KLYNA_POPUPS_OPTION_KEY ); ?>[cookie_days]" value="<?php echo esc_attr( (string) ( $settings['cookie_days'] ?? 7 ) ); ?>" class="small-text">
								<p class="description"><?php esc_html_e( 'Default window for the "once every N days" frequency cap. Individual popups can override.', 'wp-popups' ); ?></p>
							</td>
						</tr>
						<tr>
							<th scope="row"><label for="success_message"><?php esc_html_e( 'Success message', 'wp-popups' ); ?></label></th>
							<td>
								<input type="text" id="success_message" name="<?php echo esc_attr( KLYNA_POPUPS_OPTION_KEY ); ?>[success_message]" class="regular-text" value="<?php echo esc_attr( (string) ( $settings['success_message'] ?? '' ) ); ?>">
							</td>
						</tr>
						<tr>
							<th scope="row"><label for="webhook_url"><?php esc_html_e( 'Webhook URL', 'wp-popups' ); ?></label></th>
							<td>
								<input type="url" id="webhook_url" name="<?php echo esc_attr( KLYNA_POPUPS_OPTION_KEY ); ?>[webhook_url]" class="regular-text" value="<?php echo esc_attr( (string) ( $settings['webhook_url'] ?? '' ) ); ?>" placeholder="https://hooks.example.com/...">
								<p class="description"><?php esc_html_e( 'Each capture is POSTed here as JSON (event "popup.capture"). Non-blocking; failures never affect the visitor.', 'wp-popups' ); ?></p>
							</td>
						</tr>
						<tr>
							<th scope="row"><label for="webhook_secret"><?php esc_html_e( 'Webhook signing secret', 'wp-popups' ); ?></label></th>
							<td>
								<input type="text" id="webhook_secret" name="<?php echo esc_attr( KLYNA_POPUPS_OPTION_KEY ); ?>[webhook_secret]" class="regular-text" value="<?php echo esc_attr( (string) ( $settings['webhook_secret'] ?? '' ) ); ?>" autocomplete="off">
								<p class="description"><?php esc_html_e( 'If set, requests include an X-Klyna-Signature: sha256= HMAC of the body.', 'wp-popups' ); ?></p>
							</td>
						</tr>
					</tbody>
				</table>

				<h2><?php esc_html_e( 'AI assistant (optional)', 'wp-popups' ); ?></h2>
				<p class="description"><?php esc_html_e( 'Pick a free provider, paste a key, and the popup editor gains a Generate variants button for headlines. Off by default. Plugin works fine without a key.', 'wp-popups' ); ?></p>
				<table class="form-table" role="presentation">
					<tbody>
						<tr>
							<th scope="row"><label for="ai_provider"><?php esc_html_e( 'Provider', 'wp-popups' ); ?></label></th>
							<td>
								<?php $current_provider = (string) ( $settings['ai_provider'] ?? 'off' ); ?>
								<select id="ai_provider" name="<?php echo esc_attr( KLYNA_POPUPS_OPTION_KEY ); ?>[ai_provider]">
									<option value="off" <?php selected( $current_provider, 'off' ); ?>><?php esc_html_e( 'Off', 'wp-popups' ); ?></option>
									<option value="openrouter" <?php selected( $current_provider, 'openrouter' ); ?>>OpenRouter (free models)</option>
									<option value="groq" <?php selected( $current_provider, 'groq' ); ?>>Groq (fast and free)</option>
									<option value="gemini" <?php selected( $current_provider, 'gemini' ); ?>>Google Gemini (free tier)</option>
									<option value="cloudflare" <?php selected( $current_provider, 'cloudflare' ); ?>>Cloudflare Workers AI</option>
									<option value="ollama" <?php selected( $current_provider, 'ollama' ); ?>>Ollama (self-hosted)</option>
								</select>
							</td>
						</tr>
						<tr>
							<th scope="row"><label for="ai_api_key"><?php esc_html_e( 'API key', 'wp-popups' ); ?></label></th>
							<td>
								<input type="password" id="ai_api_key" name="<?php echo esc_attr( KLYNA_POPUPS_OPTION_KEY ); ?>[ai_api_key]" class="regular-text" value="<?php echo esc_attr( (string) ( $settings['ai_api_key'] ?? '' ) ); ?>" autocomplete="new-password">
								<p class="description"><?php esc_html_e( 'Get a free key from your providers dashboard. Stored only in your database.', 'wp-popups' ); ?></p>
							</td>
						</tr>
						<tr>
							<th scope="row"><label for="ai_model"><?php esc_html_e( 'Model', 'wp-popups' ); ?></label></th>
							<td>
								<input type="text" id="ai_model" name="<?php echo esc_attr( KLYNA_POPUPS_OPTION_KEY ); ?>[ai_model]" class="regular-text" value="<?php echo esc_attr( (string) ( $settings['ai_model'] ?? '' ) ); ?>" placeholder="meta-llama/llama-3.3-70b-instruct:free">
								<p class="description"><?php esc_html_e( 'Optional. Leave blank to use the provider default (OpenRouter: Llama 3.3 70B free, Groq: Llama 3.3 70B versatile, Gemini: 1.5 Flash, Cloudflare: Llama 3.1 8B, Ollama: llama3.2).', 'wp-popups' ); ?></p>
							</td>
						</tr>
						<tr>
							<th scope="row"><label for="ai_endpoint"><?php esc_html_e( 'Endpoint (Ollama or Cloudflare account id)', 'wp-popups' ); ?></label></th>
							<td>
								<input type="text" id="ai_endpoint" name="<?php echo esc_attr( KLYNA_POPUPS_OPTION_KEY ); ?>[ai_endpoint]" class="regular-text" value="<?php echo esc_attr( (string) ( $settings['ai_endpoint'] ?? '' ) ); ?>" placeholder="http://localhost:11434">
							</td>
						</tr>
						<tr>
							<th scope="row"><label for="ai_daily_cap"><?php esc_html_e( 'Daily request cap', 'wp-popups' ); ?></label></th>
							<td>
								<input type="number" min="1" max="10000" id="ai_daily_cap" name="<?php echo esc_attr( KLYNA_POPUPS_OPTION_KEY ); ?>[ai_daily_cap]" value="<?php echo esc_attr( (string) ( $settings['ai_daily_cap'] ?? 100 ) ); ?>" class="small-text">
								<p class="description"><?php esc_html_e( 'Hard cap on AI calls per day. Resets at 00:00 UTC.', 'wp-popups' ); ?></p>
							</td>
						</tr>
						<tr>
							<th scope="row"><?php esc_html_e( 'Test connection', 'wp-popups' ); ?></th>
							<td>
								<button type="button" class="button" id="klyna-popups-ai-test"><?php esc_html_e( 'Run a test call', 'wp-popups' ); ?></button>
								<span id="klyna-popups-ai-test-result" style="margin-left:8px;"></span>
								<p class="description"><?php esc_html_e( 'Saves nothing. Sends a one-word prompt to confirm credentials work.', 'wp-popups' ); ?></p>
							</td>
						</tr>
					</tbody>
				</table>

				<?php submit_button(); ?>
			</form>
			<script>
			(function () {
				var btn = document.getElementById('klyna-popups-ai-test');
				var out = document.getElementById('klyna-popups-ai-test-result');
				if (!btn || !window.KLYNA_POPUPS_ADMIN) { return; }
				btn.addEventListener('click', function () {
					out.textContent = '<?php echo esc_js( __( 'Testing...', 'wp-popups' ) ); ?>';
					fetch(window.KLYNA_POPUPS_ADMIN.apiBase + '/ai/test', {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
							'X-WP-Nonce': window.KLYNA_POPUPS_ADMIN.nonce
						},
						body: '{}'
					})
					.then(function (r) { return r.json(); })
					.then(function (j) {
						if (j && j.ok) {
							out.style.color = '#1a7f37';
							out.textContent = '<?php echo esc_js( __( 'OK - provider replied:', 'wp-popups' ) ); ?> ' + (j.text || '').slice(0, 60);
						} else {
							out.style.color = '#b32d2e';
							out.textContent = '<?php echo esc_js( __( 'Failed:', 'wp-popups' ) ); ?> ' + ((j && (j.text || j.reason)) || 'unknown');
						}
					})
					.catch(function (e) {
						out.style.color = '#b32d2e';
						out.textContent = '<?php echo esc_js( __( 'Error:', 'wp-popups' ) ); ?> ' + e.message;
					});
				});
			})();
			</script>
		</div>
		<?php
	}

	/**
	 * @param string[] $links Existing action links.
	 * @return string[]
	 */
	public function add_settings_link( array $links ): array {
		$url   = admin_url( 'admin.php?page=' . self::SETTINGS_PAGE );
		$label = __( 'Settings', 'wp-popups' );
		$first = sprintf( '<a href="%s">%s</a>', esc_url( $url ), esc_html( $label ) );
		array_unshift( $links, $first );
		return $links;
	}

	/**
	 * Admin-menu glyph: the Klyna overlapping-window mark, tinted for the menu.
	 */
	private function menu_icon_svg(): string {
		return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">'
			. '<rect x="3" y="6" width="13" height="12" rx="2.5" fill="#9ca3af"/>'
			. '<rect x="8" y="3" width="13" height="12" rx="2.5" fill="none" stroke="#9ca3af" stroke-width="2"/>'
			. '</svg>';
	}
}
