<?php
/**
 * REST API — cache stats + one-click purge.
 *
 * Routes live under the `klyna-speed/v1` namespace and require `manage_options`
 * plus a valid `wp_rest` nonce, mirroring the rest of the Klyna toolkit.
 *
 * @package KlynaSpeed
 */

namespace KlynaSpeed;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Rest {

	private const NAMESPACE = 'klyna-speed/v1';

	public function register(): void {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
	}

	public function register_routes(): void {
		register_rest_route(
			self::NAMESPACE,
			'/stats',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'get_stats' ),
				'permission_callback' => array( $this, 'can_manage' ),
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
					'urls' => array(
						'type'     => 'array',
						'required' => false,
						'items'    => array( 'type' => 'string' ),
					),
				),
			)
		);
		register_rest_route(
			self::NAMESPACE,
			'/ai/apply',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'ai_apply' ),
				'permission_callback' => array( $this, 'can_manage' ),
			)
		);
		register_rest_route(
			self::NAMESPACE,
			'/purge',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'purge' ),
				'permission_callback' => array( $this, 'can_manage' ),
				'args'                => array(
					'url' => array(
						'type'              => 'string',
						'required'          => false,
						'sanitize_callback' => 'esc_url_raw',
					),
				),
			)
		);
	}

	/**
	 * Capability + nonce gate for every route.
	 */
	public function can_manage(): bool {
		return current_user_can( 'manage_options' );
	}

	/**
	 * GET /stats — cached page count + disk footprint.
	 */
	public function get_stats( \WP_REST_Request $req ): \WP_REST_Response {
		$stats = Cache::stats();
		return new \WP_REST_Response(
			array(
				'files'      => $stats['files'],
				'bytes'      => $stats['bytes'],
				'human_size' => size_format( $stats['bytes'], 1 ),
				'enabled'    => (bool) Plugin::get( 'enable_page_cache', true ),
			),
			200
		);
	}

	/**
	 * POST /purge — clear one URL or the entire store.
	 */
	public function purge( \WP_REST_Request $req ): \WP_REST_Response {
		$url = (string) $req->get_param( 'url' );

		if ( '' !== $url ) {
			( new Cache() )->purge_url( $url );
			return new \WP_REST_Response(
				array(
					'purged'  => 'url',
					'url'     => esc_url_raw( $url ),
					'message' => __( 'Cleared the cache for that URL.', 'wp-speed' ),
				),
				200
			);
		}

		$removed = Cache::purge_all();
		return new \WP_REST_Response(
			array(
				'purged'  => 'all',
				'removed' => $removed,
				'message' => sprintf(
					/* translators: %d: number of cached pages removed. */
					_n( 'Purged %d cached page.', 'Purged %d cached pages.', $removed, 'wp-speed' ),
					$removed
				),
			),
			200
		);
	}

	/**
	 * POST /ai/test - ping the configured provider.
	 */
	public function ai_test( \WP_REST_Request $req ): \WP_REST_Response {
		$ai     = new Ai();
		$result = $ai->test();
		return new \WP_REST_Response( $result, 200 );
	}

	/**
	 * POST /ai/suggest - sample the given URLs, send telemetry to the AI,
	 * return JSON with skip[] + aggressive[] rules.
	 */
	public function ai_suggest( \WP_REST_Request $req ): \WP_REST_Response {
		$raw  = (array) $req->get_param( 'urls' );
		$urls = array();
		foreach ( $raw as $u ) {
			$u = esc_url_raw( (string) $u );
			if ( '' !== $u ) {
				$urls[] = $u;
			}
		}
		if ( ! $urls ) {
			$urls = array( home_url( '/' ) );
		}
		// Dedupe and cap to 5 to bound the number of HTTP requests.
		$urls = array_values( array_unique( $urls ) );
		$urls = array_slice( $urls, 0, 5 );

		$samples = array();
		foreach ( $urls as $u ) {
			$sample = $this->sample_url( $u );
			if ( is_wp_error( $sample ) ) {
				$samples[] = array(
					'url'   => $u,
					'kind'  => 'error',
					'ms'    => 0,
					'error' => $sample->get_error_message(),
				);
				continue;
			}
			$samples[] = $sample;
		}

		$prompt = $this->build_cache_prompt( $samples );

		$ai     = new Ai();
		$result = $ai->complete( $prompt, array( 'temperature' => 0.2, 'max_tokens' => 800 ) );
		if ( empty( $result['ok'] ) ) {
			return new \WP_REST_Response(
				array(
					'ok'     => false,
					'reason' => $result['reason'] ?? 'ai_error',
					'text'   => $result['text'] ?? __( 'AI call failed.', 'wp-speed' ),
				),
				200
			);
		}

		$parsed = $this->parse_suggestions( (string) $result['text'] );
		return new \WP_REST_Response(
			array(
				'ok'         => true,
				'skip'       => $parsed['skip'],
				'aggressive' => $parsed['aggressive'],
				'samples'    => $samples,
				'cached'     => ! empty( $result['cached'] ),
			),
			200
		);
	}

	/**
	 * POST /ai/apply - merge selected suggestions into the settings option.
	 *  skip[]       -> appended to exclude_urls.
	 *  aggressive[] -> the longest sane TTL among the proposals replaces
	 *                  cache_ttl_hours (capped at 720).
	 */
	public function ai_apply( \WP_REST_Request $req ): \WP_REST_Response {
		$skip = (array) $req->get_param( 'skip' );
		$agg  = (array) $req->get_param( 'aggressive' );

		$settings = wp_parse_args( Plugin::settings(), Plugin::defaults() );
		$existing = preg_split( "/\r\n|\r|\n/", (string) $settings['exclude_urls'] );
		$existing = array_filter( array_map( 'trim', (array) $existing ) );

		$added = 0;
		foreach ( $skip as $item ) {
			if ( ! is_array( $item ) ) { continue; }
			$pattern = isset( $item['pattern'] ) ? sanitize_text_field( (string) $item['pattern'] ) : '';
			if ( '' === $pattern ) { continue; }
			if ( ! in_array( $pattern, $existing, true ) ) {
				$existing[] = $pattern;
				$added++;
			}
		}
		$settings['exclude_urls'] = implode( "\n", $existing );

		$max_ttl = 0;
		foreach ( $agg as $item ) {
			if ( ! is_array( $item ) ) { continue; }
			$ttl = isset( $item['ttl_hours'] ) ? (int) $item['ttl_hours'] : 0;
			if ( $ttl > $max_ttl ) {
				$max_ttl = $ttl;
			}
		}
		if ( $max_ttl > 0 ) {
			$settings['cache_ttl_hours'] = max( 1, min( 720, $max_ttl ) );
		}

		update_option( KLYNA_SPEED_OPTION_KEY, $settings );

		return new \WP_REST_Response(
			array(
				'ok'         => true,
				'added_skip' => $added,
				'ttl_hours'  => (int) $settings['cache_ttl_hours'],
				'message'    => __( 'Applied AI suggestions.', 'wp-speed' ),
			),
			200
		);
	}

	/**
	 * SSRF guard: only allow https URLs whose resolved host is a public
	 * IP, and reject known cloud metadata endpoints.
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
			'instance-data.ec2.internal',
			'metadata',
			'localhost',
		);
		if ( in_array( $host, $blocked_hosts, true ) ) {
			return false;
		}

		// Resolve host. gethostbyname returns the host unchanged on failure.
		$ip = gethostbyname( $host );
		if ( $ip === $host && ! filter_var( $host, FILTER_VALIDATE_IP ) ) {
			return false;
		}

		// Try IPv4 first.
		if ( filter_var( $ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4 ) ) {
			$v4_ranges = array(
				array( '10.0.0.0',    8  ),
				array( '172.16.0.0',  12 ),
				array( '192.168.0.0', 16 ),
				array( '127.0.0.0',   8  ),
				array( '169.254.0.0', 16 ),
				array( '0.0.0.0',     8  ),
				array( '100.64.0.0',  10 ), // CGNAT / metadata 169.254 alt
				array( '224.0.0.0',   4  ), // multicast
				array( '240.0.0.0',   4  ), // reserved
			);
			$ip_bin = inet_pton( $ip );
			if ( false === $ip_bin ) {
				return false;
			}
			foreach ( $v4_ranges as $r ) {
				if ( self::ip_in_cidr_bin( $ip_bin, $r[0], $r[1] ) ) {
					return false;
				}
			}
			return true;
		}

		// IPv6
		if ( filter_var( $ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6 ) ) {
			if ( '::1' === $ip ) {
				return false;
			}
			$v6_ranges = array(
				array( 'fc00::', 7  ), // unique local
				array( 'fe80::', 10 ), // link local
				array( '::',     128 ), // unspecified (exact)
			);
			$ip_bin = inet_pton( $ip );
			if ( false === $ip_bin ) {
				return false;
			}
			foreach ( $v6_ranges as $r ) {
				if ( self::ip_in_cidr_bin( $ip_bin, $r[0], $r[1] ) ) {
					return false;
				}
			}
			return true;
		}

		return false;
	}

	/**
	 * Bitmask check: does $ip_bin (raw inet_pton bytes) sit inside
	 * $network/$prefix?
	 */
	private static function ip_in_cidr_bin( string $ip_bin, string $network, int $prefix ): bool {
		$net_bin = inet_pton( $network );
		if ( false === $net_bin || strlen( $net_bin ) !== strlen( $ip_bin ) ) {
			return false;
		}
		$bytes_full = intdiv( $prefix, 8 );
		$bits_rem   = $prefix % 8;
		if ( $bytes_full > 0 && 0 !== substr_compare( $ip_bin, $net_bin, 0, $bytes_full ) ) {
			return false;
		}
		if ( 0 === $bits_rem ) {
			return true;
		}
		$mask = chr( ( 0xff << ( 8 - $bits_rem ) ) & 0xff );
		return ( $ip_bin[ $bytes_full ] & $mask ) === ( $net_bin[ $bytes_full ] & $mask );
	}

	/**
	 * Fetch a URL and capture page kind + render time. Errors are returned
	 * inline so the AI can still reason about partial data.
	 *
	 * @return array<string,mixed>|\WP_Error
	 */
	private function sample_url( string $url ) {
		if ( ! self::is_safe_public_url( $url ) ) {
			return new \WP_Error(
				'klyna_speed_unsafe_url',
				__( 'Refusing to fetch a non-public or non-HTTPS URL.', 'wp-speed' )
			);
		}

		$start = microtime( true );
		$resp  = wp_remote_get(
			$url,
			array(
				'timeout'              => 5,
				'redirection'          => 2,
				'limit_response_size'  => 262144,
				'headers'              => array( 'User-Agent' => 'KlynaSpeed/1.0 (+https://klyna.dev)' ),
			)
		);
		$ms = (int) round( ( microtime( true ) - $start ) * 1000 );

		if ( is_wp_error( $resp ) ) {
			return array(
				'url'   => $url,
				'kind'  => 'error',
				'ms'    => $ms,
				'error' => $resp->get_error_message(),
			);
		}

		$code = (int) wp_remote_retrieve_response_code( $resp );
		$body = (string) wp_remote_retrieve_body( $resp );
		$len  = strlen( $body );
		$kind = $this->classify_url( $url, $body );

		return array(
			'url'    => $url,
			'kind'   => $kind,
			'ms'     => $ms,
			'status' => $code,
			'bytes'  => $len,
		);
	}

	/**
	 * Rough page-kind classifier for the AI prompt.
	 */
	private function classify_url( string $url, string $html ): string {
		$path = (string) wp_parse_url( $url, PHP_URL_PATH );
		$path = strtolower( $path );
		$dynamic_paths = array( '/cart', '/checkout', '/my-account', '/account', '/wp-admin', '/wp-login', '/?s=', '/search' );
		foreach ( $dynamic_paths as $needle ) {
			if ( false !== strpos( $url, $needle ) || ( '/' !== $needle && false !== strpos( $path, $needle ) ) ) {
				return 'dynamic';
			}
		}
		if ( '/' === $path || '' === $path ) {
			return 'home';
		}
		if ( false !== stripos( $html, 'rel="canonical"' ) && false !== stripos( $html, 'article' ) ) {
			return 'post';
		}
		return 'page';
	}

	/**
	 * Build the user prompt with sampled telemetry. Asks for strict JSON.
	 *
	 * @param array<int,array<string,mixed>> $samples
	 */
	private function build_cache_prompt( array $samples ): string {
		$lines = array();
		foreach ( $samples as $s ) {
			$lines[] = sprintf(
				'- url=%s kind=%s render_ms=%d bytes=%d status=%s',
				$s['url'],
				$s['kind'],
				(int) ( $s['ms'] ?? 0 ),
				(int) ( $s['bytes'] ?? 0 ),
				(string) ( $s['status'] ?? ( $s['error'] ?? 'n/a' ) )
			);
		}
		$telemetry = implode( "\n", $lines );

		return "You are tuning a WordPress full-page cache for a single site. "
			. "Given the page-load telemetry below, propose cache exclusion + aggressive-cache rules.\n\n"
			. "Telemetry:\n" . $telemetry . "\n\n"
			. "Reply with STRICT JSON ONLY, no prose, no code fences, matching this shape:\n"
			. "{\n"
			. "  \"skip\": [ { \"pattern\": \"/cart\", \"reason\": \"one sentence why\" } ],\n"
			. "  \"aggressive\": [ { \"pattern\": \"/blog/*\", \"ttl_hours\": 72, \"reason\": \"one sentence why\" } ]\n"
			. "}\n"
			. "Rules:\n"
			. "- skip[] are path patterns to NEVER cache (carts, checkouts, account, search, admin previews).\n"
			. "- aggressive[] are path patterns that are safe to cache longer; ttl_hours must be an integer 1-720.\n"
			. "- Each item must include a one-sentence reason.\n"
			. "- Use leading slashes; * is a wildcard. Do not invent paths that contradict the telemetry.";
	}

	/**
	 * Parse the AI JSON response defensively. Returns normalized arrays.
	 *
	 * @return array{skip:array<int,array<string,mixed>>,aggressive:array<int,array<string,mixed>>}
	 */
	private function parse_suggestions( string $text ): array {
		$text = trim( $text );
		// Strip code fences if a model adds them despite instructions.
		$text = preg_replace( '/^```(?:json)?\s*|\s*```$/im', '', $text );
		// Try to extract the first JSON object.
		if ( preg_match( '/\{[\s\S]*\}/', $text, $m ) ) {
			$text = $m[0];
		}
		$data = json_decode( $text, true );
		$out  = array( 'skip' => array(), 'aggressive' => array() );
		if ( ! is_array( $data ) ) {
			return $out;
		}
		foreach ( (array) ( $data['skip'] ?? array() ) as $item ) {
			if ( ! is_array( $item ) ) { continue; }
			$pattern = isset( $item['pattern'] ) ? sanitize_text_field( (string) $item['pattern'] ) : '';
			$reason  = isset( $item['reason'] ) ? sanitize_text_field( (string) $item['reason'] ) : '';
			if ( '' === $pattern ) { continue; }
			$out['skip'][] = array( 'pattern' => $pattern, 'reason' => $reason );
		}
		foreach ( (array) ( $data['aggressive'] ?? array() ) as $item ) {
			if ( ! is_array( $item ) ) { continue; }
			$pattern = isset( $item['pattern'] ) ? sanitize_text_field( (string) $item['pattern'] ) : '';
			$reason  = isset( $item['reason'] ) ? sanitize_text_field( (string) $item['reason'] ) : '';
			$ttl     = isset( $item['ttl_hours'] ) ? max( 1, min( 720, (int) $item['ttl_hours'] ) ) : 24;
			if ( '' === $pattern ) { continue; }
			$out['aggressive'][] = array( 'pattern' => $pattern, 'ttl_hours' => $ttl, 'reason' => $reason );
		}
		return $out;
	}
}
