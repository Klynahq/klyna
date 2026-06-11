<?php
/**
 * Plugin Name:       Klyna Booking
 * Plugin URI:        https://klyna.dev/products/wp-booking
 * Description:       Tools that help your work get found.
 * Version:           0.1.0
 * Requires at least: 6.4
 * Requires PHP:      8.0
 * Author:            Klyna
 * Author URI:        https://klyna.dev
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       wp-booking
 * Domain Path:       /languages
 *
 * @package KlynaBooking
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'KLYNA_BOOKING_VERSION', '0.1.0' );
define( 'KLYNA_BOOKING_PLUGIN_FILE', __FILE__ );
define( 'KLYNA_BOOKING_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'KLYNA_BOOKING_PLUGIN_URL', plugin_dir_url( __FILE__ ) );
define( 'KLYNA_BOOKING_OPTION_KEY', 'wp_booking_settings' );

// Composer-style autoload for our own classes (no third-party deps).
spl_autoload_register(
	function ( $class ) {
		if ( strpos( $class, 'KlynaBooking\\' ) !== 0 ) {
			return;
		}
		$relative = str_replace( 'KlynaBooking\\', '', $class );
		$relative = str_replace( '\\', '/', $relative );
		$parts    = explode( '/', $relative );
		$base     = array_pop( $parts );
		// Handle both CamelCase (Plugin -> plugin) and snake_case (Feed_Builder -> feed-builder).
		$kebab    = preg_replace( '/(?<!^)[A-Z]/', '-$0', $base );
		$kebab    = str_replace( '_', '-', $kebab );
		$kebab    = preg_replace( '/-+/', '-', $kebab );
		$filename = 'class-' . strtolower( $kebab ) . '.php';
		$path     = KLYNA_BOOKING_PLUGIN_DIR . 'includes/';
		if ( $parts ) {
			$path .= strtolower( implode( '/', $parts ) ) . '/';
		}
		$full = $path . $filename;
		if ( file_exists( $full ) ) {
			require_once $full;
		}
	}
);

// Bootstrap.
add_action(
	'plugins_loaded',
	function () {
		( new KlynaBooking\Plugin() )->boot();
	}
);

// Activation: set defaults, register the post types, then flush rewrites.
register_activation_hook(
	__FILE__,
	function () {
		$defaults = array(
			'business_name'    => get_bloginfo( 'name' ),
			'business_email'   => get_option( 'admin_email' ),
			'time_zone'        => wp_timezone_string(),
			'slot_interval'    => 30,
			'lead_time'        => 60,
			'booking_window'   => 30,
			'require_approval' => false,
			'notify_admin'     => true,
			'notify_customer'  => true,
			'availability'     => KlynaBooking\Availability::default_hours(),
			'blackout_dates'   => '',
		);
		$existing = get_option( KLYNA_BOOKING_OPTION_KEY, array() );
		update_option( KLYNA_BOOKING_OPTION_KEY, wp_parse_args( $existing, $defaults ) );

		// Register CPTs so the rewrite rules exist before the flush.
		( new KlynaBooking\Services() )->register_post_type();
		( new KlynaBooking\Bookings() )->register_post_type();

		// Install / upgrade the AI email storage table.
		KlynaBooking\Booking_Emails::install();

		flush_rewrite_rules();
	}
);

// Deactivation: flush rewrites; settings + bookings are preserved.
register_deactivation_hook(
	__FILE__,
	function () {
		flush_rewrite_rules();
	}
);
