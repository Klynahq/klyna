<?php
/**
 * Uninstall handler.
 *
 * Runs when the user deletes the plugin from the Plugins screen. We remove our
 * option and every `klyna_table` post (with its meta). We never touch other
 * post types, users, or core tables.
 *
 * @package KlynaTables
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

delete_option( 'wp_tables_settings' );

// Remove every stored table CPT (and its post meta) for a clean uninstall.
$klyna_table_ids = get_posts(
	array(
		'post_type'      => 'klyna_table',
		'post_status'    => 'any',
		'posts_per_page' => -1,
		'fields'         => 'ids',
	)
);

foreach ( $klyna_table_ids as $klyna_table_id ) {
	wp_delete_post( (int) $klyna_table_id, true );
}
