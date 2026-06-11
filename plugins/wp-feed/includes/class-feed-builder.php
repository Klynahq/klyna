<?php
/**
 * Feed builder — turns the WooCommerce catalog into Google Shopping XML and a
 * Meta (Facebook/Instagram) product CSV.
 *
 * Pure PHP, no external services. Field mapping (gtin, brand, condition,
 * Google product category) is configurable from Settings, with per-product
 * meta overrides. Include/exclude by category and stock status are applied
 * during the query. Every product is run through a small rule set that emits
 * health warnings for missing required fields.
 *
 * Degrades gracefully: when WooCommerce is not active, building returns an
 * empty result with a single explanatory warning rather than fataling.
 *
 * @package KlynaFeed
 */

namespace KlynaFeed;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Feed_Builder {

	/**
	 * Google Shopping required attributes we validate for. These map to the
	 * `g:` namespaced elements in the RSS 2.0 output.
	 *
	 * @var string[]
	 */
	private const GOOGLE_REQUIRED = array( 'id', 'title', 'description', 'link', 'image_link', 'availability', 'price' );

	/**
	 * Resolved settings snapshot.
	 *
	 * @var array<string,mixed>
	 */
	private array $settings;

	/**
	 * Accumulated health warnings for the most recent build.
	 *
	 * @var array<int, array{product_id:int,product:string,field:string,message:string}>
	 */
	private array $warnings = array();

	/**
	 * Which channel the next collect_items() pass is rendering for.
	 * Used to pick the correct AI-optimized title override.
	 */
	private string $channel = '';

	public function __construct() {
		$this->settings = wp_parse_args(
			Plugin::settings(),
			array(
				'default_brand'      => get_bloginfo( 'name' ),
				'default_condition'  => 'new',
				'include_categories' => array(),
				'exclude_categories' => array(),
				'in_stock_only'      => true,
				'gtin_meta_key'      => '_gtin',
				'brand_meta_key'     => '_brand',
				'google_category'    => '',
			)
		);
	}

	/**
	 * Build the Google Shopping XML feed.
	 *
	 * @return array{payload:string,item_count:int,warning_count:int,warnings:array<int,array<string,string|int>>}
	 */
	public function build_google(): array {
		$this->channel = 'google';
		$items = $this->collect_items();
		$xml   = $this->render_google_xml( $items );
		return array(
			'payload'       => $xml,
			'item_count'    => count( $items ),
			'warning_count' => count( $this->warnings ),
			'warnings'      => $this->warnings,
		);
	}

	/**
	 * Build the Meta product CSV feed.
	 *
	 * @return array{payload:string,item_count:int,warning_count:int,warnings:array<int,array<string,string|int>>}
	 */
	public function build_meta(): array {
		$this->channel = 'meta';
		$items = $this->collect_items();
		$csv   = $this->render_meta_csv( $items );
		return array(
			'payload'       => $csv,
			'item_count'    => count( $items ),
			'warning_count' => count( $this->warnings ),
			'warnings'      => $this->warnings,
		);
	}

	/**
	 * Run health validation only (no payload rendering). Used by the dashboard.
	 *
	 * @return array{item_count:int,warning_count:int,warnings:array<int,array<string,string|int>>}
	 */
	public function health(): array {
		$items = $this->collect_items();
		return array(
			'item_count'    => count( $items ),
			'warning_count' => count( $this->warnings ),
			'warnings'      => $this->warnings,
		);
	}

