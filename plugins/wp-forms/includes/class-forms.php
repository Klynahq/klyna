<?php
/**
 * Form model — a `klyna_form` custom post type whose field definitions and
 * delivery config live in post meta.
 *
 * A "form" is a small declarative document:
 *  - `_klyna_form_fields`  — ordered list of field definitions (type/label/etc).
 *  - `_klyna_form_config`  — per-form overrides (success message, redirect,
 *    notification recipient, submit label).
 *
 * Everything is pure WordPress (CPT + meta) — no custom schema for the form
 * definition itself. Submissions are stored separately in the entries table.
 *
 * @package KlynaForms
 */

namespace KlynaForms;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Forms {

	public const FIELDS_META = '_klyna_form_fields';
	public const CONFIG_META = '_klyna_form_config';

	/**
	 * Field types we know how to render and validate.
	 */
	private const FIELD_TYPES = array( 'text', 'email', 'tel', 'url', 'number', 'textarea', 'select', 'checkbox', 'radio' );

	public function register(): void {
		add_action( 'init', array( __CLASS__, 'register_post_type' ) );
	}

	/**
	 * Registers the form CPT. Static so the activation hook can call it directly.
	 */
	public static function register_post_type(): void {
		register_post_type(
			KLYNA_FORMS_POST_TYPE,
			array(
				'labels'              => array(
					'name'               => __( 'Forms', 'wp-forms' ),
					'singular_name'      => __( 'Form', 'wp-forms' ),
					'add_new'            => __( 'Add form', 'wp-forms' ),
					'add_new_item'       => __( 'Add new form', 'wp-forms' ),
					'edit_item'          => __( 'Edit form', 'wp-forms' ),
					'new_item'           => __( 'New form', 'wp-forms' ),
					'view_item'          => __( 'View form', 'wp-forms' ),
					'search_items'       => __( 'Search forms', 'wp-forms' ),
					'not_found'          => __( 'No forms found', 'wp-forms' ),
					'not_found_in_trash' => __( 'No forms found in Trash', 'wp-forms' ),
					'menu_name'          => __( 'Klyna Forms', 'wp-forms' ),
				),
				'public'              => false,
				'show_ui'             => false,
				'show_in_menu'        => false,
				// REST is enabled (admin-only via the CPT cap) so the block editor
				// can list forms in the Klyna Form block picker.
				'show_in_rest'        => true,
				'rest_base'           => 'klyna_form',
				'exclude_from_search' => true,
				'publicly_queryable'  => false,
				'has_archive'         => false,
				'rewrite'             => false,
				'capability_type'     => 'page',
				'map_meta_cap'        => true,
				'supports'            => array( 'title', 'author' ),
			)
		);
	}

	/**
	 * Load a form's field definitions, normalized and sanitized for output.
	 *
	 * @param int $form_id Form post ID.
	 * @return array<int, array<string,mixed>>
	 */
	public static function get_fields( int $form_id ): array {
		$raw = get_post_meta( $form_id, self::FIELDS_META, true );
		if ( ! is_array( $raw ) ) {
			return array();
		}
		return array_values( array_filter( array_map( array( __CLASS__, 'normalize_field' ), $raw ) ) );
	}

	/**
	 * Load a form's delivery config merged over sane defaults.
	 *
	 * @param int $form_id Form post ID.
	 * @return array<string,mixed>
	 */
	public static function get_config( int $form_id ): array {
		$raw = get_post_meta( $form_id, self::CONFIG_META, true );
		$raw = is_array( $raw ) ? $raw : array();
		return wp_parse_args(
			$raw,
			array(
				'submit_label'    => __( 'Submit', 'wp-forms' ),
				'success_message' => __( 'Thanks — your message has been received.', 'wp-forms' ),
				'success_action'  => 'message', // 'message' | 'redirect'.
				'redirect_url'    => '',
				'notify_to'       => '',
			)
		);
	}

