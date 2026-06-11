<?php
/**
 * Plugin Name:       Klyna Analytics
 * Plugin URI:        https://klyna.dev/products/wp-analytics
 * Description:       Tools that help your work get found. Privacy-first, cookieless analytics with an in-dashboard report. No external services, no PII.
 * Version:           0.1.0
 * Requires at least: 6.4
 * Requires PHP:      8.0
 * Author:            Klyna
 * Author URI:        https://klyna.dev
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       wp-analytics
 * Domain Path:       /languages
 *
 * @package KlynaAnalytics
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'KLYNA_ANALYTICS_VERSION', '0.1.0' );
define( 'KLYNA_ANALYTICS_PLUGIN_FILE', __FILE__ );
define( 'KLYNA_ANALYTICS_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'KLYNA_ANALYTICS_PLUGIN_URL', plugin_dir_url( __FILE__ ) );
define( 'KLYNA_ANALYTICS_OPTION_KEY', 'wp_analytics_settings' );
define( 'KLYNA_ANALYTICS_DB_VERSION', '1' );

// Composer-style autoload for our own classes (no third-party deps).
spl_autoload_register(
	function ( $class ) {
		if ( strpos( $class, 'KlynaAnalytics\\' ) !== 0 ) {
			return;
		}
		$relative = str_replace( 'KlynaAnalytics\\', '', $class );
		$relative = str_replace( '\\', '/', $relative );
		$parts    = explode( '/', $relative );
		$base     = array_pop( $parts );
		// Handle both CamelCase (Plugin -> plugin) and snake_case (Feed_Builder -> feed-builder).
		$kebab    = preg_replace( '/(?<!^)[A-Z]/', '-$0', $base );
		$kebab    = str_replace( '_', '-', $kebab );
		$kebab    = preg_replace( '/-+/', '-', $kebab );
		$filename = 'class-' . strtolower( $kebab ) . '.php';
		$path     = KLYNA_ANALYTICS_PLUGIN_DIR . 'includes/';
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
		( new KlynaAnalytics\Plugin() )->boot();
	}
);

// Activation: set defaults, install the storage table.
register_activation_hook(
	__FILE__,
	function () {
		$defaults = array(
			'enabled'           => true,
			'respect_dnt'       => true,
			'track_logged_in'   => false,
			'exclude_admins'    => true,
			'retention_days'    => 365,
			'hash_salt'         => wp_generate_password( 32, false, false ),
		);
		$existing = get_option( KLYNA_ANALYTICS_OPTION_KEY, array() );
		update_option( KLYNA_ANALYTICS_OPTION_KEY, wp_parse_args( $existing, $defaults ) );

		KlynaAnalytics\Storage::install();
		KlynaAnalytics\Storage::schedule_pruning();
	}
);

// Deactivation: clear the cron event; leave data intact.
register_deactivation_hook(
	__FILE__,
	function () {
		KlynaAnalytics\Storage::unschedule_pruning();
	}
);
