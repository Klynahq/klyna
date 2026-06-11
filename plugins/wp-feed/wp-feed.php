<?php
/**
 * Plugin Name:       Klyna Product Feed
 * Plugin URI:        https://klyna.dev/products/wp-feed
 * Description:       Tools that help your work get found. WooCommerce product feeds for Google Shopping & Meta, auto-refreshed.
 * Version:           0.1.0
 * Requires at least: 6.4
 * Requires PHP:      8.0
 * Author:            Klyna
 * Author URI:        https://klyna.dev
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       wp-feed
 * Domain Path:       /languages
 *
 * @package KlynaFeed
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'KLYNA_FEED_VERSION', '0.1.0' );
define( 'KLYNA_FEED_PLUGIN_FILE', __FILE__ );
define( 'KLYNA_FEED_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'KLYNA_FEED_PLUGIN_URL', plugin_dir_url( __FILE__ ) );
define( 'KLYNA_FEED_OPTION_KEY', 'wp_feed_settings' );
define( 'KLYNA_FEED_CRON_HOOK', 'klyna_feed_regenerate' );

// Composer-style autoload for our own classes (no third-party deps).
spl_autoload_register(
	function ( $class ) {
		if ( strpos( $class, 'KlynaFeed\\' ) !== 0 ) {
			return;
		}
		$relative = str_replace( 'KlynaFeed\\', '', $class );
		$relative = str_replace( '\\', '/', $relative );
		$parts    = explode( '/', $relative );
		// Map e.g. Feed_Builder -> class-feed-builder.php: underscores become
		// hyphens, then CamelCase boundaries become hyphens too.
		$leaf     = str_replace( '_', '-', array_pop( $parts ) );
		$filename = 'class-' . strtolower( preg_replace( '/(?<!^)(?<!-)[A-Z]/', '-$0', $leaf ) ) . '.php';
		$path     = KLYNA_FEED_PLUGIN_DIR . 'includes/';
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
		( new KlynaFeed\Plugin() )->boot();
	}
);

// Activation: set defaults, create the cache table, schedule regeneration, flush rewrites.
register_activation_hook(
	__FILE__,
	function () {
		$defaults = array(
			'enable_google'      => true,
			'enable_meta'        => true,
			'default_brand'      => get_bloginfo( 'name' ),
			'default_condition'  => 'new',
			'include_categories' => array(),
			'exclude_categories' => array(),
			'in_stock_only'      => true,
			'gtin_meta_key'      => '_gtin',
			'brand_meta_key'     => '_brand',
			'google_category'    => '',
			'schedule'           => 'daily',
			'feed_token'         => wp_generate_password( 20, false, false ),
		);
		$existing = get_option( KLYNA_FEED_OPTION_KEY, array() );
		update_option( KLYNA_FEED_OPTION_KEY, wp_parse_args( $existing, $defaults ) );

		KlynaFeed\Storage::install_table();

		$settings = get_option( KLYNA_FEED_OPTION_KEY, array() );
		$schedule = is_array( $settings ) && ! empty( $settings['schedule'] ) ? (string) $settings['schedule'] : 'daily';
		if ( 'off' !== $schedule && ! wp_next_scheduled( KLYNA_FEED_CRON_HOOK ) ) {
			wp_schedule_event( time() + HOUR_IN_SECONDS, $schedule, KLYNA_FEED_CRON_HOOK );
		}

		// Register the rewrite endpoint then flush so the public feed URL resolves.
		KlynaFeed\Feed_Endpoint::add_rewrite_rules();
		flush_rewrite_rules();
	}
);

// Deactivation: drop the cron schedule and flush rewrites. Settings + cache are preserved.
register_deactivation_hook(
	__FILE__,
	function () {
		$timestamp = wp_next_scheduled( KLYNA_FEED_CRON_HOOK );
		if ( $timestamp ) {
			wp_unschedule_event( $timestamp, KLYNA_FEED_CRON_HOOK );
		}
		wp_clear_scheduled_hook( KLYNA_FEED_CRON_HOOK );
		flush_rewrite_rules();
	}
);
