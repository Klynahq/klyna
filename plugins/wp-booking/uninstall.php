<?php
/**
 * Uninstall handler.
 *
 * Runs when the user deletes the plugin from the Plugins screen. We remove our
 * option, our custom posts (services + bookings) and their meta, and any rate-
 * limit transients we created. We never touch core posts, users, or tables.
 *
 * @package KlynaBooking
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

global $wpdb;

// 1. Plugin settings.
delete_option( 'wp_booking_settings' );

// 2. Custom post types — services + bookings, with their meta.
$post_types = array( 'klyna_service', 'klyna_booking' );
foreach ( $post_types as $post_type ) {
	$ids = $wpdb->get_col(
		$wpdb->prepare(
			"SELECT ID FROM {$wpdb->posts} WHERE post_type = %s",
			$post_type
		)
	);
	foreach ( $ids as $id ) {
		// wp_delete_post handles post + meta cleanup safely.
		wp_delete_post( (int) $id, true );
	}
}

// 3. Rate-limit transients (and their timeout rows).
$wpdb->query(
	"DELETE FROM {$wpdb->options}
	 WHERE option_name LIKE '\_transient\_klyna\_booking\_rl\_%'
	    OR option_name LIKE '\_transient\_timeout\_klyna\_booking\_rl\_%'"
);
