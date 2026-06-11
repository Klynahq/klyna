<?php
/**
 * Klyna Redirects — custom table creation & schema upgrades.
 *
 * Tables:
 *   {prefix}klyna_redirects  — the redirect rules
 *   {prefix}klyna_404_log    — 404 hit log
 *
 * @package KlynaRedirects
 */

namespace KlynaRedirects;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Database {

	public function register(): void {
		$installed = get_option( 'wp_redirects_db_version', '0' );
		if ( version_compare( $installed, KLYNA_REDIRECTS_DB_VERSION, '<' ) ) {
			self::install();
			update_option( 'wp_redirects_db_version', KLYNA_REDIRECTS_DB_VERSION );
		}

		add_action( 'wp_redirects_prune_logs', array( $this, 'prune_404_log' ) );
		if ( ! wp_next_scheduled( 'wp_redirects_prune_logs' ) ) {
			wp_schedule_event( time(), 'daily', 'wp_redirects_prune_logs' );
		}
	}

	public static function install(): void {
		global $wpdb;
		$charset = $wpdb->get_charset_collate();

		$sql_redirects = "CREATE TABLE IF NOT EXISTS {$wpdb->prefix}klyna_redirects (
			id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
			source      VARCHAR(2048)   NOT NULL,
			destination VARCHAR(2048)   NOT NULL,
			status_code SMALLINT        NOT NULL DEFAULT 301,
			is_regex    TINYINT(1)      NOT NULL DEFAULT 0,
			hit_count   BIGINT UNSIGNED NOT NULL DEFAULT 0,
			enabled     TINYINT(1)      NOT NULL DEFAULT 1,
			note        TEXT,
			created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			PRIMARY KEY (id),
			KEY idx_enabled (enabled),
			KEY idx_source (source(255))
		) $charset;";

		$sql_log = "CREATE TABLE IF NOT EXISTS {$wpdb->prefix}klyna_404_log (
			id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
			url        VARCHAR(2048)   NOT NULL,
			referrer   VARCHAR(2048),
			user_agent VARCHAR(512),
			hit_count  BIGINT UNSIGNED NOT NULL DEFAULT 1,
			last_seen  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY (id),
			UNIQUE KEY uniq_url (url(255))
		) $charset;";

		require_once ABSPATH . 'wp-admin/includes/upgrade.php';
		dbDelta( $sql_redirects );
		dbDelta( $sql_log );
	}

	public function prune_404_log(): void {
		global $wpdb;
		$days = absint( Plugin::settings()['log_retention_days'] ?? 90 );
		$wpdb->query(
			$wpdb->prepare(
				"DELETE FROM {$wpdb->prefix}klyna_404_log WHERE last_seen < DATE_SUB(NOW(), INTERVAL %d DAY)",
				$days
			)
		);
	}

	public static function drop_tables(): void {
		global $wpdb;
		$wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}klyna_redirects" );
		$wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}klyna_404_log" );
	}
}
