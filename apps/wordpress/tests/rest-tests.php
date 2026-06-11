<?php
/**
 * Adversarial REST API test pass for the Klyna SEO Suite plugin.
 * Run via: docker compose run --rm -T wpcli eval-file tests/rest-tests.php --allow-root
 */

wp_set_current_user( 1 );

echo "═══ BUG VERIFICATION: schema flags vs reality ═══" . PHP_EOL;
$raw = get_option( 'klyna_settings', array() );
echo '  raw option enable_schema: ' . var_export( $raw['enable_schema'] ?? 'MISSING', true ) . PHP_EOL;
$settings_endpoint = rest_do_request( new WP_REST_Request( 'GET', '/klyna/v1/settings' ) )->get_data();
echo '  settings endpoint enable_schema: ' . var_export( $settings_endpoint['enable_schema'], true ) . PHP_EOL;
$html = file_get_contents( 'http://wp/' );
preg_match_all( '|<script[^>]*application/ld\+json[^>]*>|i', $html, $m );
echo '  actual JSON-LD blocks on home page: ' . count( $m[0] ) . PHP_EOL;

echo PHP_EOL . '═══ apply_link with valid input ═══' . PHP_EOL;
$req = new WP_REST_Request( 'POST', '/klyna/v1/internal-links/apply' );
$req->set_header( 'Content-Type', 'application/json' );
$req->set_body( wp_json_encode( array( 'from_id' => 4, 'to_id' => 5, 'anchor' => 'GEO' ) ) );
$res = rest_do_request( $req );
echo '  status: ' . $res->get_status() . PHP_EOL;
echo '  result: ' . wp_json_encode( $res->get_data() ) . PHP_EOL;
$post = get_post( 4 );
preg_match( '|<a [^>]*>GEO</a>|', $post->post_content, $check );
echo '  anchor injected: ' . ( ! empty( $check[0] ) ? 'YES — ' . $check[0] : 'NO' ) . PHP_EOL;

echo PHP_EOL . '═══ apply_link with anchor not in content ═══' . PHP_EOL;
$req = new WP_REST_Request( 'POST', '/klyna/v1/internal-links/apply' );
$req->set_header( 'Content-Type', 'application/json' );
$req->set_body( wp_json_encode( array( 'from_id' => 4, 'to_id' => 5, 'anchor' => 'qwerty-doesnt-exist' ) ) );
$res  = rest_do_request( $req );
$data = $res->get_data();
echo '  ok: ' . var_export( $data['ok'] ?? null, true ) . ' (expected false)' . PHP_EOL;
echo '  reason: ' . ( $data['reason'] ?? '' ) . PHP_EOL;

echo PHP_EOL . '═══ apply_link with bad input ═══' . PHP_EOL;
$req = new WP_REST_Request( 'POST', '/klyna/v1/internal-links/apply' );
$req->set_header( 'Content-Type', 'application/json' );
$req->set_body( wp_json_encode( array( 'from_id' => 0, 'to_id' => 0 ) ) );
$res = rest_do_request( $req );
echo '  status: ' . $res->get_status() . ' (expected 400)' . PHP_EOL;

echo PHP_EOL . '═══ Settings sanitization: clamp out-of-range ═══' . PHP_EOL;
$req = new WP_REST_Request( 'POST', '/klyna/v1/settings' );
$req->set_header( 'Content-Type', 'application/json' );
$req->set_body( wp_json_encode( array( 'internal_links_per_post' => 999, 'internal_links_min_similarity' => 5.0 ) ) );
$res = rest_do_request( $req );
$s   = $res->get_data()['settings'];
echo '  per_post clamped from 999 to: ' . $s['internal_links_per_post'] . ' (expected ≤30)' . PHP_EOL;
echo '  min_sim clamped from 5.0 to:  ' . $s['internal_links_min_similarity'] . ' (expected ≤1.0)' . PHP_EOL;

echo PHP_EOL . '═══ Settings POST: partial patch preserves other keys ═══' . PHP_EOL;
update_option( 'klyna_settings', array( 'organization_name' => 'Test Co', 'enable_schema' => true ) );
$req = new WP_REST_Request( 'POST', '/klyna/v1/settings' );
$req->set_header( 'Content-Type', 'application/json' );
$req->set_body( wp_json_encode( array( 'twitter_handle' => '@klynahq' ) ) );
rest_do_request( $req );
$now = get_option( 'klyna_settings' );
echo '  organization_name preserved: ' . var_export( $now['organization_name'] ?? 'MISSING', true ) . ' (expected Test Co)' . PHP_EOL;
echo '  twitter_handle set:           ' . var_export( $now['twitter_handle'] ?? 'MISSING', true ) . PHP_EOL;
echo '  enable_schema preserved:      ' . var_export( $now['enable_schema'] ?? 'MISSING', true ) . PHP_EOL;

