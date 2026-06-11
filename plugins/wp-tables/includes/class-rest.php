<?php
/**
 * REST API — table CRUD, CSV import, and settings.
 *
 * Namespace: klyna-tables/v1. Every write requires the `manage_options`
 * capability and a valid `wp_rest` nonce (enforced by core when the
 * X-WP-Nonce header is present and the permission callback runs).
 *
 * @package KlynaTables
 */

namespace KlynaTables;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Rest {

	private const NAMESPACE = 'klyna-tables/v1';

	private Table_Store $store;

	public function __construct() {
		$this->store = new Table_Store();
	}

	public function register(): void {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
	}

	public function register_routes(): void {
		$can_edit = static fn() => current_user_can( 'manage_options' );

		register_rest_route(
			self::NAMESPACE,
			'/tables',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( $this, 'list_tables' ),
					'permission_callback' => $can_edit,
				),
				array(
					'methods'             => 'POST',
					'callback'            => array( $this, 'create_table' ),
					'permission_callback' => $can_edit,
					'args'                => array(
						'title' => array(
							'type'              => 'string',
							'required'          => true,
							'sanitize_callback' => 'sanitize_text_field',
						),
					),
				),
			)
		);

		register_rest_route(
			self::NAMESPACE,
			'/tables/(?P<id>\d+)',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( $this, 'get_table' ),
					'permission_callback' => $can_edit,
				),
				array(
					'methods'             => 'POST',
					'callback'            => array( $this, 'update_table' ),
					'permission_callback' => $can_edit,
				),
				array(
					'methods'             => 'DELETE',
					'callback'            => array( $this, 'delete_table' ),
					'permission_callback' => $can_edit,
				),
			)
		);

		register_rest_route(
			self::NAMESPACE,
			'/tables/(?P<id>\d+)/import-csv',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'import_csv' ),
				'permission_callback' => $can_edit,
				'args'                => array(
					'csv'           => array(
						'type'     => 'string',
						'required' => true,
					),
					'has_header'    => array(
						'type'    => 'boolean',
						'default' => true,
					),
					'delimiter'     => array(
						'type'    => 'string',
						'default' => ',',
					),
				),
			)
		);

		register_rest_route(
			self::NAMESPACE,
			'/tables/(?P<id>\d+)/insight',
			array(
				array(
					'methods'             => 'POST',
					'callback'            => array( $this, 'generate_insight' ),
					'permission_callback' => $can_edit,
				),
				array(
					'methods'             => 'DELETE',
					'callback'            => array( $this, 'clear_insight' ),
					'permission_callback' => $can_edit,
				),
			)
		);

		register_rest_route(
			self::NAMESPACE,
			'/tables/(?P<id>\d+)/insight-toggle',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'toggle_insight' ),
				'permission_callback' => $can_edit,
				'args'                => array(
					'enabled' => array(
						'type'     => 'boolean',
						'required' => true,
					),
				),
			)
		);

		register_rest_route(
			self::NAMESPACE,
			'/ai/test',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'ai_test' ),
				'permission_callback' => $can_edit,
			)
		);

		register_rest_route(
			self::NAMESPACE,
			'/ai/suggest',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'ai_suggest' ),
				'permission_callback' => $can_edit,
				'args'                => array(
					'prompt' => array(
						'type'              => 'string',
						'required'          => true,
						'sanitize_callback' => 'sanitize_textarea_field',
					),
				),
			)
		);

		register_rest_route(
			self::NAMESPACE,
			'/settings',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( $this, 'get_settings' ),
					'permission_callback' => $can_edit,
				),
				array(
					'methods'             => 'POST',
					'callback'            => array( $this, 'update_settings' ),
					'permission_callback' => $can_edit,
				),
			)
		);
	}

	public function list_tables(): \WP_REST_Response {
		return new \WP_REST_Response( $this->store->all(), 200 );
	}

	public function create_table( \WP_REST_Request $req ): \WP_REST_Response {
		$id = $this->store->create( (string) $req->get_param( 'title' ) );
		if ( 0 === $id ) {
			return new \WP_REST_Response( array( 'message' => __( 'Could not create table.', 'wp-tables' ) ), 500 );
		}
		return new \WP_REST_Response( $this->table_payload( $id ), 201 );
	}

	public function get_table( \WP_REST_Request $req ): \WP_REST_Response {
		$id = (int) $req->get_param( 'id' );
		if ( ! $this->store->exists( $id ) ) {
			return new \WP_REST_Response( array( 'message' => __( 'Table not found.', 'wp-tables' ) ), 404 );
		}
		return new \WP_REST_Response( $this->table_payload( $id ), 200 );
	}

	public function update_table( \WP_REST_Request $req ): \WP_REST_Response {
		$id = (int) $req->get_param( 'id' );
		if ( ! $this->store->exists( $id ) ) {
			return new \WP_REST_Response( array( 'message' => __( 'Table not found.', 'wp-tables' ) ), 404 );
		}

		$title = $req->get_param( 'title' );
		if ( is_string( $title ) ) {
			$this->store->rename( $id, $title );
		}

		$data = $req->get_param( 'data' );
		if ( is_array( $data ) ) {
			$this->store->save_data( $id, $data );
		}

		$config = $req->get_param( 'config' );
		if ( is_array( $config ) ) {
			$this->store->save_config( $id, $config );
		}

		return new \WP_REST_Response( $this->table_payload( $id ), 200 );
	}

	public function delete_table( \WP_REST_Request $req ): \WP_REST_Response {
		$id = (int) $req->get_param( 'id' );
		if ( ! $this->store->exists( $id ) ) {
			return new \WP_REST_Response( array( 'message' => __( 'Table not found.', 'wp-tables' ) ), 404 );
		}
		$this->store->delete( $id );
		return new \WP_REST_Response( array( 'deleted' => $id ), 200 );
	}

	/**
	 * Import a CSV blob into an existing table, replacing its grid.
	 */
	public function import_csv( \WP_REST_Request $req ): \WP_REST_Response {
		$id = (int) $req->get_param( 'id' );
		if ( ! $this->store->exists( $id ) ) {
			return new \WP_REST_Response( array( 'message' => __( 'Table not found.', 'wp-tables' ) ), 404 );
		}

		$csv        = (string) $req->get_param( 'csv' );
		$has_header = (bool) $req->get_param( 'has_header' );
		$delimiter  = (string) $req->get_param( 'delimiter' );
		$delimiter  = '' !== $delimiter ? $delimiter[0] : ',';

		$parsed = $this->parse_csv( $csv, $delimiter );
		if ( empty( $parsed ) ) {
			return new \WP_REST_Response( array( 'message' => __( 'No rows found in CSV.', 'wp-tables' ) ), 422 );
		}

		$header_row = $has_header ? array_shift( $parsed ) : array();
		$col_count  = 0;
		foreach ( $parsed as $row ) {
			$col_count = max( $col_count, count( $row ) );
		}
		$col_count = max( $col_count, count( $header_row ) );

		$columns = array();
		for ( $c = 0; $c < $col_count; $c++ ) {
			$label = $header_row[ $c ] ?? '';
			if ( '' === trim( (string) $label ) ) {
				/* translators: %d: column number. */
				$label = sprintf( __( 'Column %d', 'wp-tables' ), $c + 1 );
			}
			$columns[] = array(
				'key'   => 'col_' . ( $c + 1 ),
				'label' => $label,
				'type'  => 'text',
				'align' => 'left',
			);
		}

		$data = array(
			'columns' => $columns,
			'rows'    => $parsed,
			'source'  => 'csv',
		);
		$this->store->save_data( $id, $data );

		return new \WP_REST_Response( $this->table_payload( $id ), 200 );
	}

	public function get_settings(): \WP_REST_Response {
		return new \WP_REST_Response( Plugin::settings(), 200 );
	}

	public function update_settings( \WP_REST_Request $req ): \WP_REST_Response {
		$input    = $req->get_json_params();
		$input    = is_array( $input ) ? $input : array();
		$sanitized = $this->sanitize_settings( $input );
		update_option( KLYNA_TABLES_OPTION_KEY, $sanitized );
		return new \WP_REST_Response( Plugin::settings(), 200 );
	}

	/**
	 * @param array<string,mixed> $input
	 * @return array<string,mixed>
	 */
	public function sanitize_settings( array $input ): array {
		$out = Plugin::settings();

		foreach ( array( 'enable_search', 'enable_sort', 'enable_pagination', 'responsive_stack', 'striped' ) as $key ) {
			if ( array_key_exists( $key, $input ) ) {
				$out[ $key ] = ! empty( $input[ $key ] );
			}
		}

		if ( isset( $input['default_rows_per_page'] ) ) {
			$out['default_rows_per_page'] = max( 1, min( 500, (int) $input['default_rows_per_page'] ) );
		}

		if ( isset( $input['accent'] ) ) {
			$accent = sanitize_hex_color( (string) $input['accent'] );
			$out['accent'] = $accent ?: '#7c5cff';
		}

		if ( isset( $input['ai_provider'] ) ) {
			$allowed = array( 'off', 'openrouter', 'groq', 'gemini', 'cloudflare', 'ollama' );
			$prov    = sanitize_key( (string) $input['ai_provider'] );
			$out['ai_provider'] = in_array( $prov, $allowed, true ) ? $prov : 'off';
		}
		if ( isset( $input['ai_api_key'] ) ) {
			$out['ai_api_key'] = sanitize_text_field( (string) $input['ai_api_key'] );
		}
		if ( isset( $input['ai_model'] ) ) {
			$out['ai_model'] = sanitize_text_field( (string) $input['ai_model'] );
		}
		if ( isset( $input['ai_endpoint'] ) ) {
			$out['ai_endpoint'] = sanitize_text_field( (string) $input['ai_endpoint'] );
		}
		if ( isset( $input['ai_daily_cap'] ) ) {
			$out['ai_daily_cap'] = max( 1, min( 10000, (int) $input['ai_daily_cap'] ) );
		}

		if ( isset( $input['woo_columns'] ) && is_array( $input['woo_columns'] ) ) {
			$allowed = array( 'image', 'title', 'sku', 'category', 'price', 'stock', 'cart' );
			$out['woo_columns'] = array_values(
				array_intersect( $allowed, array_map( 'sanitize_key', $input['woo_columns'] ) )
			);
			if ( empty( $out['woo_columns'] ) ) {
				$out['woo_columns'] = array( 'image', 'title', 'price', 'cart' );
			}
		}

		return $out;
	}

	public function ai_test(): \WP_REST_Response {
		$ai     = new Ai();
		$result = $ai->test();
		$status = ! empty( $result['ok'] ) ? 200 : 400;
		return new \WP_REST_Response(
			array(
				'ok'     => ! empty( $result['ok'] ),
				'text'   => (string) ( $result['text'] ?? '' ),
				'reason' => (string) ( $result['reason'] ?? '' ),
			),
			$status
		);
	}

	public function ai_suggest( \WP_REST_Request $req ): \WP_REST_Response {
		$prompt = (string) $req->get_param( 'prompt' );
		if ( '' === trim( $prompt ) ) {
			return new \WP_REST_Response( array( 'message' => __( 'Prompt is required.', 'wp-tables' ) ), 400 );
		}
		$ai     = new Ai();
		$result = $ai->complete( $prompt );
		$status = ! empty( $result['ok'] ) ? 200 : 400;
		return new \WP_REST_Response(
			array(
				'ok'     => ! empty( $result['ok'] ),
				'text'   => (string) ( $result['text'] ?? '' ),
				'reason' => (string) ( $result['reason'] ?? '' ),
				'cached' => ! empty( $result['cached'] ),
			),
			$status
		);
	}

	public function generate_insight( \WP_REST_Request $req ): \WP_REST_Response {
		$id = (int) $req->get_param( 'id' );
		if ( ! $this->store->exists( $id ) ) {
			return new \WP_REST_Response( array( 'message' => __( 'Table not found.', 'wp-tables' ) ), 404 );
		}
		$data    = $this->store->get_data( $id );
		$columns = $data['columns'] ?? array();
		$rows    = $data['rows'] ?? array();
		if ( empty( $columns ) || empty( $rows ) ) {
			return new \WP_REST_Response( array( 'message' => __( 'Add some data before generating an insight.', 'wp-tables' ) ), 422 );
		}

		$csv = $this->table_to_csv( $columns, $rows, 5000 );
		$title = get_the_title( $id );

		$prompt  = "You are a data analyst. Read the following CSV table titled \"$title\" and write exactly one paragraph of 40-80 words summarizing what the data shows. Include specific numeric observations (totals, ranges, top values, notable comparisons). Do not invent values that are not present. Plain text only, no markdown, no preamble.\n\nCSV:\n" . $csv;

		$ai     = new Ai();
		$result = $ai->complete( $prompt, array( 'max_tokens' => 300, 'temperature' => 0.4 ) );
		if ( empty( $result['ok'] ) ) {
			return new \WP_REST_Response(
				array(
					'ok'     => false,
					'reason' => (string) ( $result['reason'] ?? 'error' ),
					'message' => (string) ( $result['text'] ?? __( 'AI request failed.', 'wp-tables' ) ),
				),
				400
			);
		}

		$text = sanitize_textarea_field( (string) $result['text'] );
		update_post_meta( $id, '_wp_tables_insight', $text );
		update_post_meta( $id, '_wp_tables_insight_at', time() );

		return new \WP_REST_Response(
			array(
				'ok'      => true,
				'insight' => $text,
				'cached'  => ! empty( $result['cached'] ),
			),
			200
		);
	}

	public function clear_insight( \WP_REST_Request $req ): \WP_REST_Response {
		$id = (int) $req->get_param( 'id' );
		if ( ! $this->store->exists( $id ) ) {
			return new \WP_REST_Response( array( 'message' => __( 'Table not found.', 'wp-tables' ) ), 404 );
		}
		delete_post_meta( $id, '_wp_tables_insight' );
		delete_post_meta( $id, '_wp_tables_insight_at' );
		return new \WP_REST_Response( array( 'ok' => true ), 200 );
	}

	public function toggle_insight( \WP_REST_Request $req ): \WP_REST_Response {
		$id = (int) $req->get_param( 'id' );
		if ( ! $this->store->exists( $id ) ) {
			return new \WP_REST_Response( array( 'message' => __( 'Table not found.', 'wp-tables' ) ), 404 );
		}
		$enabled = (bool) $req->get_param( 'enabled' );
		update_post_meta( $id, '_wp_tables_insight_enabled', $enabled ? '1' : '0' );
		return new \WP_REST_Response( array( 'ok' => true, 'enabled' => $enabled ), 200 );
	}

	/**
	 * Serialize columns + rows to a CSV string, truncated to a char cap.
	 *
	 * @param array<int, array<string,string>> $columns
	 * @param array<int, array<int,string>>    $rows
	 */
	private function table_to_csv( array $columns, array $rows, int $cap ): string {
		$labels = array();
		foreach ( $columns as $col ) {
			$labels[] = (string) ( $col['label'] ?? '' );
		}
		$lines = array( $this->csv_row( $labels ) );
		foreach ( $rows as $row ) {
			$lines[] = $this->csv_row( array_map( 'strval', (array) $row ) );
			if ( strlen( implode( "\n", $lines ) ) >= $cap ) {
				break;
			}
		}
		$out = implode( "\n", $lines );
		if ( strlen( $out ) > $cap ) {
			$out = substr( $out, 0, $cap );
		}
		return $out;
	}

	/**
	 * @param array<int,string> $fields
	 */
	private function csv_row( array $fields ): string {
		$escaped = array();
		foreach ( $fields as $field ) {
			$clean = wp_strip_all_tags( $field );
			if ( false !== strpbrk( $clean, ",\"\n" ) ) {
				$clean = '"' . str_replace( '"', '""', $clean ) . '"';
			}
			$escaped[] = $clean;
		}
		return implode( ',', $escaped );
	}

	/**
	 * Build the full table payload returned by GET/POST handlers.
	 *
	 * @return array<string,mixed>
	 */
	private function table_payload( int $id ): array {
		$post = get_post( $id );
		return array(
			'id'        => $id,
			'title'     => $post ? $post->post_title : '',
			'data'      => $this->store->get_data( $id ),
			'config'    => $this->store->get_config( $id ),
			'shortcode' => sprintf( '[klyna_table id="%d"]', $id ),
			'insight'   => array(
				'text'    => (string) get_post_meta( $id, '_wp_tables_insight', true ),
				'updated' => (int) get_post_meta( $id, '_wp_tables_insight_at', true ),
				'enabled' => '1' === (string) get_post_meta( $id, '_wp_tables_insight_enabled', true ),
			),
		);
	}

	/**
	 * Minimal RFC-4180-ish CSV parser (handles quoted fields + embedded commas).
	 *
	 * @return array<int, array<int,string>>
	 */
	private function parse_csv( string $csv, string $delimiter ): array {
		$csv = str_replace( array( "\r\n", "\r" ), "\n", $csv );
		$rows = array();
		$row  = array();
		$field = '';
		$in_quotes = false;
		$len = strlen( $csv );

		for ( $i = 0; $i < $len; $i++ ) {
			$ch = $csv[ $i ];

			if ( $in_quotes ) {
				if ( '"' === $ch ) {
					if ( $i + 1 < $len && '"' === $csv[ $i + 1 ] ) {
						$field .= '"';
						$i++;
					} else {
						$in_quotes = false;
					}
				} else {
					$field .= $ch;
				}
				continue;
			}

			if ( '"' === $ch ) {
				$in_quotes = true;
			} elseif ( $delimiter === $ch ) {
				$row[] = $field;
				$field = '';
			} elseif ( "\n" === $ch ) {
				$row[] = $field;
				$rows[] = $row;
				$row   = array();
				$field = '';
			} else {
				$field .= $ch;
			}
		}

		// Flush trailing field/row.
		if ( '' !== $field || ! empty( $row ) ) {
			$row[]  = $field;
			$rows[] = $row;
		}

		// Drop fully empty trailing rows.
		return array_values(
			array_filter(
				$rows,
				static fn( $r ) => '' !== implode( '', array_map( 'trim', $r ) )
			)
		);
	}
}
