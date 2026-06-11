<?php
/**
 * AI weekly traffic narrative.
 *
 * Aggregates the last 7 days of analytics, asks the configured AI provider
 * for a 100-word narrative highlighting the biggest spike, the standout
 * content, and one concrete suggestion. The result is cached for 24h in an
 * option so the dashboard renders it instantly.
 *
 * @package KlynaAnalytics
 */

namespace KlynaAnalytics;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Insight {

	public const OPTION_KEY = 'wp_analytics_weekly_insight';
	private const CACHE_TTL = DAY_IN_SECONDS;

	/**
	 * Return the cached narrative (or null) plus metadata for rendering.
	 *
	 * @return array{text:string, generated_at:int, range:array{since:string,until:string}, totals:array{views:int,visitors:int}}|null
	 */
	public static function get_cached(): ?array {
		$raw = get_option( self::OPTION_KEY, null );
		if ( ! is_array( $raw ) || empty( $raw['text'] ) || empty( $raw['generated_at'] ) ) {
			return null;
		}
		if ( ( time() - (int) $raw['generated_at'] ) > self::CACHE_TTL ) {
			return null;
		}
		return array(
			'text'         => (string) $raw['text'],
			'generated_at' => (int) $raw['generated_at'],
			'range'        => (array) ( $raw['range'] ?? array() ),
			'totals'       => (array) ( $raw['totals'] ?? array() ),
		);
	}

	/**
	 * Force-regenerate the weekly narrative and write it to the option cache.
	 *
	 * @return array{ok:bool, text:string, reason?:string, generated_at?:int}
	 */
	public static function regenerate(): array {
		$snapshot = self::weekly_snapshot();
		if ( $snapshot['totals']['views'] < 1 ) {
			$text = __( 'Not enough traffic in the last 7 days to summarize. Once visitors arrive, this card will surface the spike, the standout post, and one suggestion.', 'wp-analytics' );
			$payload = array(
				'text'         => $text,
				'generated_at' => time(),
				'range'        => $snapshot['range'],
				'totals'       => $snapshot['totals'],
			);
			update_option( self::OPTION_KEY, $payload, false );
			return array( 'ok' => true, 'text' => $text, 'generated_at' => $payload['generated_at'], 'cached' => false );
		}

		$prompt = self::build_prompt( $snapshot );
		$ai     = new Ai();
		$result = $ai->complete(
			$prompt,
			array(
				'temperature' => 0.5,
				'max_tokens'  => 320,
			)
		);
		if ( empty( $result['ok'] ) ) {
			return array(
				'ok'     => false,
				'reason' => (string) ( $result['reason'] ?? 'ai_error' ),
				'text'   => (string) ( $result['text'] ?? '' ),
			);
		}

		$text    = self::clean_text( (string) $result['text'] );
		$payload = array(
			'text'         => $text,
			'generated_at' => time(),
			'range'        => $snapshot['range'],
			'totals'       => $snapshot['totals'],
		);
		update_option( self::OPTION_KEY, $payload, false );

		return array(
			'ok'           => true,
			'text'         => $text,
			'generated_at' => $payload['generated_at'],
		);
	}

