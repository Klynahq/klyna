<?php
/**
 * Table store — the data model.
 *
 * Each table is a `klyna_table` custom post type whose post meta holds the
 * grid: an ordered list of column definitions and a matrix of cell values.
 * We store the grid as JSON in a single meta key so a table round-trips as one
 * atomic blob, mirroring how the TypeScript engine serialises @klyna/core data.
 *
 * Meta shape (`_klyna_table_data`):
 *   {
 *     "columns": [ { "key": "name", "label": "Name", "type": "text", "align": "left" } ],
 *     "rows":    [ [ "Widget", "9.99" ], ... ],
 *     "source":  "manual" | "csv" | "woocommerce"
 *   }
 *
 * @package KlynaTables
 */

namespace KlynaTables;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Table_Store {

	public const META_DATA   = '_klyna_table_data';
	public const META_CONFIG = '_klyna_table_config';

	private const ALLOWED_COLUMN_TYPES = array( 'text', 'number', 'link', 'image', 'html' );
	private const ALLOWED_ALIGN        = array( 'left', 'center', 'right' );
	private const ALLOWED_SOURCES      = array( 'manual', 'csv', 'woocommerce' );

	public function register(): void {
		add_action( 'init', array( $this, 'register_post_type' ) );
	}

	/**
	 * Register the `klyna_table` post type. Kept admin-only on the front end —
	 * tables are surfaced via shortcode/block, never as standalone permalinks.
	 */
	public function register_post_type(): void {
		register_post_type(
			KLYNA_TABLES_POST_TYPE,
			array(
				'labels'              => array(
					'name'               => __( 'Tables', 'wp-tables' ),
					'singular_name'      => __( 'Table', 'wp-tables' ),
					'add_new'            => __( 'Add table', 'wp-tables' ),
					'add_new_item'       => __( 'Add new table', 'wp-tables' ),
					'edit_item'          => __( 'Edit table', 'wp-tables' ),
					'new_item'           => __( 'New table', 'wp-tables' ),
					'view_item'          => __( 'View table', 'wp-tables' ),
					'search_items'       => __( 'Search tables', 'wp-tables' ),
					'not_found'          => __( 'No tables found', 'wp-tables' ),
					'not_found_in_trash' => __( 'No tables found in Trash', 'wp-tables' ),
					'menu_name'          => __( 'Klyna Tables', 'wp-tables' ),
				),
				'public'              => false,
				'show_ui'             => false,
				'show_in_menu'        => false,
				'show_in_rest'        => false,
				'exclude_from_search' => true,
				'publicly_queryable'  => false,
				'has_archive'         => false,
				'rewrite'             => false,
				'capability_type'     => 'post',
				'map_meta_cap'        => true,
				'supports'            => array( 'title', 'author' ),
			)
		);
	}

	/**
	 * Return every table as a lightweight summary list for the admin index.
	 *
	 * @return array<int, array<string,mixed>>
	 */
	public function all(): array {
		$posts = get_posts(
			array(
				'post_type'      => KLYNA_TABLES_POST_TYPE,
				'post_status'    => array( 'publish', 'draft' ),
				'posts_per_page' => -1,
				'orderby'        => 'modified',
				'order'          => 'DESC',
			)
		);

		$out = array();
		foreach ( $posts as $post ) {
			$data  = $this->get_data( $post->ID );
			$out[] = array(
				'id'       => $post->ID,
				'title'    => $post->post_title,
				'columns'  => count( $data['columns'] ),
				'rows'     => count( $data['rows'] ),
				'source'   => $data['source'],
				'modified' => get_post_modified_time( DATE_W3C, true, $post ),
				'shortcode' => sprintf( '[klyna_table id="%d"]', $post->ID ),
			);
		}
		return $out;
	}

	/**
	 * Read a table's grid. Always returns a well-formed structure.
	 *
	 * @return array{columns: array<int, array<string,string>>, rows: array<int, array<int,string>>, source: string}
	 */
	public function get_data( int $table_id ): array {
		$raw = get_post_meta( $table_id, self::META_DATA, true );
		if ( is_string( $raw ) && '' !== $raw ) {
			$decoded = json_decode( $raw, true );
			if ( is_array( $decoded ) ) {
				return $this->normalize_data( $decoded );
			}
		}
		return array(
			'columns' => array(),
			'rows'    => array(),
			'source'  => 'manual',
		);
	}

	/**
	 * Read a table's per-table render config, falling back to global settings.
	 *
	 * @return array<string,mixed>
	 */
	public function get_config( int $table_id ): array {
		$defaults = array(
			'enable_search'     => null,
			'enable_sort'       => null,
			'enable_pagination' => null,
			'rows_per_page'     => null,
			'responsive_stack'  => null,
			'striped'           => null,
		);
		$raw = get_post_meta( $table_id, self::META_CONFIG, true );
		if ( is_string( $raw ) && '' !== $raw ) {
			$decoded = json_decode( $raw, true );
			if ( is_array( $decoded ) ) {
				return wp_parse_args( $decoded, $defaults );
			}
		}
		return $defaults;
	}

