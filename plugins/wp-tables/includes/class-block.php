<?php
/**
 * Gutenberg block — server-rendered "Klyna Table".
 *
 * The block is a thin wrapper around the same Renderer the shortcode uses, so
 * editor and front-end output never drift. The editor control is a simple
 * table picker registered from assets/js/block.js (no build step, classic
 * `wp.blocks.registerBlockType` against `wp.element`).
 *
 * @package KlynaTables
 */

namespace KlynaTables;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Block {

	private Renderer $renderer;

	public function __construct() {
		$this->renderer = new Renderer();
	}

	public function register(): void {
		add_action( 'init', array( $this, 'register_block' ) );
		add_action( 'enqueue_block_editor_assets', array( $this, 'enqueue_editor_assets' ) );
	}

	public function register_block(): void {
		if ( ! function_exists( 'register_block_type' ) ) {
			return;
		}
		register_block_type(
			'klyna/table',
			array(
				'api_version'     => 2,
				'title'           => __( 'Klyna Table', 'wp-tables' ),
				'category'        => 'widgets',
				'attributes'      => array(
					'tableId'  => array(
						'type'    => 'integer',
						'default' => 0,
					),
					'mode'     => array(
						'type'    => 'string',
						'default' => 'table',
					),
					'limit'    => array(
						'type'    => 'integer',
						'default' => 50,
					),
					'category' => array(
						'type'    => 'string',
						'default' => '',
					),
				),
				'render_callback' => array( $this, 'render' ),
			)
		);
	}

	/**
	 * Server-side render for both stored tables and product mode.
	 *
	 * @param array<string,mixed> $attributes
	 */
	public function render( array $attributes ): string {
		$mode = isset( $attributes['mode'] ) ? (string) $attributes['mode'] : 'table';

		if ( 'products' === $mode ) {
			$html = $this->renderer->render_products(
				array(
					'limit'    => isset( $attributes['limit'] ) ? (int) $attributes['limit'] : 50,
					'category' => isset( $attributes['category'] ) ? sanitize_text_field( (string) $attributes['category'] ) : '',
				)
			);
		} else {
			$id   = isset( $attributes['tableId'] ) ? (int) $attributes['tableId'] : 0;
			$html = $id > 0 ? $this->renderer->render_table( $id ) : '';
		}

		if ( '' === $html ) {
			return '';
		}

		// Front-end assets are registered by Shortcode::register_assets on
		// wp_enqueue_scripts; enqueue them now that the block is rendering.
		wp_enqueue_style( 'klyna-tables' );
		wp_enqueue_script( 'klyna-tables' );

		return $html;
	}

	/**
	 * Register the editor script + the list of tables it offers in the picker.
	 */
	public function enqueue_editor_assets(): void {
		wp_enqueue_script(
			'klyna-tables-block',
			KLYNA_TABLES_PLUGIN_URL . 'assets/js/block.js',
			array( 'wp-blocks', 'wp-element', 'wp-block-editor', 'wp-components', 'wp-i18n' ),
			KLYNA_TABLES_VERSION,
			true
		);
		wp_set_script_translations( 'klyna-tables-block', 'wp-tables', KLYNA_TABLES_PLUGIN_DIR . 'languages' );

		$store  = new Table_Store();
		$tables = array_map(
			static fn( $t ) => array(
				'id'    => $t['id'],
				'title' => $t['title'],
			),
			$store->all()
		);

		wp_localize_script(
			'klyna-tables-block',
			'KlynaTablesBlock',
			array(
				'tables'   => $tables,
				'hasWoo'   => class_exists( 'WooCommerce' ),
				'adminUrl' => admin_url( 'admin.php?page=klyna-tables' ),
			)
		);

		wp_enqueue_style(
			'klyna-tables-block',
			KLYNA_TABLES_PLUGIN_URL . 'assets/css/tables.css',
			array(),
			KLYNA_TABLES_VERSION
		);
	}
}
