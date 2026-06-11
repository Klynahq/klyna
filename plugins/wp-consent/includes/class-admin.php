<?php
/**
 * Admin settings page — Klyna Consent.
 *
 * @package KlynaConsent
 */

namespace KlynaConsent;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Registers the settings page, sanitises input, enqueues admin assets.
 */
final class Admin {

	private const MENU_SLUG          = 'klyna-consent';
	private const SETTINGS_GROUP     = 'klyna_consent_settings_group';
	private const NONCE_ACTION       = 'klyna_consent_save';

	public function register(): void {
		add_action( 'admin_menu', array( $this, 'register_menu' ) );
		add_action( 'admin_init', array( $this, 'register_settings' ) );
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue_assets' ) );
		add_filter(
			'plugin_action_links_' . plugin_basename( KLYNA_CONSENT_PLUGIN_FILE ),
			array( $this, 'add_settings_link' )
		);
	}

	public function register_menu(): void {
		add_menu_page(
			__( 'Klyna Consent', 'wp-consent' ),
			__( 'Klyna Consent', 'wp-consent' ),
			'manage_options',
			self::MENU_SLUG,
			array( $this, 'render_settings' ),
			$this->menu_icon_svg(),
			76
		);
	}

	/**
	 * Returns a base64-encoded SVG data URI for the menu icon.
	 */
	private function menu_icon_svg(): string {
		$svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">'
			. '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
			. '<stop offset="0%" stop-color="#9277ff"/>'
			. '<stop offset="100%" stop-color="#5b3df0"/>'
			. '</linearGradient></defs>'
			. '<rect width="32" height="32" rx="7" fill="url(#g)"/>'
			. '<circle cx="16" cy="14" r="5" stroke="#fff" stroke-width="2.5" fill="none"/>'
			. '<path d="M13 17l-2 5h10l-2-5" stroke="#fff" stroke-width="2.5" stroke-linejoin="round" fill="none"/>'
			. '<path d="M14.5 13l1 1.5 2-2.5" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>'
			. '</svg>';
		return 'data:image/svg+xml;base64,' . base64_encode( $svg );
	}

	public function register_settings(): void {
		register_setting(
			self::SETTINGS_GROUP,
			KLYNA_CONSENT_OPTION_KEY,
			array(
				'type'              => 'array',
				'sanitize_callback' => array( $this, 'sanitize_settings' ),
				'default'           => array(),
			)
		);
	}

	/**
	 * Sanitize all incoming settings before they hit the database.
	 *
	 * @param mixed $input
	 * @return array<string,mixed>
	 */
	public function sanitize_settings( $input ): array {
		$input = is_array( $input ) ? $input : array();
		$out   = array();

		// Text fields.
		$text_fields = array( 'banner_text', 'accept_label', 'reject_label', 'manage_label' );
		foreach ( $text_fields as $k ) {
			$out[ $k ] = isset( $input[ $k ] ) ? sanitize_textarea_field( (string) $input[ $k ] ) : '';
		}

		// Position: only 'top' or 'bottom'.
		$out['position'] = isset( $input['position'] ) && $input['position'] === 'top' ? 'top' : 'bottom';

		// Colour fields.
		$color_fields = array( 'bg_color', 'text_color', 'accent_color' );
		foreach ( $color_fields as $k ) {
			$raw         = isset( $input[ $k ] ) ? sanitize_hex_color( (string) $input[ $k ] ) : '';
			$out[ $k ]   = $raw ? $raw : '#1a1a23';
		}

		// Boolean toggles.
		$bool_fields = array(
			'enable_analytics',
			'enable_marketing',
			'enable_preferences',
			'google_consent_mode',
			'geo_restrict',
			'cookie_settings_link',
		);
		foreach ( $bool_fields as $k ) {
			$out[ $k ] = ! empty( $input[ $k ] );
		}

		// AI assistant fields.
		$allowed_providers = array( 'off', 'openrouter', 'groq', 'gemini', 'cloudflare', 'ollama' );
		$prov              = isset( $input['ai_provider'] ) ? sanitize_key( (string) $input['ai_provider'] ) : 'off';
		$out['ai_provider']  = in_array( $prov, $allowed_providers, true ) ? $prov : 'off';
		$out['ai_model']     = isset( $input['ai_model'] ) ? sanitize_text_field( (string) $input['ai_model'] ) : '';
		$submitted_key = isset( $input['ai_api_key'] ) ? trim( sanitize_text_field( (string) $input['ai_api_key'] ) ) : '';
		$keep_key      = ! empty( $input['ai_api_key_keep'] );
		if ( '' === $submitted_key && $keep_key ) {
			$existing          = get_option( KLYNA_CONSENT_OPTION_KEY, array() );
			$out['ai_api_key'] = (string) ( is_array( $existing ) && isset( $existing['ai_api_key'] ) ? $existing['ai_api_key'] : '' );
		} else {
			$out['ai_api_key'] = $submitted_key;
		}
		$out['ai_endpoint']  = isset( $input['ai_endpoint'] ) ? sanitize_text_field( (string) $input['ai_endpoint'] ) : '';
		$cap                 = isset( $input['ai_daily_cap'] ) ? (int) $input['ai_daily_cap'] : 100;
		$out['ai_daily_cap'] = max( 1, min( 10000, $cap ) );

		return $out;
	}

