<?php
/**
 * Klyna Redirects — auto-create 301 when a post slug changes.
 *
 * @package KlynaRedirects
 */

namespace KlynaRedirects;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class SlugWatcher {

	public function register(): void {
		if ( ! ( Plugin::settings()['auto_redirect_slug'] ?? true ) ) {
			return;
		}
		add_action( 'post_updated', array( $this, 'on_post_updated' ), 10, 3 );
	}

	public function on_post_updated( int $post_id, \WP_Post $post_after, \WP_Post $post_before ): void {
		if ( $post_before->post_name === $post_after->post_name ) {
			return;
		}
		if ( ! in_array( $post_before->post_status, array( 'publish' ), true ) ) {
			return;
		}

		$old_link = str_replace( home_url(), '', get_permalink( $post_before ) );
		$new_link = str_replace( home_url(), '', get_permalink( $post_after ) );

		if ( $old_link === $new_link || empty( $old_link ) || empty( $new_link ) ) {
			return;
		}

		global $wpdb;

		// Don't duplicate.
		$exists = $wpdb->get_var(
			$wpdb->prepare(
				"SELECT id FROM {$wpdb->prefix}klyna_redirects WHERE source = %s",
				$old_link
			)
		);

		if ( ! $exists ) {
			$wpdb->insert(
				$wpdb->prefix . 'klyna_redirects',
				array(
					'source'      => $old_link,
					'destination' => $new_link,
					'status_code' => 301,
					'is_regex'    => 0,
					'enabled'     => 1,
					'note'        => sprintf( 'Auto: post #%d slug changed', $post_id ),
				),
				array( '%s', '%s', '%d', '%d', '%d', '%s' )
			);
		}
	}
}
