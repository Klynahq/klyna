<?php
/**
 * Klyna Forms plugin bootstrap.
 *
 * @package KlynaForms
 */

namespace KlynaForms;

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
		load_plugin_textdomain( 'wp-forms', false, dirname( plugin_basename( KLYNA_FORMS_PLUGIN_FILE ) ) . '/languages' );

		( new Forms() )->register();
		( new Entries() )->register();
		( new Render() )->register();
		( new Submission() )->register();

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
		$settings = get_option( KLYNA_FORMS_OPTION_KEY, array() );
		return is_array( $settings ) ? $settings : array();
	}

	/**
	 * One settings value with a fallback.
	 *
	 * @param string $key     Setting key.
	 * @param mixed  $default Fallback when unset.
	 * @return mixed
	 */
	public static function setting( string $key, $default = null ) {
		$settings = self::settings();
		return $settings[ $key ] ?? $default;
	}
}
