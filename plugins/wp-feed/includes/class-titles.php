<?php
/**
 * Per-channel AI product title overrides.
 *
 * Stores three variants per product (google / meta / pinterest) in a single
 * post-meta JSON payload to avoid an extra table for what is small data.
 *
 * @package KlynaFeed
 */

namespace KlynaFeed;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Titles {

	public const META_KEY = '_wp_feed_titles';

	/**
	 * Supported channels and their per-channel constraints.
	 *
	 * @return array<string,array{label:string,max:int,style:string}>
	 */
	public static function channels(): array {
		return array(
			'google'    => array(
				'label' => 'Google Shopping',
				'max'   => 70,
				'style' => 'keyword-dense, includes brand + product type + key attributes (size, color, material). No emojis. No marketing fluff.',
			),
			'meta'      => array(
				'label' => 'Meta (Facebook & Instagram)',
				'max'   => 60,
				'style' => 'conversational, benefit-led, suitable for a social feed. Plain language. No emojis.',
			),
			'pinterest' => array(
				'label' => 'Pinterest',
				'max'   => 50,
				'style' => 'lifestyle, inspirational, evokes a use-case or aesthetic. Plain language. No emojis.',
			),
		);
	}

	/**
	 * Read the stored overrides for a product. Variations fall back to parent.
	 *
	 * @return array<string,string>
	 */
	public static function get( int $product_id ): array {
		$raw = get_post_meta( $product_id, self::META_KEY, true );
		if ( ! $raw && $product_id > 0 ) {
			$parent = (int) wp_get_post_parent_id( $product_id );
			if ( $parent > 0 ) {
				$raw = get_post_meta( $parent, self::META_KEY, true );
			}
		}
		$out  = array( 'google' => '', 'meta' => '', 'pinterest' => '' );
		if ( is_string( $raw ) && '' !== $raw ) {
			$decoded = json_decode( $raw, true );
			if ( is_array( $decoded ) ) {
				foreach ( array_keys( $out ) as $k ) {
					if ( isset( $decoded[ $k ] ) && is_string( $decoded[ $k ] ) ) {
						$out[ $k ] = $decoded[ $k ];
					}
				}
			}
		}
		return $out;
	}

	/**
	 * Persist overrides. Empty strings are kept (signal: cleared).
	 *
	 * @param array<string,string> $variants
	 */
	public static function save( int $product_id, array $variants ): void {
		$existing = self::get( $product_id );
		$clean    = $existing;
		foreach ( self::channels() as $ch => $cfg ) {
			if ( array_key_exists( $ch, $variants ) ) {
				$value = sanitize_text_field( (string) $variants[ $ch ] );
				if ( '' !== $value ) {
					$value = self::trim_to( $value, $cfg['max'] );
				}
				$clean[ $ch ] = $value;
			}
		}
		update_post_meta( $product_id, self::META_KEY, wp_json_encode( $clean ) );
	}

	/**
	 * Resolve the title to use for a given channel. Falls back to $default.
	 */
	public static function for_channel( int $product_id, string $channel, string $default ): string {
		$store = self::get( $product_id );
		$ch    = isset( $store[ $channel ] ) ? trim( (string) $store[ $channel ] ) : '';
		return '' !== $ch ? $ch : $default;
	}

	/**
	 * Build the user prompt sent to the AI for one channel.
	 */
	public static function prompt(
		string $channel,
		string $original_title,
		string $brand,
		string $category,
		string $description
	): string {
		$channels = self::channels();
		if ( ! isset( $channels[ $channel ] ) ) {
			return '';
		}
		$cfg  = $channels[ $channel ];
		$desc = wp_strip_all_tags( $description );
		$desc = self::trim_to( $desc, 400 );

		$lines   = array();
		$lines[] = sprintf(
			'Rewrite this product title for %s. Style: %s',
			$cfg['label'],
			$cfg['style']
		);
		$lines[] = sprintf( 'Hard max %d characters. Output exactly one line, no quotes, no trailing period.', $cfg['max'] );
		$lines[] = '';
		$lines[] = 'Original title: ' . $original_title;
		if ( '' !== $brand ) {
			$lines[] = 'Brand: ' . $brand;
		}
		if ( '' !== $category ) {
			$lines[] = 'Category: ' . $category;
		}
		if ( '' !== $desc ) {
			$lines[] = 'Description (truncated): ' . $desc;
		}
		return implode( "\n", $lines );
	}

	/**
	 * Tight character trim that prefers a word boundary.
	 */
	public static function trim_to( string $value, int $max ): string {
		$value = trim( preg_replace( '/\s+/', ' ', $value ) ?? $value );
		if ( $max <= 0 || mb_strlen( $value ) <= $max ) {
			return $value;
		}
		$cut = mb_substr( $value, 0, $max );
		$sp  = mb_strrpos( $cut, ' ' );
		if ( false !== $sp && $sp > (int) ( $max * 0.6 ) ) {
			$cut = mb_substr( $cut, 0, $sp );
		}
		return rtrim( $cut );
	}
}
