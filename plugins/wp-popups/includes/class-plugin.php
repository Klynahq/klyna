<?php
/**
 * Klyna Popups bootstrap.
 *
 * @package KlynaPopups
 */

namespace KlynaPopups;

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
		load_plugin_textdomain( 'wp-popups', false, dirname( plugin_basename( KLYNA_POPUPS_PLUGIN_FILE ) ) . '/languages' );

		( new Popups() )->register();
		( new Entries() )->register();
		( new Rest() )->register();
		( new Frontend() )->register();

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
		$settings = get_option( KLYNA_POPUPS_OPTION_KEY, array() );
		return is_array( $settings ) ? $settings : array();
	}

	/**
	 * Single setting accessor with default fallback.
	 *
	 * @param string $key     Setting key.
	 * @param mixed  $default Default value.
	 * @return mixed
	 */
	public static function setting( string $key, $default = null ) {
		$settings = self::settings();
		return $settings[ $key ] ?? $default;
	}
}