	/**
	 * Enqueue admin CSS + JS only on this plugin's settings page.
	 *
	 * @param string $hook Current admin page hook.
	 */
	public function enqueue_assets( string $hook ): void {
		if ( strpos( $hook, self::MENU_SLUG ) === false ) {
			return;
		}

		wp_enqueue_style(
			'klyna-consent-admin',
			KLYNA_CONSENT_PLUGIN_URL . 'assets/admin/admin.css',
			array(),
			KLYNA_CONSENT_VERSION
		);

		wp_enqueue_script(
			'klyna-consent-admin',
			KLYNA_CONSENT_PLUGIN_URL . 'assets/admin/admin.js',
			array(),
			KLYNA_CONSENT_VERSION,
			true
		);

		wp_localize_script(
			'klyna-consent-admin',
			'KlynaConsentAdmin',
			array(
				'apiBase' => esc_url_raw( rest_url( 'wp-consent/v1' ) ),
				'nonce'   => wp_create_nonce( 'wp_rest' ),
			)
		);
	}

	/**
	 * Render the settings page.
	 */
	public function render_settings(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to access this page.', 'wp-consent' ) );
		}

		$settings = Plugin::settings();
		?>
<div class="klyna-consent-wrap">
	<div class="klyna-consent-header">
		<svg class="klyna-consent-logo" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" width="36" height="36" aria-hidden="true">
			<defs>
				<linearGradient id="klyna-logo-g" x1="0" y1="0" x2="1" y2="1">
					<stop offset="0%" stop-color="#9277ff"/>
					<stop offset="100%" stop-color="#5b3df0"/>
				</linearGradient>
			</defs>
			<rect width="32" height="32" rx="7" fill="url(#klyna-logo-g)"/>
			<circle cx="16" cy="14" r="5" stroke="#fff" stroke-width="2.5" fill="none"/>
			<path d="M13 17l-2 5h10l-2-5" stroke="#fff" stroke-width="2.5" stroke-linejoin="round" fill="none"/>
			<path d="M14.5 13l1 1.5 2-2.5" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
		</svg>
		<div>
			<h1 class="klyna-consent-header__title">
				<?php esc_html_e( 'Klyna Consent', 'wp-consent' ); ?>
			</h1>
			<p class="klyna-consent-header__sub">
				<?php esc_html_e( 'GDPR / ePrivacy cookie consent with Google Consent Mode v2.', 'wp-consent' ); ?>
			</p>
		</div>
	</div>

	<?php settings_errors( KLYNA_CONSENT_OPTION_KEY ); ?>

	<form method="post" action="options.php" class="klyna-consent-form" novalidate>
		<?php settings_fields( self::SETTINGS_GROUP ); ?>

		<!-- Banner text -->
		<section class="klyna-consent-section">
			<h2 class="klyna-consent-section__title">
				<?php esc_html_e( 'Banner content', 'wp-consent' ); ?>
			</h2>

