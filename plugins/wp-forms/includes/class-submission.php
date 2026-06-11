<?php
/**
 * Submission pipeline — validates, spam-checks, stores, and notifies.
 *
 * Exposes a REST route `POST /klyna-forms/v1/submit`. The flow:
 *  1. nonce + form existence check
 *  2. spam gate — honeypot + time-trap (both silently 200 to not tip off bots)
 *  3. per-field validation (required, type)
 *  4. store the entry (if storage enabled)
 *  5. email the admin recipient(s)
 *  6. return success payload telling the JS to show a message or redirect
 *
 * @package KlynaForms
 */

namespace KlynaForms;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Submission {

	public function register(): void {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
	}

	public function register_routes(): void {
		register_rest_route(
			'klyna-forms/v1',
			'/submit',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'handle' ),
				// Public endpoint by design (front-end visitors submit). The nonce
				// + spam gates provide the protection, not a capability check.
				'permission_callback' => '__return_true',
				'args'                => array(
					'form_id' => array(
						'type'     => 'integer',
						'required' => true,
					),
				),
			)
		);
	}

	/**
	 * Handle a submission request.
	 */
	public function handle( \WP_REST_Request $request ): \WP_REST_Response {
		$form_id = (int) $request->get_param( 'form_id' );
		$post    = $form_id ? get_post( $form_id ) : null;

		if ( ! $post || KLYNA_FORMS_POST_TYPE !== $post->post_type || 'publish' !== $post->post_status ) {
			return $this->fail( __( 'This form is no longer available.', 'wp-forms' ), 404 );
		}

		// Nonce check — bound to the specific form.
		$nonce = (string) $request->get_param( '_klyna_nonce' );
		if ( ! wp_verify_nonce( $nonce, 'klyna_form_submit_' . $form_id ) ) {
			return $this->fail( __( 'Security check failed. Please reload the page and try again.', 'wp-forms' ), 403 );
		}

		// Spam gate. On a hit we pretend success so bots stop retrying.
		if ( $this->is_spam( $request ) ) {
			return $this->success_response( $form_id, true );
		}

		$fields = Forms::get_fields( $form_id );
		$raw    = $request->get_param( 'fields' );
		$raw    = is_array( $raw ) ? $raw : array();

		$validation = $this->validate( $fields, $raw );
		if ( ! empty( $validation['errors'] ) ) {
			$response = new \WP_REST_Response(
				array(
					'success' => false,
					'message' => __( 'Please fix the highlighted fields.', 'wp-forms' ),
					'errors'  => $validation['errors'],
				),
				422
			);
			return $response;
		}

		$values = $validation['values'];

		// Store.
		$entry_id = 0;
		if ( Plugin::setting( 'store_entries', true ) ) {
			$entry_id = Entries::insert( $form_id, $values, $this->request_meta( $request ) );
		}

		// Notify.
		$this->notify( $form_id, $post->post_title, $values );

		/**
		 * Fires after a submission is accepted and stored.
		 *
		 * @param int                 $form_id  Form post ID.
		 * @param array<string,mixed> $values   Sanitized field values.
		 * @param int                 $entry_id New entry ID (0 if storage disabled).
		 */
		do_action( 'klyna_forms_submission', $form_id, $values, $entry_id );

		return $this->success_response( $form_id, false );
	}

	/**
	 * Spam detection: honeypot + time-trap.
	 */
	private function is_spam( \WP_REST_Request $request ): bool {
		// Honeypot — must be empty.
		if ( Plugin::setting( 'honeypot_enabled', true ) ) {
			$hp = (string) $request->get_param( Render::HONEYPOT );
			if ( '' !== trim( $hp ) ) {
				return true;
			}
		}

		// Time-trap — a real human takes at least N seconds to fill a form.
		if ( Plugin::setting( 'time_trap_enabled', true ) ) {
			$min       = (int) Plugin::setting( 'time_trap_seconds', 3 );
			$rendered  = (int) $request->get_param( Render::TIMESTAMP );
			$elapsed   = time() - $rendered;
			// Reject impossibly fast submits or a missing/garbage timestamp.
			if ( $rendered <= 0 || $elapsed < $min ) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Validate raw values against field definitions.
	 *
	 * @param array<int, array<string,mixed>> $fields Field definitions.
	 * @param array<string,mixed>             $raw    Raw submitted values.
	 * @return array{values: array<string,mixed>, errors: array<string,string>}
	 */
	private function validate( array $fields, array $raw ): array {
		$values = array();
		$errors = array();

		foreach ( $fields as $field ) {
			$key   = (string) $field['key'];
			$type  = (string) $field['type'];
			$label = (string) $field['label'];
			$req   = ! empty( $field['required'] );
			$input = $raw[ $key ] ?? '';

			$clean = $this->sanitize_value( $type, $input );

			if ( $req && $this->is_empty_value( $clean ) ) {
				$errors[ $key ] = sprintf(
					/* translators: %s: field label */
					__( '%s is required.', 'wp-forms' ),
					$label
				);
				continue;
			}

			if ( ! $this->is_empty_value( $clean ) ) {
				$type_error = $this->type_error( $type, $clean, $label );
				if ( $type_error ) {
					$errors[ $key ] = $type_error;
					continue;
				}
			}

			$values[ $key ] = $clean;
		}

		return array(
			'values' => $values,
			'errors' => $errors,
		);
	}

	/**
	 * Sanitize one value by field type.
	 *
	 * @param string $type  Field type.
	 * @param mixed  $input Raw value.
	 * @return mixed Scalar string or array (for multi-checkbox).
	 */
	private function sanitize_value( string $type, $input ) {
		if ( is_array( $input ) ) {
			return array_values( array_map( 'sanitize_text_field', array_map( 'strval', $input ) ) );
		}
		$input = (string) $input;
		return match ( $type ) {
			'email'    => sanitize_email( $input ),
			'url'      => esc_url_raw( $input ),
			'textarea' => sanitize_textarea_field( $input ),
			'number'   => preg_replace( '/[^0-9.\-]/', '', $input ),
			default    => sanitize_text_field( $input ),
		};
	}

	/**
	 * Type-specific validation error, or '' when valid.
	 *
	 * @param mixed $value Sanitized value.
	 */
	private function type_error( string $type, $value, string $label ): string {
		if ( 'email' === $type && ! is_email( (string) $value ) ) {
			return sprintf(
				/* translators: %s: field label */
				__( '%s must be a valid email address.', 'wp-forms' ),
				$label
			);
		}
		if ( 'url' === $type && '' === esc_url_raw( (string) $value ) ) {
			return sprintf(
				/* translators: %s: field label */
				__( '%s must be a valid URL.', 'wp-forms' ),
				$label
			);
		}
		if ( 'number' === $type && '' !== (string) $value && ! is_numeric( (string) $value ) ) {
			return sprintf(
				/* translators: %s: field label */
				__( '%s must be a number.', 'wp-forms' ),
				$label
			);
		}
		return '';
	}

	/**
	 * @param mixed $value Sanitized value.
	 */
	private function is_empty_value( $value ): bool {
		if ( is_array( $value ) ) {
			return 0 === count( $value );
		}
		return '' === trim( (string) $value );
	}

	/**
	 * Email the form's recipient(s) about a new submission.
	 *
	 * @param int                 $form_id    Form post ID.
	 * @param string              $form_title Form title.
	 * @param array<string,mixed> $values     Sanitized values.
	 */
	private function notify( int $form_id, string $form_title, array $values ): void {
		if ( ! Plugin::setting( 'notify_enabled', true ) ) {
			return;
		}

		$config = Forms::get_config( $form_id );
		$to     = $config['notify_to'] ?: (string) Plugin::setting( 'notify_to', get_option( 'admin_email' ) );
		$to     = Forms::sanitize_recipient_list( $to );
		if ( '' === $to ) {
			return;
		}

		$subject_tpl = (string) Plugin::setting( 'notify_subject', __( 'New form submission: {form_title}', 'wp-forms' ) );
		$subject     = str_replace( '{form_title}', $form_title, $subject_tpl );
		$subject     = wp_specialchars_decode( $subject, ENT_QUOTES );

		$fields = Forms::get_fields( $form_id );
		$labels = wp_list_pluck( $fields, 'label', 'key' );

		$lines = array();
		$lines[] = sprintf(
			/* translators: %s: form title */
			__( 'New submission for "%s".', 'wp-forms' ),
			$form_title
		);
		$lines[] = '';
		foreach ( $values as $key => $value ) {
			$label = $labels[ $key ] ?? $key;
			$shown = is_array( $value ) ? implode( ', ', $value ) : (string) $value;
			$lines[] = $label . ': ' . $shown;
		}
		$lines[] = '';
		$lines[] = sprintf(
			/* translators: %s: admin entries URL */
			__( 'View all entries: %s', 'wp-forms' ),
			admin_url( 'admin.php?page=wp-forms-entries&form_id=' . $form_id )
		);

		$from_name  = sanitize_text_field( (string) Plugin::setting( 'from_name', get_bloginfo( 'name' ) ) );
		$from_email = sanitize_email( (string) Plugin::setting( 'from_email', get_option( 'admin_email' ) ) );
		$headers    = array();
		if ( $from_name && $from_email && is_email( $from_email ) ) {
			$headers[] = sprintf( 'From: %s <%s>', $from_name, $from_email );
		}

		// Reply-To the submitter when the form has an email field.
		$reply_to = $this->guess_reply_to( $fields, $values );
		if ( $reply_to ) {
			$headers[] = 'Reply-To: ' . $reply_to;
		}

		wp_mail( $to, $subject, implode( "\n", $lines ), $headers );
	}

	/**
	 * Find the submitter's email (first email field) for the Reply-To header.
	 *
	 * @param array<int, array<string,mixed>> $fields Field definitions.
	 * @param array<string,mixed>             $values Sanitized values.
	 */
	private function guess_reply_to( array $fields, array $values ): string {
		foreach ( $fields as $field ) {
			if ( 'email' === $field['type'] ) {
				$candidate = (string) ( $values[ $field['key'] ] ?? '' );
				if ( $candidate && is_email( $candidate ) ) {
					return $candidate;
				}
			}
		}
		return '';
	}

	/**
	 * Build the per-request metadata (ip/ua/referer) honoring privacy settings.
	 *
	 * @return array<string,string>
	 */
	private function request_meta( \WP_REST_Request $request ): array {
		$ip = '';
		if ( Plugin::setting( 'store_ip', true ) && isset( $_SERVER['REMOTE_ADDR'] ) ) {
			$ip = sanitize_text_field( wp_unslash( (string) $_SERVER['REMOTE_ADDR'] ) );
		}
		$ua = isset( $_SERVER['HTTP_USER_AGENT'] )
			? sanitize_text_field( wp_unslash( (string) $_SERVER['HTTP_USER_AGENT'] ) )
			: '';
		$referer = (string) $request->get_header( 'referer' );

		return array(
			'ip'         => $ip,
			'user_agent' => $ua,
			'referer'    => esc_url_raw( $referer ),
		);
	}

	/**
	 * Success payload — tells the JS whether to show a message or redirect.
	 */
	private function success_response( int $form_id, bool $silent ): \WP_REST_Response {
		$config = Forms::get_config( $form_id );
		$body   = array(
			'success' => true,
			'action'  => $config['success_action'],
			'message' => wp_kses_post( $config['success_message'] ),
		);
		if ( 'redirect' === $config['success_action'] && ! empty( $config['redirect_url'] ) ) {
			$body['redirect'] = esc_url_raw( $config['redirect_url'] );
		}
		// `silent` lets the front-end optionally know a spam submit was swallowed
		// (it never is in practice — we present identical UX either way).
		$body['silent'] = $silent;
		return new \WP_REST_Response( $body, 200 );
	}

	private function fail( string $message, int $status ): \WP_REST_Response {
		return new \WP_REST_Response(
			array(
				'success' => false,
				'message' => $message,
			),
			$status
		);
	}
}