	/**
	 * Create a new empty table and return its ID.
	 */
	public function create( string $title ): int {
		$title = sanitize_text_field( $title );
		if ( '' === $title ) {
			$title = __( 'Untitled table', 'wp-tables' );
		}
		$id = wp_insert_post(
			array(
				'post_type'   => KLYNA_TABLES_POST_TYPE,
				'post_status' => 'publish',
				'post_title'  => $title,
				'post_author' => get_current_user_id(),
			),
			true
		);
		if ( is_wp_error( $id ) ) {
			return 0;
		}
		$this->save_data(
			(int) $id,
			array(
				'columns' => array(
					array( 'key' => 'col_1', 'label' => __( 'Column 1', 'wp-tables' ), 'type' => 'text', 'align' => 'left' ),
					array( 'key' => 'col_2', 'label' => __( 'Column 2', 'wp-tables' ), 'type' => 'text', 'align' => 'left' ),
				),
				'rows'    => array( array( '', '' ) ),
				'source'  => 'manual',
			)
		);
		return (int) $id;
	}

	/**
	 * Persist a table's grid. Input is sanitized exhaustively before write.
	 *
	 * @param array<string,mixed> $data
	 */
	public function save_data( int $table_id, array $data ): bool {
		$clean = $this->normalize_data( $data );
		return (bool) update_post_meta( $table_id, self::META_DATA, wp_json_encode( $clean ) );
	}

	/**
	 * Persist per-table render config.
	 *
	 * @param array<string,mixed> $config
	 */
	public function save_config( int $table_id, array $config ): bool {
		$out = array();

		foreach ( array( 'enable_search', 'enable_sort', 'enable_pagination', 'responsive_stack', 'striped' ) as $key ) {
			if ( array_key_exists( $key, $config ) && null !== $config[ $key ] ) {
				$out[ $key ] = (bool) $config[ $key ];
			} else {
				$out[ $key ] = null;
			}
		}

		if ( isset( $config['rows_per_page'] ) && null !== $config['rows_per_page'] ) {
			$out['rows_per_page'] = max( 1, min( 500, (int) $config['rows_per_page'] ) );
		} else {
			$out['rows_per_page'] = null;
		}

		return (bool) update_post_meta( $table_id, self::META_CONFIG, wp_json_encode( $out ) );
	}

	public function rename( int $table_id, string $title ): bool {
		$title = sanitize_text_field( $title );
		if ( '' === $title ) {
			return false;
		}
		$result = wp_update_post(
			array(
				'ID'         => $table_id,
				'post_title' => $title,
			),
			true
		);
		return ! is_wp_error( $result );
	}

	public function delete( int $table_id ): bool {
		return (bool) wp_delete_post( $table_id, true );
	}

	public function exists( int $table_id ): bool {
		return get_post_type( $table_id ) === KLYNA_TABLES_POST_TYPE;
	}

	/**
	 * Sanitize and shape an arbitrary grid payload into our canonical form.
	 *
	 * @param array<string,mixed> $data
	 * @return array{columns: array<int, array<string,string>>, rows: array<int, array<int,string>>, source: string}
	 */
	public function normalize_data( array $data ): array {
		$columns = array();
		$raw_cols = isset( $data['columns'] ) && is_array( $data['columns'] ) ? $data['columns'] : array();
		$used_keys = array();

		foreach ( $raw_cols as $i => $col ) {
			$col   = is_array( $col ) ? $col : array();
			$label = isset( $col['label'] ) ? sanitize_text_field( (string) $col['label'] ) : '';
			if ( '' === $label ) {
				/* translators: %d: column number. */
				$label = sprintf( __( 'Column %d', 'wp-tables' ), (int) $i + 1 );
			}

			$key = isset( $col['key'] ) ? sanitize_key( (string) $col['key'] ) : '';
			if ( '' === $key || in_array( $key, $used_keys, true ) ) {
				$key = 'col_' . ( (int) $i + 1 );
			}
			$used_keys[] = $key;

			$type  = isset( $col['type'] ) && in_array( $col['type'], self::ALLOWED_COLUMN_TYPES, true ) ? (string) $col['type'] : 'text';
			$align = isset( $col['align'] ) && in_array( $col['align'], self::ALLOWED_ALIGN, true ) ? (string) $col['align'] : 'left';

			$columns[] = array(
				'key'   => $key,
				'label' => $label,
				'type'  => $type,
				'align' => $align,
			);
		}

		$col_count = count( $columns );
		$rows      = array();
		$raw_rows  = isset( $data['rows'] ) && is_array( $data['rows'] ) ? $data['rows'] : array();

		foreach ( $raw_rows as $row ) {
			$row    = is_array( $row ) ? array_values( $row ) : array();
			$cells  = array();
			for ( $c = 0; $c < $col_count; $c++ ) {
				$cell      = $row[ $c ] ?? '';
				$type      = $columns[ $c ]['type'];
				$cells[]   = $this->sanitize_cell( (string) $cell, $type );
			}
			$rows[] = $cells;
		}

		$source = isset( $data['source'] ) && in_array( $data['source'], self::ALLOWED_SOURCES, true ) ? (string) $data['source'] : 'manual';

		return array(
			'columns' => $columns,
			'rows'    => $rows,
			'source'  => $source,
		);
	}

	/**
	 * Sanitize a single cell value according to its column type.
	 */
	private function sanitize_cell( string $value, string $type ): string {
		switch ( $type ) {
			case 'html':
				return wp_kses_post( $value );
			case 'link':
				// Store either a bare URL or "URL|Label".
				if ( str_contains( $value, '|' ) ) {
					[ $url, $label ] = array_pad( explode( '|', $value, 2 ), 2, '' );
					return esc_url_raw( trim( $url ) ) . '|' . sanitize_text_field( $label );
				}
				return esc_url_raw( trim( $value ) );
			case 'image':
				return esc_url_raw( trim( $value ) );
			case 'number':
				return is_numeric( trim( $value ) ) ? trim( $value ) : sanitize_text_field( $value );
			case 'text':
			default:
				return sanitize_text_field( $value );
		}
	}
}