	/**
	 * Aggregate the last 7 days from the storage table.
	 *
	 * @return array{range:array{since:string,until:string,days:int}, totals:array{views:int,visitors:int}, series:array<int,array{date:string,views:int,visitors:int}>, top_pages:array<int,array{path:string,views:int}>, top_referrers:array<int,array{host:string,views:int}>, biggest_spike:array{date:string,views:int,delta:int}|null}
	 */
	public static function weekly_snapshot(): array {
		global $wpdb;

		$reports = new Reports();
		$series  = $reports->daily_series( 7 );
		$totals  = $reports->totals( 7 );

		$table = Storage::table();
		$since = $series ? $series[0]['date'] : gmdate( 'Y-m-d', time() - 6 * DAY_IN_SECONDS );
		$until = $series ? $series[ count( $series ) - 1 ]['date'] : gmdate( 'Y-m-d' );

		// phpcs:disable WordPress.DB.DirectDatabaseQuery, WordPress.DB.PreparedSQL.NotPrepared
		$top_pages = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT path, SUM(hits) AS views
				 FROM {$table}
				 WHERE day >= %s AND event = 'pageview'
				 GROUP BY path
				 ORDER BY views DESC
				 LIMIT 5",
				$since
			),
			ARRAY_A
		);
		$top_referrers = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT ref_host, SUM(hits) AS views
				 FROM {$table}
				 WHERE day >= %s AND event = 'pageview' AND ref_host <> ''
				 GROUP BY ref_host
				 ORDER BY views DESC
				 LIMIT 5",
				$since
			),
			ARRAY_A
		);
		// phpcs:enable

		// Detect biggest day-over-day spike inside the window.
		$biggest = null;
		$prev    = null;
		foreach ( $series as $point ) {
			if ( null !== $prev ) {
				$delta = (int) $point['views'] - (int) $prev['views'];
				if ( null === $biggest || $delta > $biggest['delta'] ) {
					$biggest = array(
						'date'  => (string) $point['date'],
						'views' => (int) $point['views'],
						'delta' => $delta,
					);
				}
			}
			$prev = $point;
		}

		return array(
			'range'         => array(
				'since' => (string) $since,
				'until' => (string) $until,
				'days'  => 7,
			),
			'totals'        => array(
				'views'    => (int) $totals['views'],
				'visitors' => (int) $totals['visitors'],
			),
			'series'        => $series,
			'top_pages'     => array_map(
				static function ( $row ) {
					return array(
						'path'  => (string) ( $row['path'] ?? '/' ),
						'views' => (int) ( $row['views'] ?? 0 ),
					);
				},
				is_array( $top_pages ) ? $top_pages : array()
			),
			'top_referrers' => array_map(
				static function ( $row ) {
					return array(
						'host'  => (string) ( $row['ref_host'] ?? '' ),
						'views' => (int) ( $row['views'] ?? 0 ),
					);
				},
				is_array( $top_referrers ) ? $top_referrers : array()
			),
			'biggest_spike' => $biggest,
		);
	}

	/**
	 * Build the AI user prompt from the snapshot.
	 *
	 * @param array<string,mixed> $snap
	 */
	private static function build_prompt( array $snap ): string {
		$lines   = array();
		$lines[] = 'You are a traffic analyst writing for the site owner.';
		$lines[] = 'Write a single paragraph of about 100 words. No headings, no bullet points, no markdown.';
		$lines[] = 'The paragraph MUST cover three things in order: (1) the biggest day-over-day traffic spike or notable trend, (2) the standout piece of content driving views, (3) one concrete, actionable suggestion the owner can do this week.';
		$lines[] = 'Be specific. Use the numbers from the data. Do not invent posts, hosts, or stats not present below.';
		$lines[] = '';
		$lines[] = 'Window: ' . $snap['range']['since'] . ' to ' . $snap['range']['until'] . ' (7 days).';
		$lines[] = 'Totals: ' . (int) $snap['totals']['views'] . ' pageviews, ' . (int) $snap['totals']['visitors'] . ' unique visitors.';
		$lines[] = '';
		$lines[] = 'Daily views:';
		foreach ( $snap['series'] as $point ) {
			$lines[] = '  ' . $point['date'] . ': ' . (int) $point['views'] . ' views, ' . (int) $point['visitors'] . ' visitors';
		}
		if ( ! empty( $snap['biggest_spike'] ) ) {
			$lines[] = '';
			$lines[] = 'Biggest day-over-day change: ' . $snap['biggest_spike']['date'] . ' (delta ' . (int) $snap['biggest_spike']['delta'] . ' views).';
		}
		if ( ! empty( $snap['top_pages'] ) ) {
			$lines[] = '';
			$lines[] = 'Top pages:';
			foreach ( $snap['top_pages'] as $row ) {
				$lines[] = '  ' . $row['path'] . ' — ' . (int) $row['views'] . ' views';
			}
		}
		if ( ! empty( $snap['top_referrers'] ) ) {
			$lines[] = '';
			$lines[] = 'Top referrers:';
			foreach ( $snap['top_referrers'] as $row ) {
				$lines[] = '  ' . $row['host'] . ' — ' . (int) $row['views'] . ' views';
			}
		}
		return implode( "\n", $lines );
	}

	private static function clean_text( string $text ): string {
		$text = trim( $text );
		// Strip code fences if a model wraps the paragraph.
		$text = preg_replace( '/^```[a-z]*\s*/i', '', $text );
		$text = preg_replace( '/\s*```$/', '', $text );
		return trim( (string) $text );
	}
}