			<div class="klyna-consent-field">
				<label for="kc-banner-text" class="klyna-consent-label">
					<?php esc_html_e( 'Banner message', 'wp-consent' ); ?>
				</label>
				<textarea
					id="kc-banner-text"
					name="<?php echo esc_attr( KLYNA_CONSENT_OPTION_KEY ); ?>[banner_text]"
					class="klyna-consent-textarea"
					rows="3"
				><?php echo esc_textarea( $settings['banner_text'] ); ?></textarea>
			</div>

			<div class="klyna-consent-row3">
				<div class="klyna-consent-field">
					<label for="kc-accept-label" class="klyna-consent-label">
						<?php esc_html_e( 'Accept All button text', 'wp-consent' ); ?>
					</label>
					<input
						type="text"
						id="kc-accept-label"
						name="<?php echo esc_attr( KLYNA_CONSENT_OPTION_KEY ); ?>[accept_label]"
						class="klyna-consent-input"
						value="<?php echo esc_attr( $settings['accept_label'] ); ?>"
					>
				</div>
				<div class="klyna-consent-field">
					<label for="kc-reject-label" class="klyna-consent-label">
						<?php esc_html_e( 'Reject All button text', 'wp-consent' ); ?>
					</label>
					<input
						type="text"
						id="kc-reject-label"
						name="<?php echo esc_attr( KLYNA_CONSENT_OPTION_KEY ); ?>[reject_label]"
						class="klyna-consent-input"
						value="<?php echo esc_attr( $settings['reject_label'] ); ?>"
					>
				</div>
				<div class="klyna-consent-field">
					<label for="kc-manage-label" class="klyna-consent-label">
						<?php esc_html_e( 'Manage Preferences text', 'wp-consent' ); ?>
					</label>
					<input
						type="text"
						id="kc-manage-label"
						name="<?php echo esc_attr( KLYNA_CONSENT_OPTION_KEY ); ?>[manage_label]"
						class="klyna-consent-input"
						value="<?php echo esc_attr( $settings['manage_label'] ); ?>"
					>
				</div>
			</div>
		</section>

		<!-- Appearance -->
		<section class="klyna-consent-section">
			<h2 class="klyna-consent-section__title">
				<?php esc_html_e( 'Appearance', 'wp-consent' ); ?>
			</h2>

			<div class="klyna-consent-row3">
				<div class="klyna-consent-field">
					<label for="kc-position" class="klyna-consent-label">
						<?php esc_html_e( 'Position', 'wp-consent' ); ?>
					</label>
					<select
						id="kc-position"
						name="<?php echo esc_attr( KLYNA_CONSENT_OPTION_KEY ); ?>[position]"
						class="klyna-consent-select"
					>
						<option value="bottom" <?php selected( $settings['position'], 'bottom' ); ?>>
							<?php esc_html_e( 'Bottom', 'wp-consent' ); ?>
						</option>
						<option value="top" <?php selected( $settings['position'], 'top' ); ?>>
							<?php esc_html_e( 'Top', 'wp-consent' ); ?>
						</option>
					</select>
				</div>

				<div class="klyna-consent-field">
					<label for="kc-bg-color" class="klyna-consent-label">
						<?php esc_html_e( 'Banner background', 'wp-consent' ); ?>
					</label>
					<div class="klyna-consent-color-wrap">
						<input
							type="color"
							id="kc-bg-color"
							name="<?php echo esc_attr( KLYNA_CONSENT_OPTION_KEY ); ?>[bg_color]"
							class="klyna-consent-color"
							value="<?php echo esc_attr( $settings['bg_color'] ); ?>"
						>
						<input
							type="text"
							class="klyna-consent-input klyna-consent-color-text"
							value="<?php echo esc_attr( $settings['bg_color'] ); ?>"
							data-color-peer="kc-bg-color"
							maxlength="7"
						>
					</div>
				</div>

