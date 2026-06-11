<?php
/**
 * Availability + slot calculation.
 *
 * Owns the weekly opening-hours model, the blackout-date list, and the pure
 * function that turns a service + a calendar day into a list of bookable
 * start times. Everything is computed against the site time zone and stored in
 * UTC, so the maths is honest across DST boundaries.
 *
 * No external services — slots are derived from settings and the existing
 * bookings already on the books.
 *
 * @package KlynaBooking
 */

namespace KlynaBooking;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Availability {

	/** Canonical, ordered week. Keys are stored in settings. */
	public const DAYS = array( 'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun' );

	public function register(): void {
		// Availability is consumed by REST + the front-end; nothing to hook
		// directly, but keeping register() makes the boot list uniform.
	}

	/**
	 * Default weekly hours — open Mon–Fri 09:00–17:00, weekend closed.
	 *
	 * @return array<string, array{enabled:bool,start:string,end:string}>
	 */
	public static function default_hours(): array {
		$out = array();
		foreach ( self::DAYS as $day ) {
			$weekday      = ! in_array( $day, array( 'sat', 'sun' ), true );
			$out[ $day ] = array(
				'enabled' => $weekday,
				'start'   => '09:00',
				'end'     => '17:00',
			);
		}
		return $out;
	}

	/**
	 * Day labels for the settings UI.
	 *
	 * @return array<string,string>
	 */
	public static function day_labels(): array {
		return array(
			'mon' => __( 'Monday', 'wp-booking' ),
			'tue' => __( 'Tuesday', 'wp-booking' ),
			'wed' => __( 'Wednesday', 'wp-booking' ),
			'thu' => __( 'Thursday', 'wp-booking' ),
			'fri' => __( 'Friday', 'wp-booking' ),
			'sat' => __( 'Saturday', 'wp-booking' ),
			'sun' => __( 'Sunday', 'wp-booking' ),
		);
	}

	/**
	 * The site time zone as a DateTimeZone, honoring the saved override.
	 */
	public static function timezone(): \DateTimeZone {
		$settings = Plugin::settings();
		$tz       = (string) ( $settings['time_zone'] ?? '' );
		if ( $tz ) {
			try {
				return new \DateTimeZone( $tz );
			} catch ( \Exception $e ) {
				// Fall through to core helper.
			}
		}
		return wp_timezone();
	}

	/**
	 * Compute bookable slots for one service on one local calendar date.
	 *
	 * @param int    $service_id Service to book.
	 * @param string $date       Local date `Y-m-d`.
	 * @return array<int, array{start:string,end:string,label:string}> Each start/end is UTC ISO-8601.
	 */
	public static function slots_for( int $service_id, string $date ): array {
		$service = Services::get( $service_id );
		if ( ! $service ) {
			return array();
		}
		if ( ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $date ) ) {
			return array();
		}

		$settings = Plugin::settings();
		$tz       = self::timezone();

		// Reject blackout dates outright.
		if ( in_array( $date, self::blackout_dates(), true ) ) {
			return array();
		}

		// Map the local date to a weekday key + its configured window.
		try {
			$day_start = new \DateTimeImmutable( $date . ' 00:00:00', $tz );
		} catch ( \Exception $e ) {
			return array();
		}
		$weekday_key = self::DAYS[ (int) $day_start->format( 'N' ) - 1 ];
		$hours       = self::weekly_hours()[ $weekday_key ] ?? null;
		if ( ! $hours || empty( $hours['enabled'] ) ) {
			return array();
		}

		$open  = self::time_on( $day_start, $hours['start'] );
		$close = self::time_on( $day_start, $hours['end'] );
		if ( ! $open || ! $close || $close <= $open ) {
			return array();
		}

		$interval = max( 5, (int) $settings['slot_interval'] );
		$duration = (int) $service['duration'];
		$lead     = max( 0, (int) $settings['lead_time'] ); // minutes from now.
		$capacity = max( 1, (int) $service['capacity'] );

		// Earliest a booking may start: now + lead time.
		$now      = new \DateTimeImmutable( 'now', $tz );
		$earliest = $now->modify( '+' . $lead . ' minutes' );

		// Existing bookings overlapping this local day, for overlap checks.
		// Bounds are canonical ISO-8601 UTC strings matching the stored format,
		// so the lexicographic BETWEEN in the query is exact. We widen the
		// window by a day on each side so a booking that starts the previous
		// local evening but spans into this day is still considered.
		$utc           = new \DateTimeZone( 'UTC' );
		$day_start_utc = $day_start->modify( '-1 day' )->setTimezone( $utc )->format( 'c' );
		$day_end_utc   = $day_start->modify( '+1 day' )->setTimezone( $utc )->format( 'c' );
		$occupied       = Bookings::occupied_for_day( $service_id, $day_start_utc, $day_end_utc );

		$slots  = array();
		$cursor = $open;
		while ( true ) {
			$slot_end = $cursor->modify( '+' . $duration . ' minutes' );
			if ( $slot_end > $close ) {
				break;
			}
			if ( $cursor >= $earliest ) {
				$count = self::overlap_count( $cursor, $slot_end, $occupied );
				if ( $count < $capacity ) {
					$slots[] = array(
						'start' => $cursor->setTimezone( $utc )->format( 'c' ),
						'end'   => $slot_end->setTimezone( $utc )->format( 'c' ),
						'label' => $cursor->format( 'g:i a' ),
					);
				}
			}
			$cursor = $cursor->modify( '+' . $interval . ' minutes' );
		}

