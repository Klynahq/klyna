<?php
/**
 * Front-end renderer — turns a stored table (or a Woo product query) into
 * accessible, progressively-enhanced HTML. The markup ships sortable/searchable
 * out of the box; the vanilla-JS runtime in assets/js/tables.js wires up the
 * interactivity. With JS off, the table is still a valid, readable <table>.
 *
 * @package KlynaTables
 */

namespace KlynaTables;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Renderer {

	private Table_Store $store;

	public function __construct() {
		$this->store = new Table_Store();
	}

	/**
	 * Render a stored table by ID. Returns '' if the table does not exist.
	 *
	 * @param array<string,mixed> $overrides Shortcode/block attribute overrides.
	 */
	public function render_table( int $table_id, array $overrides = array() ): string {
		if ( ! $this->store->exists( $table_id ) ) {
			return '';
		}

		$data   = $this->store->get_data( $table_id );
		$config = $this->resolve_config( $this->store->get_config( $table_id ), $overrides );
		$title  = get_the_title( $table_id );

		$insight_html = '';
		$enabled      = '1' === (string) get_post_meta( $table_id, '_wp_tables_insight_enabled', true );
		$text         = (string) get_post_meta( $table_id, '_wp_tables_insight', true );
		if ( $enabled && '' !== trim( $text ) ) {
			$accent       = Plugin::settings()['accent'];
			$insight_html = sprintf(
				'<div class="klyna-table-insight" role="note" style="--klyna-accent:%1$s"><span class="klyna-table-insight-label">%2$s</span><p>%3$s</p></div>',
				esc_attr( $accent ),
				esc_html__( 'AI insight', 'wp-tables' ),
				esc_html( $text )
			);
		}

		return $insight_html . $this->render_grid( $data['columns'], $data['rows'], $config, $title, 'table-' . $table_id );
	}

	/**
	 * Render a WooCommerce product table. Falls back to a notice if Woo is off.
	 *
	 * @param array<string,mixed> $atts
	 */
	public function render_products( array $atts ): string {
		if ( ! class_exists( 'WooCommerce' ) ) {
			return sprintf(
				'<div class="klyna-table-notice">%s</div>',
				esc_html__( 'WooCommerce is not active, so the product table cannot render.', 'wp-tables' )
			);
		}

		$settings = Plugin::settings();
		$columns  = $this->product_columns( $settings['woo_columns'] );
		$config   = $this->resolve_config( array(), $atts );

		$query_args = array(
			'status'  => 'publish',
			'limit'   => isset( $atts['limit'] ) ? (int) $atts['limit'] : 50,
			'orderby' => 'date',
			'order'   => 'DESC',
			'return'  => 'objects',
		);
		if ( ! empty( $atts['category'] ) ) {
			$query_args['category'] = array_map( 'sanitize_title', explode( ',', (string) $atts['category'] ) );
		}

		$products = wc_get_products( $query_args );
		$rows     = array();
		foreach ( $products as $product ) {
			$rows[] = $this->product_row( $product, $settings['woo_columns'] );
		}

		return $this->render_grid(
			$columns,
			$rows,
			$config,
			__( 'Products', 'wp-tables' ),
			'products',
			true
		);
	}