				<div class="klyna-consent-field">
					<label for="kc-text-color" class="klyna-consent-label">
						<?php esc_html_e( 'Banner text colour', 'wp-consent' ); ?>
					</label>
					<div class="klyna-consent-color-wrap">
						<input
							type="color"
							id="kc-text-color"
							name="<?php echo esc_attr( KLYNA_CONSENT_OPTION_KEY ); ?>[text_color]"
							class="klyna-consent-color"
							value="<?php echo esc_attr( $settings['text_color'] ); ?>"
						>
						<input
							type="text"
							class="klyna-consent-input klyna-consent-color-text"
							value="<?php echo esc_attr( $settings['text_color'] ); ?>"
							data-color-peer="kc-text-color"
							maxlength="7"
						>
					</div>
				</div>

				<div class="klyna-consent-field">
					<label for="kc-accent-color" class="klyna-consent-label">
						<?php esc_html_e( 'Accent / button colour', 'wp-consent' ); ?>
					</label>
					<div class="klyna-consent-color-wrap">
						<input
							type="color"
							id="kc-accent-color"
							name="<?php echo esc_attr( KLYNA_CONSENT_OPTION_KEY ); ?>[accent_color]"
							class="klyna-consent-color"
							value="<?php echo esc_attr( $settings['accent_color'] ); ?>"
						>
						<input
							type="text"
							class="klyna-consent-input klyna-consent-color-text"
							value="<?php echo esc_attr( $settings['accent_color'] ); ?>"
							data-color-peer="kc-accent-color"
							maxlength="7"
						>
					</div>
				</div>
			</div>
		</section>

		<!-- Cookie categories -->
		<section class="klyna-consent-section">
			<h2 class="klyna-consent-section__title">
				<?php esc_html_e( 'Cookie categories', 'wp-consent' ); ?>
			</h2>
			<p class="klyna-consent-hint">
				<?php esc_html_e( '"Necessary" is always enabled. Enable only the categories your site uses.', 'wp-consent' ); ?>
			</p>

			<div class="klyna-consent-toggles">
				<?php
				$categories = array(
					'enable_analytics'   => array(
						'label' => __( 'Analytics', 'wp-consent' ),
						'desc'  => __( 'Google Analytics, Plausible, Matomo, etc.', 'wp-consent' ),
					),
					'enable_marketing'   => array(
						'label' => __( 'Marketing', 'wp-consent' ),
						'desc'  => __( 'Google Ads, Meta Pixel, retargeting.', 'wp-consent' ),
					),
					'enable_preferences' => array(
						'label' => __( 'Preferences', 'wp-consent' ),
						'desc'  => __( 'Language, region, UI personalisation.', 'wp-consent' ),
					),
				);
				foreach ( $categories as $key => $info ) :
					$checked = ! empty( $settings[ $key ] );
					$id      = 'kc-' . str_replace( '_', '-', $key );
					?>
					<label class="klyna-consent-toggle-row" for="<?php echo esc_attr( $id ); ?>">
						<div class="klyna-consent-toggle-row__info">
							<span class="klyna-consent-toggle-row__name"><?php echo esc_html( $info['label'] ); ?></span>
							<span class="klyna-consent-toggle-row__desc"><?php echo esc_html( $info['desc'] ); ?></span>
						</div>
						<div class="klyna-admin-toggle-wrap">
							<input
								type="checkbox"
								id="<?php echo esc_attr( $id ); ?>"
								name="<?php echo esc_attr( KLYNA_CONSENT_OPTION_KEY ); ?>[<?php echo esc_attr( $key ); ?>]"
								value="1"
								class="klyna-admin-toggle-input"
								<?php checked( $checked ); ?>
							>
							<span class="klyna-admin-toggle-ui" aria-hidden="true"></span>
						</div>
					</label>
				<?php endforeach; ?>
			</div>
		</section>

		<!-- Integrations -->
		<section class="klyna-consent-section">
			<h2 class="klyna-consent-section__title">
				<?php esc_html_e( 'Integrations & behaviour', 'wp-consent' ); ?>
			</h2>

