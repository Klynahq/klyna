<?php
/**
 * Klyna plugin — comprehensive audit pass.
 * Output: PASS / FAIL / WARN per check.
 */

wp_set_current_user( 1 );

$results = array();
$rec     = function ( string $cat, string $what, string $status, string $detail = '' ) use ( &$results ) {
	$results[] = compact( 'cat', 'what', 'status', 'detail' );
};

// ─── SCHEMA module ────────────────────────────────────────────
// Direct method call: capture Schema's wp_head output instead of round-tripping HTTP.
ob_start();
$GLOBALS['post'] = null;
( new Klyna\Schema() )->register();
do_action( 'wp_head' );
$home_html = ob_get_clean();
$nblocks = preg_match_all( '|<script[^>]*application/ld\+json[^>]*>([^<]+)</script>|i', $home_html, $matches );
$rec( 'schema', 'home page emits JSON-LD', $nblocks > 0 ? 'PASS' : 'FAIL', "$nblocks block(s)" );

$types_found = array();
if ( $nblocks > 0 ) {
	foreach ( $matches[1] as $block ) {
		$data = json_decode( $block, true );
		if ( ! $data ) continue;
		$graph = $data['@graph'] ?? array( $data );
		foreach ( $graph as $node ) {
			$t = $node['@type'] ?? null;
			if ( $t ) $types_found[] = is_array( $t ) ? implode( '+', $t ) : $t;
		}
	}
	$rec( 'schema', 'Organization on home page', in_array( 'Organization', $types_found, true ) ? 'PASS' : 'FAIL', implode( ', ', array_unique( $types_found ) ) );
	$rec( 'schema', 'WebSite on home page',      in_array( 'WebSite', $types_found, true ) ? 'PASS' : 'FAIL', '' );
}

// Simulate being on a single post — set the queried object and re-run wp_head capture
ob_start();
global $wp_query;
$wp_query = new WP_Query( array( 'p' => 4, 'post_type' => 'post' ) );
if ( $wp_query->have_posts() ) { $wp_query->the_post(); }
do_action( 'wp_head' );
wp_reset_postdata();
$post_html = ob_get_clean();
$pblocks   = preg_match_all( '|<script[^>]*application/ld\+json[^>]*>([^<]+)</script>|i', $post_html, $pm );
$rec( 'schema', 'post page emits JSON-LD', $pblocks > 0 ? 'PASS' : 'FAIL', "$pblocks block(s)" );
$ptypes = array();
if ( $pblocks > 0 ) {
	foreach ( $pm[1] as $b ) {
		$d = json_decode( $b, true );
		if ( ! $d ) continue;
		$graph = $d['@graph'] ?? array( $d );
		foreach ( $graph as $n ) {
			$t = $n['@type'] ?? null;
			if ( $t ) $ptypes[] = is_array( $t ) ? implode( '+', $t ) : $t;
		}
	}
	$rec( 'schema', 'BlogPosting on post page',    in_array( 'BlogPosting', $ptypes, true ) ? 'PASS' : 'FAIL', implode( ', ', array_unique( $ptypes ) ) );
	$rec( 'schema', 'BreadcrumbList on post page', in_array( 'BreadcrumbList', $ptypes, true ) ? 'PASS' : 'FAIL', '' );
}

$s_save = get_option( 'klyna_settings', array() );
// Set every schema sub-toggle to off — they're independent by design.
update_option( 'klyna_settings', array_merge( $s_save, array(
	'enable_schema'       => false,
	'enable_organization' => false,
	'enable_breadcrumbs'  => false,
) ) );
ob_start();
$GLOBALS['post'] = null;
do_action( 'wp_head' );
$html_off = ob_get_clean();
$blocks_off = preg_match_all( '|<script[^>]*application/ld\+json[^>]*>|i', $html_off );
$rec( 'schema', 'toggle off removes schema', 0 === $blocks_off ? 'PASS' : 'FAIL', "$blocks_off blocks when disabled" );
update_option( 'klyna_settings', $s_save );

// ─── FAQ module ────────────────────────────────────────────────
$faq_post = wp_insert_post( array(
	'post_title'   => 'Klyna self-test FAQ',
	'post_status'  => 'publish',
	'post_content' => '<h2>FAQ</h2><h3>What is GEO?</h3><p>Generative Engine Optimization is the practice of optimizing content for LLM citations.</p><h3>Why does it matter?</h3><p>LLMs cite structured content far more than long-form prose.</p>',
) );
ob_start();
$wp_query = new WP_Query( array( 'p' => $faq_post, 'post_type' => 'post' ) );
if ( $wp_query->have_posts() ) { $wp_query->the_post(); }
do_action( 'wp_head' );
wp_reset_postdata();
$html_faq = ob_get_clean();
$has_faqpage = false !== strpos( $html_faq, '"FAQPage"' );
$rec( 'faq', 'FAQ content emits FAQPage schema', $has_faqpage ? 'PASS' : 'WARN', $has_faqpage ? 'present' : 'not detected — may need <details> wrappers' );
wp_delete_post( $faq_post, true );

