<?php
/**
 * Reporting query layer.
 *
 * Reads the daily aggregate table and shapes it for the dashboard. Kept
 * separate from Rest so the same queries can power both the REST responses and
 * the initial server-rendered snapshot (so the dashboard shows data instantly,
 * before the JS fetch resolves).
 *
 * @package KlynaAnalytics
 */

namespace KlynaAnalytics;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Reports {

	public function register(): void {
		// Reports is a pure query helper; nothing to hook today. Kept as a
		// registered subsystem for symmetry and future scheduled rollups.
	}

	/**
	 * Per-day pageviews + visitors for the last $days days, gap-filled so every
	 * day in the window is present (zero where there was no traffic).
	 *
	 * @return array<int, array{date:string, views:int, visitors:int}>
	 */
	public function daily_series( int $days ): array {
		global $wpdb;

		$days  = max( 1, min( 365, $days ) );
		$table = Storage::table();
		$today = current_time( 'timestamp' );
		$since = gmdate( 'Y-m-d', $today - ( ( $days - 1 ) * DAY_IN_SECONDS ) );

		// phpcs:disable WordPress.DB.DirectDatabaseQuery, WordPress.DB.PreparedSQL.NotPrepared
		$rows = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT day, SUM(hits) AS views, SUM(visitors) AS visitors
				 FROM {$table}
				 WHERE day >= %s AND event = 'pageview'
				 GROUP BY day",
				$since
			),
			ARRAY_A
		);
		// phpcs:enable

		$by_day = array();
		foreach ( (array) $rows as $row ) {
			$by_day[ $row['day'] ] = array(
				'views'    => (int) $row['views'],
				'visitors' => (int) $row['visitors'],
			);
		}

		$series = array();
		for ( $i = $days - 1; $i >= 0; $i-- ) {
			$date     = gmdate( 'Y-m-d', $today - ( $i * DAY_IN_SECONDS ) );
			$series[] = array(
				'date'     => $date,
				'views'    => $by_day[ $date ]['views'] ?? 0,
				'visitors' => $by_day[ $date ]['visitors'] ?? 0,
			);
		}

		return $series;
	}

	/**
	 * Headline totals for a window.
	 *
	 * @return array{views:int, visitors:int}
	 */
	public function totals( int $days ): array {
		$series = $this->daily_series( $days );
		$views  = 0;
		$people = 0;
		foreach ( $series as $point ) {
			$views  += $point['views'];
			$people += $point['visitors'];
		}
		return array(
			'views'    => $views,
			'visitors' => $people,
		);
	}

	/**
	 * Render a compact inline SVG sparkline for the given series. Used in the
	 * server-rendered dashboard snapshot so there is something to see before the
	 * canvas chart hydrates.
	 *
	 * @param array<int, array{date:string, views:int, visitors:int}> $series
	 */
	public static function sparkline_svg( array $series, int $width = 480, int $height = 64 ): string {
		$values = array_map( static fn( $p ) => (int) $p['views'], $series );
		$count  = count( $values );
		if ( $count < 2 ) {
			return '';
		}

		$max  = max( 1, max( $values ) );
		$step = $width / ( $count - 1 );
		$pad  = 4;

		$points = array();
		foreach ( $values as $i => $value ) {
			$x        = round( $i * $step, 2 );
			$y        = round( $height - $pad - ( ( $value / $max ) * ( $height - 2 * $pad ) ), 2 );
			$points[] = $x . ',' . $y;
		}

		$line = implode( ' ', $points );
		$area = '0,' . $height . ' ' . $line . ' ' . $width . ',' . $height;

		return sprintf(
			'<svg class="klyna-an-sparkline" viewBox="0 0 %1$d %2$d" preserveAspectRatio="none" role="img" aria-label="%5$s">'
			. '<polygon points="%3$s" fill="rgba(124,92,255,0.14)" />'
			. '<polyline points="%4$s" fill="none" stroke="#7c5cff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />'
			. '</svg>',
			$width,
			$height,
			esc_attr( $area ),
			esc_attr( $line ),
			esc_attr__( 'Pageviews trend', 'wp-analytics' )
		);
	}
}
