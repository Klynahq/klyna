<?php
/**
 * Bookings custom post type + persistence helpers.
 *
 * A booking is one customer reservation against a service at a point in time.
 * Stored as a private CPT so it never appears on the front-end but inherits
 * WordPress' list table, search, and capability model for free. Customer
 * details and the slot are post meta; status lives in `post_status` via a set
 * of custom statuses (pending / confirmed / cancelled).
 *
 * @package KlynaBooking
 */

namespace KlynaBooking;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Bookings {

	public const POST_TYPE = 'klyna_booking';

	public const STATUS_PENDING   = 'kb_pending';
	public const STATUS_CONFIRMED = 'kb_confirmed';
	public const STATUS_CANCELLED = 'kb_cancelled';

	public const META_SERVICE  = '_klyna_booking_service_id';
	public const META_SERVICE_TITLE = '_klyna_booking_service_title';
	public const META_START    = '_klyna_booking_start';
	public const META_END      = '_klyna_booking_end';
	public const META_NAME     = '_klyna_booking_name';
	public const META_EMAIL    = '_klyna_booking_email';
	public const META_PHONE    = '_klyna_booking_phone';
	public const META_NOTES    = '_klyna_booking_notes';
	public const META_DURATION = '_klyna_booking_duration';

	public function register(): void {
		add_action( 'init', array( $this, 'register_post_type' ) );
		add_action( 'init', array( $this, 'register_statuses' ) );
	}

	public function register_post_type(): void {
		register_post_type(
			self::POST_TYPE,
			array(
				'labels'              => array(
					'name'          => __( 'Bookings', 'wp-booking' ),
					'singular_name' => __( 'Booking', 'wp-booking' ),
					'menu_name'     => __( 'Bookings', 'wp-booking' ),
				),
				'public'              => false,
				'show_ui'             => false,
				'show_in_menu'        => false,
				'show_in_rest'        => false,
				'exclude_from_search' => true,
				'publicly_queryable'  => false,
				'has_archive'         => false,
				'supports'            => array( 'title' ),
				'capability_type'     => 'post',
				'map_meta_cap'        => true,
			)
		);
	}

	public function register_statuses(): void {
		register_post_status(
			self::STATUS_PENDING,
			array(
				'label'                     => _x( 'Pending', 'booking status', 'wp-booking' ),
				'public'                    => false,
				'internal'                  => true,
				'exclude_from_search'       => true,
				'show_in_admin_all_list'    => true,
				'show_in_admin_status_list' => true,
				/* translators: %s: count. */
				'label_count'               => _n_noop( 'Pending <span class="count">(%s)</span>', 'Pending <span class="count">(%s)</span>', 'wp-booking' ),
			)
		);
		register_post_status(
			self::STATUS_CONFIRMED,
			array(
				'label'                     => _x( 'Confirmed', 'booking status', 'wp-booking' ),
				'public'                    => false,
				'internal'                  => true,
				'exclude_from_search'       => true,
				'show_in_admin_all_list'    => true,
				'show_in_admin_status_list' => true,
				/* translators: %s: count. */
				'label_count'               => _n_noop( 'Confirmed <span class="count">(%s)</span>', 'Confirmed <span class="count">(%s)</span>', 'wp-booking' ),
			)
		);
		register_post_status(
			self::STATUS_CANCELLED,
			array(
				'label'                     => _x( 'Cancelled', 'booking status', 'wp-booking' ),
				'public'                    => false,
				'internal'                  => true,
				'exclude_from_search'       => true,
				'show_in_admin_all_list'    => true,
				'show_in_admin_status_list' => true,
				/* translators: %s: count. */
				'label_count'               => _n_noop( 'Cancelled <span class="count">(%s)</span>', 'Cancelled <span class="count">(%s)</span>', 'wp-booking' ),
			)
		);
	}

	/**
	 * @return array<string,string>
	 */
	public static function statuses(): array {
		return array(
			self::STATUS_PENDING   => __( 'Pending', 'wp-booking' ),
			self::STATUS_CONFIRMED => __( 'Confirmed', 'wp-booking' ),
			self::STATUS_CANCELLED => __( 'Cancelled', 'wp-booking' ),
		);
	}

	/**
	 * Create a booking. Caller is responsible for validation + slot
	 * availability; this only persists.
	 *
	 * @param array<string,mixed> $data Sanitized booking fields.
	 * @return int|\WP_Error Booking post ID on success.
	 */
	public static function create( array $data ) {
		$require_approval = ! empty( Plugin::settings()['require_approval'] );
		$status           = $require_approval ? self::STATUS_PENDING : self::STATUS_CONFIRMED;

		$service = Services::get( (int) $data['service_id'] );
		if ( ! $service ) {
			return new \WP_Error( 'invalid_service', __( 'That service is no longer available.', 'wp-booking' ) );
		}

		$start = $data['start'];
		$title = sprintf(
			/* translators: 1: customer name, 2: service title, 3: date/time. */
			__( '%1$s — %2$s — %3$s', 'wp-booking' ),
			$data['name'],
			$service['title'],
			Availability::format_local( $start )
		);

		$post_id = wp_insert_post(
			array(
				'post_type'   => self::POST_TYPE,
				'post_status' => $status,
				'post_title'  => $title,
				'meta_input'  => array(
					self::META_SERVICE       => $service['id'],
					self::META_SERVICE_TITLE => $service['title'],
					self::META_START         => $start,
					self::META_END           => $data['end'],
					self::META_DURATION      => $service['duration'],
					self::META_NAME          => $data['name'],
					self::META_EMAIL         => $data['email'],
					self::META_PHONE         => $data['phone'] ?? '',
					self::META_NOTES         => $data['notes'] ?? '',
				),
			),
			true
		);

		if ( is_wp_error( $post_id ) ) {
			return $post_id;
		}

		/**
		 * Fires after a booking is created and persisted.
		 *
		 * @param int    $post_id Booking ID.
		 * @param string $status  Booking status slug.
		 */
		do_action( 'klyna_booking_created', $post_id, $status );

		return (int) $post_id;
	}

