<?php
/**
 * Entry storage — a dedicated custom table for form submissions.
 *
 * Submissions are high-volume, append-mostly, and want their own indexable
 * columns (form_id, created_at, status), so a custom table beats a CPT here.
 * The per-submission field values are stored as JSON in `data`.
 *
 * @package KlynaForms
 */

namespace KlynaForms;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Entries {

	/**
	 * Bumped via KLYNA_FORMS_DB_VERSION when the schema changes.
	 */
	private const VERSION_OPTION = 'wp_forms_db_version';

	public function register(): void {
		// Run an idempotent migration check on load so updates pick up schema changes
		// even when the user updated files without re-activating.
		add_action( 'plugins_loaded', array( __CLASS__, 'maybe_upgrade' ), 20 );
	}

	/**
	 * Fully-qualified table name.
	 */
	public static function table(): string {
		global $wpdb;
		return $wpdb->prefix . 'klyna_form_entries';
	}

	/**
	 * Create or migrate the entries table using dbDelta.
	 */
	public static function install_table(): void {
		global $wpdb;
		require_once ABSPATH . 'wp-admin/includes/upgrade.php';

		$table           = self::table();
		$charset_collate = $wpdb->get_charset_collate();

		// phpcs:disable WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- DDL with a trusted table name.
		$sql = "CREATE TABLE {$table} (
			id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
			form_id BIGINT UNSIGNED NOT NULL,
			data LONGTEXT NOT NULL,
			status VARCHAR(20) NOT NULL DEFAULT 'unread',
			ip VARCHAR(100) NOT NULL DEFAULT '',
			user_agent VARCHAR(255) NOT NULL DEFAULT '',
			referer VARCHAR(255) NOT NULL DEFAULT '',
			created_at DATETIME NOT NULL DEFAULT '0000-00-00 00:00:00',
			PRIMARY KEY  (id),
			KEY form_id (form_id),
			KEY status (status),
			KEY created_at (created_at)
		) {$charset_collate};";
		// phpcs:enable

