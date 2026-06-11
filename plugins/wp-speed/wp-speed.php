<?php
/**
 * Plugin Name:       Klyna Speed
 * Plugin URI:        https://klyna.dev/products/wp-speed
 * Description:       Tools that help your work get found.
 * Version:           0.1.0
 * Requires at least: 6.4
 * Requires PHP:      8.0
 * Author:            Klyna
 * Author URI:        https://klyna.dev
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       wp-speed
 * Domain Path:       /languages
 *
 * @package KlynaSpeed
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'KLYNA_SPEED_VERSION', '0.1.0' );
define( 'KLYNA_SPEED_PLUGIN_FILE', __FILE__ );
define( 'KLYNA_SPEED_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'KLYNA_SPEED_PLUGIN_URL', plugin_dir_url( __FILE__ ) );
define( 'KLYNA_SPEED_OPTION_KEY', 'wp_speed_settings' );
define( 'KLYNA_SPEED_CACHE_DIR', WP_CONTENT_DIR . '/cache/klyna-speed' );

// Composer-style autoload for our own classes (no third-party deps).
spl_autoload_register(
	function ( $class ) {
		if ( strpos( $class, 'KlynaSpeed\\' ) !== 0 ) {
			return;
		}
		$relative = str_replace( 'KlynaSpeed\\', '', $class );
		$relative = str_replace( '\\', '/', $relative );
		$parts    = explode( '/', $relative );
		$base     = array_pop( $parts );
		// Handle both CamelCase (Plugin -> plugin) and snake_case (Feed_Builder -> feed-builder).
		$kebab    = preg_replace( '/(?<!^)[A-Z]/', '-$0', $base );
		$kebab    = str_replace( '_', '-', $kebab );
		$kebab    = preg_replace( '/-+/', '-', $kebab );
		$filename = 'class-' . strtolower( $kebab ) . '.php';
		$path     = KLYNA_SPEED_PLUGIN_DIR . 'includes/';
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
		( new KlynaSpeed\Plugin() )->boot();
	}
);

// Activation: set defaults, ensure the cache directory exists.
register_activation_hook(
	__FILE__,
	function () {
		$defaults = array(
			'enable_page_cache'   => true,
			'cache_logged_in'     => false,
			'cache_ttl_hours'     => 10,
			'enable_lazyload'     => true,
			'lazyload_iframes'    => true,
			'enable_defer_js'     => true,
			'enable_minify_css'   => true,
			'enable_minify_html'  => true,
			'enable_preload'      => true,
			'preload_urls'        => '',
			'heartbeat_mode'      => 'slow',
			'exclude_urls'        => '',
		);
		$existing = get_option( KLYNA_SPEED_OPTION_KEY, array() );
		update_option( KLYNA_SPEED_OPTION_KEY, wp_parse_args( $existing, $defaults ) );

		KlynaSpeed\Cache::ensure_cache_dir();
		KlynaSpeed\Cache::write_drop_in_marker();
	}
);

// Deactivation: clear cached pages, leave settings in place.
register_deactivation_hook(
	__FILE__,
	function () {
		KlynaSpeed\Cache::purge_all();
		KlynaSpeed\Cache::remove_drop_in_marker();
	}
);
