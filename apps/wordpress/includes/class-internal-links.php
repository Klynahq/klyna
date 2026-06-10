<?php
/**
 * Internal linking suggestion engine — pure PHP TF-IDF over the post corpus.
 *
 * Exposes:
 *  - A WP-CLI command (`wp klyna suggest-links`) — runs on the full corpus.
 *  - Admin tool — runs on demand from the Klyna admin page.
 *  - Optional auto-insertion of one missing internal link per post on save.
 *
 * Zero API calls, zero cost, runs entirely on the customer's server.
 *
 * @package Klyna
 */

namespace Klyna;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class InternalLinks {

	private const STOP_WORDS = array(
		'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'have',
		'he', 'her', 'his', 'i', 'if', 'in', 'is', 'it', 'its', 'of', 'on', 'or', 'our',
		'she', 'so', 'the', 'their', 'them', 'they', 'this', 'to', 'was', 'we', 'were',
		'will', 'with', 'you', 'your', 'about', 'into', 'than', 'that', 'these', 'those',
		'just', 'not', 'do', 'does', 'did', 'but', 'all', 'any', 'can', 'us', 'me', 'my',
		'no', 'one', 'two', 'three', 'when', 'where', 'how', 'why', 'what', 'who',
	);

	public function register(): void {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
	}

