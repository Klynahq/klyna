<?php
/**
 * AI auto-reply orchestrator.
 *
 * Listens to the klyna_forms_submission action and, if the form has an
 * AI auto-reply panel enabled and AI is configured, builds a prompt and
 * stores the draft reply in the replies table. Never sends. Admins
 * review + send from the entries view.
 *
 * @package KlynaForms
 */

namespace KlynaForms;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Auto_Reply {

	public const META_ENABLED   = '_klyna_form_autoreply_enabled';
	public const META_INSTRUCTION = '_klyna_form_autoreply_instruction';
	public const META_SUBJECT   = '_klyna_form_autoreply_subject';

	public function register(): void {
		add_action( 'klyna_forms_submission', array( __CLASS__, 'maybe_generate' ), 20, 3 );
	}

	/**
	 * Hook callback. Skips silently when AI is off, the form opted out,
	 * or no entry id is available.
	 *
	 * @param int                 $form_id  Form post ID.
	 * @param array<string,mixed> $values   Sanitized values.
	 * @param int                 $entry_id Entry row id (0 when storage off).
	 */
	public static function maybe_generate( int $form_id, array $values, int $entry_id ): void {
		if ( ! $entry_id ) {
			return; // No persisted entry to attach a reply to.
		}
		if ( ! get_post_meta( $form_id, self::META_ENABLED, true ) ) {
			return;
		}
		$provider = (string) Plugin::setting( 'ai_provider', '' );
		if ( '' === $provider || 'off' === $provider ) {
			return;
		}
		$entry = Entries::get( $entry_id );
		if ( ! $entry ) {
			return;
		}
		self::generate_for_entry( $form_id, $entry );
	}

	/**
	 * Build a prompt, call the AI client, and store the draft. Returns
	 * the result array so REST callers can show feedback.
	 *
	 * @param int                 $form_id Form post ID.
	 * @param array<string,mixed> $entry   Entry row (with hydrated data array).
	 * @return array{ok: bool, text?: string, reason?: string, reply_id?: int}
	 */
	public static function generate_for_entry( int $form_id, array $entry ): array {
		$provider = (string) Plugin::setting( 'ai_provider', '' );
		if ( '' === $provider || 'off' === $provider ) {
			return array( 'ok' => false, 'reason' => 'ai_disabled' );
		}

		$fields = Forms::get_fields( $form_id );
		$labels = wp_list_pluck( $fields, 'label', 'key' );
		$values = is_array( $entry['data'] ?? null ) ? $entry['data'] : array();

		$instruction = (string) get_post_meta( $form_id, self::META_INSTRUCTION, true );
		if ( '' === trim( $instruction ) ) {
			$instruction = __( 'Write a brief, friendly auto-reply confirming we received the message and that we will get back to them shortly.', 'wp-forms' );
		}
		$subject_tpl = (string) get_post_meta( $form_id, self::META_SUBJECT, true );
		if ( '' === trim( $subject_tpl ) ) {
			$subject_tpl = __( 'Thanks for reaching out', 'wp-forms' );
		}

		$lines = array();
		foreach ( $values as $key => $value ) {
			$label = $labels[ $key ] ?? $key;
			$shown = is_array( $value ) ? implode( ', ', $value ) : (string) $value;
			$lines[] = $label . ': ' . $shown;
		}
		$submission_block = implode( "\n", $lines );

		$to = self::find_reply_to( $fields, $values );

		$prompt  = "You are drafting an auto-reply email on behalf of the site owner.\n";
		$prompt .= "Instruction: " . $instruction . "\n\n";
		$prompt .= "The user just submitted the following form:\n";
		$prompt .= $submission_block . "\n\n";
		$prompt .= "Write the email body only (no subject line, no signature placeholder, no markdown). Keep it under 120 words. Friendly and concrete.";

		$client = new Ai();
		$result = $client->complete( $prompt, array( 'max_tokens' => 400, 'temperature' => 0.5 ) );

		if ( empty( $result['ok'] ) ) {
			return $result;
		}

		$body    = (string) $result['text'];
		$subject = sanitize_text_field( $subject_tpl );

		$reply_id = Replies::insert_draft(
			(int) $entry['id'],
			$form_id,
			$to,
			$subject,
			$body
		);

		$result['reply_id'] = $reply_id;
		return $result;
	}

	/**
	 * Find the submitter email by inspecting field types.
	 *
	 * @param array<int, array<string,mixed>> $fields Field defs.
	 * @param array<string,mixed>             $values Sanitized values.
	 */
	private static function find_reply_to( array $fields, array $values ): string {
		foreach ( $fields as $field ) {
			if ( 'email' === ( $field['type'] ?? '' ) ) {
				$candidate = (string) ( $values[ $field['key'] ] ?? '' );
				if ( $candidate && is_email( $candidate ) ) {
					return $candidate;
				}
			}
		}
		return '';
	}
}
