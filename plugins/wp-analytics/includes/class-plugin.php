<?php
/**
 * Klyna Analytics plugin bootstrap.
 *
 * @package KlynaAnalytics
 */

namespace KlynaAnalytics;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Plugin orchestrator. Wires hook subscribers on `plugins_loaded`.
 */
final class Plugin {

	/**
	 * Boot every subsystem.
	 */
	public function boot(): void {
		load_plugin_textdomain( 'wp-analytics', false, dirname( plugin_basename( KLYNA_ANALYTICS_PLUGIN_FILE ) ) . '/languages' );

		( new Storage() )->register();
		( new Tracker() )->register();
		( new Rest() )->register();
		( new Reports() )->register();

		if ( is_admin() ) {
			( new Admin() )->register();
		}
	}

	/**
	 * Settings accessor used by all submodules. Defaults are applied on read so
	 * older saved options keep working.
	 *
	 * @return array<string,mixed>
	 */
	public static function settings(): array {
		$defaults = array(
			'enabled'         => true,
			'respect_dnt'     => true,
			'track_logged_in' => false,
			'exclude_admins'  => true,
			'retention_days'  => 365,
			'hash_salt'       => '',
			'ai_provider'     => 'off',
			'ai_api_key'      => '',
			'ai_model'        => '',
			'ai_endpoint'     => '',
			'ai_daily_cap'    => 100,
		);
		$settings = get_option( KLYNA_ANALYTICS_OPTION_KEY, array() );
		$settings = is_array( $settings ) ? $settings : array();
		return wp_parse_args( $settings, $defaults );
	}
}
