<?php
/**
 * REST API — admin-only feed controls.
 *
 * Routes (namespace `klyna-feed/v1`, all gated to `manage_options` + nonce):
 *   POST /regenerate   — rebuild + cache every enabled feed, return fresh stats.
 *   GET  /health       — run validation and return item count + warnings.
 *   GET  /stats        — lightweight cached stats for the dashboard.
 *
 * @package KlynaFeed
 */

namespace KlynaFeed;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Rest {

	private const NAMESPACE = 'klyna-feed/v1';

	public function register(): void {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
	}

	public function register_routes(): void {
		register_rest_route(
			self::NAMESPACE,
			'/regenerate',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'regenerate' ),
				'permission_callback' => array( $this, 'can_manage' ),
			)
		);
		register_rest_route(
			self::NAMESPACE,
			'/health',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'health' ),
				'permission_callback' => array( $this, 'can_manage' ),
			)
		);
		register_rest_route(
			self::NAMESPACE,
			'/stats',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'stats' ),
				'permission_callback' => array( $this, 'can_manage' ),
			)
		);
	}

	/**
	 * Capability + nonce gate. The nonce is verified automatically by core for
	 * the `wp_rest` nonce passed via the X-WP-Nonce header.
	 */
	public function can_manage(): bool {
		return current_user_can( 'manage_options' );
	}

	/**
	 * POST /regenerate
	 */
	public function regenerate( \WP_REST_Request $request ): \WP_REST_Response {
		( new Scheduler() )->regenerate();
		return new \WP_REST_Response( $this->stats_payload(), 200 );
	}

	/**
	 * GET /health
	 */
	public function health( \WP_REST_Request $request ): \WP_REST_Response {
		if ( ! Plugin::woocommerce_active() ) {
			return new \WP_REST_Response(
				array(
					'woocommerce'   => false,
					'item_count'    => 0,
					'warning_count' => 0,
					'warnings'      => array(),
				),
				200
			);
		}
		$result = ( new Feed_Builder() )->health();
		return new \WP_REST_Response(
			array(
				'woocommerce'   => true,
				'item_count'    => $result['item_count'],
				'warning_count' => $result['warning_count'],
				'warnings'      => array_slice( $result['warnings'], 0, 200 ),
			),
			200
		);
	}

	/**
	 * GET /stats
	 */
	public function stats( \WP_REST_Request $request ): \WP_REST_Response {
		return new \WP_REST_Response( $this->stats_payload(), 200 );
	}

	/**
	 * Build the shared stats payload for the dashboard.
	 *
	 * @return array<string,mixed>
	 */
	private function stats_payload(): array {
		return array(
			'woocommerce' => Plugin::woocommerce_active(),
			'last_run'    => Scheduler::last_run(),
			'feeds'       => Storage::all_stats(),
			'urls'        => array(
				'google' => Plugin::feed_url( 'google' ),
				'meta'   => Plugin::feed_url( 'meta' ),
			),
		);
	}
}
