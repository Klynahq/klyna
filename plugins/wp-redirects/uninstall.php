<?php
/**
 * Klyna Redirects — uninstall cleanup.
 *
 * @package KlynaRedirects
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

delete_option( 'wp_redirects_settings' );
delete_option( 'wp_redirects_db_version' );

global $wpdb;
$wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}klyna_redirects" );
$wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}klyna_404_log" );
