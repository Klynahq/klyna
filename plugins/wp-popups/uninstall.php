<?php
/**
 * Uninstall handler.
 *
 * Runs when the user deletes the plugin from the Plugins screen. We remove our
 * own option, the popup posts + their meta, and the entries table. We never
 * touch core tables, other plugins' data, or unrelated posts.
 *
 * @package KlynaPopups
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

global $wpdb;

// 1. Settings + DB version flag.
delete_option( 'wp_popups_settings' );
delete_option( 'klyna_popups_db_version' );

// 2. Delete every popup post and its meta (counters + config).
$popups = get_posts(
	array(
		'post_type'      => 'klyna_popup',
		'post_status'    => 'any',
		'posts_per_page' => -1,
		'fields'         => 'ids',
	)
);
foreach ( $popups as $popup_id ) {
	wp_delete_post( (int) $popup_id, true );
}

// 3. Drop the entries table.
$table = $wpdb->prefix . 'klyna_popup_entries';
// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.DirectDatabaseQuery.SchemaChange, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
$wpdb->query( "DROP TABLE IF EXISTS {$table}" );
