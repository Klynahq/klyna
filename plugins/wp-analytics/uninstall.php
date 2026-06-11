<?php
/**
 * Uninstall handler.
 *
 * Runs when the user deletes the plugin from the Plugins screen. We remove our
 * own options and the aggregate table, plus any leftover unique-visitor
 * transients. We never touch posts, users, or core tables.
 *
 * @package KlynaAnalytics
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

global $wpdb;

// Options.
delete_option( 'wp_analytics_settings' );
delete_option( 'klyna_analytics_db_version' );

// Aggregate table.
$table = $wpdb->prefix . 'klyna_analytics_daily';
// phpcs:ignore WordPress.DB.DirectDatabaseQuery, WordPress.DB.PreparedSQL.NotPrepared
$wpdb->query( "DROP TABLE IF EXISTS {$table}" );

// Daily unique-visitor transients (and their timeouts).
// phpcs:disable WordPress.DB.DirectDatabaseQuery
$wpdb->query(
	"DELETE FROM {$wpdb->options}
	 WHERE option_name LIKE '_transient_klyna_an_%'
	    OR option_name LIKE '_transient_timeout_klyna_an_%'"
);
// phpcs:enable

// Scheduled cron event.
$timestamp = wp_next_scheduled( 'klyna_analytics_prune' );
if ( $timestamp ) {
	wp_unschedule_event( $timestamp, 'klyna_analytics_prune' );
}
