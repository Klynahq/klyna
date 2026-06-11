<?php
/**
 * Review theme summaries.
 *
 * AI-generated digests of the most common themes across a target's reviews.
 * Stored as an option array keyed by target so we can look up themes for any
 * product, page, or "site" without a custom table.
 *
 * @package KlynaReviews
 */

namespace KlynaReviews;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Themes {

	private const OPTION_KEY = 'wp_reviews_themes';

	/**
	 * Parse "THEME: x / QUOTE: y" lines from the AI text into structured data.
	 *
	 * @return array<int, array{theme:string, quote:string}>
	 */
	public static function parse( string $text ): array {
		$lines  = preg_split( '/\r?\n/', trim( $text ) );
		$themes = array();
		$current = null;
		foreach ( (array) $lines as $line ) {
			$line = trim( (string) $line );
			if ( '' === $line ) {
				continue;
			}
			if ( preg_match( '/^THEME\s*:\s*(.+)$/i', $line, $m ) ) {
				if ( is_array( $current ) && '' !== $current['theme'] ) {
					$themes[] = $current;
				}
				$current = array(
					'theme' => sanitize_text_field( $m[1] ),
					'quote' => '',
				);
			} elseif ( preg_match( '/^QUOTE\s*:\s*(.+)$/i', $line, $m ) ) {
				if ( is_array( $current ) ) {
					$current['quote'] = sanitize_text_field( trim( $m[1], " \t\n\r\0\x0B\"'" ) );
				}
			}
		}
		if ( is_array( $current ) && '' !== $current['theme'] ) {
			$themes[] = $current;
		}
		return array_slice( $themes, 0, 3 );
	}

	/**
	 * Persist parsed themes for a target.
	 *
	 * @param array<int, array{theme:string, quote:string}> $themes Themes.
	 */
	public static function save( string $target, array $themes ): void {
		$all = (array) get_option( self::OPTION_KEY, array() );
		$all[ $target ] = array(
			'themes'     => array_values( $themes ),
			'updated_at' => time(),
		);
		update_option( self::OPTION_KEY, $all, false );
	}

	/**
	 * Get themes for a target.
	 *
	 * @return array<int, array{theme:string, quote:string}>
	 */
	public static function get( string $target ): array {
		$all = (array) get_option( self::OPTION_KEY, array() );
		if ( empty( $all[ $target ]['themes'] ) || ! is_array( $all[ $target ]['themes'] ) ) {
			return array();
		}
		return $all[ $target ]['themes'];
	}

	public static function clear( string $target ): void {
		$all = (array) get_option( self::OPTION_KEY, array() );
		unset( $all[ $target ] );
		update_option( self::OPTION_KEY, $all, false );
	}
}