	/**
	 * Query WooCommerce and normalize each purchasable product into a flat
	 * attribute map shared by both the Google and Meta renderers.
	 *
	 * @return array<int, array<string,string>>
	 */
	private function collect_items(): array {
		$this->warnings = array();

		if ( ! Plugin::woocommerce_active() ) {
			$this->warnings[] = array(
				'product_id' => 0,
				'product'    => '',
				'field'      => 'woocommerce',
				'message'    => __( 'WooCommerce is not active. Activate WooCommerce to generate product feeds.', 'wp-feed' ),
			);
			return array();
		}

		$query_args = array(
			'status'  => array( 'publish' ),
			'limit'   => -1,
			'orderby' => 'date',
			'order'   => 'DESC',
			'return'  => 'objects',
		);

		$include = $this->term_ids( $this->settings['include_categories'] );
		if ( $include ) {
			$query_args['category'] = $this->term_slugs( $include );
		}
		if ( ! empty( $this->settings['in_stock_only'] ) ) {
			$query_args['stock_status'] = 'instock';
		}

		$products = wc_get_products( $query_args );
		$exclude  = $this->term_ids( $this->settings['exclude_categories'] );
		$items    = array();

		foreach ( (array) $products as $product ) {
			if ( ! $product instanceof \WC_Product ) {
				continue;
			}
			// Skip parent variable products; export their concrete variations.
			if ( $product->is_type( 'variable' ) ) {
				foreach ( $product->get_children() as $variation_id ) {
					$variation = wc_get_product( $variation_id );
					if ( $variation instanceof \WC_Product && $this->passes_filters( $variation, $exclude ) ) {
						$items[] = $this->map_product( $variation, $product );
					}
				}
				continue;
			}
			if ( $this->passes_filters( $product, $exclude ) ) {
				$items[] = $this->map_product( $product, null );
			}
		}

		return $items;
	}

	/**
	 * Apply exclude-category and stock filters that wc_get_products cannot
	 * express directly (variations inherit the parent's terms).
	 *
	 * @param int[] $exclude
	 */
	private function passes_filters( \WC_Product $product, array $exclude ): bool {
		if ( ! empty( $this->settings['in_stock_only'] ) && ! $product->is_in_stock() ) {
			return false;
		}
		if ( $exclude ) {
			$parent_id = $product->get_parent_id() ? $product->get_parent_id() : $product->get_id();
			$terms     = wc_get_product_term_ids( $parent_id, 'product_cat' );
			if ( array_intersect( $exclude, (array) $terms ) ) {
				return false;
			}
		}
		return true;
	}

	/**
	 * Normalize one product (or variation) to the shared attribute map and
	 * record any missing-required-field warnings.
	 *
	 * @param \WC_Product      $product Product or variation being exported.
	 * @param \WC_Product|null $parent  Parent product for variations, else null.
	 * @return array<string,string>
	 */
	private function map_product( \WC_Product $product, ?\WC_Product $parent ): array {
		$id          = $product->get_id();
		$title       = $product->get_name();
		// Apply per-channel AI title override if one is stored for this
		// product (or its parent, for variations).
		if ( '' !== $this->channel ) {
			$override_lookup = $parent ? (int) $parent->get_id() : (int) $id;
			$title = Titles::for_channel( $override_lookup, $this->channel, $title );
		}
		$description = $this->description( $product, $parent );
		$link        = (string) get_permalink( $parent ? $parent->get_id() : $id );
		$image       = $this->image_url( $product, $parent );
		$price       = $this->price( $product );
		$sale_price  = $this->sale_price( $product );
		$availability = $product->is_in_stock() ? 'in_stock' : 'out_of_stock';

		$brand     = $this->meta_or_default( $product, $parent, (string) $this->settings['brand_meta_key'], (string) $this->settings['default_brand'] );
		$gtin      = $this->meta_value( $product, $parent, (string) $this->settings['gtin_meta_key'] );
		$mpn       = $product->get_sku();
		$condition = $this->condition( $product, $parent );
		$category  = $this->google_category( $product, $parent );
		$ptype     = $this->product_type_path( $parent ? $parent->get_id() : $id );

		$item = array(
			'id'                     => (string) $id,
			'title'                  => $this->clean( $title ),
			'description'            => $this->clean( $description ),
			'link'                   => $link,
			'image_link'             => $image,
			'availability'           => $availability,
			'price'                  => $price,
			'sale_price'             => $sale_price,
			'brand'                  => $this->clean( $brand ),
			'gtin'                   => $gtin,
			'mpn'                    => $mpn,
			'condition'              => $condition,
			'google_product_category' => $category,
			'product_type'           => $ptype,
			'item_group_id'          => $parent ? (string) $parent->get_id() : '',
		);

		$this->validate( $item, $product );

		return $item;
	}

