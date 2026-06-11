<?php
/**
 * Email-capture entry storage + impression / conversion counters.
 *
 * Entries live in a dedicated table (`{$prefix}klyna_popup_entries`). Per-popup
 * impression and conversion counters are kept as post meta for cheap reads in
 * the list table, and the entries table is the source of truth for captured
 * emails. Optional webhook dispatch fires on each capture.
 *
 * @package KlynaPopups
 */

namespace KlynaPopups;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Entries {

	private const TABLE          = 'klyna_popup_entries';
	private const META_IMPRESS   = '_klyna_impressions';
	private const META_CONVERT   = '_klyna_conversions';
	private const DB_VERSION_OPT = 'klyna_popups_db_version';

	public function register(): void {
		// Run a lightweight migration check in case the plugin was updated
		// without re-running the activation hook (e.g. git deploys).
		add_action( 'admin_init', array( __CLASS__, 'maybe_upgrade' ) );
	}

	/**
	 * Fully-qualified entries table name.
	 */
	public static function table(): string {
		global $wpdb;
		return $wpdb->prefix . self::TABLE;
	}

	/**
	 * Create / update the entries table via dbDelta.
	 */
	public static function install_table(): void {
		global $wpdb;
		require_once ABSPATH . 'wp-admin/includes/upgrade.php';

		$table           = self::table();
		$charset_collate = $wpdb->get_charset_collate();

		$sql = "CREATE TABLE {$table} (
			id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
			popup_id BIGINT UNSIGNED NOT NULL,
			email VARCHAR(190) NOT NULL,
			name VARCHAR(190) NOT NULL DEFAULT '',
			page_url VARCHAR(255) NOT NULL DEFAULT '',
			referrer VARCHAR(255) NOT NULL DEFAULT '',
			ip_hash CHAR(64) NOT NULL DEFAULT '',
			created_at DATETIME NOT NULL DEFAULT '0000-00-00 00:00:00',
			PRIMARY KEY  (id),
			KEY popup_id (popup_id),
			KEY created_at (created_at),
			UNIQUE KEY popup_email (popup_id, email)
		) {$charset_collate};";

