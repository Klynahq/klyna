<?php
/**
 * REST API — admin-only feed controls.
 *
 * Routes (namespace `klyna-feed/v1`, all gated to `manage_options` + nonce):
 *   POST /regenerate   — rebuild + cache every enabled feed, return fresh stats.
 *   GET  /health       — run validation and return item count + warnings.
 *   GET  /stats        — lightweight cached stats for the dashboard.
 *
 * @package KlynaFeed
 */

namespace KlynaFeed;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Rest {

	private const NAMESPACE = 'klyna-feed/v1';

	public function register(): void {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
	}

	public function register_routes(): void {
		register_rest_route(
			self::NAMESPACE,
			'/regenerate',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'regenerate' ),
				'permission_callback' => array( $this, 'can_manage' ),
			)
		);
		register_rest_route(
			self::NAMESPACE,
			'/health',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'health' ),
				'permission_callback' => array( $this, 'can_manage' ),
			)
		);
		register_rest_route(
			self::NAMESPACE,
			'/stats',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'stats' ),
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
					'prompt' => array( 'required' => true ),
				),
			)
		);
		register_rest_route(
			self::NAMESPACE,
			'/titles/optimize',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'optimize_title' ),
				'permission_callback' => array( $this, 'can_manage' ),
				'args'                => array(
					'product_id' => array( 'required' => true ),
				),
			)
		);
		register_rest_route(
			self::NAMESPACE,
			'/titles/save',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'save_titles' ),
				'permission_callback' => array( $this, 'can_manage' ),
			)
		);
	}

	/**
	 * Capability + nonce gate. The nonce is verified automatically by core for
	 * the `wp_rest` nonce passed via the X-WP-Nonce header.
	 */
	public function can_manage(): bool {
		return current_user_can( 'manage_options' );
	}

	/**
	 * POST /regenerate
	 */
	public function regenerate( \WP_REST_Request $request ): \WP_REST_Response {
		( new Scheduler() )->regenerate();
		return new \WP_REST_Response( $this->stats_payload(), 200 );
	}

	/**
	 * GET /health
	 */
	public function health( \WP_REST_Request $request ): \WP_REST_Response {
		if ( ! Plugin::woocommerce_active() ) {
			return new \WP_REST_Response(
				array(
					'woocommerce'   => false,
					'item_count'    => 0,
					'warning_count' => 0,
					'warnings'      => array(),
				),
				200
			);
		}
		$result = ( new Feed_Builder() )->health();
		return new \WP_REST_Response(
			array(
				'woocommerce'   => true,
				'item_count'    => $result['item_count'],
				'warning_count' => $result['warning_count'],
				'warnings'      => array_slice( $result['warnings'], 0, 200 ),
			),
			200
		);
	}

	/**
	 * GET /stats
	 */
	public function stats( \WP_REST_Request $request ): \WP_REST_Response {
		return new \WP_REST_Response( $this->stats_payload(), 200 );
	}

	/**
	 * POST /ai/test — fire a one-token prompt to verify the configured provider works.
	 */
	public function ai_test( \WP_REST_Request $request ): \WP_REST_Response {
		$settings = Plugin::settings();
		if ( empty( $settings['ai_provider'] ) ) {
			return new \WP_REST_Response(
				array( 'ok' => false, 'reason' => 'disabled', 'text' => 'AI is disabled. Pick a provider in Settings.' ),
				200
			);
		}
		$result = ( new Ai() )->complete(
			'Reply with the single word: ok',
			array( 'max_tokens' => 8, 'temperature' => 0.0 )
		);
		return new \WP_REST_Response( $result, 200 );
	}

	/**
	 * POST /ai/suggest — generic text completion for any UI that wants it.
	 */
	public function ai_suggest( \WP_REST_Request $request ): \WP_REST_Response {
		$prompt = sanitize_textarea_field( (string) $request->get_param( 'prompt' ) );
		if ( '' === $prompt ) {
			return new \WP_REST_Response(
				array( 'ok' => false, 'reason' => 'empty_prompt', 'text' => '' ),
				200
			);
		}
		$opts = array();
		if ( null !== $request->get_param( 'max_tokens' ) ) {
			$opts['max_tokens'] = max( 16, min( 2000, (int) $request->get_param( 'max_tokens' ) ) );
		}
		$result = ( new Ai() )->complete( $prompt, $opts );
		return new \WP_REST_Response( $result, 200 );
	}

	/**
	 * POST /titles/optimize — for one product, generate three per-channel
	 * titles and persist them. Client iterates the selection.
	 */
	public function optimize_title( \WP_REST_Request $request ): \WP_REST_Response {
		$product_id = absint( $request->get_param( 'product_id' ) );
		if ( ! $product_id || ! Plugin::woocommerce_active() ) {
			return new \WP_REST_Response(
				array( 'ok' => false, 'reason' => 'invalid_product', 'variants' => array() ),
				200
			);
		}
		$product = wc_get_product( $product_id );
		if ( ! $product instanceof \WC_Product ) {
			return new \WP_REST_Response(
				array( 'ok' => false, 'reason' => 'not_found', 'variants' => array() ),
				200
			);
		}

		$settings = Plugin::settings();
		if ( empty( $settings['ai_provider'] ) ) {
			return new \WP_REST_Response(
				array( 'ok' => false, 'reason' => 'ai_disabled', 'variants' => array() ),
				200
			);
		}

		$ai           = new Ai();
		$brand        = (string) get_post_meta( $product_id, (string) ( $settings['brand_meta_key'] ?? '_brand' ), true );
		if ( '' === $brand ) {
			$brand = (string) ( $settings['default_brand'] ?? '' );
		}
		$category_terms = get_the_term_list( $product_id, 'product_cat', '', ' > ', '' );
		$category       = is_string( $category_terms ) ? wp_strip_all_tags( $category_terms ) : '';
		$description    = (string) $product->get_short_description();
		if ( '' === $description ) {
			$description = (string) $product->get_description();
		}
		$original = (string) $product->get_name();

		$variants  = array();
		$first_err = '';
		foreach ( array_keys( Titles::channels() ) as $channel ) {
			$prompt = Titles::prompt( $channel, $original, $brand, $category, $description );
			$res    = $ai->complete( $prompt, array( 'max_tokens' => 80, 'temperature' => 0.7 ) );
			if ( empty( $res['ok'] ) ) {
				if ( '' === $first_err ) {
					$first_err = (string) ( $res['reason'] ?? 'error' );
				}
				$variants[ $channel ] = '';
				continue;
			}
			$line                 = trim( (string) $res['text'] );
			// AI sometimes wraps output in quotes; strip them.
			$line                 = trim( $line, "\"' \n\r\t" );
			$variants[ $channel ] = Titles::trim_to( $line, Titles::channels()[ $channel ]['max'] );
		}

		Titles::save( $product_id, $variants );

		return new \WP_REST_Response(
			array(
				'ok'         => '' === $first_err,
				'reason'     => $first_err,
				'product_id' => $product_id,
				'variants'   => $variants,
			),
			200
		);
	}

	/**
	 * POST /titles/save — manual override save from the preview UI.
	 */
	public function save_titles( \WP_REST_Request $request ): \WP_REST_Response {
		$product_id = absint( $request->get_param( 'product_id' ) );
		if ( ! $product_id ) {
			return new \WP_REST_Response( array( 'ok' => false, 'reason' => 'invalid_product' ), 200 );
		}
		$raw_variants = $request->get_param( 'variants' );
		if ( ! is_array( $raw_variants ) ) {
			return new \WP_REST_Response( array( 'ok' => false, 'reason' => 'invalid_variants' ), 200 );
		}
		$clean = array();
		foreach ( Titles::channels() as $ch => $cfg ) {
			if ( array_key_exists( $ch, $raw_variants ) ) {
				$clean[ $ch ] = sanitize_text_field( (string) $raw_variants[ $ch ] );
			}
		}
		Titles::save( $product_id, $clean );
		return new \WP_REST_Response(
			array( 'ok' => true, 'variants' => Titles::get( $product_id ) ),
			200
		);
	}

	/**
	 * Build the shared stats payload for the dashboard.
	 *
	 * @return array<string,mixed>
	 */
	private function stats_payload(): array {
		return array(
			'woocommerce' => Plugin::woocommerce_active(),
			'last_run'    => Scheduler::last_run(),
			'feeds'       => Storage::all_stats(),
			'urls'        => array(
				'google' => Plugin::feed_url( 'google' ),
				'meta'   => Plugin::feed_url( 'meta' ),
			),
		);
	}
}
