<?php
/**
 * REST routes for Klyna Popups.
 *
 * Two surfaces:
 *  - Public (front-end) routes for recording impressions and capturing emails.
 *    These are open to logged-out visitors but require a rotating REST nonce and
 *    sanitize/validate every field.
 *  - Admin routes for reading entries and exporting CSV — gated by
 *    `manage_options`.
 *
 * @package KlynaPopups
 */

namespace KlynaPopups;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Rest {

	private const NAMESPACE = 'klyna-popups/v1';

	public function register(): void {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
	}

	public function register_routes(): void {
		register_rest_route(
			self::NAMESPACE,
			'/impression',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'record_impression' ),
				'permission_callback' => array( $this, 'public_permission' ),
				'args'                => array(
					'popup_id' => array(
						'type'              => 'integer',
						'required'          => true,
						'sanitize_callback' => 'absint',
					),
				),
			)
		);

		register_rest_route(
			self::NAMESPACE,
			'/capture',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'capture' ),
				'permission_callback' => array( $this, 'public_permission' ),
				'args'                => array(
					'popup_id' => array(
						'type'              => 'integer',
						'required'          => true,
						'sanitize_callback' => 'absint',
					),
					'email'    => array(
						'type'     => 'string',
						'required' => true,
					),
					'name'     => array(
						'type'     => 'string',
						'required' => false,
					),
				),
			)
		);

		register_rest_route(
			self::NAMESPACE,
			'/entries',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'list_entries' ),
				'permission_callback' => array( $this, 'admin_permission' ),
				'args'                => array(
					'popup_id' => array(
						'type'              => 'integer',
						'default'           => 0,
						'sanitize_callback' => 'absint',
					),
					'limit'    => array(
						'type'              => 'integer',
						'default'           => 100,
						'sanitize_callback' => 'absint',
					),
				),
			)
		);
	}

	/**
	 * Public routes require a valid `wp_rest` nonce. WordPress checks this
	 * automatically for the `X-WP-Nonce` header, but we assert it explicitly so
	 * logged-out abuse is rejected before we touch the database.
	 */
	public function public_permission( \WP_REST_Request $request ) {
		$nonce = $request->get_header( 'X-WP-Nonce' );
		if ( ! $nonce || ! wp_verify_nonce( $nonce, 'wp_rest' ) ) {
			return new \WP_Error(
				'klyna_popups_bad_nonce',
				__( 'Invalid or expired session token.', 'wp-popups' ),
				array( 'status' => 403 )
			);
		}
		return true;
	}

	/**
	 * Admin routes require `manage_options`.
	 */
	public function admin_permission(): bool {
		return current_user_can( 'manage_options' );
	}

	/**
	 * POST /impression — bump the impression counter for an active popup.
	 */
	public function record_impression( \WP_REST_Request $request ): \WP_REST_Response {
		$popup_id = (int) $request->get_param( 'popup_id' );
		$popup    = $this->valid_active_popup( $popup_id );
		if ( ! $popup ) {
			return new \WP_REST_Response( array( 'ok' => false ), 404 );
		}
		Entries::record_impression( $popup_id );
		return new \WP_REST_Response( array( 'ok' => true ), 200 );
	}

	/**
	 * POST /capture — store an email entry and (optionally) ping the webhook.
	 */
	public function capture( \WP_REST_Request $request ): \WP_REST_Response {
		$popup_id = (int) $request->get_param( 'popup_id' );
		$popup    = $this->valid_active_popup( $popup_id );
		if ( ! $popup ) {
			return new \WP_REST_Response(
				array(
					'ok'      => false,
					'message' => __( 'This popup is no longer available.', 'wp-popups' ),
				),
				404
			);
		}

		$email = sanitize_email( (string) $request->get_param( 'email' ) );
		if ( '' === $email || ! is_email( $email ) ) {
			return new \WP_REST_Response(
				array(
					'ok'      => false,
					'message' => __( 'Please enter a valid email address.', 'wp-popups' ),
				),
				422
			);
		}

		$data = array(
			'email'    => $email,
			'name'     => sanitize_text_field( (string) $request->get_param( 'name' ) ),
			'page_url' => esc_url_raw( (string) $request->get_param( 'page_url' ) ),
			'referrer' => esc_url_raw( (string) ( $request->get_header( 'referer' ) ?? '' ) ),
			'ip_hash'  => $this->hash_ip( $request ),
		);

		$result = Entries::record_capture( $popup_id, $data );

		// A duplicate is still a success from the visitor's perspective — they
		// are already subscribed, so we don't re-fire the webhook.
		if ( $result['stored'] ) {
			Entries::dispatch_webhook( $popup_id, $data );
		}

		$success = (string) Plugin::setting( 'success_message', __( 'Thanks! Check your inbox.', 'wp-popups' ) );

		return new \WP_REST_Response(
			array(
				'ok'        => true,
				'duplicate' => $result['duplicate'],
				'message'   => $success,
			),
			200
		);
	}

	/**
	 * GET /entries — admin-only list of captured emails.
	 */
	public function list_entries( \WP_REST_Request $request ): \WP_REST_Response {
		$popup_id = (int) $request->get_param( 'popup_id' );
		$limit    = (int) $request->get_param( 'limit' );
		$entries  = Entries::recent( $popup_id, $limit > 0 ? $limit : 100 );
		return new \WP_REST_Response(
			array(
				'ok'      => true,
				'total'   => Entries::total_count(),
				'entries' => $entries,
			),
			200
		);
	}

	/**
	 * Resolve a published, active popup or return null.
	 */
	private function valid_active_popup( int $popup_id ): ?\WP_Post {
		if ( $popup_id <= 0 ) {
			return null;
		}
		$post = get_post( $popup_id );
		if ( ! $post || Popups::POST_TYPE !== $post->post_type || 'publish' !== $post->post_status ) {
			return null;
		}
		$config = Popups::config( $popup_id );
		if ( 'active' !== $config['status'] ) {
			return null;
		}
		return $post;
	}

	/**
	 * One-way hash of the visitor IP (privacy-preserving dedupe / abuse signal).
	 * We never store the raw IP. Salted with the WP auth salt.
	 */
	private function hash_ip( \WP_REST_Request $request ): string {
		$ip = '';
		if ( ! empty( $_SERVER['REMOTE_ADDR'] ) ) {
			$ip = sanitize_text_field( wp_unslash( (string) $_SERVER['REMOTE_ADDR'] ) );
		}
		if ( '' === $ip ) {
			return '';
		}
		$salt = defined( 'AUTH_SALT' ) ? AUTH_SALT : 'klyna-popups';
		return hash( 'sha256', $ip . '|' . $salt );
	}
}
