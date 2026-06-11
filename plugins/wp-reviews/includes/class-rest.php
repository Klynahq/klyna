<?php
/**
 * REST API — public submission + admin moderation.
 *
 * Routes (namespace `klyna-reviews/v1`):
 *   POST /reviews            Public. Submit a review. Nonce + honeypot guarded.
 *   GET  /reviews            Public. Approved reviews + aggregate for a target.
 *   GET  /moderation         Admin. Pending queue. `manage_options`.
 *   POST /moderation/(id)    Admin. Approve / unapprove / delete. `manage_options`.
 *
 * Every write checks a nonce and (for admin routes) a capability. Every string
 * is sanitized on the way in. Nothing trusts the client.
 *
 * @package KlynaReviews
 */

namespace KlynaReviews;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Rest {

	private const NAMESPACE = 'klyna-reviews/v1';

	private Reviews $reviews;

	public function __construct() {
		$this->reviews = new Reviews();
	}

	public function register(): void {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
	}

	public function register_routes(): void {
		register_rest_route(
			self::NAMESPACE,
			'/reviews',
			array(
				array(
					'methods'             => 'POST',
					'callback'            => array( $this, 'submit' ),
					'permission_callback' => '__return_true',
					'args'                => $this->submit_args(),
				),
				array(
					'methods'             => 'GET',
					'callback'            => array( $this, 'list_public' ),
					'permission_callback' => '__return_true',
					'args'                => array(
						'target'   => array(
							'type'              => 'string',
							'default'           => 'site',
							'sanitize_callback' => 'sanitize_text_field',
						),
						'page'     => array(
							'type'    => 'integer',
							'default' => 1,
						),
						'per_page' => array(
							'type'    => 'integer',
							'default' => 10,
						),
					),
				),
			)
		);

		register_rest_route(
			self::NAMESPACE,
			'/moderation',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'list_pending' ),
				'permission_callback' => static fn() => current_user_can( 'manage_options' ),
				'args'                => array(
					'page' => array(
						'type'    => 'integer',
						'default' => 1,
					),
				),
			)
		);

		register_rest_route(
			self::NAMESPACE,
			'/moderation/(?P<id>\d+)',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'moderate' ),
				'permission_callback' => static fn() => current_user_can( 'manage_options' ),
				'args'                => array(
					'id'     => array(
						'type'              => 'integer',
						'required'          => true,
						'sanitize_callback' => 'absint',
					),
					'action' => array(
						'type'              => 'string',
						'required'          => true,
						'enum'              => array( 'approve', 'unapprove', 'delete' ),
						'sanitize_callback' => 'sanitize_key',
					),
				),
			)
		);
	}

	/* ---------------------------------------------------------------------
	 * Public: submission
	 * ------------------------------------------------------------------- */

	/**
	 * @return array<string,array<string,mixed>>
	 */
	private function submit_args(): array {
		return array(
			'author'  => array(
				'type'              => 'string',
				'required'          => true,
				'sanitize_callback' => 'sanitize_text_field',
			),
			'email'   => array(
				'type'              => 'string',
				'required'          => false,
				'sanitize_callback' => 'sanitize_email',
			),
			'rating'  => array(
				'type'     => 'integer',
				'required' => true,
			),
			'title'   => array(
				'type'              => 'string',
				'required'          => false,
				'sanitize_callback' => 'sanitize_text_field',
			),
			'body'    => array(
				'type'              => 'string',
				'required'          => true,
				'sanitize_callback' => array( $this, 'sanitize_body' ),
			),
			'target'  => array(
				'type'              => 'string',
				'default'           => 'site',
				'sanitize_callback' => 'sanitize_text_field',
			),
			// Honeypot: must arrive empty. Bots fill every field.
			'website' => array(
				'type'              => 'string',
				'required'          => false,
				'sanitize_callback' => 'sanitize_text_field',
			),
		);
	}

	/**
	 * Strip tags but keep line breaks for the review body.
	 *
	 * @param mixed $value Raw value.
	 * @return string
	 */
	public function sanitize_body( $value ): string {
		return sanitize_textarea_field( (string) $value );
	}

	/**
	 * Handle a public review submission.
	 */
	public function submit( \WP_REST_Request $req ): \WP_REST_Response {
		// 1) Nonce. The form ships a `wp_rest` nonce in the X-WP-Nonce header,
		// plus a dedicated action nonce in the body for defense in depth.
		$nonce = (string) $req->get_param( '_wpnonce' );
		if ( ! wp_verify_nonce( $nonce, 'klyna_reviews_submit' ) ) {
			return $this->error( 'invalid_nonce', __( 'Your session expired. Please reload and try again.', 'wp-reviews' ), 403 );
		}

		// 2) Honeypot. A filled field means a bot — fail silently with 200 so
		// the bot believes it succeeded and does not retry.
		if ( '' !== trim( (string) $req->get_param( 'website' ) ) ) {
			return new \WP_REST_Response(
				array(
					'ok'      => true,
					'status'  => 'pending',
					'message' => __( 'Thanks! Your review is awaiting moderation.', 'wp-reviews' ),
				),
				200
			);
		}

		$settings = Plugin::settings();

		$author = trim( (string) $req->get_param( 'author' ) );
		$email  = (string) $req->get_param( 'email' );
		$rating = (int) $req->get_param( 'rating' );
		$body   = trim( (string) $req->get_param( 'body' ) );
		$title  = trim( (string) $req->get_param( 'title' ) );
		$target = (string) $req->get_param( 'target' );

		// 3) Validation.
		if ( '' === $author ) {
			return $this->error( 'missing_author', __( 'Please add your name.', 'wp-reviews' ), 422 );
		}
		if ( '' === $body ) {
			return $this->error( 'missing_body', __( 'Please write a short review.', 'wp-reviews' ), 422 );
		}
		$min = (int) ( $settings['min_rating'] ?? 1 );
		$max = (int) ( $settings['max_rating'] ?? 5 );
		if ( $rating < $min || $rating > $max ) {
			return $this->error(
				'invalid_rating',
				/* translators: 1: min rating, 2: max rating */
				sprintf( __( 'Please choose a rating between %1$d and %2$d.', 'wp-reviews' ), $min, $max ),
				422
			);
		}
		if ( ! empty( $settings['require_email'] ) && ! is_email( $email ) ) {
			return $this->error( 'missing_email', __( 'Please enter a valid email address.', 'wp-reviews' ), 422 );
		}

		$status = ! empty( $settings['auto_approve'] ) ? 'publish' : 'pending';

		$result = $this->reviews->create(
			array(
				'author'  => $author,
				'email'   => is_email( $email ) ? $email : '',
				'rating'  => $rating,
				'title'   => $title,
				'body'    => $body,
				'target'  => '' !== $target ? $target : 'site',
				'ip_hash' => $this->hash_ip(),
				'status'  => $status,
			)
		);

		if ( is_wp_error( $result ) ) {
			return $this->error( 'create_failed', __( 'Could not save your review. Please try again.', 'wp-reviews' ), 500 );
		}

		/**
		 * Fires after a review is stored.
		 *
		 * @param int    $review_id Review post ID.
		 * @param string $status    `publish` or `pending`.
		 */
		do_action( 'klyna_reviews_submitted', $result, $status );

		$message = 'publish' === $status
			? __( 'Thanks! Your review is now live.', 'wp-reviews' )
			: __( 'Thanks! Your review is awaiting moderation.', 'wp-reviews' );

		return new \WP_REST_Response(
			array(
				'ok'      => true,
				'status'  => 'publish' === $status ? 'approved' : 'pending',
				'message' => $message,
			),
			201
		);
	}

	/* ---------------------------------------------------------------------
	 * Public: listing
	 * ------------------------------------------------------------------- */

	public function list_public( \WP_REST_Request $req ): \WP_REST_Response {
		$target   = (string) $req->get_param( 'target' );
		$page     = max( 1, (int) $req->get_param( 'page' ) );
		$per_page = max( 1, min( 50, (int) $req->get_param( 'per_page' ) ) );

		$reviews = $this->reviews->get_for_target( $target, $per_page, $page );

		// Don't leak email addresses to the public endpoint.
		$reviews = array_map(
			static function ( $r ) {
				unset( $r['email'] );
				return $r;
			},
			$reviews
		);

		return new \WP_REST_Response(
			array(
				'reviews'   => $reviews,
				'aggregate' => $this->reviews->aggregate( $target ),
			),
			200
		);
	}

	/* ---------------------------------------------------------------------
	 * Admin: moderation
	 * ------------------------------------------------------------------- */

	public function list_pending( \WP_REST_Request $req ): \WP_REST_Response {
		$page = max( 1, (int) $req->get_param( 'page' ) );

		$query = new \WP_Query(
			array(
				'post_type'      => Reviews::POST_TYPE,
				'post_status'    => 'pending',
				'posts_per_page' => 20,
				'paged'          => $page,
				'orderby'        => 'date',
				'order'          => 'DESC',
			)
		);

		$items = array();
		foreach ( $query->posts as $post ) {
			$row          = $this->reviews->to_array( $post );
			$row['email'] = (string) get_post_meta( $post->ID, Reviews::META_EMAIL, true );
			$items[]      = $row;
		}

		return new \WP_REST_Response(
			array(
				'items' => $items,
				'pages' => (int) $query->max_num_pages,
				'total' => (int) $query->found_posts,
			),
			200
		);
	}

	public function moderate( \WP_REST_Request $req ): \WP_REST_Response {
		// REST cookie auth already validated the `wp_rest` nonce; re-check the
		// capability explicitly since this is a destructive write.
		if ( ! current_user_can( 'manage_options' ) ) {
			return $this->error( 'forbidden', __( 'You are not allowed to moderate reviews.', 'wp-reviews' ), 403 );
		}

		$id     = absint( $req->get_param( 'id' ) );
		$action = sanitize_key( (string) $req->get_param( 'action' ) );

		$post = get_post( $id );
		if ( ! $post || Reviews::POST_TYPE !== $post->post_type ) {
			return $this->error( 'not_found', __( 'Review not found.', 'wp-reviews' ), 404 );
		}

		switch ( $action ) {
			case 'approve':
				$this->reviews->set_status( $id, 'approved' );
				break;
			case 'unapprove':
				$this->reviews->set_status( $id, 'pending' );
				break;
			case 'delete':
				wp_trash_post( $id );
				break;
		}

		return new \WP_REST_Response(
			array(
				'ok'     => true,
				'id'     => $id,
				'action' => $action,
			),
			200
		);
	}

	/* ---------------------------------------------------------------------
	 * Helpers
	 * ------------------------------------------------------------------- */

	/**
	 * Salted, non-reversible hash of the submitter IP for light dedupe/abuse
	 * signals. We never store the raw address.
	 */
	private function hash_ip(): string {
		$ip = isset( $_SERVER['REMOTE_ADDR'] )
			? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) )
			: '';
		if ( '' === $ip ) {
			return '';
		}
		return hash_hmac( 'sha256', $ip, wp_salt( 'auth' ) );
	}

	private function error( string $code, string $message, int $status ): \WP_REST_Response {
		return new \WP_REST_Response(
			array(
				'ok'      => false,
				'code'    => $code,
				'message' => $message,
			),
			$status
		);
	}
}