			<div class="klyna-consent-toggles">
				<?php
				$toggles = array(
					'google_consent_mode' => array(
						'label' => __( 'Google Consent Mode v2', 'wp-consent' ),
						'desc'  => __( 'Emits GCM v2 default signals in <head> and updates them on consent. Required for GA4 / Google Ads compliance.', 'wp-consent' ),
					),
					'geo_restrict'        => array(
						'label' => __( 'EU only (geo-restrict)', 'wp-consent' ),
						'desc'  => __( 'Show banner only to EU/EEA/UK visitors detected via Cloudflare CF-IPCountry header. Falls back to always-show if header unavailable.', 'wp-consent' ),
					),
					'cookie_settings_link' => array(
						'label' => __( 'Floating "Cookie settings" button', 'wp-consent' ),
						'desc'  => __( 'Shows a small button after consent is given, allowing users to change preferences at any time.', 'wp-consent' ),
					),
				);
				foreach ( $toggles as $key => $info ) :
					$checked = ! empty( $settings[ $key ] );
					$id      = 'kc-' . str_replace( '_', '-', $key );
					?>
					<label class="klyna-consent-toggle-row" for="<?php echo esc_attr( $id ); ?>">
						<div class="klyna-consent-toggle-row__info">
							<span class="klyna-consent-toggle-row__name"><?php echo esc_html( $info['label'] ); ?></span>
							<span class="klyna-consent-toggle-row__desc"><?php echo esc_html( $info['desc'] ); ?></span>
						</div>
						<div class="klyna-admin-toggle-wrap">
							<input
								type="checkbox"
								id="<?php echo esc_attr( $id ); ?>"
								name="<?php echo esc_attr( KLYNA_CONSENT_OPTION_KEY ); ?>[<?php echo esc_attr( $key ); ?>]"
								value="1"
								class="klyna-admin-toggle-input"
								<?php checked( $checked ); ?>
							>
							<span class="klyna-admin-toggle-ui" aria-hidden="true"></span>
						</div>
					</label>
				<?php endforeach; ?>
			</div>
		</section>

		<!-- AI assistant -->
		<section class="klyna-consent-section">
			<h2 class="klyna-consent-section__title">
				<?php esc_html_e( 'AI assistant', 'wp-consent' ); ?>
			</h2>
			<p class="klyna-consent-hint">
				<?php esc_html_e( 'Optional. Powers the cookie policy generator below. All providers offer free tiers.', 'wp-consent' ); ?>
			</p>

			<?php
			$ai_provider  = isset( $settings['ai_provider'] ) ? (string) $settings['ai_provider'] : 'off';
			$ai_model     = isset( $settings['ai_model'] ) ? (string) $settings['ai_model'] : '';
			$ai_api_key   = isset( $settings['ai_api_key'] ) ? (string) $settings['ai_api_key'] : '';
			$ai_endpoint  = isset( $settings['ai_endpoint'] ) ? (string) $settings['ai_endpoint'] : '';
			$ai_daily_cap = isset( $settings['ai_daily_cap'] ) ? (int) $settings['ai_daily_cap'] : 100;
			$catalog      = \KlynaConsent\Ai::provider_catalog();
			?>
			<div class="klyna-consent-row3">
				<div class="klyna-consent-field">
					<label for="kc-ai-provider" class="klyna-consent-label">
						<?php esc_html_e( 'Provider', 'wp-consent' ); ?>
					</label>
					<select
						id="kc-ai-provider"
						name="<?php echo esc_attr( KLYNA_CONSENT_OPTION_KEY ); ?>[ai_provider]"
						class="klyna-consent-select"
					>
						<option value="off" <?php selected( $ai_provider, 'off' ); ?>>
							<?php esc_html_e( 'Off (no AI)', 'wp-consent' ); ?>
						</option>
						<?php foreach ( $catalog as $key => $info ) : ?>
							<option value="<?php echo esc_attr( $key ); ?>" <?php selected( $ai_provider, $key ); ?>>
								<?php echo esc_html( $info['label'] ); ?>
							</option>
						<?php endforeach; ?>
					</select>
				</div>

