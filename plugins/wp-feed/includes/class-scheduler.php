<?php
/**
 * Scheduled regeneration via wp-cron.
 *
 * Rebuilds every enabled feed on the chosen interval (hourly / twicedaily /
 * daily) and writes the result to the cache table. Also reconciles the cron
 * schedule whenever settings change so the interval always matches the option.
 *
 * @package KlynaFeed
 */

namespace KlynaFeed;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Scheduler {

	/**
	 * Allowed schedule intervals (must be valid wp-cron recurrences).
	 *
	 * @var string[]
	 */
	public const INTERVALS = array( 'hourly', 'twicedaily', 'daily' );

	public function register(): void {
		add_action( KLYNA_FEED_CRON_HOOK, array( $this, 'regenerate' ) );
		add_action( 'update_option_' . KLYNA_FEED_OPTION_KEY, array( $this, 'reschedule' ), 10, 2 );
	}

	/**
	 * Rebuild and cache every enabled feed. This is the cron callback and is
	 * also invoked on demand from the admin "Regenerate now" action.
	 */
	public function regenerate(): void {
		$settings = Plugin::settings();
		$builder  = new Feed_Builder();

		if ( ! empty( $settings['enable_google'] ) ) {
			$google = $builder->build_google();
			Storage::save(
				'google',
				$google['payload'],
				array(
					'item_count'    => $google['item_count'],
					'warning_count' => $google['warning_count'],
				)
			);
		}

		if ( ! empty( $settings['enable_meta'] ) ) {
			$meta = $builder->build_meta();
			Storage::save(
				'meta',
				$meta['payload'],
				array(
					'item_count'    => $meta['item_count'],
					'warning_count' => $meta['warning_count'],
				)
			);
		}

		update_option( 'klyna_feed_last_run', current_time( 'mysql', true ), false );
	}

	/**
	 * Reconcile the cron event when settings are saved.
	 *
	 * @param mixed $old_value
	 * @param mixed $new_value
	 */
	public function reschedule( $old_value, $new_value ): void {
		$new      = is_array( $new_value ) ? $new_value : array();
		$schedule = isset( $new['schedule'] ) ? (string) $new['schedule'] : 'daily';

		$timestamp = wp_next_scheduled( KLYNA_FEED_CRON_HOOK );

		if ( 'off' === $schedule ) {
			if ( $timestamp ) {
				wp_unschedule_event( $timestamp, KLYNA_FEED_CRON_HOOK );
			}
			return;
		}

		if ( ! in_array( $schedule, self::INTERVALS, true ) ) {
			$schedule = 'daily';
		}

		// If the interval changed (or nothing is scheduled), reset the event.
		$current_recurrence = $timestamp ? wp_get_schedule( KLYNA_FEED_CRON_HOOK ) : false;
		if ( $current_recurrence !== $schedule ) {
			if ( $timestamp ) {
				wp_unschedule_event( $timestamp, KLYNA_FEED_CRON_HOOK );
			}
			wp_schedule_event( time() + MINUTE_IN_SECONDS, $schedule, KLYNA_FEED_CRON_HOOK );
		}
	}

	/**
	 * Human-readable timestamp of the last successful regeneration.
	 */
	public static function last_run(): string {
		$value = get_option( 'klyna_feed_last_run', '' );
		return is_string( $value ) ? $value : '';
	}
}
