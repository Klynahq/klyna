<?php
/**
 * Klyna Consent plugin bootstrap / orchestrator.
 *
 * @package KlynaConsent
 */

namespace KlynaConsent;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Plugin orchestrator. Wires all subsystems on `plugins_loaded`.
 */
final class Plugin {

	/**
	 * Boot every subsystem.
	 */
	public function boot(): void {
		load_plugin_textdomain(
			'wp-consent',
			false,
			dirname( plugin_basename( KLYNA_CONSENT_PLUGIN_FILE ) ) . '/languages'
		);

		// Always register REST routes (needed on REST-only requests).
		add_action( 'rest_api_init', array( new Rest(), 'register_routes' ) );

		// Front-end: banner + consent mode injection.
		if ( ! is_admin() ) {
			( new ConsentMode() )->register();
			( new Banner() )->register();
		}

		// Admin UI.
		if ( is_admin() ) {
			( new Admin() )->register();
		}
	}

	/**
	 * Settings accessor used by all submodules.
	 * Merges saved option with baked-in defaults so callers always get a full array.
	 *
	 * @return array<string,mixed>
	 */
	public static function settings(): array {
		$saved = get_option( KLYNA_CONSENT_OPTION_KEY, array() );
		if ( ! is_array( $saved ) ) {
			$saved = array();
		}

		$defaults = array(
			'banner_text'               => 'We use cookies to enhance your experience. Choose which cookies you allow.',
			'accept_label'              => 'Accept All',
			'reject_label'              => 'Reject All',
			'manage_label'              => 'Manage Preferences',
			'position'                  => 'bottom',
			'bg_color'                  => '#1a1a23',
			'text_color'                => '#f4f4f5',
			'accent_color'              => '#7c5cff',
			'enable_analytics'          => true,
			'enable_marketing'          => true,
			'enable_preferences'        => true,
			'google_consent_mode'       => true,
			'geo_restrict'              => false,
			'cookie_settings_link'      => true,
			// AI assistant.
			'ai_provider'               => 'off',
			'ai_model'                  => '',
			'ai_api_key'                => '',
			'ai_endpoint'               => '',
			'ai_daily_cap'              => 100,
		);

		return wp_parse_args( $saved, $defaults );
	}

	/**
	 * Determine whether the banner should be shown based on geo restriction settings.
	 * Uses the CF-IPCountry header as a best-effort geo signal.
	 *
	 * @return bool
	 */
	public static function should_show_for_geo(): bool {
		$settings = self::settings();

		if ( empty( $settings['geo_restrict'] ) ) {
			return true; // No restriction — always show.
		}

		// EU country codes (ISO 3166-1 alpha-2).
		$eu_codes = array(
			'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI',
			'FR', 'GR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT',
			'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK',
			// EEA additions.
			'IS', 'LI', 'NO',
			// UK (post-Brexit GDPR equivalent).
			'GB',
		);

		// Try Cloudflare's header (available on any CF-proxied site).
		// phpcs:ignore WordPress.Security.ValidatedSanitizedInput
		$country = isset( $_SERVER['HTTP_CF_IPCOUNTRY'] )
			? strtoupper( sanitize_text_field( wp_unslash( $_SERVER['HTTP_CF_IPCOUNTRY'] ) ) )
			: '';

		if ( $country === '' ) {
			// No geo signal — default to showing banner to be safe.
			return true;
		}

		return in_array( $country, $eu_codes, true );
	}
}