	/**
	 * Core grid renderer shared by manual and product tables.
	 *
	 * @param array<int, array<string,string>> $columns
	 * @param array<int, array<int,string>>    $rows     Pre-escaped when $raw_cells is true.
	 * @param array<string,mixed>              $config
	 * @param bool                             $raw_cells When true cells are emitted verbatim (product HTML).
	 */
	private function render_grid( array $columns, array $rows, array $config, string $title, string $uid, bool $raw_cells = false ): string {
		if ( empty( $columns ) ) {
			return '';
		}

		$accent     = Plugin::settings()['accent'];
		$dom_id     = 'klyna-table-' . sanitize_html_class( $uid );
		$classes    = array( 'klyna-table' );
		if ( $config['striped'] ) {
			$classes[] = 'is-striped';
		}
		if ( $config['responsive_stack'] ) {
			$classes[] = 'is-stackable';
		}

		$data_attrs = sprintf(
			' data-sort="%s" data-search="%s" data-paginate="%s" data-per-page="%d"',
			$config['enable_sort'] ? '1' : '0',
			$config['enable_search'] ? '1' : '0',
			$config['enable_pagination'] ? '1' : '0',
			(int) $config['rows_per_page']
		);

		ob_start();
		?>
		<div class="klyna-table-wrap" id="<?php echo esc_attr( $dom_id ); ?>" style="--klyna-accent:<?php echo esc_attr( $accent ); ?>"<?php echo $data_attrs; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- built from booleans/ints above. ?>>
			<?php if ( $config['enable_search'] ) : ?>
				<div class="klyna-table-toolbar">
					<label class="klyna-table-search">
						<span class="screen-reader-text"><?php esc_html_e( 'Search table', 'wp-tables' ); ?></span>
						<input type="search" class="klyna-table-search-input" placeholder="<?php esc_attr_e( 'Search…', 'wp-tables' ); ?>" autocomplete="off">
					</label>
					<span class="klyna-table-count" aria-live="polite"></span>
				</div>
			<?php endif; ?>

			<div class="klyna-table-scroll">
				<table class="<?php echo esc_attr( implode( ' ', $classes ) ); ?>">
					<caption class="screen-reader-text"><?php echo esc_html( $title ); ?></caption>
					<thead>
						<tr>
							<?php foreach ( $columns as $i => $col ) : ?>
								<th
									scope="col"
									class="klyna-col-<?php echo esc_attr( $col['align'] ); ?>"
									data-type="<?php echo esc_attr( $col['type'] ); ?>"
									<?php echo $config['enable_sort'] ? 'tabindex="0" role="button" aria-sort="none"' : ''; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- static strings. ?>
								>
									<span class="klyna-col-label"><?php echo esc_html( $col['label'] ); ?></span>
									<?php if ( $config['enable_sort'] ) : ?>
										<span class="klyna-sort-icon" aria-hidden="true"></span>
									<?php endif; ?>
								</th>
							<?php endforeach; ?>
						</tr>
					</thead>
					<tbody>
						<?php foreach ( $rows as $row ) : ?>
							<tr>
								<?php foreach ( $columns as $c => $col ) : ?>
									<?php
									$value     = $row[ $c ] ?? '';
									$sort_key  = $this->sort_value( $value, $col['type'] );
									?>
									<td
										class="klyna-col-<?php echo esc_attr( $col['align'] ); ?>"
										data-label="<?php echo esc_attr( $col['label'] ); ?>"
										data-sort="<?php echo esc_attr( $sort_key ); ?>"
									><?php echo $raw_cells ? $value : $this->render_cell( $value, $col['type'] ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- render_cell escapes; product cells pre-escaped. ?></td>
								<?php endforeach; ?>
							</tr>
						<?php endforeach; ?>
					</tbody>
				</table>
			</div>

			<?php if ( $config['enable_pagination'] ) : ?>
				<nav class="klyna-table-pager" aria-label="<?php esc_attr_e( 'Table pagination', 'wp-tables' ); ?>"></nav>
			<?php endif; ?>

			<?php if ( empty( $rows ) ) : ?>
				<p class="klyna-table-empty"><?php esc_html_e( 'This table has no rows yet.', 'wp-tables' ); ?></p>
			<?php endif; ?>
		</div>
		<?php
		return (string) ob_get_clean();
	}

	/**
	 * Escape and format a single cell according to its column type.
	 */
	private function render_cell( string $value, string $type ): string {
		switch ( $type ) {
			case 'link':
				if ( str_contains( $value, '|' ) ) {
					[ $url, $label ] = array_pad( explode( '|', $value, 2 ), 2, '' );
				} else {
					$url   = $value;
					$label = $value;
				}
				$url = trim( $url );
				if ( '' === $url ) {
					return '';
				}
				return sprintf(
					'<a href="%s" rel="noopener">%s</a>',
					esc_url( $url ),
					esc_html( '' !== trim( $label ) ? $label : $url )
				);
			case 'image':
				if ( '' === trim( $value ) ) {
					return '';
				}
				return sprintf(
					'<img src="%s" alt="" loading="lazy" class="klyna-cell-img">',
					esc_url( $value )
				);
			case 'html':
				return wp_kses_post( $value );
			case 'number':
			case 'text':
			default:
				return esc_html( $value );
		}
	}

	/**
	 * Compute a stable client-side sort key for a cell.
	 */
	private function sort_value( string $value, string $type ): string {
		if ( 'number' === $type ) {
			$num = preg_replace( '/[^0-9.\-]/', '', $value );
			return is_numeric( $num ) ? $num : '';
		}
		if ( 'link' === $type && str_contains( $value, '|' ) ) {
			[ , $label ] = array_pad( explode( '|', $value, 2 ), 2, '' );
			return $label;
		}
		return wp_strip_all_tags( $value );
	}

	/**
	 * Merge global settings, per-table config, and inline overrides into the
	 * final render config. Per-table config wins over globals; overrides win
	 * over everything.
	 *
	 * @param array<string,mixed> $config
	 * @param array<string,mixed> $overrides
	 * @return array<string,mixed>
	 */
	private function resolve_config( array $config, array $overrides ): array {
		$settings = Plugin::settings();

		$resolve_bool = static function ( string $key, $per_table ) use ( $settings, $overrides ) {
			if ( array_key_exists( $key, $overrides ) && '' !== $overrides[ $key ] ) {
				return filter_var( $overrides[ $key ], FILTER_VALIDATE_BOOLEAN );
			}
			if ( null !== $per_table ) {
				return (bool) $per_table;
			}
			return (bool) ( $settings[ $key ] ?? false );
		};

		$rows_per_page = $settings['default_rows_per_page'];
		if ( isset( $config['rows_per_page'] ) && null !== $config['rows_per_page'] ) {
			$rows_per_page = (int) $config['rows_per_page'];
		}
		if ( isset( $overrides['rows_per_page'] ) && '' !== $overrides['rows_per_page'] ) {
			$rows_per_page = (int) $overrides['rows_per_page'];
		}

		return array(
			'enable_search'     => $resolve_bool( 'enable_search', $config['enable_search'] ?? null ),
			'enable_sort'       => $resolve_bool( 'enable_sort', $config['enable_sort'] ?? null ),
			'enable_pagination' => $resolve_bool( 'enable_pagination', $config['enable_pagination'] ?? null ),
			'responsive_stack'  => $resolve_bool( 'responsive_stack', $config['responsive_stack'] ?? null ),
			'striped'           => $resolve_bool( 'striped', $config['striped'] ?? null ),
			'rows_per_page'     => max( 1, min( 500, $rows_per_page ) ),
		);
	}

	/**
	 * Build column definitions for the Woo product table.
	 *
	 * @param string[] $keys
	 * @return array<int, array<string,string>>
	 */
	private function product_columns( array $keys ): array {
		$labels = array(
			'image'    => __( 'Image', 'wp-tables' ),
			'title'    => __( 'Product', 'wp-tables' ),
			'sku'      => __( 'SKU', 'wp-tables' ),
			'category' => __( 'Category', 'wp-tables' ),
			'price'    => __( 'Price', 'wp-tables' ),
			'stock'    => __( 'Stock', 'wp-tables' ),
			'cart'     => __( 'Add to cart', 'wp-tables' ),
		);
		$types = array(
			'image' => 'image',
			'price' => 'number',
		);
		$out = array();
		foreach ( $keys as $key ) {
			if ( ! isset( $labels[ $key ] ) ) {
				continue;
			}
			$out[] = array(
				'key'   => $key,
				'label' => $labels[ $key ],
				'type'  => $types[ $key ] ?? 'text',
				'align' => in_array( $key, array( 'price', 'stock', 'cart' ), true ) ? 'right' : 'left',
			);
		}
		return $out;
	}

	/**
	 * Build one pre-escaped product row.
	 *
	 * @param \WC_Product $product
	 * @param string[]    $keys
	 * @return array<int,string>
	 */
	private function product_row( $product, array $keys ): array {
		$row = array();
		foreach ( $keys as $key ) {
			switch ( $key ) {
				case 'image':
					$row[] = $product->get_image( 'thumbnail', array( 'class' => 'klyna-cell-img', 'loading' => 'lazy' ) );
					break;
				case 'title':
					$row[] = sprintf(
						'<a href="%s" rel="noopener">%s</a>',
						esc_url( $product->get_permalink() ),
						esc_html( $product->get_name() )
					);
					break;
				case 'sku':
					$row[] = esc_html( $product->get_sku() );
					break;
				case 'category':
					$terms = wc_get_product_category_list( $product->get_id() );
					$row[] = wp_kses_post( $terms );
					break;
				case 'price':
					$row[] = wp_kses_post( $product->get_price_html() );
					break;
				case 'stock':
					$row[] = wp_kses_post( wc_get_stock_html( $product ) );
					break;
				case 'cart':
					$row[] = $this->add_to_cart_button( $product );
					break;
				default:
					$row[] = '';
			}
		}
		return $row;
	}

	/**
	 * @param \WC_Product $product
	 */
	private function add_to_cart_button( $product ): string {
		$url   = $product->add_to_cart_url();
		$label = $product->add_to_cart_text();
		$class = 'button klyna-add-to-cart';
		if ( $product->is_purchasable() && $product->is_in_stock() && $product->is_type( 'simple' ) ) {
			$class .= ' ajax_add_to_cart';
		}
		return sprintf(
			'<a href="%s" data-quantity="1" data-product_id="%d" rel="nofollow" class="%s">%s</a>',
			esc_url( $url ),
			(int) $product->get_id(),
			esc_attr( $class ),
			esc_html( $label )
		);
	}
}