// ─── Auth ───────────────────────────────────────────────────────
wp_set_current_user( 0 );
$anon = rest_do_request( new WP_REST_Request( 'GET', '/klyna/v1/stats' ) );
$rec( 'security', 'anonymous /stats blocked', 401 === $anon->get_status() ? 'PASS' : 'FAIL', 'status ' . $anon->get_status() );
$anon2 = rest_do_request( new WP_REST_Request( 'POST', '/klyna/v1/audit/fix-all' ) );
$rec( 'security', 'anonymous /audit/fix-all blocked', 401 === $anon2->get_status() ? 'PASS' : 'FAIL', 'status ' . $anon2->get_status() );
$sub_id = username_exists( 'audit-sub' ) ?: wp_create_user( 'audit-sub', wp_generate_password(), 'sub@k.test' );
( new WP_User( $sub_id ) )->set_role( 'subscriber' );
wp_set_current_user( $sub_id );
$sub = rest_do_request( new WP_REST_Request( 'POST', '/klyna/v1/audit/fix-all' ) );
$rec( 'security', 'subscriber /audit/fix-all blocked', 403 === $sub->get_status() ? 'PASS' : 'FAIL', 'status ' . $sub->get_status() );
wp_set_current_user( 1 );

// XSS in settings
update_option( 'klyna_settings', array_merge( $s_save, array(
	'organization_name' => '<script>alert("xss")</script>Bad Co',
) ) );
$settings = rest_do_request( new WP_REST_Request( 'GET', '/klyna/v1/settings' ) )->get_data();
$has_raw_script = false !== strpos( (string) $settings['organization_name'], '<script>' );
$rec( 'security', 'settings strip <script>', ! $has_raw_script ? 'PASS' : 'FAIL', "stored as: " . substr( (string) $settings['organization_name'], 0, 80 ) );
ob_start();
$GLOBALS['post'] = null;
do_action( 'wp_head' );
$html = ob_get_clean();
$has_inline = preg_match( '#<script[^>]*>alert\("xss"\)</script>#', $html );
$rec( 'security', 'XSS payload not on rendered page', ! $has_inline ? 'PASS' : 'FAIL', $has_inline ? 'PAYLOAD ON PAGE' : 'clean' );
update_option( 'klyna_settings', $s_save );

// ─── Performance ────────────────────────────────────────────────
global $wpdb;
$qb = $wpdb->num_queries; $t0 = microtime( true );
rest_do_request( new WP_REST_Request( 'GET', '/klyna/v1/posts' ) );
$el = round( ( microtime( true ) - $t0 ) * 1000 );
$rec( 'perf', '/posts response', $el < 1000 ? 'PASS' : 'WARN', "$el ms, " . ( $wpdb->num_queries - $qb ) . ' queries' );
$qb = $wpdb->num_queries; $t0 = microtime( true );
rest_do_request( new WP_REST_Request( 'GET', '/klyna/v1/stats' ) );
$el = round( ( microtime( true ) - $t0 ) * 1000 );
$rec( 'perf', '/stats response', $el < 1500 ? 'PASS' : 'WARN', "$el ms, " . ( $wpdb->num_queries - $qb ) . ' queries' );

// ─── Front-end output ──────────────────────────────────────────
ob_start();
$GLOBALS['post'] = null;
do_action( 'wp_head' );
$home_html = ob_get_clean();
$rec( 'frontend', 'no PHP errors visible on home', ! preg_match( '#(Warning|Fatal error|Parse error|Notice)#i', $home_html ) ? 'PASS' : 'FAIL', '' );

// ─── Editor sidebar bundle reachable ───────────────────────────
$asset_url = str_replace( array( 'localhost:8080', 'localhost' ), 'wp', plugins_url( 'assets/editor/index.js', dirname( __DIR__ ) . '/klyna-seo-suite.php' ) );
$resp = wp_remote_get( $asset_url );
$code = is_wp_error( $resp ) ? 0 : wp_remote_retrieve_response_code( $resp );
$rec( 'assets', 'editor bundle reachable', 200 === $code ? 'PASS' : 'FAIL', "HTTP $code" );

// ─── Print report ──────────────────────────────────────────────
$by_cat = array();
foreach ( $results as $r ) $by_cat[ $r['cat'] ][] = $r;
$totals = array( 'PASS' => 0, 'FAIL' => 0, 'WARN' => 0 );
foreach ( $by_cat as $cat => $rows ) {
	echo strtoupper( $cat ) . PHP_EOL;
	foreach ( $rows as $r ) {
		$icon = $r['status'] === 'PASS' ? '✓' : ( $r['status'] === 'FAIL' ? '✗' : '!' );
		$totals[ $r['status'] ]++;
		echo '  ' . $icon . '  ' . str_pad( $r['what'], 48 ) . ' ' . $r['detail'] . PHP_EOL;
	}
	echo PHP_EOL;
}
echo str_repeat( '─', 60 ) . PHP_EOL;
echo sprintf( '  TOTALS: %d PASS · %d FAIL · %d WARN%s', $totals['PASS'], $totals['FAIL'], $totals['WARN'], PHP_EOL );
echo str_repeat( '─', 60 ) . PHP_EOL;
