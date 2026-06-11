<?php
/**
 * Uninstall handler.
 *
 * Runs when the user deletes the plugin from the Plugins screen.
 * We only remove *our* footprint here — settings, the last-run marker, the
 * scheduled cron event, and the feed cache table. We never touch products,
 * users, or core tables.
 *
 * @package KlynaFeed
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

delete_option( 'wp_feed_settings' );
delete_option( 'klyna_feed_last_run' );

// Clear the regeneration cron event if it is still scheduled.
$timestamp = wp_next_scheduled( 'klyna_feed_regenerate' );
if ( $timestamp ) {
	wp_unschedule_event( $timestamp, 'klyna_feed_regenerate' );
}
wp_clear_scheduled_hook( 'klyna_feed_regenerate' );

// Drop the feed cache table. Mirror Storage::table_name() without autoloading.
global $wpdb;
$table = $wpdb->prefix . 'klyna_feeds';
// phpcs:ignore WordPress.DB.DirectDatabaseQuery, WordPress.DB.PreparedSQL.NotPrepared
$wpdb->query( 'DROP TABLE IF EXISTS ' . $table );
