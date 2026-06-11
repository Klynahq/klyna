<?php
/**
 * Klyna Redirects — plugin orchestrator.
 *
 * @package KlynaRedirects
 */

namespace KlynaRedirects;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Plugin {

	public function boot(): void {
		load_plugin_textdomain( 'wp-redirects', false, dirname( plugin_basename( KLYNA_REDIRECTS_PLUGIN_FILE ) ) . '/languages' );

		( new Database() )->register();
		( new Redirector() )->register();
		( new Monitor() )->register();
		( new SlugWatcher() )->register();

		if ( is_admin() ) {
			( new Admin() )->register();
		}
	}

	public static function settings(): array {
		$s = get_option( KLYNA_REDIRECTS_OPTION_KEY, array() );
		return is_array( $s ) ? $s : array();
	}
}
