<?php
/**
 * Public feed endpoint.
 *
 * Registers a rewrite rule so each feed is served from a clean public URL:
 *
 *   https://example.com/klyna-feed/google/?token=...   → Google Shopping XML
 *   https://example.com/klyna-feed/meta/?token=...      → Meta product CSV
 *
 * The token is a shared secret stored in settings; merchant pastes the full
 * URL into Google Merchant Center / Meta Commerce Manager. Output is served
 * straight from the cache table (Storage), regenerated lazily on a miss so the
 * very first hit still returns a valid feed.
 *
 * @package KlynaFeed
 */

namespace KlynaFeed;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Feed_Endpoint {

	private const QUERY_VAR = 'klyna_feed';

	public function register(): void {
		add_action( 'init', array( __CLASS__, 'add_rewrite_rules' ) );
		add_filter( 'query_vars', array( $this, 'add_query_var' ) );
		add_action( 'template_redirect', array( $this, 'maybe_serve' ) );
	}

	/**
	 * Register the rewrite rule. Static so the activation hook can call it
	 * before flushing rewrites.
	 */
	public static function add_rewrite_rules(): void {
		add_rewrite_rule(
			'^klyna-feed/(google|meta)/?$',
			'index.php?' . self::QUERY_VAR . '=$matches[1]',
			'top'
		);
	}

	/**
	 * @param string[] $vars
	 * @return string[]
	 */
	public function add_query_var( array $vars ): array {
		$vars[] = self::QUERY_VAR;
		return $vars;
	}

	/**
	 * Serve the requested feed when our query var is present.
	 */
	public function maybe_serve(): void {
		$format = get_query_var( self::QUERY_VAR );
		if ( ! is_string( $format ) || '' === $format ) {
			return;
		}
		$format = sanitize_key( $format );
		if ( ! in_array( $format, array( 'google', 'meta' ), true ) ) {
			return;
		}

		$settings = Plugin::settings();
		$expected = isset( $settings['feed_token'] ) ? (string) $settings['feed_token'] : '';
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- public read-only endpoint, auth is the shared token.
		$provided = isset( $_GET['token'] ) ? sanitize_text_field( wp_unslash( $_GET['token'] ) ) : '';

		if ( '' === $expected || ! hash_equals( $expected, $provided ) ) {
			status_header( 403 );
			nocache_headers();
			header( 'Content-Type: text/plain; charset=utf-8' );
			echo esc_html__( 'Invalid or missing feed token.', 'wp-feed' );
			exit;
		}

		$enabled_key = 'google' === $format ? 'enable_google' : 'enable_meta';
		if ( empty( $settings[ $enabled_key ] ) ) {
			status_header( 404 );
			nocache_headers();
			header( 'Content-Type: text/plain; charset=utf-8' );
			echo esc_html__( 'This feed is disabled in settings.', 'wp-feed' );
			exit;
		}

		$row = Storage::get( $format );
		if ( ! $row || '' === (string) $row['payload'] ) {
			// Lazy generation on first hit / after a cache flush.
			( new Scheduler() )->regenerate();
			$row = Storage::get( $format );
		}

		$payload = $row ? (string) $row['payload'] : '';

		nocache_headers();
		if ( 'google' === $format ) {
			header( 'Content-Type: application/xml; charset=utf-8' );
		} else {
			header( 'Content-Type: text/csv; charset=utf-8' );
			header( 'Content-Disposition: inline; filename="klyna-meta-feed.csv"' );
		}
		header( 'X-Robots-Tag: noindex' );
		// Output is pre-escaped feed markup (XML/CSV); echo verbatim.
		echo $payload; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
		exit;
	}
}
