<?php
/**
 * Klyna plugin bootstrap.
 *
 * @package Klyna
 */

namespace Klyna;

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
		load_plugin_textdomain( 'klyna', false, dirname( plugin_basename( KLYNA_PLUGIN_FILE ) ) . '/languages' );

		( new Schema() )->register();
		( new InternalLinks() )->register();
		( new Faq() )->register();

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
		$settings = get_option( KLYNA_OPTION_KEY, array() );
		return is_array( $settings ) ? $settings : array();
	}
}
