<?php
/**
 * Plugin Name:       Klyna Tables
 * Plugin URI:        https://klyna.dev/products/wp-tables
 * Description:       Tools that help your work get found.
 * Version:           0.1.0
 * Requires at least: 6.4
 * Requires PHP:      8.0
 * Author:            Klyna
 * Author URI:        https://klyna.dev
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       wp-tables
 * Domain Path:       /languages
 *
 * @package KlynaTables
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'KLYNA_TABLES_VERSION', '0.1.0' );
define( 'KLYNA_TABLES_PLUGIN_FILE', __FILE__ );
define( 'KLYNA_TABLES_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'KLYNA_TABLES_PLUGIN_URL', plugin_dir_url( __FILE__ ) );
define( 'KLYNA_TABLES_OPTION_KEY', 'wp_tables_settings' );
define( 'KLYNA_TABLES_POST_TYPE', 'klyna_table' );

// Composer-style autoload for our own classes (no third-party deps).
spl_autoload_register(
	function ( $class ) {
		if ( strpos( $class, 'KlynaTables\\' ) !== 0 ) {
			return;
		}
		$relative = str_replace( 'KlynaTables\\', '', $class );
		$relative = str_replace( '\\', '/', $relative );
		$parts    = explode( '/', $relative );
		$base     = array_pop( $parts );
		// Handle both CamelCase (Plugin → plugin) and snake_case (Table_Store → table-store).
		$kebab    = preg_replace( '/(?<!^)[A-Z]/', '-$0', $base );
		$kebab    = str_replace( '_', '-', $kebab );
		$kebab    = preg_replace( '/-+/', '-', $kebab );
		$filename = 'class-' . strtolower( $kebab ) . '.php';
		$path     = KLYNA_TABLES_PLUGIN_DIR . 'includes/';
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
		( new KlynaTables\Plugin() )->boot();
	}
);

// Activation: set defaults, register the CPT, flush rewrites.
register_activation_hook(
	__FILE__,
	function () {
		$defaults = array(
			'default_rows_per_page' => 10,
			'enable_search'         => true,
			'enable_sort'           => true,
			'enable_pagination'     => true,
			'responsive_stack'      => true,
			'striped'               => true,
			'accent'                => '#7c5cff',
			'woo_columns'           => array( 'image', 'title', 'price', 'cart' ),
		);
		$existing = get_option( KLYNA_TABLES_OPTION_KEY, array() );
		update_option( KLYNA_TABLES_OPTION_KEY, wp_parse_args( $existing, $defaults ) );

		// Ensure the CPT exists before flushing so rewrite rules register.
		( new KlynaTables\Table_Store() )->register_post_type();
		flush_rewrite_rules();
	}
);

// Deactivation: flush rewrites; settings are preserved.
register_deactivation_hook(
	__FILE__,
	function () {
		flush_rewrite_rules();
	}
);
