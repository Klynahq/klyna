<?php
/**
 * Daily-aggregated event storage.
 *
 * Klyna Analytics never stores a row per pageview. The Tracker buckets every
 * hit into a (day, path, referrer-host, event) tuple and increments a single
 * counter via an atomic upsert. The table therefore stays small even on busy
 * sites, holds zero PII, and is trivially prunable by date.
 *
 * Pure PHP + $wpdb. No external services.
 *
 * @package KlynaAnalytics
 */

namespace KlynaAnalytics;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Storage {

	private const CRON_HOOK = 'klyna_analytics_prune';

	/**
	 * Maximum stored length of a path / referrer host. Anything longer is
	 * truncated before storage to keep the unique index compact.
	 */
	private const MAX_PATH = 190;
	private const MAX_HOST = 128;

	public function register(): void {
		add_action( self::CRON_HOOK, array( $this, 'prune' ) );

		// Self-heal: install/upgrade the table if a deploy bumped the schema.
		add_action( 'plugins_loaded', array( $this, 'maybe_upgrade' ), 20 );
	}

	/**
	 * Fully-qualified table name.
	 */
	public static function table(): string {
		global $wpdb;
		return $wpdb->prefix . 'klyna_analytics_daily';
	}

	/**
	 * Create the storage table. Idempotent — safe to call repeatedly.
	 */
	public static function install(): void {
		global $wpdb;
		require_once ABSPATH . 'wp-admin/includes/upgrade.php';

		$table   = self::table();
		$collate = $wpdb->get_charset_collate();

		// `bucket` is a 32-char hash of day|path|ref|event used as the unique
		// dedupe key, since MySQL unique indexes cap key length.
		$sql = "CREATE TABLE {$table} (
			id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
			day DATE NOT NULL,
			path VARCHAR(190) NOT NULL DEFAULT '',
			ref_host VARCHAR(128) NOT NULL DEFAULT '',
			event VARCHAR(64) NOT NULL DEFAULT 'pageview',
			hits BIGINT UNSIGNED NOT NULL DEFAULT 0,
			visitors BIGINT UNSIGNED NOT NULL DEFAULT 0,
			bucket CHAR(32) NOT NULL DEFAULT '',
			PRIMARY KEY (id),
			UNIQUE KEY bucket (bucket),
			KEY day (day),
			KEY event (event)
		) {$collate};";

		dbDelta( $sql );

		update_option( 'klyna_analytics_db_version', KLYNA_ANALYTICS_DB_VERSION );
	}

	/**
	 * Run install() again if the stored DB version is behind.
	 */
	public function maybe_upgrade(): void {
		if ( get_option( 'klyna_analytics_db_version' ) !== KLYNA_ANALYTICS_DB_VERSION ) {
			self::install();
		}
	}

	/**
	 * Record one event by incrementing the matching daily bucket.
	 *
	 * The `visitors` counter is only incremented when $is_unique is true — the
	 * Tracker decides uniqueness from a rotating, salted daily hash so no
	 * per-visitor identifier is ever stored.
	 *
	 * @param string $day       Y-m-d (site timezone).
	 * @param string $path      Normalized request path.
	 * @param string $ref_host  Referrer host (empty for direct).
	 * @param string $event     Event name (`pageview` or a custom slug).
	 * @param bool   $is_unique Whether this hit should count as a new visitor.
	 */
	public static function record( string $day, string $path, string $ref_host, string $event, bool $is_unique ): void {
		global $wpdb;

		$path     = self::clip( $path, self::MAX_PATH );
		$ref_host = self::clip( $ref_host, self::MAX_HOST );
		$event    = self::clip( $event, 64 );
		$bucket   = md5( $day . '|' . $path . '|' . $ref_host . '|' . $event );
		$table    = self::table();
		$visitor  = $is_unique ? 1 : 0;

		// Atomic upsert: one row per (day, path, ref, event), counters bumped.
		// phpcs:disable WordPress.DB.PreparedSQL.NotPrepared -- prepared below.
		$wpdb->query(
			$wpdb->prepare(
				"INSERT INTO {$table} (day, path, ref_host, event, hits, visitors, bucket)
				 VALUES (%s, %s, %s, %s, 1, %d, %s)
				 ON DUPLICATE KEY UPDATE hits = hits + 1, visitors = visitors + %d",
				$day,
				$path,
				$ref_host,
				$event,
				$visitor,
				$bucket,
				$visitor
			)
		);
		// phpcs:enable
	}

	/**
	 * Delete aggregated rows older than the configured retention window.
	 */
	public function prune(): void {
		global $wpdb;

		$settings = Plugin::settings();
		$days     = max( 1, (int) $settings['retention_days'] );
		$cutoff   = gmdate( 'Y-m-d', time() - ( $days * DAY_IN_SECONDS ) );
		$table    = self::table();

		// phpcs:disable WordPress.DB.DirectDatabaseQuery
		$wpdb->query(
			$wpdb->prepare( "DELETE FROM {$table} WHERE day < %s", $cutoff )
		);
		// phpcs:enable
	}

	/**
	 * Schedule the daily pruning cron event.
	 */
	public static function schedule_pruning(): void {
		if ( ! wp_next_scheduled( self::CRON_HOOK ) ) {
			wp_schedule_event( time() + HOUR_IN_SECONDS, 'daily', self::CRON_HOOK );
		}
	}

	/**
	 * Clear the pruning cron event.
	 */
	public static function unschedule_pruning(): void {
		$timestamp = wp_next_scheduled( self::CRON_HOOK );
		if ( $timestamp ) {
			wp_unschedule_event( $timestamp, self::CRON_HOOK );
		}
	}

	/**
	 * Drop the storage table entirely (used by uninstall).
	 */
	public static function drop(): void {
		global $wpdb;
		$table = self::table();
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery, WordPress.DB.PreparedSQL.NotPrepared
		$wpdb->query( "DROP TABLE IF EXISTS {$table}" );
		delete_option( 'klyna_analytics_db_version' );
	}

	private static function clip( string $value, int $max ): string {
		return function_exists( 'mb_substr' ) ? mb_substr( $value, 0, $max ) : substr( $value, 0, $max );
	}
}
