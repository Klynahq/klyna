<?php
/**
 * Feed cache storage — a custom table holding the last generated payload per
 * format plus generation metadata (item count, byte size, timestamp).
 *
 * We cache to a table rather than the filesystem so the public feed URL serves
 * instantly without re-querying WooCommerce on every hit, and so health stats
 * survive between requests. Zero external dependencies; pure dbDelta.
 *
 * @package KlynaFeed
 */

namespace KlynaFeed;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Storage {

	/**
	 * Bare table name (no prefix).
	 */
	private const TABLE = 'klyna_feeds';

	/**
	 * Fully-qualified table name including the site DB prefix.
	 */
	public static function table_name(): string {
		global $wpdb;
		return $wpdb->prefix . self::TABLE;
	}

	/**
	 * Create or update the cache table. Idempotent — safe to call repeatedly.
	 */
	public static function install_table(): void {
		global $wpdb;
		$table           = self::table_name();
		$charset_collate = $wpdb->get_charset_collate();

		$sql = "CREATE TABLE {$table} (
			format varchar(20) NOT NULL,
			payload longtext NOT NULL,
			item_count int unsigned NOT NULL DEFAULT 0,
			warning_count int unsigned NOT NULL DEFAULT 0,
			byte_size bigint unsigned NOT NULL DEFAULT 0,
			generated_at datetime NOT NULL DEFAULT '0000-00-00 00:00:00',
			PRIMARY KEY  (format)
		) {$charset_collate};";

		require_once ABSPATH . 'wp-admin/includes/upgrade.php';
		dbDelta( $sql );
	}

	/**
	 * Persist a generated feed payload + its stats.
	 *
	 * @param array{item_count:int,warning_count:int} $stats
	 */
	public static function save( string $format, string $payload, array $stats ): void {
		global $wpdb;
		$wpdb->replace(
			self::table_name(),
			array(
				'format'        => $format,
				'payload'       => $payload,
				'item_count'    => (int) ( $stats['item_count'] ?? 0 ),
				'warning_count' => (int) ( $stats['warning_count'] ?? 0 ),
				'byte_size'     => strlen( $payload ),
				'generated_at'  => current_time( 'mysql', true ),
			),
			array( '%s', '%s', '%d', '%d', '%d', '%s' )
		);
	}

	/**
	 * Fetch a cached feed row.
	 *
	 * @return array<string,mixed>|null
	 */
	public static function get( string $format ): ?array {
		global $wpdb;
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery
		$row = $wpdb->get_row(
			$wpdb->prepare( 'SELECT * FROM ' . self::table_name() . ' WHERE format = %s', $format ),
			ARRAY_A
		);
		return is_array( $row ) ? $row : null;
	}

	/**
	 * Lightweight stats for every cached format (no payload).
	 *
	 * @return array<string, array<string,mixed>>
	 */
	public static function all_stats(): array {
		global $wpdb;
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery
		$rows = $wpdb->get_results(
			'SELECT format, item_count, warning_count, byte_size, generated_at FROM ' . self::table_name(),
			ARRAY_A
		);
		$out = array();
		foreach ( (array) $rows as $row ) {
			$out[ (string) $row['format'] ] = $row;
		}
		return $out;
	}

	/**
	 * Remove the cache table entirely. Called from uninstall.php.
	 */
	public static function drop_table(): void {
		global $wpdb;
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery, WordPress.DB.PreparedSQL.NotPrepared
		$wpdb->query( 'DROP TABLE IF EXISTS ' . self::table_name() );
	}
}
