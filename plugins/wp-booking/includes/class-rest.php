<?php
/**
 * REST API — public slot lookup + booking creation, admin status management.
 *
 * Routes live under `wp-booking/v1`. Public routes (services, slots, booking
 * submission) are open but nonce-protected against CSRF and rate-limited per
 * IP; admin routes require `manage_options`. Every write sanitizes its input
 * and re-validates the slot server-side so a stale or hand-crafted form can
 * never double-book.
 *
 * @package KlynaBooking
 */

namespace KlynaBooking;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Rest {

	private const NAMESPACE = 'wp-booking/v1';

	/** Max booking submissions allowed per IP per window. */
	private const RATE_LIMIT  = 8;
	private const RATE_WINDOW = HOUR_IN_SECONDS;

	public function register(): void {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
	}

	public function register_routes(): void {
		register_rest_route(
			self::NAMESPACE,
			'/services',
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => array( $this, 'get_services' ),
				'permission_callback' => '__return_true',
			)
		);

		register_rest_route(
			self::NAMESPACE,
			'/slots',
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => array( $this, 'get_slots' ),
				'permission_callback' => '__return_true',
				'args'                => array(
					'service' => array(
						'type'              => 'integer',
						'required'          => true,
						'sanitize_callback' => 'absint',
					),
					'date'    => array(
						'type'              => 'string',
						'required'          => true,
						'sanitize_callback' => 'sanitize_text_field',
					),
				),
			)
		);

		register_rest_route(
			self::NAMESPACE,
			'/bookings',
			array(
				'methods'             => \WP_REST_Server::CREATABLE,
				'callback'            => array( $this, 'create_booking' ),
				'permission_callback' => array( $this, 'check_public_nonce' ),
			)
		);

		register_rest_route(
			self::NAMESPACE,
			'/admin/bookings',
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => array( $this, 'list_bookings' ),
				'permission_callback' => array( $this, 'check_admin' ),
				'args'                => array(
					'status'   => array( 'type' => 'string' ),
					'paged'    => array(
						'type'    => 'integer',
						'default' => 1,
					),
					'search'   => array( 'type' => 'string' ),
				),
			)
		);

		register_rest_route(
			self::NAMESPACE,
			'/admin/bookings/(?P<id>\d+)/status',
			array(
				'methods'             => \WP_REST_Server::EDITABLE,
				'callback'            => array( $this, 'update_status' ),
				'permission_callback' => array( $this, 'check_admin' ),
				'args'                => array(
					'id'     => array(
						'type'              => 'integer',
						'sanitize_callback' => 'absint',
					),
					'status' => array(
						'type'              => 'string',
						'required'          => true,
						'sanitize_callback' => 'sanitize_key',
					),
				),
			)
		);
	}

	/* --------------------------------------------------------------------- */
	/* Permission callbacks                                                  */
	/* --------------------------------------------------------------------- */

	public function check_admin(): bool {
		return current_user_can( 'manage_options' );
	}

	/**
	 * Public writes carry a `wp_rest` nonce supplied via the front-end boot
	 * object. This blocks cross-origin CSRF while keeping the form usable by
	 * logged-out visitors.
	 */
	public function check_public_nonce( \WP_REST_Request $request ): bool {
		$nonce = $request->get_header( 'X-WP-Nonce' );
		if ( ! $nonce ) {
			$nonce = (string) $request->get_param( '_wpnonce' );
		}
		return (bool) wp_verify_nonce( $nonce, 'wp_rest' );
	}

	/* --------------------------------------------------------------------- */
	/* Public routes                                                         */
	/* --------------------------------------------------------------------- */

	public function get_services(): \WP_REST_Response {
		$services = array();
		foreach ( Services::all() as $service ) {
			$services[] = array(
				'id'             => $service['id'],
				'title'          => $service['title'],
				'duration'       => $service['duration'],
				'price'          => $service['price'],
				'price_display'  => Services::format_price( $service['price'] ),
			);
		}
		return new \WP_REST_Response(
			array(
				'services' => $services,
				'dates'    => Availability::bookable_dates(),
			),
			200
		);
	}

	public function get_slots( \WP_REST_Request $request ): \WP_REST_Response {
		$service_id = (int) $request->get_param( 'service' );
		$date       = (string) $request->get_param( 'date' );
		$slots      = Availability::slots_for( $service_id, $date );
		return new \WP_REST_Response(
			array(
				'date'  => $date,
				'slots' => $slots,
			),
			200
		);
	}

	public function create_booking( \WP_REST_Request $request ) {
		if ( ! $this->within_rate_limit() ) {
			return new \WP_Error(
				'rate_limited',
				__( 'Too many booking attempts. Please try again later.', 'wp-booking' ),
				array( 'status' => 429 )
			);
		}

		$service_id = absint( $request->get_param( 'service_id' ) );
		$start_utc  = sanitize_text_field( (string) $request->get_param( 'start' ) );
		$name       = sanitize_text_field( (string) $request->get_param( 'name' ) );
		$email      = sanitize_email( (string) $request->get_param( 'email' ) );
		$phone      = sanitize_text_field( (string) $request->get_param( 'phone' ) );
		$notes      = sanitize_textarea_field( (string) $request->get_param( 'notes' ) );

		if ( '' === $name ) {
			return new \WP_Error( 'missing_name', __( 'Please enter your name.', 'wp-booking' ), array( 'status' => 400 ) );
		}
		if ( ! is_email( $email ) ) {
			return new \WP_Error( 'invalid_email', __( 'Please enter a valid email address.', 'wp-booking' ), array( 'status' => 400 ) );
		}

		$slot = Availability::validate_slot( $service_id, $start_utc );
		if ( is_wp_error( $slot ) ) {
			$slot->add_data( array( 'status' => 409 ) );
			return $slot;
		}

		$booking_id = Bookings::create(
			array(
				'service_id' => $service_id,
				// Slot times are already canonical ISO-8601 UTC; store as-is so
				// the value is unambiguous when re-parsed for overlap + display.
				'start'      => $slot['start'],
				'end'        => $slot['end'],
				'name'       => $name,
				'email'      => $email,
				'phone'      => $phone,
				'notes'      => $notes,
			)
		);

		if ( is_wp_error( $booking_id ) ) {
			$booking_id->add_data( array( 'status' => 400 ) );
			return $booking_id;
		}

		$booking = Bookings::get( $booking_id );
		return new \WP_REST_Response(
			array(
				'id'      => $booking_id,
				'status'  => $booking['status'],
				'message' => $this->confirmation_message( $booking ),
				'when'    => Availability::format_local( $booking['start'] ),
			),
			201
		);
	}

	/* --------------------------------------------------------------------- */
	/* Admin routes                                                          */
	/* --------------------------------------------------------------------- */

	public function list_bookings( \WP_REST_Request $request ): \WP_REST_Response {
		$result = Bookings::query(
			array(
				'status'   => sanitize_key( (string) $request->get_param( 'status' ) ),
				'paged'    => max( 1, (int) $request->get_param( 'paged' ) ),
				'per_page' => 20,
				'search'   => sanitize_text_field( (string) $request->get_param( 'search' ) ),
			)
		);

		// Decorate each row with a localized time for display.
		$items = array_map(
			static function ( array $row ): array {
				$row['when'] = Availability::format_local( $row['start'] );
				return $row;
			},
			$result['items']
		);

		return new \WP_REST_Response(
			array(
				'items' => $items,
				'total' => $result['total'],
				'pages' => $result['pages'],
			),
			200
		);
	}

	public function update_status( \WP_REST_Request $request ) {
		$id     = absint( $request->get_param( 'id' ) );
		$status = (string) $request->get_param( 'status' );

		// Accept short forms (pending/confirmed/cancelled) and full slugs.
		$map = array(
			'pending'   => Bookings::STATUS_PENDING,
			'confirmed' => Bookings::STATUS_CONFIRMED,
			'cancelled' => Bookings::STATUS_CANCELLED,
		);
		$status = $map[ $status ] ?? $status;

		$result = Bookings::set_status( $id, $status );
		if ( is_wp_error( $result ) ) {
			$result->add_data( array( 'status' => 400 ) );
			return $result;
		}
		$result['when'] = Availability::format_local( $result['start'] );
		return new \WP_REST_Response( $result, 200 );
	}

	/* --------------------------------------------------------------------- */
	/* Helpers                                                               */
	/* --------------------------------------------------------------------- */

	/**
	 * @param array<string,mixed> $booking
	 */
	private function confirmation_message( array $booking ): string {
		if ( Bookings::STATUS_PENDING === $booking['status'] ) {
			return __( 'Thanks! Your request is pending approval. We will email you once it is confirmed.', 'wp-booking' );
		}
		return __( 'You are booked! A confirmation email is on its way.', 'wp-booking' );
	}

	/**
	 * Simple per-IP transient rate limit for the public booking endpoint.
	 */
	private function within_rate_limit(): bool {
		$ip = isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : '0.0.0.0';
		$key = 'klyna_booking_rl_' . md5( $ip );
		$hits = (int) get_transient( $key );
		if ( $hits >= self::RATE_LIMIT ) {
			return false;
		}
		set_transient( $key, $hits + 1, self::RATE_WINDOW );
		return true;
	}
}
