<?php
/**
 * Shortcodes — [klyna_table] and [klyna_products].
 *
 * Front-end assets are registered here and only enqueued when a shortcode
 * actually renders, so pages without a table ship zero extra weight.
 *
 * @package KlynaTables
 */

namespace KlynaTables;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Shortcode {

	private Renderer $renderer;

	public function __construct() {
		$this->renderer = new Renderer();
	}

	public function register(): void {
		add_action( 'wp_enqueue_scripts', array( $this, 'register_assets' ) );
		add_shortcode( 'klyna_table', array( $this, 'render_table' ) );
		add_shortcode( 'klyna_products', array( $this, 'render_products' ) );
	}

	/**
	 * Register (not enqueue) the front-end runtime + styles.
	 */
	public function register_assets(): void {
		wp_register_style(
			'klyna-tables',
			KLYNA_TABLES_PLUGIN_URL . 'assets/css/tables.css',
			array(),
			KLYNA_TABLES_VERSION
		);
		wp_register_script(
			'klyna-tables',
			KLYNA_TABLES_PLUGIN_URL . 'assets/js/tables.js',
			array(),
			KLYNA_TABLES_VERSION,
			true
		);
		wp_set_script_translations( 'klyna-tables', 'wp-tables', KLYNA_TABLES_PLUGIN_DIR . 'languages' );
		wp_localize_script(
			'klyna-tables',
			'KlynaTablesI18n',
			array(
				'search'   => __( 'Search…', 'wp-tables' ),
				'noResults' => __( 'No matching rows.', 'wp-tables' ),
				/* translators: 1: visible count, 2: total count. */
				'showing'  => __( 'Showing %1$s of %2$s', 'wp-tables' ),
				'prev'     => __( 'Previous', 'wp-tables' ),
				'next'     => __( 'Next', 'wp-tables' ),
				/* translators: %s: page number. */
				'page'     => __( 'Page %s', 'wp-tables' ),
			)
		);
	}

	/**
	 * [klyna_table id="123" search="1" sort="1" paginate="1" rows_per_page="10"]
	 *
	 * @param array<string,mixed>|string $atts
	 */
	public function render_table( $atts ): string {
		$atts = shortcode_atts(
			array(
				'id'                => 0,
				'search'            => '',
				'sort'              => '',
				'paginate'          => '',
				'rows_per_page'     => '',
				'responsive_stack'  => '',
				'striped'           => '',
			),
			$atts,
			'klyna_table'
		);

		$id = (int) $atts['id'];
		if ( $id <= 0 ) {
			return '';
		}

		$html = $this->renderer->render_table(
			$id,
			array(
				'enable_search'     => $atts['search'],
				'enable_sort'       => $atts['sort'],
				'enable_pagination' => $atts['paginate'],
				'rows_per_page'     => $atts['rows_per_page'],
				'responsive_stack'  => $atts['responsive_stack'],
				'striped'           => $atts['striped'],
			)
		);

		if ( '' === $html ) {
			return '';
		}

		$this->enqueue();
		return $html;
	}

	/**
	 * [klyna_products limit="50" category="hoodies" search="1" sort="1"]
	 *
	 * @param array<string,mixed>|string $atts
	 */
	public function render_products( $atts ): string {
		$atts = shortcode_atts(
			array(
				'limit'             => 50,
				'category'          => '',
				'search'            => '',
				'sort'              => '',
				'paginate'          => '',
				'rows_per_page'     => '',
				'responsive_stack'  => '',
				'striped'           => '',
			),
			$atts,
			'klyna_products'
		);

		$html = $this->renderer->render_products(
			array(
				'limit'             => (int) $atts['limit'],
				'category'          => sanitize_text_field( (string) $atts['category'] ),
				'enable_search'     => $atts['search'],
				'enable_sort'       => $atts['sort'],
				'enable_pagination' => $atts['paginate'],
				'rows_per_page'     => $atts['rows_per_page'],
				'responsive_stack'  => $atts['responsive_stack'],
				'striped'           => $atts['striped'],
			)
		);

		$this->enqueue();
		return $html;
	}

	private function enqueue(): void {
		wp_enqueue_style( 'klyna-tables' );
		wp_enqueue_script( 'klyna-tables' );
	}
}
