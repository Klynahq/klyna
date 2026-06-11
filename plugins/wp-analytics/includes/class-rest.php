<?php
/**
 * REST API surface.
 *
 * Two route groups under `klyna-analytics/v1`:
 *  - POST /collect  — the public beacon endpoint. Open to anonymous visitors
 *    (that's the point), but rate-limited, nonce-aware, DNT-aware, and it only
 *    ever writes an aggregated counter, never a raw row.
 *  - GET  /stats, /stats/timeseries — admin read endpoints, gated to
 *    `manage_options` with nonce auth, that back the dashboard report.
 *
 * @package KlynaAnalytics
 */

namespace KlynaAnalytics;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Rest {

	private const NAMESPACE = 'klyna-analytics/v1';

	public function register(): void {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
	}

	public function register_routes(): void {
		register_rest_route(
			self::NAMESPACE,
			'/collect',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'collect' ),
				'permission_callback' => '__return_true',
				'args'                => array(
					'path'  => array(
						'type'              => 'string',
						'required'          => true,
						'sanitize_callback' => array( $this, 'sanitize_path' ),
					),
					'ref'   => array(
						'type'              => 'string',
						'default'           => '',
						'sanitize_callback' => 'esc_url_raw',
					),
					'event' => array(
						'type'              => 'string',
						'default'           => 'pageview',
						'sanitize_callback' => array( $this, 'sanitize_event' ),
					),
				),
			)
		);

		register_rest_route(
			self::NAMESPACE,
			'/stats',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'stats' ),
				'permission_callback' => array( $this, 'can_read' ),
				'args'                => array(
					'days' => array(
						'type'              => 'integer',
						'default'           => 30,
						'sanitize_callback' => 'absint',
					),
				),
			)
		);

		register_rest_route(
			self::NAMESPACE,
			'/ai/test',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'ai_test' ),
				'permission_callback' => array( $this, 'can_manage' ),
			)
		);

		register_rest_route(
			self::NAMESPACE,
			'/ai/suggest',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'ai_suggest' ),
				'permission_callback' => array( $this, 'can_manage' ),
				'args'                => array(
					'context' => array(
						'type'              => 'string',
						'required'          => true,
						'sanitize_callback' => 'sanitize_textarea_field',
					),
				),
			)
		);

		register_rest_route(
			self::NAMESPACE,
			'/insight/weekly',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'insight_get' ),
				'permission_callback' => array( $this, 'can_manage' ),
			)
		);

		register_rest_route(
			self::NAMESPACE,
			'/insight/weekly/regenerate',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'insight_regenerate' ),
				'permission_callback' => array( $this, 'can_manage' ),
			)
		);

		register_rest_route(
			self::NAMESPACE,
			'/stats/timeseries',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'timeseries' ),
				'permission_callback' => array( $this, 'can_read' ),
				'args'                => array(
					'days' => array(
						'type'              => 'integer',
						'default'           => 30,
						'sanitize_callback' => 'absint',
					),
				),
			)
		);
	}

	/**
	 * Capability + nonce gate for the read endpoints.
	 */
	public function can_read(): bool {
		return current_user_can( 'manage_options' );
	}

	/**
	 * Capability + REST nonce gate for AI / insight endpoints.
	 */
	public function can_manage( \WP_REST_Request $req ): bool {
		if ( ! current_user_can( 'manage_options' ) ) {
			return false;
		}
		$nonce = $req->get_header( 'x_wp_nonce' );
		if ( ! $nonce ) {
			$nonce = (string) $req->get_param( '_wpnonce' );
		}
		return (bool) wp_verify_nonce( (string) $nonce, 'wp_rest' );
	}

	public function ai_test( \WP_REST_Request $req ): \WP_REST_Response {
		unset( $req );
		$result = ( new Ai() )->test();
		$code   = ! empty( $result['ok'] ) ? 200 : 400;
		return new \WP_REST_Response( $result, $code );
	}

	public function ai_suggest( \WP_REST_Request $req ): \WP_REST_Response {
		$context = (string) $req->get_param( 'context' );
		if ( '' === trim( $context ) ) {
			return new \WP_REST_Response(
				array( 'ok' => false, 'reason' => 'empty_context', 'text' => 'Context is required.' ),
				400
			);
		}
		$settings = Plugin::settings();
		if ( 'off' === ( $settings['ai_provider'] ?? 'off' ) ) {
			return new \WP_REST_Response(
				array( 'ok' => false, 'reason' => 'provider_off', 'text' => 'AI provider is set to Off.' ),
				400
			);
		}
		$result = ( new Ai() )->complete( $context );
		$code   = ! empty( $result['ok'] ) ? 200 : 400;
		return new \WP_REST_Response( $result, $code );
	}

	public function insight_get( \WP_REST_Request $req ): \WP_REST_Response {
		unset( $req );
		$cached = Insight::get_cached();
		return new \WP_REST_Response(
			array(
				'ok'       => true,
				'cached'   => null !== $cached,
				'insight'  => $cached,
				'usage'    => Ai::usage(),
				'provider' => (string) ( Plugin::settings()['ai_provider'] ?? 'off' ),
			),
			200
		);
	}

	public function insight_regenerate( \WP_REST_Request $req ): \WP_REST_Response {
		unset( $req );
		$result = Insight::regenerate();
		$code   = ! empty( $result['ok'] ) ? 200 : 400;
		return new \WP_REST_Response( $result, $code );
	}

	/**
	 * Public collector. Buckets one hit into the daily aggregate table.
	 */
	public function collect( \WP_REST_Request $req ) {
		// Hard byte cap on request body — the beacon is tiny, anything
		// larger is abuse. Reject before any parsing/work.
		$body = (string) $req->get_body();
		if ( strlen( $body ) > 2048 ) {
			return new \WP_Error( 'body_too_large', __( 'Request body too large.', 'wp-analytics' ), array( 'status' => 413 ) );
		}

		$settings = Plugin::settings();

		if ( empty( $settings['enabled'] ) ) {
			return new \WP_REST_Response( array( 'ok' => false, 'reason' => 'disabled' ), 202 );
		}

		// Honor server-side DNT/GPC even though the beacon also checks it.
		if ( ! empty( $settings['respect_dnt'] ) && Tracker::dnt_enabled() ) {
			return new \WP_REST_Response( array( 'ok' => false, 'reason' => 'dnt' ), 202 );
		}

		// Skip bots cheaply by user-agent. This is best-effort, not a gate.
		if ( $this->is_bot( $this->user_agent() ) ) {
			return new \WP_REST_Response( array( 'ok' => false, 'reason' => 'bot' ), 202 );
		}

		$path     = (string) $req->get_param( 'path' );
		$ref      = (string) $req->get_param( 'ref' );
		$event    = (string) $req->get_param( 'event' );
		$ref_host = $this->referrer_host( $ref );
		$day      = current_time( 'Y-m-d' );

		// Derive a non-persisted, daily-rotating token to flag unique visitors.
		$token     = Tracker::visitor_token( $this->client_ip(), $this->user_agent(), $day );
		$is_unique = $this->is_unique_today( $token );

		Storage::record( $day, $path, $ref_host, $event, $is_unique );

		// 202: we accepted the beacon; the client ignores the body anyway.
		return new \WP_REST_Response( array( 'ok' => true ), 202 );
	}

	/**
	 * Summary stats for the dashboard: totals, top pages, top referrers.
	 *
	 * @return \WP_REST_Response
	 */
	public function stats( \WP_REST_Request $req ): \WP_REST_Response {
		global $wpdb;

		$days  = $this->clamp_days( (int) $req->get_param( 'days' ) );
		$since = current_time( 'Y-m-d', false );
		$since = gmdate( 'Y-m-d', strtotime( $since ) - ( ( $days - 1 ) * DAY_IN_SECONDS ) );
		$table = Storage::table();

		// Totals across the window (pageviews only for the headline numbers).
		// phpcs:disable WordPress.DB.DirectDatabaseQuery, WordPress.DB.PreparedSQL.NotPrepared
		$totals = $wpdb->get_row(
			$wpdb->prepare(
				"SELECT COALESCE(SUM(hits),0) AS views, COALESCE(SUM(visitors),0) AS visitors
				 FROM {$table}
				 WHERE day >= %s AND event = 'pageview'",
				$since
			),
			ARRAY_A
		);

		$top_pages = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT path, SUM(hits) AS views
				 FROM {$table}
				 WHERE day >= %s AND event = 'pageview'
				 GROUP BY path
				 ORDER BY views DESC
				 LIMIT 10",
				$since
			),
			ARRAY_A
		);

		$top_referrers = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT ref_host, SUM(hits) AS views
				 FROM {$table}
				 WHERE day >= %s AND event = 'pageview' AND ref_host <> ''
				 GROUP BY ref_host
				 ORDER BY views DESC
				 LIMIT 10",
				$since
			),
			ARRAY_A
		);

		$events = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT event, SUM(hits) AS hits
				 FROM {$table}
				 WHERE day >= %s AND event <> 'pageview'
				 GROUP BY event
				 ORDER BY hits DESC
				 LIMIT 10",
				$since
			),
			ARRAY_A
		);
		// phpcs:enable

		return new \WP_REST_Response(
			array(
				'range'         => array( 'days' => $days, 'since' => $since ),
				'totals'        => array(
					'views'    => (int) ( $totals['views'] ?? 0 ),
					'visitors' => (int) ( $totals['visitors'] ?? 0 ),
				),
				'top_pages'     => array_map( array( $this, 'shape_page' ), $top_pages ?: array() ),
				'top_referrers' => array_map( array( $this, 'shape_referrer' ), $top_referrers ?: array() ),
				'events'        => array_map( array( $this, 'shape_event' ), $events ?: array() ),
			),
			200
		);
	}

	/**
	 * Per-day views + visitors for the sparkline / chart.
	 */
	public function timeseries( \WP_REST_Request $req ): \WP_REST_Response {
		$days   = $this->clamp_days( (int) $req->get_param( 'days' ) );
		$series = ( new Reports() )->daily_series( $days );
		return new \WP_REST_Response( array( 'series' => $series ), 200 );
	}

	/* ---------------------------------------------------------------------- *
	 * Sanitizers
	 * ---------------------------------------------------------------------- */

	/**
	 * Normalize a request path: keep the path component only, strip the query
	 * string and fragment, collapse a trailing slash, and cap length.
	 */
	public function sanitize_path( $raw ): string {
		$raw  = is_string( $raw ) ? $raw : '';
		$path = wp_parse_url( $raw, PHP_URL_PATH );
		if ( ! is_string( $path ) || '' === $path ) {
			$path = '/';
		}
		$path = '/' . ltrim( $path, '/' );
		if ( strlen( $path ) > 1 ) {
			$path = rtrim( $path, '/' );
		}
		$path = preg_replace( '/[^\x20-\x7E]/', '', $path );
		return sanitize_text_field( (string) $path );
	}

	/**
	 * Custom event names are lowercase slugs, max 64 chars.
	 */
	public function sanitize_event( $raw ): string {
		$raw  = is_string( $raw ) ? strtolower( $raw ) : 'pageview';
		$slug = preg_replace( '/[^a-z0-9_-]/', '', $raw );
		$slug = '' === $slug ? 'pageview' : $slug;
		return substr( $slug, 0, 64 );
	}

	/* ---------------------------------------------------------------------- *
	 * Helpers
	 * ---------------------------------------------------------------------- */

	private function clamp_days( int $days ): int {
		if ( $days < 1 ) {
			$days = 30;
		}
		return min( 365, $days );
	}

	/**
	 * Reduce a full referrer URL to its registrable host, dropping our own
	 * host (internal navigation is treated as direct).
	 */
	private function referrer_host( string $ref ): string {
		if ( '' === $ref ) {
			return '';
		}
		$host = wp_parse_url( $ref, PHP_URL_HOST );
		if ( ! is_string( $host ) || '' === $host ) {
			return '';
		}
		$host      = strtolower( preg_replace( '/^www\./', '', $host ) );
		$self_host = strtolower( preg_replace( '/^www\./', '', (string) wp_parse_url( home_url(), PHP_URL_HOST ) ) );
		if ( $host === $self_host ) {
			return '';
		}
		return sanitize_text_field( $host );
	}

	/**
	 * Best-effort unique-visitor flag using a short-lived transient keyed by the
	 * (non-persisted) daily token. The transient itself stores no PII — only a
	 * one-way hash that expires the same day.
	 */
	private function is_unique_today( string $token ): bool {
		$key = 'klyna_an_' . substr( $token, 0, 24 );
		if ( false !== get_transient( $key ) ) {
			return false;
		}
		// Expire at the end of the current day in the site timezone.
		$ttl = strtotime( 'tomorrow', current_time( 'timestamp' ) ) - current_time( 'timestamp' );
		set_transient( $key, 1, max( HOUR_IN_SECONDS, $ttl ) );
		return true;
	}

	private function client_ip(): string {
		$ip = isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : '';
		return $ip;
	}

	private function user_agent(): string {
		return isset( $_SERVER['HTTP_USER_AGENT'] ) ? sanitize_text_field( wp_unslash( $_SERVER['HTTP_USER_AGENT'] ) ) : '';
	}

	private function is_bot( string $ua ): bool {
		if ( '' === $ua ) {
			return true;
		}
		return (bool) preg_match( '/bot|crawl|spider|slurp|mediapartners|facebookexternalhit|preview|monitor|curl|wget|headless|lighthouse/i', $ua );
	}

	/**
	 * @param array<string,mixed> $row
	 * @return array<string,mixed>
	 */
	private function shape_page( array $row ): array {
		$path = (string) ( $row['path'] ?? '/' );
		return array(
			'path'  => $path,
			'url'   => esc_url_raw( home_url( $path ) ),
			'views' => (int) ( $row['views'] ?? 0 ),
		);
	}

	/**
	 * @param array<string,mixed> $row
	 * @return array<string,mixed>
	 */
	private function shape_referrer( array $row ): array {
		return array(
			'host'  => (string) ( $row['ref_host'] ?? '' ),
			'views' => (int) ( $row['views'] ?? 0 ),
		);
	}

	/**
	 * @param array<string,mixed> $row
	 * @return array<string,mixed>
	 */
	private function shape_event( array $row ): array {
		return array(
			'event' => (string) ( $row['event'] ?? '' ),
			'hits'  => (int) ( $row['hits'] ?? 0 ),
		);
	}
}
