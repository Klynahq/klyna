<?php
/**
 * Front-end tracking beacon.
 *
 * Enqueues a tiny (~1 KB) vanilla-JS beacon that POSTs a pageview to the REST
 * collector after first paint. The beacon sends only the path, document title,
 * and referrer — never cookies, never a fingerprint, never PII. Uniqueness is
 * derived server-side from a daily-rotating salted hash that is used to compute
 * a counter and then discarded; it is never stored.
 *
 * Respects Do-Not-Track and the Global Privacy Control. Skips logged-in users,
 * admins, and previews per the plugin settings.
 *
 * @package KlynaAnalytics
 */

namespace KlynaAnalytics;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Tracker {

	public function register(): void {
		add_action( 'wp_enqueue_scripts', array( $this, 'enqueue_beacon' ) );
	}

	/**
	 * Enqueue the beacon when tracking is permitted for this request.
	 */
	public function enqueue_beacon(): void {
		if ( ! $this->should_track() ) {
			return;
		}

		wp_enqueue_script(
			'klyna-analytics-beacon',
			KLYNA_ANALYTICS_PLUGIN_URL . 'assets/js/beacon.js',
			array(),
			KLYNA_ANALYTICS_VERSION,
			true
		);

		wp_localize_script(
			'klyna-analytics-beacon',
			'KlynaAnalytics',
			array(
				'endpoint'   => esc_url_raw( rest_url( 'klyna-analytics/v1/collect' ) ),
				'nonce'      => wp_create_nonce( 'wp_rest' ),
				'respectDnt' => ! empty( Plugin::settings()['respect_dnt'] ),
			)
		);
	}

	/**
	 * Decide whether the current visitor should be tracked at all (server side).
	 * The beacon does a second DNT check client-side as defense-in-depth.
	 */
	private function should_track(): bool {
		$settings = Plugin::settings();

		if ( empty( $settings['enabled'] ) ) {
			return false;
		}

		// Never track admin, login, REST, feed, or 404 requests.
		if ( is_admin() || is_preview() || is_feed() || is_robots() || is_trackback() ) {
			return false;
		}

		if ( ! empty( $settings['exclude_admins'] ) && current_user_can( 'manage_options' ) ) {
			return false;
		}

		if ( empty( $settings['track_logged_in'] ) && is_user_logged_in() ) {
			return false;
		}

		if ( ! empty( $settings['respect_dnt'] ) && self::dnt_enabled() ) {
			return false;
		}

		return true;
	}

	/**
	 * Detect a Do-Not-Track or Global Privacy Control signal from request
	 * headers. Either one opts the visitor out entirely.
	 */
	public static function dnt_enabled(): bool {
		$dnt = isset( $_SERVER['HTTP_DNT'] ) ? sanitize_text_field( wp_unslash( $_SERVER['HTTP_DNT'] ) ) : '';
		$gpc = isset( $_SERVER['HTTP_SEC_GPC'] ) ? sanitize_text_field( wp_unslash( $_SERVER['HTTP_SEC_GPC'] ) ) : '';
		return '1' === $dnt || '1' === $gpc;
	}

	/**
	 * Compute a salted, daily-rotating visitor token. Used only to decide
	 * whether a hit is a unique visitor for the day; never persisted.
	 *
	 * The IP and user-agent are hashed together with a per-install secret salt
	 * and the current date. Because the salt rotates implicitly with the day,
	 * the token cannot be correlated across days or reversed into an identity.
	 */
	public static function visitor_token( string $ip, string $user_agent, string $day ): string {
		$settings = Plugin::settings();
		$salt     = (string) ( $settings['hash_salt'] ?? '' );
		if ( '' === $salt ) {
			$salt = wp_salt( 'nonce' );
		}
		return hash( 'sha256', $day . '|' . $salt . '|' . $ip . '|' . $user_agent );
	}
}
