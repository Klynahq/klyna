<?php
/**
 * Plugin Name:       Klyna Consent
 * Plugin URI:        https://klyna.dev/products/wp-consent
 * Description:       GDPR/ePrivacy cookie consent banner with Google Consent Mode v2, script blocking, geo-aware display, and a fully branded admin UI. Free, no external APIs.
 * Version:           1.0.0
 * Requires at least: 6.4
 * Requires PHP:      8.0
 * Author:            Klyna
 * Author URI:        https://klyna.dev
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       wp-consent
 * Domain Path:       /languages
 *
 * @package KlynaConsent
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'KLYNA_CONSENT_VERSION', '1.0.0' );
define( 'KLYNA_CONSENT_PLUGIN_FILE', __FILE__ );
define( 'KLYNA_CONSENT_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'KLYNA_CONSENT_PLUGIN_URL', plugin_dir_url( __FILE__ ) );
define( 'KLYNA_CONSENT_OPTION_KEY', 'wp_consent_settings' );

// Composer-style autoload for our own classes.
spl_autoload_register(
	function ( $class ) {
		if ( strpos( $class, 'KlynaConsent\\' ) !== 0 ) {
			return;
		}
		$relative = str_replace( 'KlynaConsent\\', '', $class );
		$relative = str_replace( '\\', '/', $relative );
		$parts    = explode( '/', $relative );
		$filename = 'class-' . strtolower( preg_replace( '/(?<!^)[A-Z]/', '-$0', array_pop( $parts ) ) ) . '.php';
		$path     = KLYNA_CONSENT_PLUGIN_DIR . 'includes/';
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
		( new KlynaConsent\Plugin() )->boot();
	}
);

// Activation: set defaults.
register_activation_hook(
	__FILE__,
	function () {
		$defaults = array(
			'banner_text'               => 'We use cookies to enhance your experience. Choose which cookies you allow.',
			'accept_label'              => 'Accept All',
			'reject_label'              => 'Reject All',
			'manage_label'              => 'Manage Preferences',
			'position'                  => 'bottom',
			'bg_color'                  => '#1a1a23',
			'text_color'                => '#f4f4f5',
			'accent_color'              => '#7c5cff',
			'enable_analytics'          => true,
			'enable_marketing'          => true,
			'enable_preferences'        => true,
			'google_consent_mode'       => true,
			'geo_restrict'              => false,
			'cookie_settings_link'      => true,
		);
		$existing = get_option( KLYNA_CONSENT_OPTION_KEY, array() );
		if ( ! is_array( $existing ) ) {
			$existing = array();
		}
		update_option( KLYNA_CONSENT_OPTION_KEY, wp_parse_args( $existing, $defaults ) );
	}
);

// Deactivation: nothing destructive.
register_deactivation_hook( __FILE__, '__return_null' );
