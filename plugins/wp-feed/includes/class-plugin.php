<?php
/**
 * Klyna Product Feed bootstrap.
 *
 * @package KlynaFeed
 */

namespace KlynaFeed;

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
		load_plugin_textdomain( 'wp-feed', false, dirname( plugin_basename( KLYNA_FEED_PLUGIN_FILE ) ) . '/languages' );

		( new Feed_Endpoint() )->register();
		( new Scheduler() )->register();
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
		$settings = get_option( KLYNA_FEED_OPTION_KEY, array() );
		return is_array( $settings ) ? $settings : array();
	}

	/**
	 * Whether WooCommerce is active. Every product-facing path degrades when false.
	 */
	public static function woocommerce_active(): bool {
		return class_exists( 'WooCommerce' ) && function_exists( 'wc_get_products' );
	}

	/**
	 * Public feed URL for a given format (google|meta).
	 */
	public static function feed_url( string $format ): string {
		$settings = self::settings();
		$token    = isset( $settings['feed_token'] ) ? (string) $settings['feed_token'] : '';
		$base     = home_url( '/klyna-feed/' . rawurlencode( $format ) . '/' );
		return add_query_arg( 'token', rawurlencode( $token ), $base );
	}
}