	/**
	 * Record health warnings for missing required / strongly-recommended fields.
	 *
	 * @param array<string,string> $item
	 */
	private function validate( array $item, \WC_Product $product ): void {
		$label = $item['title'] !== '' ? $item['title'] : ( '#' . $item['id'] );

		foreach ( self::GOOGLE_REQUIRED as $field ) {
			if ( '' === trim( (string) ( $item[ $field ] ?? '' ) ) ) {
				$this->warnings[] = array(
					'product_id' => (int) $item['id'],
					'product'    => $label,
					'field'      => $field,
					/* translators: %s: feed attribute name. */
					'message'    => sprintf( __( 'Missing required attribute: %s', 'wp-feed' ), $field ),
				);
			}
		}

		// GTIN or MPN+brand is required by both Google and Meta for most categories.
		if ( '' === trim( $item['gtin'] ) && ( '' === trim( $item['mpn'] ) || '' === trim( $item['brand'] ) ) ) {
			$this->warnings[] = array(
				'product_id' => (int) $item['id'],
				'product'    => $label,
				'field'      => 'gtin',
				'message'    => __( 'No GTIN, and no MPN+brand fallback. Google may reject this item.', 'wp-feed' ),
			);
		}

		if ( mb_strlen( $item['description'] ) < 30 ) {
			$this->warnings[] = array(
				'product_id' => (int) $item['id'],
				'product'    => $label,
				'field'      => 'description',
				'message'    => __( 'Description is very short (under 30 characters).', 'wp-feed' ),
			);
		}
	}

	/* ------------------------------------------------------------------ *
	 * Renderers
	 * ------------------------------------------------------------------ */

	/**
	 * Render a Google Shopping RSS 2.0 feed.
	 *
	 * @param array<int, array<string,string>> $items
	 */
	private function render_google_xml( array $items ): string {
		$site_title = $this->clean( get_bloginfo( 'name' ) );
		$site_desc  = $this->clean( get_bloginfo( 'description' ) );
		$link       = esc_url_raw( home_url( '/' ) );

		$out  = '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
		$out .= '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">' . "\n";
		$out .= "\t<channel>\n";
		$out .= "\t\t<title>" . $this->cdata( $site_title ) . "</title>\n";
		$out .= "\t\t<link>" . esc_xml( $link ) . "</link>\n";
		$out .= "\t\t<description>" . $this->cdata( $site_desc ) . "</description>\n";

		foreach ( $items as $item ) {
			$out .= "\t\t<item>\n";
			$out .= $this->g_tag( 'g:id', $item['id'] );
			$out .= $this->tag( 'title', $item['title'], true );
			$out .= $this->tag( 'description', $item['description'], true );
			$out .= $this->tag( 'link', esc_url_raw( $item['link'] ) );
			$out .= $this->g_tag( 'g:image_link', esc_url_raw( $item['image_link'] ) );
			$out .= $this->g_tag( 'g:availability', $item['availability'] );
			$out .= $this->g_tag( 'g:price', $item['price'] );
			if ( '' !== $item['sale_price'] ) {
				$out .= $this->g_tag( 'g:sale_price', $item['sale_price'] );
			}
			$out .= $this->g_tag( 'g:condition', $item['condition'] );
			if ( '' !== $item['brand'] ) {
				$out .= $this->g_tag( 'g:brand', $item['brand'], true );
			}
			if ( '' !== $item['gtin'] ) {
				$out .= $this->g_tag( 'g:gtin', $item['gtin'] );
			}
			if ( '' !== $item['mpn'] ) {
				$out .= $this->g_tag( 'g:mpn', $item['mpn'] );
			}
			if ( '' !== $item['google_product_category'] ) {
				$out .= $this->g_tag( 'g:google_product_category', $item['google_product_category'], true );
			}
			if ( '' !== $item['product_type'] ) {
				$out .= $this->g_tag( 'g:product_type', $item['product_type'], true );
			}
			if ( '' !== $item['item_group_id'] ) {
				$out .= $this->g_tag( 'g:item_group_id', $item['item_group_id'] );
			}
			$out .= "\t\t</item>\n";
		}

		$out .= "\t</channel>\n";
		$out .= '</rss>' . "\n";
		return $out;
	}