	/**
	 * Persist field definitions, sanitizing every value.
	 *
	 * @param int                              $form_id Form post ID.
	 * @param array<int, array<string,mixed>>  $fields  Raw field list.
	 */
	public static function save_fields( int $form_id, array $fields ): void {
		$clean = array_values( array_filter( array_map( array( __CLASS__, 'normalize_field' ), $fields ) ) );
		update_post_meta( $form_id, self::FIELDS_META, $clean );
	}

	/**
	 * Persist delivery config, sanitizing every value.
	 *
	 * @param int                 $form_id Form post ID.
	 * @param array<string,mixed> $config  Raw config.
	 */
	public static function save_config( int $form_id, array $config ): void {
		$action = in_array( $config['success_action'] ?? 'message', array( 'message', 'redirect' ), true )
			? $config['success_action']
			: 'message';
		$clean  = array(
			'submit_label'    => sanitize_text_field( (string) ( $config['submit_label'] ?? '' ) ) ?: __( 'Submit', 'wp-forms' ),
			'success_message' => sanitize_textarea_field( (string) ( $config['success_message'] ?? '' ) ),
			'success_action'  => $action,
			'redirect_url'    => esc_url_raw( (string) ( $config['redirect_url'] ?? '' ) ),
			'notify_to'       => self::sanitize_recipient_list( (string) ( $config['notify_to'] ?? '' ) ),
		);
		update_post_meta( $form_id, self::CONFIG_META, $clean );
	}

	/**
	 * Sanitize and shape a single field definition. Returns null for junk.
	 *
	 * @param mixed $field Raw field.
	 * @return array<string,mixed>|null
	 */
	public static function normalize_field( $field ): ?array {
		if ( ! is_array( $field ) ) {
			return null;
		}
		$type = isset( $field['type'] ) && in_array( $field['type'], self::FIELD_TYPES, true )
			? $field['type']
			: 'text';
		$label = sanitize_text_field( (string) ( $field['label'] ?? '' ) );
		if ( '' === $label ) {
			return null;
		}
		$key = isset( $field['key'] ) && '' !== $field['key']
			? sanitize_key( (string) $field['key'] )
			: self::slugify( $label );

		$out = array(
			'key'         => $key,
			'type'        => $type,
			'label'       => $label,
			'placeholder' => sanitize_text_field( (string) ( $field['placeholder'] ?? '' ) ),
			'required'    => ! empty( $field['required'] ),
		);

		// Option-bearing fields carry a normalized option list.
		if ( in_array( $type, array( 'select', 'radio', 'checkbox' ), true ) ) {
			$out['options'] = self::normalize_options( $field['options'] ?? array() );
		}
		return $out;
	}

	/**
	 * @param mixed $options Raw options (array of strings or newline blob).
	 * @return string[]
	 */
	private static function normalize_options( $options ): array {
		if ( is_string( $options ) ) {
			$options = preg_split( '/[\r\n]+/', $options ) ?: array();
		}
		if ( ! is_array( $options ) ) {
			return array();
		}
		$clean = array_map( static fn( $o ) => sanitize_text_field( (string) $o ), $options );
		return array_values( array_filter( $clean, static fn( $o ) => '' !== $o ) );
	}

	/**
	 * Comma/newline list of email recipients -> validated, comma-joined string.
	 */
	public static function sanitize_recipient_list( string $raw ): string {
		$parts = preg_split( '/[\r\n,]+/', $raw ) ?: array();
		$valid = array();
		foreach ( $parts as $part ) {
			$email = sanitize_email( trim( $part ) );
			if ( $email && is_email( $email ) ) {
				$valid[] = $email;
			}
		}
		return implode( ', ', array_unique( $valid ) );
	}

	/**
	 * Make a stable, collision-resistant field key from a label.
	 */
	private static function slugify( string $label ): string {
		$key = sanitize_key( str_replace( ' ', '_', $label ) );
		if ( '' === $key ) {
			$key = 'field';
		}
		return $key . '_' . substr( md5( $label . microtime() ), 0, 4 );
	}
}