echo PHP_EOL . '═══ Authorization: anonymous request blocked ═══' . PHP_EOL;
wp_set_current_user( 0 );
$res = rest_do_request( new WP_REST_Request( 'GET', '/klyna/v1/stats' ) );
echo '  anonymous GET /stats: ' . $res->get_status() . ' (expected 401)' . PHP_EOL;

$req = new WP_REST_Request( 'POST', '/klyna/v1/settings' );
$req->set_header( 'Content-Type', 'application/json' );
$req->set_body( wp_json_encode( array( 'enable_schema' => false ) ) );
echo '  anonymous POST /settings: ' . rest_do_request( $req )->get_status() . ' (expected 401)' . PHP_EOL;

echo PHP_EOL . '═══ Subscriber role (no manage_options) ═══' . PHP_EOL;
$sub_id = username_exists( 'subscriber-test' ) ?: wp_create_user( 'subscriber-test', wp_generate_password(), 'sub@klyna.test' );
( new WP_User( $sub_id ) )->set_role( 'subscriber' );
wp_set_current_user( $sub_id );
echo '  subscriber GET /stats: ' . rest_do_request( new WP_REST_Request( 'GET', '/klyna/v1/stats' ) )->get_status() . ' (expected 403)' . PHP_EOL;
echo '  subscriber POST /settings: ' . rest_do_request( new WP_REST_Request( 'POST', '/klyna/v1/settings' ) )->get_status() . ' (expected 403)' . PHP_EOL;

echo PHP_EOL . '═══ Bundle file integrity ═══' . PHP_EOL;
$js  = file_get_contents( '/var/www/html/wp-content/plugins/klyna-seo-suite/assets/admin/index.js' );
$css = file_get_contents( '/var/www/html/wp-content/plugins/klyna-seo-suite/assets/admin/index.css' );
echo '  index.js: ' . strlen( $js ) . ' bytes, starts with: ' . substr( $js, 0, 30 ) . '…' . PHP_EOL;
echo '  index.css: ' . strlen( $css ) . ' bytes, has --color-klyna-accent: ' . ( strpos( $css, '--color-klyna-accent' ) !== false ? 'YES' : 'NO' ) . PHP_EOL;
echo '  bundle uses class="…" (broken in React 18): ' . ( preg_match( '/jsx\(\s*[A-Za-z]+\s*,\s*\{[^}]*class:/', $js ) ? 'YES (BUG)' : 'no' ) . PHP_EOL;

echo PHP_EOL . '═══ HTML check: Klyna admin page mounts the React root ═══' . PHP_EOL;
$html = file_get_contents( admin_url( 'admin.php?page=klyna' ) );
echo '  contains klyna-admin-root div: ' . ( strpos( $html, 'klyna-admin-root' ) !== false ? 'YES' : 'NO' ) . PHP_EOL;
echo '  enqueues index.js: ' . ( strpos( $html, 'admin/index.js' ) !== false ? 'YES' : 'NO' ) . PHP_EOL;
echo '  enqueues index.css: ' . ( strpos( $html, 'admin/index.css' ) !== false ? 'YES' : 'NO' ) . PHP_EOL;
echo '  injects window.klynaBoot: ' . ( strpos( $html, 'window.klynaBoot' ) !== false ? 'YES' : 'NO' ) . PHP_EOL;
echo '  type=module on script: ' . ( preg_match( '|<script[^>]*type=["\']module["\'][^>]*klyna-admin-js|', $html ) || preg_match( '|<script[^>]*klyna-admin-js[^>]*type=["\']module["\']|', $html ) ? 'YES' : 'NO' ) . PHP_EOL;

echo PHP_EOL . '═══ Reset post 4 (undo apply_link injection from this test run) ═══' . PHP_EOL;
$post4 = get_post( 4 );
$cleaned = preg_replace( '|<a [^>]*>GEO</a>|', 'GEO', $post4->post_content, 1 );
wp_update_post( array( 'ID' => 4, 'post_content' => $cleaned ) );
echo '  cleaned' . PHP_EOL;
echo PHP_EOL . 'DONE.' . PHP_EOL;