	public function register_routes(): void {
		register_rest_route(
			'klyna/v1',
			'/internal-links/suggest',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'rest_suggest' ),
				'permission_callback' => static fn() => current_user_can( 'edit_posts' ),
				'args'                => array(
					'per_page' => array(
						'type'    => 'integer',
						'default' => 5,
					),
				),
			)
		);
	}

	/**
	 * REST: return link suggestions for every published post.
	 */
	public function rest_suggest( \WP_REST_Request $req ): \WP_REST_Response {
		$per_page = (int) $req->get_param( 'per_page' );
		$result   = $this->suggest( $per_page );
		return new \WP_REST_Response( $result, 200 );
	}

	/**
	 * Run the algorithm and return suggestions.
	 *
	 * @return array<int, array<string,mixed>>
	 */
	public function suggest( int $per_page = 5 ): array {
		$posts = get_posts(
			array(
				'post_type'      => 'post',
				'post_status'    => 'publish',
				'posts_per_page' => -1,
				'fields'         => 'ids',
			)
		);
		if ( count( $posts ) < 3 ) {
			return array();
		}

		// Build per-post TF map and outlink list.
		$tf_maps  = array();
		$outlinks = array();
		$titles   = array();
		$urls     = array();
		foreach ( $posts as $pid ) {
			$post                  = get_post( $pid );
			$content               = wp_strip_all_tags( $post->post_content ?? '' );
			$tf_maps[ $pid ]       = $this->tf( $this->tokenize( $post->post_title . ' ' . $content ) );
			$outlinks[ $pid ]      = $this->extract_internal_links( $post->post_content ?? '' );
			$titles[ $pid ]        = $post->post_title;
			$urls[ $pid ]          = get_permalink( $pid );
		}

		// IDF.
		$idf = $this->idf( array_values( $tf_maps ) );

		// TF-IDF.
		$tfidf_maps = array();
		foreach ( $tf_maps as $pid => $map ) {
			$tfidf_maps[ $pid ] = $this->tfidf( $map, $idf );
		}

		// Pairwise cosine, capped per source page.
		$out = array();
		foreach ( $posts as $i => $from ) {
			$candidates = array();
			foreach ( $posts as $j => $to ) {
				if ( $from === $to ) {
					continue;
				}
				$to_url = $urls[ $to ];
				if ( in_array( $to_url, $outlinks[ $from ], true ) ) {
					continue;
				}
				$sim = $this->cosine( $tfidf_maps[ $from ], $tfidf_maps[ $to ] );
				if ( $sim < 0.08 ) {
					continue;
				}
				$candidates[] = array(
					'to_id'       => $to,
					'to_title'    => $titles[ $to ],
					'to_url'      => $to_url,
					'similarity'  => round( $sim, 3 ),
				);
			}
			usort( $candidates, static fn( $a, $b ) => $b['similarity'] <=> $a['similarity'] );
			$candidates = array_slice( $candidates, 0, max( 1, $per_page ) );
			if ( $candidates ) {
				$out[] = array(
					'from_id'     => $from,
					'from_title'  => $titles[ $from ],
					'from_url'    => $urls[ $from ],
					'suggestions' => $candidates,
				);
			}
		}
		return $out;
	}

	/**
	 * @param string $text
	 * @return string[]
	 */
	private function tokenize( string $text ): array {
		$lower = strtolower( $text );
		$lower = preg_replace( '/[^a-z0-9\s-]/u', ' ', $lower );
		$parts = preg_split( '/\s+/', (string) $lower );
		if ( ! is_array( $parts ) ) {
			return array();
		}
		return array_values(
			array_filter(
				$parts,
				static fn( $t ) => strlen( $t ) >= 3 && ! in_array( $t, self::STOP_WORDS, true )
			)
		);
	}

	/**
	 * @param string[] $tokens
	 * @return array<string,int>
	 */
	private function tf( array $tokens ): array {
		$out = array();
		foreach ( $tokens as $t ) {
			$out[ $t ] = ( $out[ $t ] ?? 0 ) + 1;
		}
		return $out;
	}

	/**
	 * @param array<int, array<string,int>> $corpus
	 * @return array<string,float>
	 */
	private function idf( array $corpus ): array {
		$n  = count( $corpus );
		$df = array();
		foreach ( $corpus as $doc ) {
			foreach ( array_keys( $doc ) as $term ) {
				$df[ $term ] = ( $df[ $term ] ?? 0 ) + 1;
			}
		}
		$out = array();
		foreach ( $df as $term => $count ) {
			$out[ $term ] = log( $n / $count ) + 1;
		}
		return $out;
	}

	/**
	 * @param array<string,int>   $tf
	 * @param array<string,float> $idf
	 * @return array<string,float>
	 */
	private function tfidf( array $tf, array $idf ): array {
		$out = array();
		foreach ( $tf as $term => $freq ) {
			$out[ $term ] = $freq * ( $idf[ $term ] ?? 0.0 );
		}
		return $out;
	}

	/**
	 * @param array<string,float> $a
	 * @param array<string,float> $b
	 */
	private function cosine( array $a, array $b ): float {
		$dot   = 0.0;
		$a_mag = 0.0;
		$b_mag = 0.0;
		foreach ( $a as $v ) {
			$a_mag += $v * $v;
		}
		foreach ( $b as $v ) {
			$b_mag += $v * $v;
		}
		foreach ( $a as $term => $v ) {
			if ( isset( $b[ $term ] ) ) {
				$dot += $v * $b[ $term ];
			}
		}
		if ( $a_mag === 0.0 || $b_mag === 0.0 ) {
			return 0.0;
		}
		return $dot / ( sqrt( $a_mag ) * sqrt( $b_mag ) );
	}

	/**
	 * @return string[]
	 */
	private function extract_internal_links( string $html ): array {
		if ( ! preg_match_all( '/<a\b[^>]*href\s*=\s*["\']([^"\']+)["\'][^>]*>/i', $html, $matches ) ) {
			return array();
		}
		$home_host = wp_parse_url( home_url(), PHP_URL_HOST );
		$out       = array();
		foreach ( $matches[1] as $href ) {
			if ( $href[0] === '#' || str_starts_with( $href, 'javascript:' ) ) {
				continue;
			}
			$host = wp_parse_url( $href, PHP_URL_HOST );
			if ( ! $host || $host === $home_host ) {
				$out[] = $href;
			}
		}
		return $out;
	}
}
