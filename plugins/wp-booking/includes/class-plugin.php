<?php
/**
 * Klyna Booking plugin bootstrap.
 *
 * @package KlynaBooking
 */

namespace KlynaBooking;

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
		load_plugin_textdomain( 'wp-booking', false, dirname( plugin_basename( KLYNA_BOOKING_PLUGIN_FILE ) ) . '/languages' );

		( new Services() )->register();
		( new Bookings() )->register();
		( new Availability() )->register();
		( new Rest() )->register();
		( new Frontend() )->register();
		( new Emails() )->register();
		( new Ai_Confirmations() )->register();

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
		$settings = get_option( KLYNA_BOOKING_OPTION_KEY, array() );
		$settings = is_array( $settings ) ? $settings : array();
		return wp_parse_args( $settings, self::defaults() );
	}

	/**
	 * Hard defaults applied on every read so a half-saved option never
	 * leaves a subsystem reading a missing key.
	 *
	 * @return array<string,mixed>
	 */
	public static function defaults(): array {
		return array(
			'business_name'    => get_bloginfo( 'name' ),
			'business_email'   => get_option( 'admin_email' ),
			'time_zone'        => wp_timezone_string(),
			'slot_interval'    => 30,
			'lead_time'        => 60,
			'booking_window'   => 30,
			'require_approval' => false,
			'notify_admin'     => true,
			'notify_customer'  => true,
			'availability'     => Availability::default_hours(),
			'blackout_dates'   => '',
			'ai_provider'      => 'off',
			'ai_model'         => '',
			'ai_api_key'       => '',
			'ai_endpoint'      => '',
			'ai_daily_cap'     => 100,
		);
	}
}
