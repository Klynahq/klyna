<?php
/**
 * Klyna Speed plugin bootstrap.
 *
 * @package KlynaSpeed
 */

namespace KlynaSpeed;

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
		load_plugin_textdomain( 'wp-speed', false, dirname( plugin_basename( KLYNA_SPEED_PLUGIN_FILE ) ) . '/languages' );

		( new Cache() )->register();
		( new Optimizer() )->register();
		( new Heartbeat() )->register();

		// REST routes must register on the front-end REST request too, not just
		// in wp-admin — `is_admin()` is false during a REST call.
		( new Rest() )->register();

		if ( is_admin() ) {
			( new Admin() )->register();
		}
	}

	/**
	 * Settings accessor used by all submodules.
	 *
	 * @return array<string,mixed>
	 */
	public static function settings(): array {
		$settings = get_option( KLYNA_SPEED_OPTION_KEY, array() );
		return is_array( $settings ) ? $settings : array();
	}

	/**
	 * Default settings used as the merge floor everywhere.
	 *
	 * @return array<string,mixed>
	 */
	public static function defaults(): array {
		return array(
			'enable_page_cache'  => true,
			'cache_logged_in'    => false,
			'cache_ttl_hours'    => 10,
			'enable_lazyload'    => true,
			'lazyload_iframes'   => true,
			'enable_defer_js'    => true,
			'enable_minify_css'  => true,
			'enable_minify_html' => true,
			'enable_preload'     => true,
			'preload_urls'       => '',
			'heartbeat_mode'     => 'slow',
			'exclude_urls'       => '',
			// AI assistant — off by default; plugin must work without a key.
			'ai_provider'        => 'off',
			'ai_model'           => '',
			'ai_api_key'         => '',
			'ai_endpoint'        => '',
			'ai_daily_cap'       => 100,
		);
	}

	/**
	 * Read a single setting with the default applied.
	 *
	 * @param string $key     Setting key.
	 * @param mixed  $fallback Value when the key is missing.
	 * @return mixed
	 */
	public static function get( string $key, $fallback = null ) {
		$settings = wp_parse_args( self::settings(), self::defaults() );
		return $settings[ $key ] ?? $fallback;
	}
}
