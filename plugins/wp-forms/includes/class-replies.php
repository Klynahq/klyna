<?php
/**
 * AI auto-reply draft storage.
 *
 * Replies are short AI-generated draft emails attached to a submitted entry.
 * They are never auto-sent. Admins review, edit, and click send in the
 * entries view. The dedicated table keeps draft text, status (draft|sent),
 * and links back to the entry.
 *
 * @package KlynaForms
 */

namespace KlynaForms;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Replies {

	private const VERSION_OPTION = 'wp_forms_replies_db_version';
	private const DB_VERSION     = '1';

	public function register(): void {
		add_action( 'plugins_loaded', array( __CLASS__, 'maybe_upgrade' ), 20 );
	}

	public static function table(): string {
		global $wpdb;
		return $wpdb->prefix . 'klyna_forms_replies';
	}

	public static function install_table(): void {
		global $wpdb;
		require_once ABSPATH . 'wp-admin/includes/upgrade.php';

		$table           = self::table();
		$charset_collate = $wpdb->get_charset_collate();

		// phpcs:disable WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- DDL with trusted name.
		$sql = "CREATE TABLE {$table} (
			id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
			entry_id BIGINT UNSIGNED NOT NULL,
			form_id BIGINT UNSIGNED NOT NULL,
			to_email VARCHAR(190) NOT NULL DEFAULT '',
			subject VARCHAR(255) NOT NULL DEFAULT '',
			body LONGTEXT NOT NULL,
			status VARCHAR(20) NOT NULL DEFAULT 'draft',
			created_at DATETIME NOT NULL DEFAULT '0000-00-00 00:00:00',
			sent_at DATETIME NULL DEFAULT NULL,
			PRIMARY KEY  (id),
			KEY entry_id (entry_id),
			KEY form_id (form_id),
			KEY status (status)
		) {$charset_collate};";
		// phpcs:enable

		dbDelta( $sql );
		update_option( self::VERSION_OPTION, self::DB_VERSION );
	}

	public static function maybe_upgrade(): void {
		if ( get_option( self::VERSION_OPTION ) !== self::DB_VERSION ) {
			self::install_table();
		}
	}

	/**
	 * Insert a draft reply. Returns the new ID or 0.
	 */
	public static function insert_draft( int $entry_id, int $form_id, string $to_email, string $subject, string $body ): int {
		global $wpdb;
		// phpcs:disable WordPress.DB.DirectDatabaseQuery
		$ok = $wpdb->insert(
			self::table(),
			array(
				'entry_id'   => $entry_id,
				'form_id'    => $form_id,
				'to_email'   => substr( sanitize_email( $to_email ), 0, 190 ),
				'subject'    => substr( sanitize_text_field( $subject ), 0, 255 ),
				'body'       => wp_kses_post( $body ),
				'status'     => 'draft',
				'created_at' => current_time( 'mysql' ),
			),
			array( '%d', '%d', '%s', '%s', '%s', '%s', '%s' )
		);
		// phpcs:enable
		return $ok ? (int) $wpdb->insert_id : 0;
	}

	/**
	 * @return array<string,mixed>|null
	 */
	public static function get( int $id ): ?array {
		global $wpdb;
		$table = self::table();
		// phpcs:disable WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.DirectDatabaseQuery
		$row = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$table} WHERE id = %d", $id ), ARRAY_A );
		// phpcs:enable
		return $row ?: null;
	}

	/**
	 * Most recent draft for an entry, or null.
	 *
	 * @return array<string,mixed>|null
	 */
	public static function latest_for_entry( int $entry_id ): ?array {
		global $wpdb;
		$table = self::table();
		// phpcs:disable WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.DirectDatabaseQuery
		$row = $wpdb->get_row(
			$wpdb->prepare( "SELECT * FROM {$table} WHERE entry_id = %d ORDER BY id DESC LIMIT 1", $entry_id ),
			ARRAY_A
		);
		// phpcs:enable
		return $row ?: null;
	}

	public static function update_draft( int $id, string $subject, string $body, string $to_email = '' ): bool {
		global $wpdb;
		$data    = array(
			'subject' => substr( sanitize_text_field( $subject ), 0, 255 ),
			'body'    => wp_kses_post( $body ),
		);
		$format  = array( '%s', '%s' );
		if ( '' !== $to_email ) {
			$data['to_email'] = substr( sanitize_email( $to_email ), 0, 190 );
			$format[]         = '%s';
		}
		// phpcs:disable WordPress.DB.DirectDatabaseQuery
		return (bool) $wpdb->update( self::table(), $data, array( 'id' => $id ), $format, array( '%d' ) );
		// phpcs:enable
	}

	public static function mark_sent( int $id ): bool {
		global $wpdb;
		// phpcs:disable WordPress.DB.DirectDatabaseQuery
		return (bool) $wpdb->update(
			self::table(),
			array( 'status' => 'sent', 'sent_at' => current_time( 'mysql' ) ),
			array( 'id' => $id ),
			array( '%s', '%s' ),
			array( '%d' )
		);
		// phpcs:enable
	}

	public static function delete( int $id ): bool {
		global $wpdb;
		// phpcs:disable WordPress.DB.DirectDatabaseQuery
		return (bool) $wpdb->delete( self::table(), array( 'id' => $id ), array( '%d' ) );
		// phpcs:enable
	}
}