	/**
	 * Normalized booking record for display.
	 *
	 * @return array<string,mixed>|null
	 */
	public static function get( int $booking_id ): ?array {
		$post = get_post( $booking_id );
		if ( ! $post || self::POST_TYPE !== $post->post_type ) {
			return null;
		}
		$service_id    = (int) get_post_meta( $booking_id, self::META_SERVICE, true );
		$stored_title  = (string) get_post_meta( $booking_id, self::META_SERVICE_TITLE, true );
		$service       = Services::get( $service_id );
		$service_title = '' !== $stored_title ? $stored_title : ( $service['title'] ?? '' );
		return array(
			'id'            => $booking_id,
			'status'        => $post->post_status,
			'status_label'  => self::statuses()[ $post->post_status ] ?? $post->post_status,
			'service_id'    => $service_id,
			'service_title' => $service_title,
			'start'         => (string) get_post_meta( $booking_id, self::META_START, true ),
			'end'           => (string) get_post_meta( $booking_id, self::META_END, true ),
			'duration'      => (int) get_post_meta( $booking_id, self::META_DURATION, true ),
			'name'          => (string) get_post_meta( $booking_id, self::META_NAME, true ),
			'email'         => (string) get_post_meta( $booking_id, self::META_EMAIL, true ),
			'phone'         => (string) get_post_meta( $booking_id, self::META_PHONE, true ),
			'notes'         => (string) get_post_meta( $booking_id, self::META_NOTES, true ),
			'created'       => $post->post_date_gmt,
		);
	}

	/**
	 * Bookings that occupy a slot on a given service within a UTC window,
	 * counting only ones that hold a seat (pending or confirmed). Bounds are
	 * canonical ISO-8601 UTC strings; because every stored start uses the same
	 * fixed-width format, a lexicographic string BETWEEN is an exact range.
	 *
	 * @return array<int, array{start:string,end:string}>
	 */
	public static function occupied_for_day( int $service_id, string $day_start_utc, string $day_end_utc ): array {
		$ids = get_posts(
			array(
				'post_type'      => self::POST_TYPE,
				'post_status'    => array( self::STATUS_PENDING, self::STATUS_CONFIRMED ),
				'posts_per_page' => -1,
				'fields'         => 'ids',
				// phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query
				'meta_query'     => array(
					'relation' => 'AND',
					array(
						'key'   => self::META_SERVICE,
						'value' => $service_id,
					),
					array(
						'key'     => self::META_START,
						'value'   => array( $day_start_utc, $day_end_utc ),
						'compare' => 'BETWEEN',
						'type'    => 'CHAR',
					),
				),
			)
		);
		$out = array();
		foreach ( $ids as $id ) {
			$out[] = array(
				'start' => (string) get_post_meta( (int) $id, self::META_START, true ),
				'end'   => (string) get_post_meta( (int) $id, self::META_END, true ),
			);
		}
		return $out;
	}

	/**
	 * Move a booking to a new status. Returns the booking record or WP_Error.
	 *
	 * @return array<string,mixed>|\WP_Error
	 */
	public static function set_status( int $booking_id, string $status ) {
		if ( ! array_key_exists( $status, self::statuses() ) ) {
			return new \WP_Error( 'invalid_status', __( 'Unknown booking status.', 'wp-booking' ) );
		}
		$post = get_post( $booking_id );
		if ( ! $post || self::POST_TYPE !== $post->post_type ) {
			return new \WP_Error( 'not_found', __( 'Booking not found.', 'wp-booking' ) );
		}
		$result = wp_update_post(
			array(
				'ID'          => $booking_id,
				'post_status' => $status,
			),
			true
		);
		if ( is_wp_error( $result ) ) {
			return $result;
		}

		/**
		 * Fires when a booking status changes.
		 *
		 * @param int    $booking_id Booking ID.
		 * @param string $status     New status slug.
		 */
		do_action( 'klyna_booking_status_changed', $booking_id, $status );

		return self::get( $booking_id );
	}

	/**
	 * Paginated query for the admin list. Returns records + total.
	 *
	 * @param array<string,mixed> $args status, paged, per_page, search.
	 * @return array{items: array<int, array<string,mixed>>, total: int, pages: int}
	 */
	public static function query( array $args ): array {
		$statuses = array_keys( self::statuses() );
		$status   = isset( $args['status'] ) && in_array( $args['status'], $statuses, true )
			? array( $args['status'] )
			: $statuses;

		$query_args = array(
			'post_type'      => self::POST_TYPE,
			'post_status'    => $status,
			'posts_per_page' => max( 1, (int) ( $args['per_page'] ?? 20 ) ),
			'paged'          => max( 1, (int) ( $args['paged'] ?? 1 ) ),
			'orderby'        => 'meta_value',
			'meta_key'       => self::META_START,
			'order'          => 'DESC',
		);
		if ( ! empty( $args['search'] ) ) {
			$query_args['s'] = sanitize_text_field( (string) $args['search'] );
		}

		$query = new \WP_Query( $query_args );
		$items = array();
		foreach ( $query->posts as $post ) {
			$record = self::get( (int) $post->ID );
			if ( $record ) {
				$items[] = $record;
			}
		}
		return array(
			'items' => $items,
			'total' => (int) $query->found_posts,
			'pages' => (int) $query->max_num_pages,
		);
	}
}
