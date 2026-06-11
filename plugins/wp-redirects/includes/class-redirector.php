<?php
/**
 * Klyna Redirects — fires redirects on template_redirect.
 *
 * @package KlynaRedirects
 */

namespace KlynaRedirects;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Redirector {

	public function register(): void {
		if ( ! ( Plugin::settings()['enable_redirects'] ?? true ) ) {
			return;
		}
		add_action( 'template_redirect', array( $this, 'maybe_redirect' ), 1 );
	}

	public function maybe_redirect(): void {
		global $wpdb;

		$request = $this->current_path();
		$rules   = $wpdb->get_results(
			"SELECT * FROM {$wpdb->prefix}klyna_redirects WHERE enabled = 1 ORDER BY id ASC",
			ARRAY_A
		);

		foreach ( $rules as $rule ) {
			$matched     = false;
			$destination = $rule['destination'];

			if ( $rule['is_regex'] ) {
				$pattern = '#' . str_replace( '#', '\\#', $rule['source'] ) . '#i';
				if ( preg_match( $pattern, $request ) ) {
					$destination = preg_replace( $pattern, $destination, $request );
					$matched     = true;
				}
			} else {
				// Exact match (strip trailing slash for comparison).
				if ( rtrim( $rule['source'], '/' ) === rtrim( $request, '/' ) ) {
					$matched = true;
				}
			}

			if ( $matched ) {
				$wpdb->query(
					$wpdb->prepare(
						"UPDATE {$wpdb->prefix}klyna_redirects SET hit_count = hit_count + 1 WHERE id = %d",
						$rule['id']
					)
				);

				$code = absint( $rule['status_code'] );
				if ( $code === 410 ) {
					status_header( 410 );
					nocache_headers();
					exit;
				}

				wp_redirect( $destination, $code );
				exit;
			}
		}
	}

	private function current_path(): string {
		$uri = isset( $_SERVER['REQUEST_URI'] ) ? esc_url_raw( wp_unslash( $_SERVER['REQUEST_URI'] ) ) : '/';
		return strtok( $uri, '?' );
	}
}
