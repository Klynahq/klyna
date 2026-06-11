<?php
/**
 * Klyna Redirects — REST API.
 *
 * Endpoints (all require manage_options + nonce):
 *  - POST /wp-redirects/v1/ai/test     Test AI provider credentials.
 *  - POST /wp-redirects/v1/ai/suggest  Suggest a redirect target for a 404 URL.
 *
 * @package KlynaRedirects
 */

namespace KlynaRedirects;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Rest {

	const NS = 'wp-redirects/v1';

	public function register(): void {
		add_action( 'rest_api_init', array( $this, 'routes' ) );
	}

	public function routes(): void {
		register_rest_route(
			self::NS,
			'/ai/test',
			array(
				'methods'             => 'POST',
				'permission_callback' => array( $this, 'permissions' ),
				'callback'            => array( $this, 'ai_test' ),
			)
		);
		register_rest_route(
			self::NS,
			'/ai/suggest',
			array(
				'methods'             => 'POST',
				'permission_callback' => array( $this, 'permissions' ),
				'callback'            => array( $this, 'ai_suggest' ),
			)
		);
	}

	public function permissions( \WP_REST_Request $request ): bool {
		if ( ! current_user_can( 'manage_options' ) ) {
			return false;
		}
		$nonce = $request->get_header( 'x_wp_nonce' );
		return (bool) wp_verify_nonce( $nonce, 'wp_rest' );
	}

	public function ai_test( \WP_REST_Request $request ): \WP_REST_Response {
		$ai     = new Ai();
		$result = $ai->complete( 'Reply with the single word: ok' );
		return new \WP_REST_Response( $result, 200 );
	}

	public function ai_suggest( \WP_REST_Request $request ): \WP_REST_Response {
		$url = esc_url_raw( (string) $request->get_param( 'url' ) );
		if ( '' === $url ) {
			return new \WP_REST_Response(
				array( 'ok' => false, 'reason' => 'missing_url', 'text' => 'No URL supplied.' ),
				400
			);
		}

		$path = wp_parse_url( $url, PHP_URL_PATH );
		if ( ! is_string( $path ) || '' === $path ) {
			$path = $url;
		}

		// Collect a sample of 30 recent published URLs to give the AI candidate targets.
		$candidates = array();
		$posts      = get_posts(
			array(
				'numberposts' => 30,
				'post_status' => 'publish',
				'post_type'   => array( 'post', 'page' ),
				'orderby'     => 'date',
				'order'       => 'DESC',
			)
		);
		foreach ( $posts as $p ) {
			$link = wp_make_link_relative( get_permalink( $p ) );
			if ( $link ) {
				$candidates[] = sprintf(
					'- %s   (title: %s)',
					$link,
					wp_strip_all_tags( get_the_title( $p ) )
				);
			}
		}

		$prompt = "A visitor hit a 404 at this URL on our site:\n\n"
			. $path . "\n\n"
			. "Here are recently published pages on the site:\n\n"
			. implode( "\n", $candidates ) . "\n\n"
			. "Pick the single best candidate that the visitor most likely intended to reach. "
			. "Output ONLY the destination path (starting with /) and nothing else. "
			. "If no candidate is a close match, output exactly: NONE";

		$ai     = new Ai();
		$result = $ai->complete( $prompt, array( 'max_tokens' => 80, 'temperature' => 0.2 ) );

		if ( ! empty( $result['ok'] ) ) {
			$text = trim( (string) $result['text'] );
			// Strip stray quotes / trailing punctuation the model may have added.
			$text = trim( $text, " \t\n\r\0\x0B\"'`.," );
			$result['text'] = $text;
			$result['none'] = ( 'NONE' === strtoupper( $text ) || '' === $text );
		}
		return new \WP_REST_Response( $result, 200 );
	}
}
