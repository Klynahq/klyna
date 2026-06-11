<?php
/**
 * Storage for AI-generated booking confirmation emails.
 *
 * Each row is one personalized 80-word confirmation generated when a
 * booking is created (per-service toggle). Kept in its own table so
 * the booking record stays lean and the email history is queryable.
 *
 * @package KlynaBooking
 */

namespace KlynaBooking;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Booking_Emails {

	private const TABLE = 'klyna_booking_emails';
	private const DB_VERSION_KEY = 'wp_booking_emails_db_version';
	private const DB_VERSION     = '1.0.0';

	public static function table(): string {
		global $wpdb;
		return $wpdb->prefix . self::TABLE;
	}

	/** Install or upgrade the table. Safe to call on every activation. */
	public static function install(): void {
		global $wpdb;
		$table   = self::table();
		$charset = $wpdb->get_charset_collate();
		$sql     = "CREATE TABLE {$table} (
			id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
			booking_id BIGINT UNSIGNED NOT NULL,
			service_id BIGINT UNSIGNED NOT NULL,
			subject VARCHAR(255) NOT NULL DEFAULT '',
			body LONGTEXT NOT NULL,
			provider VARCHAR(32) NOT NULL DEFAULT '',
			model VARCHAR(128) NOT NULL DEFAULT '',
			created_at DATETIME NOT NULL,
			PRIMARY KEY (id),
			KEY booking_id (booking_id),
			KEY service_id (service_id)
		) {$charset};";
		require_once ABSPATH . 'wp-admin/includes/upgrade.php';
		dbDelta( $sql );
		update_option( self::DB_VERSION_KEY, self::DB_VERSION, false );
	}

	/**
	 * Persist a generated email for a booking.
	 *
	 * @param array<string,mixed> $row booking_id, service_id, subject, body, provider, model.
	 */
	public static function insert( array $row ): int {
		global $wpdb;
		$wpdb->insert(
			self::table(),
			array(
				'booking_id' => (int) ( $row['booking_id'] ?? 0 ),
				'service_id' => (int) ( $row['service_id'] ?? 0 ),
				'subject'    => (string) ( $row['subject'] ?? '' ),
				'body'       => (string) ( $row['body'] ?? '' ),
				'provider'   => (string) ( $row['provider'] ?? '' ),
				'model'      => (string) ( $row['model'] ?? '' ),
				'created_at' => gmdate( 'Y-m-d H:i:s' ),
			),
			array( '%d', '%d', '%s', '%s', '%s', '%s', '%s' )
		);
		return (int) $wpdb->insert_id;
	}

	/**
	 * Latest stored AI email for a booking (or null).
	 *
	 * @return array<string,mixed>|null
	 */
	public static function latest_for_booking( int $booking_id ): ?array {
		global $wpdb;
		$table = self::table();
		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$row = $wpdb->get_row(
			$wpdb->prepare(
				"SELECT id, booking_id, service_id, subject, body, provider, model, created_at FROM {$table} WHERE booking_id = %d ORDER BY id DESC LIMIT 1",
				$booking_id
			),
			ARRAY_A
		);
		return is_array( $row ) ? $row : null;
	}
}
