<?php
/**
 * Admin-only REST endpoints for AI features and auto-reply management.
 *
 * Namespace: klyna-forms/v1
 *  - POST /ai/test                Connectivity test for current AI provider.
 *  - POST /ai/suggest             Generate text for an arbitrary prompt.
 *  - POST /replies/(?P<id>\d+)    Update a draft reply (subject + body + to).
 *  - POST /replies/(?P<id>\d+)/send  Send the stored draft via wp_mail and mark sent.
 *  - POST /replies/generate       Generate a draft for an existing entry.
 *
 * All endpoints require manage_options and a valid wp_rest nonce.
 *
 * @package KlynaForms
 */

namespace KlynaForms;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Rest {

	private const NS = 'klyna-forms/v1';

	public function register(): void {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
	}

	public function register_routes(): void {
		register_rest_route(
			self::NS,
			'/ai/test',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'ai_test' ),
				'permission_callback' => array( $this, 'admin_only' ),
			)
		);
		register_rest_route(
			self::NS,
			'/ai/suggest',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'ai_suggest' ),
				'permission_callback' => array( $this, 'admin_only' ),
				'args'                => array(
					'prompt' => array( 'type' => 'string', 'required' => true ),
				),
			)
		);
		register_rest_route(
			self::NS,
			'/replies/generate',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'reply_generate' ),
				'permission_callback' => array( $this, 'admin_only' ),
				'args'                => array(
					'entry_id' => array( 'type' => 'integer', 'required' => true ),
				),
			)
		);
		register_rest_route(
			self::NS,
			'/replies/(?P<id>\d+)',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'reply_update' ),
				'permission_callback' => array( $this, 'admin_only' ),
			)
		);
		register_rest_route(
			self::NS,
			'/replies/(?P<id>\d+)/send',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'reply_send' ),
				'permission_callback' => array( $this, 'admin_only' ),
			)
		);
	}

	/**
	 * Capability + nonce gate. The nonce is the standard wp_rest nonce
	 * (sent as X-WP-Nonce by wp.apiFetch).
	 */
	public function admin_only( \WP_REST_Request $request ) {
		if ( ! current_user_can( 'manage_options' ) ) {
			return new \WP_Error( 'forbidden', __( 'You are not allowed to do that.', 'wp-forms' ), array( 'status' => 403 ) );
		}
		$nonce = $request->get_header( 'x_wp_nonce' );
		if ( ! $nonce ) {
			$nonce = (string) $request->get_param( '_wpnonce' );
		}
		if ( ! $nonce || ! wp_verify_nonce( $nonce, 'wp_rest' ) ) {
			return new \WP_Error( 'bad_nonce', __( 'Security check failed.', 'wp-forms' ), array( 'status' => 403 ) );
		}
		return true;
	}

	public function ai_test( \WP_REST_Request $request ): \WP_REST_Response {
		$result = Ai::test();
		return new \WP_REST_Response( $result, ! empty( $result['ok'] ) ? 200 : 400 );
	}

	public function ai_suggest( \WP_REST_Request $request ): \WP_REST_Response {
		$prompt = sanitize_textarea_field( (string) $request->get_param( 'prompt' ) );
		if ( '' === $prompt ) {
			return new \WP_REST_Response( array( 'ok' => false, 'reason' => 'empty_prompt', 'text' => '' ), 400 );
		}
		$client = new Ai();
		$result = $client->complete( $prompt );
		return new \WP_REST_Response( $result, ! empty( $result['ok'] ) ? 200 : 400 );
	}

	public function reply_generate( \WP_REST_Request $request ): \WP_REST_Response {
		$entry_id = (int) $request->get_param( 'entry_id' );
		$entry    = $entry_id ? Entries::get( $entry_id ) : null;
		if ( ! $entry ) {
			return new \WP_REST_Response( array( 'ok' => false, 'reason' => 'entry_not_found' ), 404 );
		}
		$result = AutoReply::generate_for_entry( (int) $entry['form_id'], $entry );
		$status = ! empty( $result['ok'] ) ? 200 : 400;
		return new \WP_REST_Response( $result, $status );
	}

	public function reply_update( \WP_REST_Request $request ): \WP_REST_Response {
		$id = (int) $request['id'];
		$reply = Replies::get( $id );
		if ( ! $reply ) {
			return new \WP_REST_Response( array( 'ok' => false, 'reason' => 'reply_not_found' ), 404 );
		}
		$subject = sanitize_text_field( (string) $request->get_param( 'subject' ) );
		$body    = wp_kses_post( (string) $request->get_param( 'body' ) );
		$to      = sanitize_email( (string) $request->get_param( 'to_email' ) );
		Replies::update_draft( $id, $subject, $body, $to );
		return new \WP_REST_Response( array( 'ok' => true, 'reply' => Replies::get( $id ) ), 200 );
	}

	public function reply_send( \WP_REST_Request $request ): \WP_REST_Response {
		$id    = (int) $request['id'];
		$reply = Replies::get( $id );
		if ( ! $reply ) {
			return new \WP_REST_Response( array( 'ok' => false, 'reason' => 'reply_not_found' ), 404 );
		}
		if ( 'sent' === ( $reply['status'] ?? '' ) ) {
			return new \WP_REST_Response( array( 'ok' => false, 'reason' => 'already_sent' ), 409 );
		}
		$to      = sanitize_email( (string) $reply['to_email'] );
		$subject = sanitize_text_field( (string) $reply['subject'] );
		$body    = wp_strip_all_tags( (string) $reply['body'] );
		if ( ! $to || ! is_email( $to ) ) {
			return new \WP_REST_Response( array( 'ok' => false, 'reason' => 'invalid_recipient' ), 422 );
		}
		$from_name  = sanitize_text_field( (string) Plugin::setting( 'from_name', get_bloginfo( 'name' ) ) );
		$from_email = sanitize_email( (string) Plugin::setting( 'from_email', get_option( 'admin_email' ) ) );
		$headers    = array();
		if ( $from_name && $from_email && is_email( $from_email ) ) {
			$headers[] = sprintf( 'From: %s <%s>', $from_name, $from_email );
		}
		$sent = wp_mail( $to, $subject, $body, $headers );
		if ( $sent ) {
			Replies::mark_sent( $id );
		}
		return new \WP_REST_Response(
			array( 'ok' => (bool) $sent, 'reply' => Replies::get( $id ) ),
			$sent ? 200 : 500
		);
	}
}