		dbDelta( $sql );
		update_option( self::VERSION_OPTION, KLYNA_FORMS_DB_VERSION );
	}

	/**
	 * Re-run the migration when the stored DB version drifts.
	 */
	public static function maybe_upgrade(): void {
		if ( get_option( self::VERSION_OPTION ) !== KLYNA_FORMS_DB_VERSION ) {
			self::install_table();
		}
	}

	/**
	 * Insert a submission. Returns the new entry ID, or 0 on failure.
	 *
	 * @param int                   $form_id Form post ID.
	 * @param array<string,mixed>   $data    Sanitized field values keyed by field key.
	 * @param array<string,string>  $meta    Optional ip/user_agent/referer.
	 */
	public static function insert( int $form_id, array $data, array $meta = array() ): int {
		global $wpdb;
		$ok = $wpdb->insert(
			self::table(),
			array(
				'form_id'    => $form_id,
				'data'       => wp_json_encode( $data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES ),
				'status'     => 'unread',
				'ip'         => substr( (string) ( $meta['ip'] ?? '' ), 0, 100 ),
				'user_agent' => substr( (string) ( $meta['user_agent'] ?? '' ), 0, 255 ),
				'referer'    => substr( (string) ( $meta['referer'] ?? '' ), 0, 255 ),
				'created_at' => current_time( 'mysql' ),
			),
			array( '%d', '%s', '%s', '%s', '%s', '%s', '%s' )
		);
		return $ok ? (int) $wpdb->insert_id : 0;
	}

	/**
	 * Fetch a page of entries, optionally filtered by form.
	 *
	 * @param array<string,mixed> $args form_id, status, per_page, page.
	 * @return array{rows: array<int, array<string,mixed>>, total: int}
	 */
	public static function query( array $args = array() ): array {
		global $wpdb;
		$table    = self::table();
		$per_page = max( 1, (int) ( $args['per_page'] ?? 20 ) );
		$page     = max( 1, (int) ( $args['page'] ?? 1 ) );
		$offset   = ( $page - 1 ) * $per_page;

		$where  = array( '1=1' );
		$params = array();
		if ( ! empty( $args['form_id'] ) ) {
			$where[]  = 'form_id = %d';
			$params[] = (int) $args['form_id'];
		}
		if ( ! empty( $args['status'] ) ) {
			$where[]  = 'status = %s';
			$params[] = (string) $args['status'];
		}
		$where_sql = implode( ' AND ', $where );

		// phpcs:disable WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.DirectDatabaseQuery
		$total_sql = "SELECT COUNT(*) FROM {$table} WHERE {$where_sql}";
		$total     = (int) ( $params
			? $wpdb->get_var( $wpdb->prepare( $total_sql, $params ) )
			: $wpdb->get_var( $total_sql ) );

		$rows_sql      = "SELECT * FROM {$table} WHERE {$where_sql} ORDER BY created_at DESC, id DESC LIMIT %d OFFSET %d";
		$rows_params   = array_merge( $params, array( $per_page, $offset ) );
		$rows          = $wpdb->get_results( $wpdb->prepare( $rows_sql, $rows_params ), ARRAY_A );
		// phpcs:enable

		return array(
			'rows'  => array_map( array( __CLASS__, 'hydrate' ), is_array( $rows ) ? $rows : array() ),
			'total' => $total,
		);
	}

	/**
	 * Fetch one entry by ID.
	 *
	 * @return array<string,mixed>|null
	 */
	public static function get( int $id ): ?array {
		global $wpdb;
		$table = self::table();
		// phpcs:disable WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.DirectDatabaseQuery
		$row = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$table} WHERE id = %d", $id ), ARRAY_A );
		// phpcs:enable
		return $row ? self::hydrate( $row ) : null;
	}

	/**
	 * Update an entry's status (unread|read).
	 */
	public static function set_status( int $id, string $status ): bool {
		global $wpdb;
		$status = in_array( $status, array( 'unread', 'read' ), true ) ? $status : 'read';
		// phpcs:disable WordPress.DB.DirectDatabaseQuery
		return (bool) $wpdb->update( self::table(), array( 'status' => $status ), array( 'id' => $id ), array( '%s' ), array( '%d' ) );
		// phpcs:enable
	}

	/**
	 * Permanently delete an entry.
	 */
	public static function delete( int $id ): bool {
		global $wpdb;
		// phpcs:disable WordPress.DB.DirectDatabaseQuery
		return (bool) $wpdb->delete( self::table(), array( 'id' => $id ), array( '%d' ) );
		// phpcs:enable
	}

	/**
	 * Count unread entries (optionally for one form).
	 */
	public static function unread_count( int $form_id = 0 ): int {
		global $wpdb;
		$table = self::table();
		// phpcs:disable WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.DirectDatabaseQuery
		if ( $form_id ) {
			return (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$table} WHERE status = 'unread' AND form_id = %d", $form_id ) );
		}
		return (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$table} WHERE status = 'unread'" );
		// phpcs:enable
	}

	/**
	 * All entries for a form, newest first — used by the CSV exporter.
	 *
	 * @return array<int, array<string,mixed>>
	 */
	public static function all_for_form( int $form_id ): array {
		global $wpdb;
		$table = self::table();
		// phpcs:disable WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.DirectDatabaseQuery
		$rows = $wpdb->get_results(
			$wpdb->prepare( "SELECT * FROM {$table} WHERE form_id = %d ORDER BY created_at DESC, id DESC", $form_id ),
			ARRAY_A
		);
		// phpcs:enable
		return array_map( array( __CLASS__, 'hydrate' ), is_array( $rows ) ? $rows : array() );
	}

	/**
	 * Decode the JSON `data` column into a real array.
	 *
	 * @param array<string,mixed> $row Raw DB row.
	 * @return array<string,mixed>
	 */
	private static function hydrate( array $row ): array {
		$decoded     = json_decode( (string) ( $row['data'] ?? '' ), true );
		$row['data'] = is_array( $decoded ) ? $decoded : array();
		return $row;
	}
}
