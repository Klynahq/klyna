<?php
/**
 * REST API — cache stats + one-click purge.
 *
 * Routes live under the `klyna-speed/v1` namespace and require `manage_options`
 * plus a valid `wp_rest` nonce, mirroring the rest of the Klyna toolkit.
 *
 * @package KlynaSpeed
 */

namespace KlynaSpeed;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Rest {

	private const NAMESPACE = 'klyna-speed/v1';

	public function register(): void {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
	}

	public function register_routes(): void {
		register_rest_route(
			self::NAMESPACE,
			'/stats',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'get_stats' ),
				'permission_callback' => array( $this, 'can_manage' ),
			)
		);
		register_rest_route(
			self::NAMESPACE,
			'/purge',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'purge' ),
				'permission_callback' => array( $this, 'can_manage' ),
				'args'                => array(
					'url' => array(
						'type'              => 'string',
						'required'          => false,
						'sanitize_callback' => 'esc_url_raw',
					),
				),
			)
		);
	}

	/**
	 * Capability + nonce gate for every route.
	 */
	public function can_manage(): bool {
		return current_user_can( 'manage_options' );
	}

	/**
	 * GET /stats — cached page count + disk footprint.
	 */
	public function get_stats( \WP_REST_Request $req ): \WP_REST_Response {
		$stats = Cache::stats();
		return new \WP_REST_Response(
			array(
				'files'      => $stats['files'],
				'bytes'      => $stats['bytes'],
				'human_size' => size_format( $stats['bytes'], 1 ),
				'enabled'    => (bool) Plugin::get( 'enable_page_cache', true ),
			),
			200
		);
	}

	/**
	 * POST /purge — clear one URL or the entire store.
	 */
	public function purge( \WP_REST_Request $req ): \WP_REST_Response {
		$url = (string) $req->get_param( 'url' );

		if ( '' !== $url ) {
			( new Cache() )->purge_url( $url );
			return new \WP_REST_Response(
				array(
					'purged'  => 'url',
					'url'     => esc_url_raw( $url ),
					'message' => __( 'Cleared the cache for that URL.', 'wp-speed' ),
				),
				200
			);
		}

		$removed = Cache::purge_all();
		return new \WP_REST_Response(
			array(
				'purged'  => 'all',
				'removed' => $removed,
				'message' => sprintf(
					/* translators: %d: number of cached pages removed. */
					_n( 'Purged %d cached page.', 'Purged %d cached pages.', $removed, 'wp-speed' ),
					$removed
				),
			),
			200
		);
	}
}
