<?php
/**
 * Klyna Reviews — uninstall cleanup.
 *
 * Removes all plugin options and review posts when the plugin is deleted.
 *
 * @package KlynaReviews
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

// Remove settings.
delete_option( 'wp_reviews_settings' );

// Remove all review CPT posts and their meta.
$reviews = get_posts(
	array(
		'post_type'      => 'klyna_review',
		'posts_per_page' => -1,
		'post_status'    => 'any',
		'fields'         => 'ids',
	)
);

foreach ( $reviews as $id ) {
	wp_delete_post( $id, true );
}