				<div class="klyna-consent-field">
					<label for="kc-ai-model" class="klyna-consent-label">
						<?php esc_html_e( 'Model (optional)', 'wp-consent' ); ?>
					</label>
					<input
						type="text"
						id="kc-ai-model"
						name="<?php echo esc_attr( KLYNA_CONSENT_OPTION_KEY ); ?>[ai_model]"
						class="klyna-consent-input"
						value="<?php echo esc_attr( $ai_model ); ?>"
						placeholder="<?php esc_attr_e( 'Leave blank for provider default', 'wp-consent' ); ?>"
					>
				</div>

				<div class="klyna-consent-field">
					<label for="kc-ai-daily-cap" class="klyna-consent-label">
						<?php esc_html_e( 'Daily call cap', 'wp-consent' ); ?>
					</label>
					<input
						type="number"
						id="kc-ai-daily-cap"
						name="<?php echo esc_attr( KLYNA_CONSENT_OPTION_KEY ); ?>[ai_daily_cap]"
						class="klyna-consent-input"
						min="1"
						max="10000"
						value="<?php echo esc_attr( (string) $ai_daily_cap ); ?>"
					>
				</div>
			</div>

			<div class="klyna-consent-row3">
				<div class="klyna-consent-field">
					<label for="kc-ai-api-key" class="klyna-consent-label">
						<?php esc_html_e( 'API key', 'wp-consent' ); ?>
					</label>
					<?php
					$wc_has    = ! empty( $ai_api_key );
					$wc_masked = $wc_has ? str_repeat( "\xE2\x80\xA2", 4 ) . ' ' . substr( $ai_api_key, -4 ) : '';
					?>
					<?php if ( $wc_has ) : ?>
						<div id="kc-ai-key-display">
							<code style="padding:4px 8px;background:#f0f0f1;border-radius:3px;"><?php echo esc_html( $wc_masked ); ?></code>
							<button type="button" class="button button-secondary" id="kc-ai-key-replace" style="margin-left:8px;"><?php esc_html_e( 'Replace key', 'wp-consent' ); ?></button>
						</div>
						<input type="hidden" name="<?php echo esc_attr( KLYNA_CONSENT_OPTION_KEY ); ?>[ai_api_key_keep]" value="1">
						<input
							type="password"
							id="kc-ai-api-key"
							name="<?php echo esc_attr( KLYNA_CONSENT_OPTION_KEY ); ?>[ai_api_key]"
							class="klyna-consent-input"
							value=""
							autocomplete="new-password"
							style="display:none;margin-top:8px;"
						>
						<script>
						(function(){
							var btn=document.getElementById('kc-ai-key-replace');
							var inp=document.getElementById('kc-ai-api-key');
							var disp=document.getElementById('kc-ai-key-display');
							if(btn&&inp&&disp){btn.addEventListener('click',function(){inp.style.display='';inp.focus();disp.style.display='none';});}
						})();
						</script>
					<?php else : ?>
						<input
							type="password"
							id="kc-ai-api-key"
							name="<?php echo esc_attr( KLYNA_CONSENT_OPTION_KEY ); ?>[ai_api_key]"
							class="klyna-consent-input"
							value=""
							autocomplete="new-password"
						>
					<?php endif; ?>
				</div>

				<div class="klyna-consent-field">
					<label for="kc-ai-endpoint" class="klyna-consent-label">
						<?php esc_html_e( 'Endpoint / Account ID (Cloudflare or Ollama)', 'wp-consent' ); ?>
					</label>
					<input
						type="text"
						id="kc-ai-endpoint"
						name="<?php echo esc_attr( KLYNA_CONSENT_OPTION_KEY ); ?>[ai_endpoint]"
						class="klyna-consent-input"
						value="<?php echo esc_attr( $ai_endpoint ); ?>"
					>
				</div>

				<div class="klyna-consent-field">
					<label class="klyna-consent-label">&nbsp;</label>
					<button
						type="button"
						class="button"
						id="kc-ai-test"
						data-rest="<?php echo esc_attr( esc_url_raw( rest_url( 'wp-consent/v1/ai/test' ) ) ); ?>"
						data-nonce="<?php echo esc_attr( wp_create_nonce( 'wp_rest' ) ); ?>"
					>
						<?php esc_html_e( 'Test connection', 'wp-consent' ); ?>
					</button>
					<span id="kc-ai-test-result" class="klyna-consent-hint" style="display:block;margin-top:6px;"></span>
				</div>
			</div>
		</section>

