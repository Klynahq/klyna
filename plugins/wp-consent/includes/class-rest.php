<?php
/**
 * REST endpoint — wp-consent/v1.
 *
 * GET  /wp-consent/v1/settings — returns current config (manage_options).
 *
 * @package KlynaConsent
 */

namespace KlynaConsent;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

use WP_REST_Server;
use WP_REST_Request;
use WP_REST_Response;
use WP_Error;

/**
 * Registers and handles REST endpoints for Klyna Consent.
 */
final class Rest {

	private const NAMESPACE = 'wp-consent/v1';

	public function register_routes(): void {
		register_rest_route(
			self::NAMESPACE,
			'/settings',
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( $this, 'get_settings' ),
					'permission_callback' => array( $this, 'manage_options_permission' ),
				),
				array(
					'methods'             => WP_REST_Server::EDITABLE,
					'callback'            => array( $this, 'update_settings' ),
					'permission_callback' => array( $this, 'manage_options_permission' ),
					'args'                => $this->settings_schema(),
				),
			)
		);
	}

	/**
	 * Permission callback — requires manage_options capability.
	 */
	public function manage_options_permission(): bool {
		return current_user_can( 'manage_options' );
	}

	/**
	 * GET /wp-consent/v1/settings
	 *
	 * @param WP_REST_Request $request
	 * @return WP_REST_Response
	 */
	public function get_settings( WP_REST_Request $request ): WP_REST_Response {
		$settings = Plugin::settings();
		return new WP_REST_Response( $settings, 200 );
	}

	/**
	 * PATCH /wp-consent/v1/settings
	 *
	 * @param WP_REST_Request $request
	 * @return WP_REST_Response|WP_Error
	 */
	public function update_settings( WP_REST_Request $request ) {
		$params   = $request->get_json_params();
		if ( ! is_array( $params ) ) {
			return new WP_Error( 'invalid_payload', __( 'Request body must be a JSON object.', 'wp-consent' ), array( 'status' => 400 ) );
		}

		$current  = Plugin::settings();
		$merged   = array_merge( $current, $params );
		$clean    = $this->sanitize_rest_input( $merged );

		update_option( KLYNA_CONSENT_OPTION_KEY, $clean );

		return new WP_REST_Response( $clean, 200 );
	}

	/**
	 * Sanitize incoming REST payload.
	 *
	 * @param array<string,mixed> $input
	 * @return array<string,mixed>
	 */
	private function sanitize_rest_input( array $input ): array {
		$out = array();

		$text_fields = array( 'banner_text', 'accept_label', 'reject_label', 'manage_label' );
		foreach ( $text_fields as $k ) {
			if ( isset( $input[ $k ] ) ) {
				$out[ $k ] = sanitize_textarea_field( (string) $input[ $k ] );
			}
		}

		$out['position'] = isset( $input['position'] ) && $input['position'] === 'top' ? 'top' : 'bottom';

		$color_fields = array( 'bg_color', 'text_color', 'accent_color' );
		foreach ( $color_fields as $k ) {
			$raw       = isset( $input[ $k ] ) ? sanitize_hex_color( (string) $input[ $k ] ) : '';
			$out[ $k ] = $raw ?: '#1a1a23';
		}

		$bool_fields = array(
			'enable_analytics',
			'enable_marketing',
			'enable_preferences',
			'google_consent_mode',
			'geo_restrict',
			'cookie_settings_link',
		);
		foreach ( $bool_fields as $k ) {
			if ( array_key_exists( $k, $input ) ) {
				$out[ $k ] = (bool) $input[ $k ];
			}
		}

		return $out;
	}

	/**
	 * REST arg schema for the update endpoint.
	 *
	 * @return array<string,array<string,mixed>>
	 */
	private function settings_schema(): array {
		return array(
			'banner_text'          => array( 'type' => 'string', 'required' => false ),
			'accept_label'         => array( 'type' => 'string', 'required' => false ),
			'reject_label'         => array( 'type' => 'string', 'required' => false ),
			'manage_label'         => array( 'type' => 'string', 'required' => false ),
			'position'             => array( 'type' => 'string', 'enum' => array( 'top', 'bottom' ), 'required' => false ),
			'bg_color'             => array( 'type' => 'string', 'required' => false ),
			'text_color'           => array( 'type' => 'string', 'required' => false ),
			'accent_color'         => array( 'type' => 'string', 'required' => false ),
			'enable_analytics'     => array( 'type' => 'boolean', 'required' => false ),
			'enable_marketing'     => array( 'type' => 'boolean', 'required' => false ),
			'enable_preferences'   => array( 'type' => 'boolean', 'required' => false ),
			'google_consent_mode'  => array( 'type' => 'boolean', 'required' => false ),
			'geo_restrict'         => array( 'type' => 'boolean', 'required' => false ),
			'cookie_settings_link' => array( 'type' => 'boolean', 'required' => false ),
		);
	}
}
