<?php
/**
 * Uninstall handler.
 *
 * Runs when the user deletes the plugin from the Plugins screen.
 * Removes our option, the entries table, all form posts + their meta, and the
 * stored DB version. We never touch other plugins' data or core tables.
 *
 * @package KlynaForms
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

global $wpdb;

// Plugin settings.
delete_option( 'wp_forms_settings' );
delete_option( 'wp_forms_db_version' );

// Form posts + their meta (the CPT is not registered during uninstall, so we
// query by post_type directly).
$form_ids = $wpdb->get_col( // phpcs:ignore WordPress.DB.DirectDatabaseQuery
	$wpdb->prepare( "SELECT ID FROM {$wpdb->posts} WHERE post_type = %s", 'klyna_form' )
);
foreach ( (array) $form_ids as $form_id ) {
	wp_delete_post( (int) $form_id, true );
}

// Entries table.
$table = $wpdb->prefix . 'klyna_form_entries';
// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.DirectDatabaseQuery
$wpdb->query( "DROP TABLE IF EXISTS {$table}" );