	/**
	 * Render the Meta (Facebook/Instagram) product CSV.
	 *
	 * Column order follows Meta's commerce catalog template.
	 *
	 * @param array<int, array<string,string>> $items
	 */
	private function render_meta_csv( array $items ): string {
		$columns = array(
			'id',
			'title',
			'description',
			'availability',
			'condition',
			'price',
			'sale_price',
			'link',
			'image_link',
			'brand',
			'google_product_category',
			'gtin',
			'mpn',
			'item_group_id',
		);

		$handle = fopen( 'php://temp', 'r+' );
		fputcsv( $handle, $columns );

		foreach ( $items as $item ) {
			$row = array();
			foreach ( $columns as $col ) {
				$value = (string) ( $item[ $col ] ?? '' );
				// Meta expects "12.99 USD" formatting in the price columns.
				if ( ( 'price' === $col || 'sale_price' === $col ) && '' !== $value ) {
					$value = $this->meta_price( $value );
				}
				$row[] = $value;
			}
			fputcsv( $handle, $row );
		}

		rewind( $handle );
		$csv = (string) stream_get_contents( $handle );
		fclose( $handle );
		return $csv;
	}

	/* ------------------------------------------------------------------ *
	 * Field mapping helpers
	 * ------------------------------------------------------------------ */

	private function description( \WC_Product $product, ?\WC_Product $parent ): string {
		$desc = $product->get_description();
		if ( '' === trim( $desc ) && $parent ) {
			$desc = $parent->get_description();
		}
		if ( '' === trim( $desc ) ) {
			$desc = $product->get_short_description();
		}
		$desc = wp_strip_all_tags( (string) $desc );
		return trim( $desc );
	}

	private function image_url( \WC_Product $product, ?\WC_Product $parent ): string {
		$image_id = $product->get_image_id();
		if ( ! $image_id && $parent ) {
			$image_id = $parent->get_image_id();
		}
		if ( ! $image_id ) {
			return '';
		}
		$url = wp_get_attachment_image_url( (int) $image_id, 'full' );
		return $url ? (string) $url : '';
	}

	private function price( \WC_Product $product ): string {
		$price = wc_get_price_to_display(
			$product,
			array( 'price' => $product->get_regular_price() )
		);
		if ( '' === $product->get_regular_price() ) {
			$price = wc_get_price_to_display( $product );
		}
		return $this->format_price( (float) $price );
	}

	private function sale_price( \WC_Product $product ): string {
		if ( ! $product->is_on_sale() || '' === $product->get_sale_price() ) {
			return '';
		}
		$price = wc_get_price_to_display( $product, array( 'price' => $product->get_sale_price() ) );
		return $this->format_price( (float) $price );
	}

	private function format_price( float $amount ): string {
		$currency = get_woocommerce_currency();
		return number_format( $amount, wc_get_price_decimals(), '.', '' ) . ' ' . $currency;
	}

	/**
	 * Meta wants the same "amount CUR" shape but never an empty unit; reuse the
	 * Google value which is already "12.99 USD".
	 */
	private function meta_price( string $google_price ): string {
		return $google_price;
	}

