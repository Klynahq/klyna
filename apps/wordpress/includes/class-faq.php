<?php
/**
 * FAQ block + FAQPage schema.
 *
 * Adds a Gutenberg block helper: any `<details><summary>Q</summary>A</details>`
 * pattern or any heading-followed-by-paragraph that looks like a Q/A is detected
 * and emitted as FAQPage JSON-LD on the page. Massive GEO citation lift.
 *
 * @package Klyna
 */

namespace Klyna;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Faq {

	public function register(): void {
		add_action( 'wp_head', array( $this, 'inject' ), 6 );
	}

	public function inject(): void {
		$settings = Plugin::settings();
		if ( empty( $settings['enable_faq_schema'] ) ) {
			return;
		}
		if ( ! is_singular() ) {
			return;
		}
		$post = get_post();
		if ( ! $post ) {
			return;
		}
		$pairs = $this->detect_faqs( $post->post_content );
		if ( empty( $pairs ) ) {
			return;
		}
		$payload = array(
			'@context'   => 'https://schema.org',
			'@type'      => 'FAQPage',
			'mainEntity' => array_map(
				static fn( $p ) => array(
					'@type'          => 'Question',
					'name'           => $p['q'],
					'acceptedAnswer' => array(
						'@type' => 'Answer',
						'text'  => $p['a'],
					),
				),
				$pairs
			),
		);
		printf(
			"<script type=\"application/ld+json\">%s</script>\n",
			wp_json_encode( $payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE )
		);
	}

	/**
	 * @return array<int, array{q:string,a:string}>
	 */
	private function detect_faqs( string $html ): array {
		$out = array();

		// Pattern 1: <details><summary>Q</summary>A</details>
		if ( preg_match_all(
			'/<details\b[^>]*>\s*<summary\b[^>]*>(.*?)<\/summary>(.*?)<\/details>/is',
			$html,
			$matches,
			PREG_SET_ORDER
		) ) {
			foreach ( $matches as $m ) {
				$q = trim( wp_strip_all_tags( $m[1] ) );
				$a = trim( wp_strip_all_tags( $m[2] ) );
				if ( $q && $a ) {
					$out[] = array( 'q' => $q, 'a' => $a );
				}
			}
		}

		// Pattern 2: question-shaped headings followed by a paragraph.
		// Common in indie blog posts; keeps the editor experience natural.
		if ( preg_match_all(
			'/<h[2-4]\b[^>]*>([^<]*\?)<\/h[2-4]>\s*<p\b[^>]*>(.*?)<\/p>/is',
			$html,
			$matches,
			PREG_SET_ORDER
		) ) {
			foreach ( $matches as $m ) {
				$q = trim( wp_strip_all_tags( $m[1] ) );
				$a = trim( wp_strip_all_tags( $m[2] ) );
				if ( $q && $a && mb_strlen( $a ) > 20 ) {
					$out[] = array( 'q' => $q, 'a' => $a );
				}
			}
		}

		// Dedupe by question text.
		$seen = array();
		$result = array();
		foreach ( $out as $pair ) {
			$key = mb_strtolower( $pair['q'] );
			if ( ! isset( $seen[ $key ] ) ) {
				$seen[ $key ] = true;
				$result[] = $pair;
			}
		}
		return $result;
	}
}
