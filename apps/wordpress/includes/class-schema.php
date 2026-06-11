<?php
/**
 * JSON-LD schema injection.
 *
 * Injects Organization + WebSite schema sitewide, plus BlogPosting +
 * BreadcrumbList on single posts. Generators mirror the TypeScript engine
 * in @klyna/core/schema so output is consistent across products.
 *
 * @package Klyna
 */

namespace Klyna;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Schema {

	public function register(): void {
		add_action( 'wp_head', array( $this, 'inject' ), 5 );
	}

	public function inject(): void {
		$settings = Plugin::settings();
		$graph    = array();

		// Defaults: schema-on. The admin UI toggles these but if the option
		// is empty (fresh install), schema should still ship.
		$enable_org = (bool) ( $settings['enable_organization'] ?? $settings['enable_org_schema'] ?? true );
		$enable_article = (bool) ( $settings['enable_schema'] ?? $settings['enable_article_schema'] ?? true );

		if ( $enable_org ) {
			$graph[] = $this->organization( $settings );
			$graph[] = $this->website( $settings );
		}

		if ( is_singular( 'post' ) && $enable_article ) {
			$post = get_post();
			if ( $post ) {
				$graph[] = $this->blog_posting( $post, $settings );
				$enable_breadcrumbs = (bool) ( $settings['enable_breadcrumbs'] ?? true );
				if ( $enable_breadcrumbs ) {
					$graph[] = $this->breadcrumb( $post );
				}
			}
		}

		if ( empty( $graph ) ) {
			return;
		}

		$payload = array(
			'@context' => 'https://schema.org',
			'@graph'   => $graph,
		);
		printf(
			"<script type=\"application/ld+json\">%s</script>\n",
			wp_json_encode( $payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE )
		);
	}

	/**
	 * @param array<string,mixed> $settings
	 * @return array<string,mixed>
	 */
	private function organization( array $settings ): array {
		$home = home_url( '/' );
		$name = (string) ( $settings['organization_name'] ?? $settings['org_name'] ?? get_bloginfo( 'name' ) );
		$logo = (string) ( $settings['organization_logo'] ?? $settings['org_logo'] ?? '' );
		$out  = array(
			'@type' => 'Organization',
			'@id'   => $home . '#organization',
			'name'  => $name,
			'url'   => $home,
		);
		if ( '' !== $logo ) {
			$out['logo'] = $logo;
		}
		$same_as = $this->parse_list( (string) ( $settings['org_same_as'] ?? '' ) );
		$twitter = (string) ( $settings['twitter_handle'] ?? '' );
		if ( '' !== $twitter ) {
			$handle    = ltrim( $twitter, '@' );
			$same_as[] = 'https://x.com/' . $handle;
		}
		if ( $same_as ) {
			$out['sameAs'] = array_values( array_unique( $same_as ) );
		}
		$description = get_bloginfo( 'description' );
		if ( $description ) {
			$out['description'] = $description;
		}
		return $out;
	}

	/**
	 * @param array<string,mixed> $settings
	 * @return array<string,mixed>
	 */
	private function website( array $settings ): array {
		$home = home_url( '/' );
		return array(
			'@type'      => 'WebSite',
			'@id'        => $home . '#website',
			'url'        => $home,
			'name'       => (string) ( $settings['organization_name'] ?? $settings['org_name'] ?? get_bloginfo( 'name' ) ),
			'publisher'  => array( '@id' => $home . '#organization' ),
			'inLanguage' => get_bloginfo( 'language' ),
		);
	}

	/**
	 * @param \WP_Post            $post
	 * @param array<string,mixed> $settings
	 * @return array<string,mixed>
	 */
	private function blog_posting( \WP_Post $post, array $settings ): array {
		$url            = get_permalink( $post );
		$image          = get_the_post_thumbnail_url( $post, 'full' );
		$author_id      = (int) $post->post_author;
		$author_display = get_the_author_meta( 'display_name', $author_id );
		$home           = home_url( '/' );

		$tags     = wp_get_post_tags( $post->ID, array( 'fields' => 'names' ) );
		$category = wp_get_post_categories( $post->ID, array( 'fields' => 'names' ) );

		$out = array(
			'@type'            => 'BlogPosting',
			'@id'              => $url . '#article',
			'headline'         => get_the_title( $post ),
			'description'      => $this->meta_description( $post ),
			'url'              => $url,
			'datePublished'    => get_the_date( DATE_W3C, $post ),
			'dateModified'     => get_the_modified_date( DATE_W3C, $post ),
			'author'           => array(
				'@type' => 'Person',
				'name'  => $author_display,
				'url'   => get_author_posts_url( $author_id ),
			),
			'publisher'        => array( '@id' => $home . '#organization' ),
			'mainEntityOfPage' => array(
				'@type' => 'WebPage',
				'@id'   => $url,
			),
			'inLanguage'       => get_bloginfo( 'language' ),
		);
		if ( $image ) {
			$out['image'] = $image;
		}
		if ( $tags ) {
			$out['keywords'] = implode( ', ', $tags );
		}
		if ( $category ) {
			$out['articleSection'] = $category[0];
		}
		return $out;
	}

	/**
	 * @return array<string,mixed>
	 */
	private function breadcrumb( \WP_Post $post ): array {
		$items = array(
			array( 'name' => __( 'Home', 'klyna' ), 'url' => home_url( '/' ) ),
		);
		$cats = wp_get_post_categories( $post->ID, array( 'fields' => 'all' ) );
		if ( $cats && isset( $cats[0] ) ) {
			$cat   = $cats[0];
			$items[] = array(
				'name' => $cat->name,
				'url'  => get_category_link( $cat ),
			);
		}
		$items[] = array(
			'name' => get_the_title( $post ),
			'url'  => get_permalink( $post ),
		);

		return array(
			'@type'           => 'BreadcrumbList',
			'itemListElement' => array_values(
				array_map(
					static fn( $item, $i ) => array(
						'@type'    => 'ListItem',
						'position' => $i + 1,
						'name'     => $item['name'],
						'item'     => $item['url'],
					),
					$items,
					array_keys( $items )
				)
			),
		);
	}

	private function meta_description( \WP_Post $post ): string {
		$excerpt = get_the_excerpt( $post );
		if ( $excerpt ) {
			return wp_strip_all_tags( $excerpt );
		}
		$content = wp_strip_all_tags( $post->post_content );
		return mb_substr( trim( $content ), 0, 158 );
	}

	/**
	 * @return string[]
	 */
	private function parse_list( string $raw ): array {
		$items = preg_split( '/[\r\n,]+/', $raw );
		if ( ! is_array( $items ) ) {
			return array();
		}
		return array_values( array_filter( array_map( 'trim', $items ) ) );
	}
}
