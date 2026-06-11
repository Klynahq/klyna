<?php
/**
 * Plugin Name:       Klyna Forms
 * Plugin URI:        https://klyna.dev/products/wp-forms
 * Description:       Tools that help your work get found. Lead-gen forms with entry storage, spam protection & notifications.
 * Version:           0.1.0
 * Requires at least: 6.4
 * Requires PHP:      8.0
 * Author:            Klyna
 * Author URI:        https://klyna.dev
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       wp-forms
 * Domain Path:       /languages
 *
 * @package KlynaForms
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'KLYNA_FORMS_VERSION', '0.1.0' );
define( 'KLYNA_FORMS_PLUGIN_FILE', __FILE__ );
define( 'KLYNA_FORMS_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'KLYNA_FORMS_PLUGIN_URL', plugin_dir_url( __FILE__ ) );
define( 'KLYNA_FORMS_OPTION_KEY', 'wp_forms_settings' );
define( 'KLYNA_FORMS_DB_VERSION', '1' );
define( 'KLYNA_FORMS_POST_TYPE', 'klyna_form' );

// Composer-style autoload for our own classes (no third-party deps).
spl_autoload_register(
	function ( $class ) {
		if ( strpos( $class, 'KlynaForms\\' ) !== 0 ) {
			return;
		}
		$relative = str_replace( 'KlynaForms\\', '', $class );
		$relative = str_replace( '\\', '/', $relative );
		$parts    = explode( '/', $relative );
		$base     = array_pop( $parts );
		// Handle both CamelCase (Plugin -> plugin) and snake_case (Feed_Builder -> feed-builder).
		$kebab    = preg_replace( '/(?<!^)[A-Z]/', '-$0', $base );
		$kebab    = str_replace( '_', '-', $kebab );
		$kebab    = preg_replace( '/-+/', '-', $kebab );
		$filename = 'class-' . strtolower( $kebab ) . '.php';
		$path     = KLYNA_FORMS_PLUGIN_DIR . 'includes/';
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
		( new KlynaForms\Plugin() )->boot();
	}
);

// Activation: set defaults, create the entries table, register the CPT, flush rewrites.
register_activation_hook(
	__FILE__,
	function () {
		$defaults = array(
			'notify_enabled'   => true,
			'notify_to'        => get_option( 'admin_email' ),
			'notify_subject'   => __( 'New form submission: {form_title}', 'wp-forms' ),
			'from_name'        => get_bloginfo( 'name' ),
			'from_email'       => get_option( 'admin_email' ),
			'honeypot_enabled' => true,
			'time_trap_enabled' => true,
			'time_trap_seconds' => 3,
			'store_entries'    => true,
			'store_ip'         => true,
		);
		$existing = get_option( KLYNA_FORMS_OPTION_KEY, array() );
		update_option( KLYNA_FORMS_OPTION_KEY, wp_parse_args( $existing, $defaults ) );

		// Create the entries table up front so the very first submission has somewhere to land.
		KlynaForms\Entries::install_table();
		KlynaForms\Replies::install_table();

		// Register the CPT then flush so /klyna_form rewrite rules exist.
		KlynaForms\Forms::register_post_type();
		flush_rewrite_rules();
	}
);

// Deactivation: flush rewrites; nothing destructive (data is preserved until uninstall).
register_deactivation_hook(
	__FILE__,
	function () {
		flush_rewrite_rules();
	}
);
