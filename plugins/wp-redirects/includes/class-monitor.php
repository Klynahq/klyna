<?php
/**
 * Klyna Redirects — 404 hit logger.
 *
 * @package KlynaRedirects
 */

namespace KlynaRedirects;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Monitor {

	public function register(): void {
		if ( ! ( Plugin::settings()['log_404'] ?? true ) ) {
			return;
		}
		add_action( 'wp', array( $this, 'log_404' ) );
	}

	public function log_404(): void {
		if ( ! is_404() ) {
			return;
		}

		if ( ! ( Plugin::settings()['monitor_logged_in'] ?? false ) && is_user_logged_in() ) {
			return;
		}

		global $wpdb;

		$url      = esc_url_raw( home_url( isset( $_SERVER['REQUEST_URI'] ) ? wp_unslash( $_SERVER['REQUEST_URI'] ) : '/' ) );
		$referrer = isset( $_SERVER['HTTP_REFERER'] ) ? esc_url_raw( wp_unslash( $_SERVER['HTTP_REFERER'] ) ) : '';
		$ua       = isset( $_SERVER['HTTP_USER_AGENT'] ) ? sanitize_text_field( wp_unslash( $_SERVER['HTTP_USER_AGENT'] ) ) : '';

		$existing = $wpdb->get_var(
			$wpdb->prepare( "SELECT id FROM {$wpdb->prefix}klyna_404_log WHERE url = %s", $url )
		);

		if ( $existing ) {
			$wpdb->query(
				$wpdb->prepare(
					"UPDATE {$wpdb->prefix}klyna_404_log SET hit_count = hit_count + 1, last_seen = NOW() WHERE id = %d",
					$existing
				)
			);
		} else {
			$wpdb->insert(
				$wpdb->prefix . 'klyna_404_log',
				array(
					'url'        => $url,
					'referrer'   => $referrer,
					'user_agent' => $ua,
					'hit_count'  => 1,
					'last_seen'  => current_time( 'mysql' ),
				),
				array( '%s', '%s', '%s', '%d', '%s' )
			);
		}
	}
}