		return $slots;
	}

	/**
	 * Validate that a specific UTC start time is still a real, free slot for a
	 * service. Used server-side before persisting a booking so a stale form
	 * can't double-book. Returns the resolved end time or WP_Error.
	 *
	 * @return array{start:string,end:string}|\WP_Error
	 */
	public static function validate_slot( int $service_id, string $start_utc ) {
		$service = Services::get( $service_id );
		if ( ! $service ) {
			return new \WP_Error( 'invalid_service', __( 'That service is no longer available.', 'wp-booking' ) );
		}
		try {
			$start = new \DateTimeImmutable( $start_utc );
		} catch ( \Exception $e ) {
			return new \WP_Error( 'invalid_time', __( 'That time could not be read.', 'wp-booking' ) );
		}
		$utc          = new \DateTimeZone( 'UTC' );
		$canonical    = $start->setTimezone( $utc )->format( 'c' );
		$local_date   = $start->setTimezone( self::timezone() )->format( 'Y-m-d' );

		foreach ( self::slots_for( $service_id, $local_date ) as $slot ) {
			if ( $slot['start'] === $canonical ) {
				return array(
					'start' => $slot['start'],
					'end'   => $slot['end'],
				);
			}
		}
		return new \WP_Error( 'slot_taken', __( 'Sorry, that time is no longer available. Please pick another slot.', 'wp-booking' ) );
	}

	/**
	 * Saved weekly hours merged with defaults so every day key exists.
	 *
	 * @return array<string, array{enabled:bool,start:string,end:string}>
	 */
	public static function weekly_hours(): array {
		$settings = Plugin::settings();
		$saved    = is_array( $settings['availability'] ?? null ) ? $settings['availability'] : array();
		$out      = array();
		foreach ( self::default_hours() as $day => $default ) {
			$row         = is_array( $saved[ $day ] ?? null ) ? $saved[ $day ] : array();
			$out[ $day ] = array(
				'enabled' => ! empty( $row['enabled'] ),
				'start'   => self::valid_time( $row['start'] ?? '' ) ?: $default['start'],
				'end'     => self::valid_time( $row['end'] ?? '' ) ?: $default['end'],
			);
		}
		return $out;
	}

	/**
	 * Parsed blackout dates as `Y-m-d` strings.
	 *
	 * @return string[]
	 */
	public static function blackout_dates(): array {
		$settings = Plugin::settings();
		$raw      = (string) ( $settings['blackout_dates'] ?? '' );
		$parts    = preg_split( '/[\r\n,]+/', $raw );
		if ( ! is_array( $parts ) ) {
			return array();
		}
		$out = array();
		foreach ( $parts as $part ) {
			$part = trim( $part );
			if ( preg_match( '/^\d{4}-\d{2}-\d{2}$/', $part ) ) {
				$out[] = $part;
			}
		}
		return array_values( array_unique( $out ) );
	}

	/**
	 * The set of local dates a customer is allowed to book — from today up to
	 * the booking window — paired with whether they have any open slots.
	 *
	 * @return string[] List of `Y-m-d`.
	 */
	public static function bookable_dates(): array {
		$settings = Plugin::settings();
		$window   = max( 1, (int) $settings['booking_window'] );
		$tz       = self::timezone();
		$today    = new \DateTimeImmutable( 'now', $tz );

		$out = array();
		for ( $i = 0; $i < $window; $i++ ) {
			$day        = $today->modify( '+' . $i . ' days' );
			$date       = $day->format( 'Y-m-d' );
			$weekday    = self::DAYS[ (int) $day->format( 'N' ) - 1 ];
			$hours      = self::weekly_hours()[ $weekday ];
			$is_blacked = in_array( $date, self::blackout_dates(), true );
			if ( ! empty( $hours['enabled'] ) && ! $is_blacked ) {
				$out[] = $date;
			}
		}
		return $out;
	}

	/**
	 * Render a UTC ISO timestamp in the site time zone for human display.
	 */
	public static function format_local( string $utc ): string {
		try {
			$dt = new \DateTimeImmutable( $utc );
		} catch ( \Exception $e ) {
			return $utc;
		}
		$dt     = $dt->setTimezone( self::timezone() );
		$format = get_option( 'date_format' ) . ' ' . get_option( 'time_format' );
		return wp_date( $format, $dt->getTimestamp() );
	}

	/**
	 * Combine a calendar day with an `H:i` time, returning an immutable point.
	 */
	private static function time_on( \DateTimeImmutable $day, string $hhmm ): ?\DateTimeImmutable {
		$valid = self::valid_time( $hhmm );
		if ( ! $valid ) {
			return null;
		}
		[ $h, $m ] = array_map( 'intval', explode( ':', $valid ) );
		return $day->setTime( $h, $m );
	}

	/**
	 * How many existing bookings overlap [start, end).
	 *
	 * @param array<int, array{start:string,end:string}> $occupied
	 */
	private static function overlap_count( \DateTimeImmutable $start, \DateTimeImmutable $end, array $occupied ): int {
		$count = 0;
		foreach ( $occupied as $row ) {
			try {
				$o_start = new \DateTimeImmutable( $row['start'] );
				$o_end   = new \DateTimeImmutable( $row['end'] );
			} catch ( \Exception $e ) {
				continue;
			}
			if ( $start < $o_end && $end > $o_start ) {
				++$count;
			}
		}
		return $count;
	}

	/**
	 * Normalize an `H:i` time or return '' if invalid.
	 */
	private static function valid_time( string $time ): string {
		if ( preg_match( '/^([01]?\d|2[0-3]):([0-5]\d)$/', trim( $time ), $m ) ) {
			return sprintf( '%02d:%02d', (int) $m[1], (int) $m[2] );
		}
		return '';
	}
}