		<!-- Cookie policy generator -->
		<section class="klyna-consent-section">
			<h2 class="klyna-consent-section__title">
				<?php esc_html_e( 'Cookie policy generator', 'wp-consent' ); ?>
			</h2>
			<p class="klyna-consent-hint">
				<?php
				printf(
					/* translators: %s: current site locale */
					esc_html__( 'Generates a ~300 word GDPR cookie policy in your site language (%s), tailored to your active plugins, and saves it as a draft Page.', 'wp-consent' ),
					esc_html( get_locale() )
				);
				?>
			</p>
			<button
				type="button"
				class="button button-primary"
				id="kc-ai-generate-policy"
				data-rest="<?php echo esc_attr( esc_url_raw( rest_url( 'wp-consent/v1/ai/generate-policy' ) ) ); ?>"
				data-nonce="<?php echo esc_attr( wp_create_nonce( 'wp_rest' ) ); ?>"
			>
				<?php esc_html_e( 'Generate cookie policy', 'wp-consent' ); ?>
			</button>
			<span id="kc-ai-generate-result" class="klyna-consent-hint" style="display:block;margin-top:8px;"></span>
		</section>

		<div class="klyna-consent-submit-row">
			<?php submit_button( __( 'Save settings', 'wp-consent' ), 'primary', 'submit', false, array( 'class' => 'klyna-btn-save' ) ); ?>
		</div>
	</form>
			<?php \KlynaConsent\Telemetry::render_form(); ?>

</div>
<script>
(function(){
	function jsonPost(url, nonce){
		return fetch(url, {
			method: 'POST',
			credentials: 'same-origin',
			headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': nonce }
		}).then(function(r){ return r.json().then(function(j){ return { ok: r.ok, body: j }; }); });
	}
	document.addEventListener('DOMContentLoaded', function(){
		var testBtn = document.getElementById('kc-ai-test');
		var testOut = document.getElementById('kc-ai-test-result');
		if (testBtn) {
			testBtn.addEventListener('click', function(){
				testOut.textContent = 'Testing...';
				jsonPost(testBtn.dataset.rest, testBtn.dataset.nonce).then(function(res){
					if (res.ok && res.body && res.body.ok) {
						testOut.textContent = 'OK — ' + (res.body.text || 'connected').slice(0, 200);
					} else {
						testOut.textContent = 'Failed: ' + ((res.body && (res.body.text || res.body.message)) || 'unknown error');
					}
				}).catch(function(e){ testOut.textContent = 'Error: ' + e.message; });
			});
		}
		var genBtn = document.getElementById('kc-ai-generate-policy');
		var genOut = document.getElementById('kc-ai-generate-result');
		if (genBtn) {
			genBtn.addEventListener('click', function(){
				if (!confirm('Generate a new cookie policy draft page using AI?')) return;
				genBtn.disabled = true;
				genOut.textContent = 'Generating... this can take 10-30 seconds.';
				jsonPost(genBtn.dataset.rest, genBtn.dataset.nonce).then(function(res){
					genBtn.disabled = false;
					if (res.ok && res.body && res.body.ok && res.body.edit_url) {
						genOut.textContent = 'Saved as draft. Redirecting to the editor...';
						window.location.href = res.body.edit_url;
					} else {
						genOut.textContent = 'Failed: ' + ((res.body && (res.body.text || res.body.message)) || 'unknown error');
					}
				}).catch(function(e){ genBtn.disabled = false; genOut.textContent = 'Error: ' + e.message; });
			});
		}
	});
})();
</script>
		<?php
	}

	/**
	 * @param string[] $links
	 * @return string[]
	 */
	public function add_settings_link( array $links ): array {
		$url   = admin_url( 'admin.php?page=' . self::MENU_SLUG );
		$label = __( 'Settings', 'wp-consent' );
		array_unshift( $links, sprintf( '<a href="%s">%s</a>', esc_url( $url ), esc_html( $label ) ) );
		return $links;
	}
}