		dbDelta( $sql );
		update_option( self::DB_VERSION_OPT, KLYNA_POPUPS_DB_VERSION );
	}

	/**
	 * Re-run the table install if the stored DB version is behind.
	 */
	public static function maybe_upgrade(): void {
		if ( get_option( self::DB_VERSION_OPT ) !== KLYNA_POPUPS_DB_VERSION ) {
			self::install_table();
		}
	}

	/**
	 * Record an impression for a popup (atomic counter on post meta).
	 *
	 * @param int $popup_id Popup ID.
	 */
	public static function record_impression( int $popup_id ): void {
		self::bump_counter( $popup_id, self::META_IMPRESS );
	}

	/**
	 * Store a captured email and bump the conversion counter.
	 *
	 * @param int                  $popup_id Popup ID.
	 * @param array<string,string> $data     Sanitized capture data.
	 * @return array{stored:bool,duplicate:bool}
	 */
	public static function record_capture( int $popup_id, array $data ): array {
		global $wpdb;

		$row = array(
			'popup_id'   => $popup_id,
			'email'      => $data['email'],
			'name'       => $data['name'] ?? '',
			'page_url'   => $data['page_url'] ?? '',
			'referrer'   => $data['referrer'] ?? '',
			'ip_hash'    => $data['ip_hash'] ?? '',
			'created_at' => current_time( 'mysql', true ),
		);

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$inserted = $wpdb->insert(
			self::table(),
			$row,
			array( '%d', '%s', '%s', '%s', '%s', '%s', '%s' )
		);

		// A duplicate (popup_id, email) hits the unique key and returns false.
		if ( false === $inserted ) {
			return array(
				'stored'    => false,
				'duplicate' => true,
			);
		}

		self::bump_counter( $popup_id, self::META_CONVERT );

		return array(
			'stored'    => true,
			'duplicate' => false,
		);
	}

	/**
	 * Atomically increment a meta counter without a read-modify-write race.
	 *
	 * @param int    $popup_id Popup ID.
	 * @param string $meta_key Counter meta key.
	 */
	private static function bump_counter( int $popup_id, string $meta_key ): void {
		global $wpdb;
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$updated = $wpdb->query(
			$wpdb->prepare(
				"UPDATE {$wpdb->postmeta} SET meta_value = meta_value + 1 WHERE post_id = %d AND meta_key = %s",
				$popup_id,
				$meta_key
			)
		);
		if ( ! $updated ) {
			// Counter did not exist yet — seed it at 1.
			add_post_meta( $popup_id, $meta_key, 1, true );
		}
		wp_cache_delete( $popup_id, 'post_meta' );
	}

	/**
	 * Impression count for a popup.
	 */
	public static function impressions_for( int $popup_id ): int {
		return (int) get_post_meta( $popup_id, self::META_IMPRESS, true );
	}

	/**
	 * Conversion count for a popup.
	 */
	public static function conversions_for( int $popup_id ): int {
		return (int) get_post_meta( $popup_id, self::META_CONVERT, true );
	}

	/**
	 * Aggregate stats (impressions, conversions, rate string) for a popup.
	 *
	 * @return array{impressions:int,conversions:int,rate:string}
	 */
	public static function stats_for( int $popup_id ): array {
		$impressions = self::impressions_for( $popup_id );
		$conversions = self::conversions_for( $popup_id );
		$rate        = $impressions > 0 ? round( ( $conversions / $impressions ) * 100, 1 ) : 0.0;
		return array(
			'impressions' => $impressions,
			'conversions' => $conversions,
			'rate'        => (string) $rate,
		);
	}

	/**
	 * Fetch recent entries for the admin list.
	 *
	 * @param int $popup_id Popup ID, or 0 for all popups.
	 * @param int $limit    Max rows.
	 * @return array<int, array<string,mixed>>
	 */
	public static function recent( int $popup_id = 0, int $limit = 100 ): array {
		global $wpdb;
		$table = self::table();
		$limit = max( 1, min( 500, $limit ) );

		if ( $popup_id > 0 ) {
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			$rows = $wpdb->get_results(
				$wpdb->prepare(
					"SELECT id, popup_id, email, name, page_url, created_at FROM {$table} WHERE popup_id = %d ORDER BY created_at DESC LIMIT %d",
					$popup_id,
					$limit
				),
				ARRAY_A
			);
		} else {
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			$rows = $wpdb->get_results(
				$wpdb->prepare(
					"SELECT id, popup_id, email, name, page_url, created_at FROM {$table} ORDER BY created_at DESC LIMIT %d",
					$limit
				),
				ARRAY_A
			);
		}

		return is_array( $rows ) ? $rows : array();
	}

	/**
	 * Total captured-email count across all popups.
	 */
	public static function total_count(): int {
		global $wpdb;
		$table = self::table();
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		return (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$table}" );
	}

	/**
	 * Export every entry (optionally for one popup) as CSV rows.
	 *
	 * @param int $popup_id Popup ID or 0 for all.
	 * @return array<int, array<int,string>>
	 */
	public static function export_rows( int $popup_id = 0 ): array {
		global $wpdb;
		$table = self::table();

		if ( $popup_id > 0 ) {
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			$rows = $wpdb->get_results(
				$wpdb->prepare(
					"SELECT popup_id, email, name, page_url, created_at FROM {$table} WHERE popup_id = %d ORDER BY created_at DESC",
					$popup_id
				),
				ARRAY_A
			);
		} else {
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			$rows = $wpdb->get_results(
				"SELECT popup_id, email, name, page_url, created_at FROM {$table} ORDER BY created_at DESC",
				ARRAY_A
			);
		}

		$out = array( array( 'popup_id', 'popup_title', 'email', 'name', 'page_url', 'created_at' ) );
		foreach ( (array) $rows as $row ) {
			$out[] = array(
				(string) $row['popup_id'],
				get_the_title( (int) $row['popup_id'] ),
				(string) $row['email'],
				(string) $row['name'],
				(string) $row['page_url'],
				(string) $row['created_at'],
			);
		}
		return $out;
	}

	/**
	 * Dispatch a captured entry to the configured webhook (fire-and-forget).
	 *
	 * Signs the body with an HMAC of the configured secret so the receiver can
	 * verify authenticity. Non-blocking so it never delays the capture response.
	 *
	 * @param int                  $popup_id Popup ID.
	 * @param array<string,string> $data     Capture data.
	 */
	public static function dispatch_webhook( int $popup_id, array $data ): void {
		$url = (string) Plugin::setting( 'webhook_url', '' );
		if ( '' === $url || ! wp_http_validate_url( $url ) ) {
			return;
		}
		if ( ! self::is_safe_public_url( $url ) ) {
			error_log( '[wp-popups] webhook URL rejected: not https or resolves to private/metadata host' );
			return;
		}

		$payload = wp_json_encode(
			array(
				'event'       => 'popup.capture',
				'popup_id'    => $popup_id,
				'popup_title' => get_the_title( $popup_id ),
				'email'       => $data['email'],
				'name'        => $data['name'] ?? '',
				'page_url'    => $data['page_url'] ?? '',
				'site'        => home_url( '/' ),
				'created_at'  => current_time( 'mysql', true ),
			)
		);

		$headers = array( 'Content-Type' => 'application/json' );
		$secret  = (string) Plugin::setting( 'webhook_secret', '' );
		if ( '' !== $secret ) {
			$headers['X-Klyna-Signature'] = 'sha256=' . hash_hmac( 'sha256', (string) $payload, $secret );
		}

		wp_remote_post(
			$url,
			array(
				'timeout'  => 5,
				'blocking' => false,
				'headers'  => $headers,
				'body'     => $payload,
			)
		);
	}

	/**
	 * SSRF guard for outbound webhook URLs.
	 *
	 * Requires https, resolves the hostname, and rejects any address inside
	 * private / loopback / link-local / cloud-metadata ranges. Defence in
	 * depth against an admin (or attacker who phished an admin) pointing the
	 * webhook at an internal service to exfiltrate captured PII.
	 *
	 * @param string $url Candidate URL.
	 */
	private static function is_safe_public_url( string $url ): bool {
		$parts = wp_parse_url( $url );
		if ( ! is_array( $parts ) || empty( $parts['scheme'] ) || empty( $parts['host'] ) ) {
			return false;
		}
		if ( 'https' !== strtolower( (string) $parts['scheme'] ) ) {
			return false;
		}
		$host = strtolower( (string) $parts['host'] );

		// Block well-known cloud metadata hostnames outright.
		$blocked_hosts = array(
			'metadata.google.internal',
			'metadata.goog',
			'metadata',
			'localhost',
			'localhost.localdomain',
			'ip6-localhost',
			'ip6-loopback',
		);
		if ( in_array( $host, $blocked_hosts, true ) ) {
			return false;
		}

		// Resolve to an IP. If gethostbyname can't resolve it returns the host unchanged.
		$ip = $host;
		if ( ! filter_var( $host, FILTER_VALIDATE_IP ) ) {
			$resolved = gethostbyname( $host );
			if ( $resolved === $host ) {
				return false; // unresolvable
			}
			$ip = $resolved;
		}

		if ( ! filter_var( $ip, FILTER_VALIDATE_IP ) ) {
			return false;
		}

		// Reject private + reserved ranges via PHP's built-in filter.
		if ( ! filter_var( $ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE ) ) {
			return false;
		}

		// Belt-and-braces bitmask checks for common SSRF targets.
		$packed = @inet_pton( $ip );
		if ( false === $packed ) {
			return false;
		}

		if ( filter_var( $ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4 ) ) {
			$long = ip2long( $ip );
			if ( false === $long ) {
				return false;
			}
			$ranges = array(
				array( '10.0.0.0',        '255.0.0.0' ),       // 10/8
				array( '172.16.0.0',      '255.240.0.0' ),     // 172.16/12
				array( '192.168.0.0',     '255.255.0.0' ),     // 192.168/16
				array( '127.0.0.0',       '255.0.0.0' ),       // loopback
				array( '169.254.0.0',     '255.255.0.0' ),     // link-local + AWS/Azure metadata 169.254.169.254
				array( '0.0.0.0',         '255.0.0.0' ),       // current network
				array( '100.64.0.0',      '255.192.0.0' ),     // CGNAT
				array( '192.0.0.0',       '255.255.255.0' ),   // IETF protocol
				array( '198.18.0.0',      '255.254.0.0' ),     // benchmarking
				array( '224.0.0.0',       '240.0.0.0' ),       // multicast
				array( '240.0.0.0',       '240.0.0.0' ),       // reserved
			);
			foreach ( $ranges as $r ) {
				if ( ( $long & ip2long( $r[1] ) ) === ip2long( $r[0] ) ) {
					return false;
				}
			}
		} else {
			// IPv6: block loopback ::1, unspecified ::, link-local fe80::/10, ULA fc00::/7, IPv4-mapped.
			$first_byte  = ord( $packed[0] );
			$second_byte = ord( $packed[1] );
			if ( '::1' === inet_ntop( $packed ) || '::' === inet_ntop( $packed ) ) {
				return false;
			}
			if ( ( $first_byte & 0xFE ) === 0xFC ) {
				return false; // fc00::/7 unique-local
			}
			if ( 0xFE === $first_byte && ( $second_byte & 0xC0 ) === 0x80 ) {
				return false; // fe80::/10 link-local
			}
			// IPv4-mapped ::ffff:0:0/96 — re-check the embedded IPv4.
			if ( 0 === strncmp( $packed, "\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\xff\xff", 12 ) ) {
				$mapped = inet_ntop( substr( $packed, 12 ) );
				if ( false !== $mapped ) {
					return self::is_safe_public_url( 'https://' . $mapped );
				}
				return false;
			}
		}

		return true;
	}

	/**
	 * Drop the entries table and counters. Called from uninstall.php.
	 */
	public static function drop_table(): void {
		global $wpdb;
		$table = self::table();
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.DirectDatabaseQuery.SchemaChange, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$wpdb->query( "DROP TABLE IF EXISTS {$table}" );
		delete_option( self::DB_VERSION_OPT );
	}
}
