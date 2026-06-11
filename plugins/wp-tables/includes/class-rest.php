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
