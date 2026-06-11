<?php
/**
 * Plugin Name:       Klyna Popups
 * Plugin URI:        https://klyna.dev/products/wp-popups
 * Description:       Tools that help your work get found. Email-capture popups, exit-intent triggers, and targeted on-site offers — no paid APIs.
 * Version:           0.1.0
 * Requires at least: 6.4
 * Requires PHP:      8.0
 * Author:            Klyna
 * Author URI:        https://klyna.dev
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       wp-popups
 * Domain Path:       /languages
 *
 * @package KlynaPopups
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'KLYNA_POPUPS_VERSION', '0.1.0' );
define( 'KLYNA_POPUPS_PLUGIN_FILE', __FILE__ );
define( 'KLYNA_POPUPS_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'KLYNA_POPUPS_PLUGIN_URL', plugin_dir_url( __FILE__ ) );
define( 'KLYNA_POPUPS_OPTION_KEY', 'wp_popups_settings' );
define( 'KLYNA_POPUPS_DB_VERSION', '1' );

// Composer-style autoload for our own classes (no third-party deps).
spl_autoload_register(
	function ( $class ) {
		if ( strpos( $class, 'KlynaPopups\\' ) !== 0 ) {
			return;
		}
		$relative = str_replace( 'KlynaPopups\\', '', $class );
		$relative = str_replace( '\\', '/', $relative );
		$parts    = explode( '/', $relative );
		$filename = 'class-' . strtolower( preg_replace( '/(?<!^)[A-Z]/', '-$0', array_pop( $parts ) ) ) . '.php';
		$path     = KLYNA_POPUPS_PLUGIN_DIR . 'includes/';
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
		( new KlynaPopups\Plugin() )->boot();
	}
);

// Activation: register the CPT, create the entries table, set defaults, flush rewrites.
register_activation_hook(
	__FILE__,
	function () {
		KlynaPopups\Popups::register_post_type();
		KlynaPopups\Entries::install_table();

		$defaults = array(
			'enabled'           => true,
			'default_position'  => 'center',
			'default_animation' => 'fade',
			'respect_dnt'       => true,
			'cookie_days'       => 7,
			'webhook_url'       => '',
			'webhook_secret'    => '',
			'from_name'         => get_bloginfo( 'name' ),
			'success_message'   => __( 'Thanks! Check your inbox.', 'wp-popups' ),
		);
		$existing = get_option( KLYNA_POPUPS_OPTION_KEY, array() );
		update_option( KLYNA_POPUPS_OPTION_KEY, wp_parse_args( $existing, $defaults ) );

		flush_rewrite_rules();
	}
);

// Deactivation: drop rewrite rules only. Settings, popups, and entries are preserved.
register_deactivation_hook(
	__FILE__,
	function () {
		flush_rewrite_rules();
	}
);
