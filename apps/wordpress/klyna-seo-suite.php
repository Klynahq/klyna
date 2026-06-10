<?php
/**
 * Plugin Name:       Klyna SEO Suite
 * Plugin URI:        https://klyna.dev/products/wp-suite
 * Description:       Autopilot SEO for WordPress — schema markup, internal linking, FAQ generation, content freshness. Free, open, no paid APIs.
 * Version:           0.1.0
 * Requires at least: 6.4
 * Requires PHP:      8.0
 * Author:            Klyna
 * Author URI:        https://klyna.dev
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       klyna
 * Domain Path:       /languages
 *
 * @package Klyna
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'KLYNA_VERSION', '0.1.0' );
define( 'KLYNA_PLUGIN_FILE', __FILE__ );
define( 'KLYNA_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'KLYNA_PLUGIN_URL', plugin_dir_url( __FILE__ ) );
define( 'KLYNA_OPTION_KEY', 'klyna_settings' );

// Composer-style autoload for our own classes (no third-party deps).
spl_autoload_register(
	function ( $class ) {
		if ( strpos( $class, 'Klyna\\' ) !== 0 ) {
			return;
		}
		$relative = str_replace( 'Klyna\\', '', $class );
		$relative = str_replace( '\\', '/', $relative );
		$parts    = explode( '/', $relative );
		$filename = 'class-' . strtolower( preg_replace( '/(?<!^)[A-Z]/', '-$0', array_pop( $parts ) ) ) . '.php';
		$path     = KLYNA_PLUGIN_DIR . 'includes/';
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
		( new Klyna\Plugin() )->boot();
	}
);

// Activation: set defaults, ensure rewrites are flushed.
register_activation_hook(
	__FILE__,
	function () {
		$defaults = array(
			'enable_org_schema'     => true,
			'enable_article_schema' => true,
			'enable_faq_schema'     => true,
			'enable_breadcrumbs'    => true,
			'auto_internal_links'   => false,
			'org_name'              => get_bloginfo( 'name' ),
			'org_logo'              => '',
			'org_same_as'           => '',
			'author_url'            => home_url( '/' ),
		);
		$existing = get_option( KLYNA_OPTION_KEY, array() );
		update_option( KLYNA_OPTION_KEY, wp_parse_args( $existing, $defaults ) );
	}
);

// Deactivation: nothing destructive (settings are preserved).
register_deactivation_hook( __FILE__, '__return_null' );
