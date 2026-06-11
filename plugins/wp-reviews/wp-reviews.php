<?php
/**
 * Plugin Name:       Klyna Reviews
 * Plugin URI:        https://klyna.dev/products/wp-reviews
 * Description:       Tools that help your work get found. Collect & display reviews with rich-snippet stars and moderation.
 * Version:           0.1.0
 * Requires at least: 6.4
 * Requires PHP:      8.0
 * Author:            Klyna
 * Author URI:        https://klyna.dev
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       wp-reviews
 * Domain Path:       /languages
 *
 * @package KlynaReviews
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'KLYNA_REVIEWS_VERSION', '0.1.0' );
define( 'KLYNA_REVIEWS_PLUGIN_FILE', __FILE__ );
define( 'KLYNA_REVIEWS_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'KLYNA_REVIEWS_PLUGIN_URL', plugin_dir_url( __FILE__ ) );
define( 'KLYNA_REVIEWS_OPTION_KEY', 'wp_reviews_settings' );

// Composer-style autoload for our own classes (no third-party deps).
spl_autoload_register(
	function ( $class ) {
		if ( strpos( $class, 'KlynaReviews\\' ) !== 0 ) {
			return;
		}
		$relative = str_replace( 'KlynaReviews\\', '', $class );
		$relative = str_replace( '\\', '/', $relative );
		$parts    = explode( '/', $relative );
		$base     = array_pop( $parts );
		// Handle both CamelCase (Plugin -> plugin) and snake_case (Feed_Builder -> feed-builder).
		$kebab    = preg_replace( '/(?<!^)[A-Z]/', '-$0', $base );
		$kebab    = str_replace( '_', '-', $kebab );
		$kebab    = preg_replace( '/-+/', '-', $kebab );
		$filename = 'class-' . strtolower( $kebab ) . '.php';
		$path     = KLYNA_REVIEWS_PLUGIN_DIR . 'includes/';
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
		( new KlynaReviews\Plugin() )->boot();
		\KlynaReviews\Telemetry::register();
	}
);

// Activation: set defaults, create the reviews table, flush rewrites.
register_activation_hook(
	__FILE__,
	function () {
		$defaults = array(
			'enable_aggregate_schema' => true,
			'enable_review_schema'    => true,
			'auto_approve'            => false,
			'require_email'           => true,
			'min_rating'              => 1,
			'max_rating'              => 5,
			'request_email_enabled'   => false,
			'request_email_subject'   => __( 'How was your experience?', 'wp-reviews' ),
			'request_email_body'      => __( "Hi {name},\n\nThanks for choosing {site}. We'd love to hear what you think — it only takes a minute:\n\n{link}\n\nWith thanks,\n{site}", 'wp-reviews' ),
			'reviews_per_page'        => 10,
			'product_name'            => get_bloginfo( 'name' ),
		);
		$existing = get_option( KLYNA_REVIEWS_OPTION_KEY, array() );
		update_option( KLYNA_REVIEWS_OPTION_KEY, wp_parse_args( $existing, $defaults ) );

		KlynaReviews\Reviews::install_table();

		KlynaReviews\Reviews::register_post_type();
		flush_rewrite_rules();
	}
);

// Deactivation: drop scheduled events; settings + data are preserved.
register_deactivation_hook(
	__FILE__,
	function () {
		$timestamp = wp_next_scheduled( 'klyna_reviews_send_requests' );
		if ( $timestamp ) {
			wp_unschedule_event( $timestamp, 'klyna_reviews_send_requests' );
		}
		flush_rewrite_rules();
	}
);
