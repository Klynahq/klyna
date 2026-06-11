<?php
/**
 * Uninstall — runs when the plugin is deleted from the WordPress admin.
 *
 * Removes:
 *  - The plugin option (wp_consent_settings).
 *  - Any per-user meta entries that reference the consent cookie name.
 *
 * Does NOT delete the klyna_consent browser cookie — that lives in the browser
 * and will expire naturally (365 days) or on next visit after the plugin is gone.
 *
 * @package KlynaConsent
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit; // Safety check — must be called by WordPress.
}

// Remove the plugin's settings option.
delete_option( 'wp_consent_settings' );

// Clean up site-wide option on multisite networks.
if ( is_multisite() ) {
	delete_site_option( 'wp_consent_settings' );

	// Iterate over all sites and remove per-site options.
	$sites = get_sites( array( 'number' => 0, 'fields' => 'ids' ) );
	foreach ( $sites as $site_id ) {
		switch_to_blog( $site_id );
		delete_option( 'wp_consent_settings' );
		restore_current_blog();
	}
}

// Remove any usermeta that plugins / themes may have stored against the cookie name.
// (Standard usage stores nothing in usermeta, but included for completeness.)
global $wpdb;
$wpdb->delete(
	$wpdb->usermeta,
	array( 'meta_key' => 'klyna_consent_dismissed' ),
	array( '%s' )
);
