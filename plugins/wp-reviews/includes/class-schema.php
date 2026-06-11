<?php
/**
 * JSON-LD review schema injection.
 *
 * Emits a `Product` (or `LocalBusiness` fallback) node carrying
 * `aggregateRating` and a sample of individual `review` nodes on any singular
 * page that contains a `[klyna_reviews]` shortcode/block. This is what powers
 * Google rich-snippet stars in search results and LLM citations.
 *
 * Output mirrors the schema.org shapes used across the Klyna toolkit so the
 * markup is consistent with the SEO Suite.
 *
 * @package KlynaReviews
 */

namespace KlynaReviews;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Schema {

	private const SAMPLE_SIZE = 5;

	private Reviews $reviews;

	public function __construct() {
		$this->reviews = new Reviews();
	}

	public function register(): void {
		add_action( 'wp_head', array( $this, 'inject' ), 7 );
	}

	public function inject(): void {
		$settings = Plugin::settings();
		if ( empty( $settings['enable_aggregate_schema'] ) && empty( $settings['enable_review_schema'] ) ) {
			return;
		}
		if ( ! is_singular() ) {
			return;
		}

		$post = get_post();
		if ( ! $post ) {
			return;
		}

		$target = $this->detect_target( $post );
		if ( null === $target ) {
			return;
		}

		$aggregate = $this->reviews->aggregate( $target );
		if ( $aggregate['count'] < 1 ) {
			return;
		}

		$node = array(
			'@type' => 'Product',
			'name'  => $this->product_name( $settings, $post ),
			'url'   => get_permalink( $post ),
		);

		if ( ! empty( $settings['enable_aggregate_schema'] ) ) {
			$node['aggregateRating'] = array(
				'@type'       => 'AggregateRating',
				'ratingValue' => (string) number_format( $aggregate['average'], 1, '.', '' ),
				'reviewCount' => (int) $aggregate['count'],
				'bestRating'  => (int) ( $settings['max_rating'] ?? 5 ),
				'worstRating' => (int) ( $settings['min_rating'] ?? 1 ),
			);
		}

		if ( ! empty( $settings['enable_review_schema'] ) ) {
			$reviews = $this->reviews->get_for_target( $target, self::SAMPLE_SIZE, 1 );
			$nodes   = $this->review_nodes( $reviews, $settings );
			if ( $nodes ) {
				$node['review'] = $nodes;
			}
		}

		$payload = array_merge( array( '@context' => 'https://schema.org' ), $node );

		printf(
			"<script type=\"application/ld+json\">%s</script>\n",
			wp_json_encode( $payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE )
		);
	}

	/**
	 * Map a sample of reviews into schema.org Review nodes.
	 *
	 * @param array<int, array<string,mixed>> $reviews  Reviews.
	 * @param array<string,mixed>             $settings Plugin settings.
	 * @return array<int, array<string,mixed>>
	 */
	private function review_nodes( array $reviews, array $settings ): array {
		$best = (int) ( $settings['max_rating'] ?? 5 );
		$out  = array();
		foreach ( $reviews as $review ) {
			$out[] = array(
				'@type'         => 'Review',
				'reviewRating'  => array(
					'@type'       => 'Rating',
					'ratingValue' => (string) (int) $review['rating'],
					'bestRating'  => $best,
				),
				'author'        => array(
					'@type' => 'Person',
					'name'  => (string) $review['author'],
				),
				'datePublished' => (string) $review['date'],
				'name'          => (string) ( $review['title'] !== '' ? $review['title'] : $review['author'] ),
				'reviewBody'    => (string) $review['body'],
			);
		}
		return $out;
	}

	/**
	 * Resolve the review target for the current post. We only emit schema when
	 * the page actually surfaces reviews (shortcode or block present), so the
	 * stars Google shows always match what a visitor can see.
	 *
	 * @param \WP_Post $post Current post.
	 * @return string|null Target key, or null when the page has no reviews UI.
	 */
	private function detect_target( \WP_Post $post ): ?string {
		$content = (string) $post->post_content;

		if ( has_shortcode( $content, 'klyna_reviews' ) || has_shortcode( $content, 'klyna_review_stars' ) ) {
			return $this->shortcode_target( $content );
		}

		if ( function_exists( 'has_block' ) && has_block( 'klyna/reviews', $post ) ) {
			return $this->block_target( $post );
		}

		return null;
	}

	/**
	 * Extract the `target` attribute from the first review shortcode.
	 *
	 * @param string $content Post content.
	 */
	private function shortcode_target( string $content ): string {
		if ( preg_match( '/\[klyna_review[_a-z]*\b[^\]]*\btarget=["\']?([^"\'\]\s]+)/', $content, $m ) ) {
			return sanitize_text_field( $m[1] );
		}
		return 'site';
	}

	/**
	 * Extract the `target` attribute from the first klyna/reviews block.
	 *
	 * @param \WP_Post $post Current post.
	 */
	private function block_target( \WP_Post $post ): string {
		$blocks = parse_blocks( $post->post_content );
		foreach ( $blocks as $block ) {
			if ( 'klyna/reviews' === ( $block['blockName'] ?? '' ) && ! empty( $block['attrs']['target'] ) ) {
				return sanitize_text_field( (string) $block['attrs']['target'] );
			}
		}
		return 'site';
	}

	/**
	 * @param array<string,mixed> $settings Plugin settings.
	 * @param \WP_Post            $post     Current post.
	 */
	private function product_name( array $settings, \WP_Post $post ): string {
		$name = trim( (string) ( $settings['product_name'] ?? '' ) );
		if ( '' !== $name ) {
			return $name;
		}
		return get_the_title( $post );
	}
}