	private function condition( \WC_Product $product, ?\WC_Product $parent ): string {
		$value = $this->meta_value( $product, $parent, '_condition' );
		if ( '' !== $value ) {
			return $value;
		}
		$default = (string) ( $this->settings['default_condition'] ?? 'new' );
		return in_array( $default, array( 'new', 'refurbished', 'used' ), true ) ? $default : 'new';
	}

	private function google_category( \WC_Product $product, ?\WC_Product $parent ): string {
		$value = $this->meta_value( $product, $parent, '_google_product_category' );
		if ( '' !== $value ) {
			return $value;
		}
		return (string) ( $this->settings['google_category'] ?? '' );
	}

	/**
	 * Build a "Parent > Child" category breadcrumb for the product_type field.
	 */
	private function product_type_path( int $product_id ): string {
		$terms = get_the_terms( $product_id, 'product_cat' );
		if ( ! is_array( $terms ) || ! $terms ) {
			return '';
		}
		$term  = $terms[0];
		$names = array( $term->name );
		$guard = 0;
		while ( $term->parent && $guard < 6 ) {
			$term = get_term( $term->parent, 'product_cat' );
			if ( ! $term instanceof \WP_Term ) {
				break;
			}
			array_unshift( $names, $term->name );
			++$guard;
		}
		return $this->clean( implode( ' > ', $names ) );
	}

	/**
	 * Read a meta key off the product, falling back to the parent, falling
	 * back to a supplied default.
	 */
	private function meta_or_default( \WC_Product $product, ?\WC_Product $parent, string $key, string $default ): string {
		$value = $this->meta_value( $product, $parent, $key );
		return '' !== $value ? $value : $default;
	}

	private function meta_value( \WC_Product $product, ?\WC_Product $parent, string $key ): string {
		if ( '' === $key ) {
			return '';
		}
		$value = $product->get_meta( $key, true );
		if ( ( '' === $value || null === $value ) && $parent ) {
			$value = $parent->get_meta( $key, true );
		}
		return is_scalar( $value ) ? trim( (string) $value ) : '';
	}

	/* ------------------------------------------------------------------ *
	 * Small utilities
	 * ------------------------------------------------------------------ */

	/**
	 * Resolve a mixed include/exclude setting (array of term IDs) to ints.
	 *
	 * @param mixed $value
	 * @return int[]
	 */
	private function term_ids( $value ): array {
		if ( ! is_array( $value ) ) {
			return array();
		}
		return array_values( array_filter( array_map( 'absint', $value ) ) );
	}

	/**
	 * Convert term IDs to slugs for the wc_get_products `category` arg.
	 *
	 * @param int[] $ids
	 * @return string[]
	 */
	private function term_slugs( array $ids ): array {
		$slugs = array();
		foreach ( $ids as $id ) {
			$term = get_term( $id, 'product_cat' );
			if ( $term instanceof \WP_Term ) {
				$slugs[] = $term->slug;
			}
		}
		return $slugs;
	}

	private function clean( string $value ): string {
		$value = wp_strip_all_tags( $value );
		$value = preg_replace( '/\s+/', ' ', $value );
		return trim( (string) $value );
	}

	private function tag( string $name, string $value, bool $cdata = false ): string {
		$inner = $cdata ? $this->cdata( $value ) : esc_xml( $value );
		return "\t\t\t<{$name}>{$inner}</{$name}>\n";
	}

	private function g_tag( string $name, string $value, bool $cdata = false ): string {
		return $this->tag( $name, $value, $cdata );
	}

	private function cdata( string $value ): string {
		// Guard against the CDATA terminator appearing in product copy.
		$value = str_replace( ']]>', ']]]]><![CDATA[>', $value );
		return '<![CDATA[' . $value . ']]>';
	}
}
