<?php
/**
 * Klyna Reviews plugin bootstrap.
 *
 * @package KlynaReviews
 */

namespace KlynaReviews;

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
		load_plugin_textdomain( 'wp-reviews', false, dirname( plugin_basename( KLYNA_REVIEWS_PLUGIN_FILE ) ) . '/languages' );

		( new Reviews() )->register();
		( new Rest() )->register();
		( new Shortcode() )->register();
		( new Schema() )->register();
		( new RequestEmail() )->register();

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
		$settings = get_option( KLYNA_REVIEWS_OPTION_KEY, array() );
		return is_array( $settings ) ? $settings : array();
	}

	/**
	 * A single setting with a fallback default.
	 *
	 * @param string $key      Setting key.
	 * @param mixed  $fallback Value returned when the key is missing.
	 * @return mixed
	 */
	public static function setting( string $key, $fallback = null ) {
		$settings = self::settings();
		return $settings[ $key ] ?? $fallback;
	}
}
