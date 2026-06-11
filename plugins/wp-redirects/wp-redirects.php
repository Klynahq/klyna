<?php
/**
 * Plugin Name:       Klyna Redirects
 * Plugin URI:        https://klyna.dev/products/wp-redirects
 * Description:       Tools that help your work get found. 301/302/307/410 redirect manager with a 404 monitor and one-click auto-redirects. Free, open, no paid APIs.
 * Version:           0.1.0
 * Requires at least: 6.4
 * Requires PHP:      8.0
 * Author:            Klyna
 * Author URI:        https://klyna.dev
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       wp-redirects
 * Domain Path:       /languages
 *
 * @package KlynaRedirects
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'KLYNA_REDIRECTS_VERSION', '0.1.0' );
define( 'KLYNA_REDIRECTS_PLUGIN_FILE', __FILE__ );
define( 'KLYNA_REDIRECTS_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'KLYNA_REDIRECTS_PLUGIN_URL', plugin_dir_url( __FILE__ ) );
define( 'KLYNA_REDIRECTS_OPTION_KEY', 'wp_redirects_settings' );
define( 'KLYNA_REDIRECTS_DB_VERSION', '1' );

// Composer-style autoload for our own classes (no third-party deps).
spl_autoload_register(
	function ( $class ) {
		if ( strpos( $class, 'KlynaRedirects\\' ) !== 0 ) {
			return;
		}
		$relative = str_replace( 'KlynaRedirects\\', '', $class );
		$relative = str_replace( '\\', '/', $relative );
		$parts    = explode( '/', $relative );
		$base     = array_pop( $parts );
		// Handle both CamelCase (Plugin -> plugin) and snake_case (Feed_Builder -> feed-builder).
		$kebab    = preg_replace( '/(?<!^)[A-Z]/', '-$0', $base );
		$kebab    = str_replace( '_', '-', $kebab );
		$kebab    = preg_replace( '/-+/', '-', $kebab );
		$filename = 'class-' . strtolower( $kebab ) . '.php';
		$path     = KLYNA_REDIRECTS_PLUGIN_DIR . 'includes/';
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
		( new KlynaRedirects\Plugin() )->boot();
	}
);

// Activation: create the custom tables and set defaults.
register_activation_hook(
	__FILE__,
	function () {
		require_once KLYNA_REDIRECTS_PLUGIN_DIR . 'includes/class-database.php';
		KlynaRedirects\Database::install();

		$defaults = array(
			'enable_redirects'    => true,
			'log_404'             => true,
			'auto_redirect_slug'  => true,
			'default_status'      => 301,
			'monitor_logged_in'   => false,
			'log_retention_days'  => 90,
		);
		$existing = get_option( KLYNA_REDIRECTS_OPTION_KEY, array() );
		update_option( KLYNA_REDIRECTS_OPTION_KEY, wp_parse_args( $existing, $defaults ) );
		update_option( 'wp_redirects_db_version', KLYNA_REDIRECTS_DB_VERSION );
	}
);

// Deactivation: clear our scheduled cleanup event (settings + data are preserved).
register_deactivation_hook(
	__FILE__,
	function () {
		$timestamp = wp_next_scheduled( 'wp_redirects_prune_logs' );
		if ( $timestamp ) {
			wp_unschedule_event( $timestamp, 'wp_redirects_prune_logs' );
		}
	}
);
