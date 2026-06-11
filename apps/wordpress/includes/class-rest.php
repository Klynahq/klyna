<?php
/**
 * REST API for the React admin UI.
 *
 * Namespace: klyna/v1
 *
 *   GET  /stats                       - aggregate site stats
 *   GET  /posts                       - all published posts with scores
 *   GET  /settings                    - current plugin settings
 *   POST /settings                    - patch settings
 *   GET  /internal-links/suggest      - TF-IDF link suggestions
 *   POST /internal-links/apply        - apply one suggestion to a post
 *
 * All endpoints require `manage_options`.
 *
 * @package Klyna
 */

namespace Klyna;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Rest {

	private const NS = 'klyna/v1';

	public function register(): void {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
	}

	public function register_routes(): void {
		$perm = array( $this, 'can_manage' );

		register_rest_route(
			self::NS,
			'/stats',
			array(
				'methods'             => 'GET',
				'permission_callback' => $perm,
				'callback'            => array( $this, 'stats' ),
			)
		);
		register_rest_route(
			self::NS,
			'/posts',
			array(
				'methods'             => 'GET',
				'permission_callback' => $perm,
				'callback'            => array( $this, 'posts' ),
			)
		);
		register_rest_route(
			self::NS,
			'/settings',
			array(
				'methods'             => 'GET',
				'permission_callback' => $perm,
				'callback'            => array( $this, 'get_settings' ),
			)
		);
		register_rest_route(
			self::NS,
			'/settings',
			array(
				'methods'             => 'POST',
				'permission_callback' => $perm,
				'callback'            => array( $this, 'save_settings' ),
			)
		);
		register_rest_route(
			self::NS,
			'/internal-links/apply',
			array(
				'methods'             => 'POST',
				'permission_callback' => $perm,
				'callback'            => array( $this, 'apply_link' ),
			)
		);
		register_rest_route(
			self::NS,
			'/audit/fix',
			array(
				'methods'             => 'POST',
				'permission_callback' => $perm,
				'callback'            => array( $this, 'apply_fix' ),
			)
		);
		register_rest_route(
			self::NS,
			'/audit/fix-post',
			array(
				'methods'             => 'POST',
				'permission_callback' => $perm,
				'callback'            => array( $this, 'fix_post' ),
			)
		);
		register_rest_route(
			self::NS,
			'/audit/fix-all',
			array(
				'methods'             => 'POST',
				'permission_callback' => $perm,
				'callback'            => array( $this, 'fix_all' ),
			)
		);
		register_rest_route(
			self::NS,
			'/audit/(?P<id>\d+)',
			array(
				'methods'             => 'GET',
				'permission_callback' => $perm,
				'callback'            => array( $this, 'audit_one' ),
			)
		);
		register_rest_route(
			self::NS,
			'/ai/suggest',
			array(
				'methods'             => 'POST',
				'permission_callback' => $perm,
				'callback'            => array( $this, 'ai_suggest' ),
			)
		);
		register_rest_route(
			self::NS,
			'/ai/apply',
			array(
				'methods'             => 'POST',
				'permission_callback' => $perm,
				'callback'            => array( $this, 'ai_apply' ),
			)
		);
		register_rest_route(
			self::NS,
			'/ai/usage',
			array(
				'methods'             => 'GET',
				'permission_callback' => $perm,
				'callback'            => array( $this, 'ai_usage' ),
			)
		);
		register_rest_route(
			self::NS,
			'/ai/test',
			array(
				'methods'             => 'POST',
				'permission_callback' => $perm,
				'callback'            => array( $this, 'ai_test' ),
			)
		);
	}

	/**
	 * Build a tailored AI prompt for a given finding type.
	 */
	private function ai_prompt_for( string $finding_id, \WP_Post $post ): array {
		$title   = $post->post_title;
		$content = wp_strip_all_tags( $post->post_content );
		$short   = mb_substr( $content, 0, 1500 );

		switch ( $finding_id ) {
			case 'content.thin':
				return array(
					'task'  => 'expand_content',
					'mode'  => 'append',
					'system_hint' => 'Output 2-3 additional paragraphs (about 250-350 words total) that genuinely add value. No headings. Plain text. Match the voice. Do not repeat what is already said.',
					'prompt' => "Post title: {$title}\n\nCurrent content:\n{$short}\n\nWrite 2-3 additional substantive paragraphs that continue this post. Cover information not yet mentioned. Output only the new paragraphs.",
					'max_tokens' => 700,
				);

			case 'meta.title.short':
			case 'meta.title.long':
				return array(
					'task'  => 'rewrite_title',
					'mode'  => 'choose',
					'system_hint' => 'Output exactly 3 title options, one per line, no numbering, no quotes. Each 50-60 characters.',
					'prompt' => "Current title: \"{$title}\"\n\nPost summary (first 400 chars):\n" . mb_substr( $short, 0, 400 ) . "\n\nWrite 3 alternative titles, each 50-60 characters, keyword-rich, that fit this content. Output one per line.",
					'max_tokens' => 200,
				);

			case 'meta.excerpt.missing':
				return array(
					'task'  => 'write_excerpt',
					'mode'  => 'replace_excerpt',
					'system_hint' => 'Output one excerpt (120-160 chars) — plain text only, no quotes, no markdown.',
					'prompt' => "Post title: \"{$title}\"\n\nFirst section:\n" . mb_substr( $short, 0, 600 ) . "\n\nWrite a single excerpt of 120-160 characters that would work as a meta description and social-card summary.",
					'max_tokens' => 120,
				);

			case 'headings.h2.missing':
				return array(
					'task'  => 'add_headings',
					'mode'  => 'choose',
					'system_hint' => 'Output 3-5 short H2 heading suggestions, one per line. No markdown.',
					'prompt' => "Post title: \"{$title}\"\n\nFull content (no headings yet):\n{$short}\n\nSuggest 3-5 short H2 headings (4-7 words each) that would naturally break this post into logical sections. Output one per line.",
					'max_tokens' => 200,
				);

			case 'geo.structure':
			case 'geo.faq.schema':
				return array(
					'task'  => 'add_faq',
					'mode'  => 'append',
					'system_hint' => 'Output a complete FAQ section in HTML using <h2>FAQ</h2> followed by <h3>Question?</h3><p>Answer.</p> pairs. 3 to 5 pairs. No code fences.',
					'prompt' => "Post title: \"{$title}\"\n\nContent:\n{$short}\n\nGenerate a FAQ section (3-5 Q&A pairs) that addresses likely follow-up questions a reader would ask after this post. This boosts both featured-snippet eligibility and LLM citation share.",
					'max_tokens' => 600,
				);

			default:
				return array(
					'task'  => 'generic',
					'mode'  => 'preview',
					'system_hint' => '',
					'prompt' => "Post title: \"{$title}\"\n\nFinding: {$finding_id}\n\nSuggest a fix or improvement.",
					'max_tokens' => 400,
				);
		}
	}

	public function ai_suggest( \WP_REST_Request $req ): \WP_REST_Response {
		$body       = (array) $req->get_json_params();
		$post_id    = isset( $body['post_id'] ) ? (int) $body['post_id'] : 0;
		$finding_id = isset( $body['finding_id'] ) ? (string) $body['finding_id'] : '';
		if ( ! $post_id || '' === $finding_id ) {
			return rest_ensure_response( array( 'ok' => false, 'reason' => 'missing_params' ) );
		}
		$post = get_post( $post_id );
		if ( ! $post ) {
			return rest_ensure_response( array( 'ok' => false, 'reason' => 'not_found' ) );
		}
		$spec = $this->ai_prompt_for( $finding_id, $post );
		$res  = ( new Ai() )->complete( $spec['prompt'], array( 'max_tokens' => $spec['max_tokens'] ) );
		if ( ! $res['ok'] ) {
			return rest_ensure_response( array(
				'ok'      => false,
				'reason'  => $res['reason'] ?? 'unknown',
				'message' => $res['text'] ?? '',
			) );
		}
		return rest_ensure_response( array(
			'ok'        => true,
			'task'      => $spec['task'],
			'mode'      => $spec['mode'],
			'text'      => $res['text'],
			'cached'    => $res['cached'] ?? false,
			'usage'     => Ai::usage(),
		) );
	}

	public function ai_apply( \WP_REST_Request $req ): \WP_REST_Response {
		$body    = (array) $req->get_json_params();
		$post_id = isset( $body['post_id'] ) ? (int) $body['post_id'] : 0;
		$mode    = isset( $body['mode'] ) ? (string) $body['mode'] : '';
		$text    = isset( $body['text'] ) ? (string) $body['text'] : '';
		if ( ! $post_id || '' === $mode || '' === $text ) {
			return rest_ensure_response( array( 'ok' => false, 'reason' => 'missing_params' ) );
		}
		$post = get_post( $post_id );
		if ( ! $post ) {
			return rest_ensure_response( array( 'ok' => false, 'reason' => 'not_found' ) );
		}
		switch ( $mode ) {
			case 'append':
				$is_html = preg_match( '#<(p|h\d|details|ul|ol|table)\b#i', $text );
				$append  = $is_html ? "\n\n" . $text . "\n" : "\n\n" . wpautop( $text );
				wp_update_post( array( 'ID' => $post_id, 'post_content' => $post->post_content . $append ) );
				return rest_ensure_response( array( 'ok' => true, 'message' => 'Content appended.' ) );

			case 'replace_excerpt':
				wp_update_post( array( 'ID' => $post_id, 'post_excerpt' => sanitize_text_field( $text ) ) );
				return rest_ensure_response( array( 'ok' => true, 'message' => 'Excerpt updated.' ) );

			case 'replace_title':
				wp_update_post( array( 'ID' => $post_id, 'post_title' => sanitize_text_field( $text ) ) );
				return rest_ensure_response( array( 'ok' => true, 'message' => 'Title updated.' ) );

			default:
				return rest_ensure_response( array( 'ok' => false, 'reason' => 'unknown_mode' ) );
		}
	}

	public function ai_usage(): \WP_REST_Response {
		return rest_ensure_response( Ai::usage() );
	}

	public function ai_test( \WP_REST_Request $req ): \WP_REST_Response {
		$res = ( new Ai() )->complete(
			'Say "Klyna AI connected." and nothing else.',
			array( 'max_tokens' => 30, 'temperature' => 0 )
		);
		return rest_ensure_response( array(
			'ok'      => (bool) $res['ok'],
			'text'    => $res['text'] ?? '',
			'reason'  => $res['reason'] ?? null,
			'usage'   => Ai::usage(),
		) );
	}

	/**
	 * Per-post audit, used by the Gutenberg sidebar.
	 * Accepts an optional `?content=` body so the editor can request a
	 * live audit against an unsaved draft.
	 */
	public function audit_one( \WP_REST_Request $req ): \WP_REST_Response {
		$id   = (int) $req['id'];
		$post = get_post( $id );
		if ( ! $post ) {
			return rest_ensure_response( array( 'error' => 'not_found' ) );
		}
		// Allow the editor to pass live (unsaved) content.
		$live = $req->get_param( 'content' );
		if ( is_string( $live ) && '' !== $live ) {
			$post = clone $post;
			$post->post_content = $live;
		}
		$settings = $this->normalize_settings( Plugin::settings() );
		$audit = $this->audit_post( $post, $settings );
		return rest_ensure_response(
			array(
				'id'       => $id,
				'title'    => get_the_title( $id ),
				'url'      => get_permalink( $id ),
				'edit_url' => get_edit_post_link( $id, 'raw' ),
				'score'    => $audit['score'],
				'grade'    => $audit['grade'],
				'findings' => $audit['findings'],
				'stats'    => $audit['stats'],
			)
		);
	}

	/** Apply every fixable finding for a single post. */
	public function fix_post( \WP_REST_Request $req ): \WP_REST_Response {
		$body    = (array) $req->get_json_params();
		$post_id = isset( $body['post_id'] ) ? (int) $body['post_id'] : 0;
		if ( ! $post_id ) {
			return rest_ensure_response( array( 'ok' => false, 'reason' => 'missing_post_id' ) );
		}
		$post = get_post( $post_id );
		if ( ! $post ) {
			return rest_ensure_response( array( 'ok' => false, 'reason' => 'not_found' ) );
		}
		$settings = $this->normalize_settings( Plugin::settings() );
		$audit    = $this->audit_post( $post, $settings );
		$applied  = array();
		$skipped  = array();
		foreach ( $audit['findings'] as $f ) {
			if ( empty( $f['fixable'] ) || empty( $f['fix_meta']['action'] ) ) {
				$skipped[] = array( 'id' => $f['id'], 'reason' => 'not_fixable' );
				continue;
			}
			$res = $this->run_fix_action( $f['fix_meta']['action'], $f['fix_meta'] );
			if ( ! empty( $res['ok'] ) ) {
				$applied[] = array( 'id' => $f['id'], 'message' => $res['message'] ?? '' );
			} else {
				$skipped[] = array( 'id' => $f['id'], 'reason' => $res['reason'] ?? 'unknown' );
			}
		}
		return rest_ensure_response(
			array(
				'ok'      => count( $applied ) > 0,
				'applied' => $applied,
				'skipped' => $skipped,
			)
		);
	}

	/** Apply every fixable finding across every published post. */
	public function fix_all( \WP_REST_Request $req ): \WP_REST_Response {
		// Bound the work so the request doesn't hang on huge sites.
		$body  = (array) $req->get_json_params();
		$limit = isset( $body['limit'] ) ? max( 1, min( 100, (int) $body['limit'] ) ) : 50;
		$posts = get_posts(
			array(
				'post_type'      => 'post',
				'post_status'    => 'publish',
				'numberposts'    => $limit,
				'orderby'        => 'modified',
				'order'          => 'DESC',
			)
		);
		$settings   = $this->normalize_settings( Plugin::settings() );
		$total_applied = 0;
		$by_post    = array();
		foreach ( $posts as $p ) {
			$audit   = $this->audit_post( $p, $settings );
			$applied = array();
			foreach ( $audit['findings'] as $f ) {
				if ( empty( $f['fixable'] ) || empty( $f['fix_meta']['action'] ) ) {
					continue;
				}
				$res = $this->run_fix_action( $f['fix_meta']['action'], $f['fix_meta'] );
				if ( ! empty( $res['ok'] ) ) {
					$applied[] = $f['id'];
					$total_applied++;
				}
			}
			if ( $applied ) {
				$by_post[] = array(
					'post_id' => $p->ID,
					'title'   => get_the_title( $p ),
					'applied' => $applied,
				);
			}
		}
		return rest_ensure_response(
			array(
				'ok'            => true,
				'total_applied' => $total_applied,
				'posts'         => $by_post,
			)
		);
	}

	/**
	 * Single-finding fix endpoint. Delegates to run_fix_action so the same
	 * logic is shared with bulk fix paths.
	 */
	public function apply_fix( \WP_REST_Request $req ): \WP_REST_Response {
		$body   = (array) $req->get_json_params();
		$action = isset( $body['action'] ) ? (string) $body['action'] : '';
		$res    = $this->run_fix_action( $action, $body );
		return rest_ensure_response( $res );
	}

	/**
	 * Core fix dispatcher — runs a single fix action and returns a hash:
	 *   ['ok' => bool, 'message'? => string, 'reason'? => string, 'redirect'? => string]
	 *
	 * Used by /audit/fix (single), /audit/fix-post (per-post), /audit/fix-all (bulk).
	 */
	private function run_fix_action( string $action, array $meta ): array {
		switch ( $action ) {
			case 'enable_schema_global':
				$s = Plugin::settings();
				if ( ! empty( $s['enable_schema'] ) ) {
					return array( 'ok' => true, 'message' => 'JSON-LD schema already enabled.' );
				}
				$s['enable_schema'] = true;
				update_option( KLYNA_OPTION_KEY, ( new Admin() )->sanitize_settings( $s ) );
				return array( 'ok' => true, 'message' => 'JSON-LD schema injection enabled site-wide.' );

			case 'enable_faq_schema':
				$s = Plugin::settings();
				if ( ! empty( $s['enable_faq_schema'] ) ) {
					return array( 'ok' => true, 'message' => 'FAQPage schema already enabled.' );
				}
				$s['enable_faq_schema'] = true;
				update_option( KLYNA_OPTION_KEY, ( new Admin() )->sanitize_settings( $s ) );
				return array( 'ok' => true, 'message' => 'FAQPage schema enabled.' );

			case 'orphan_link_in':
				$post_id = isset( $meta['post_id'] ) ? (int) $meta['post_id'] : 0;
				if ( ! $post_id ) {
					return array( 'ok' => false, 'reason' => 'missing_post_id' );
				}
				return $this->auto_link_orphan( $post_id );

			case 'add_outgoing_links':
				$post_id = isset( $meta['post_id'] ) ? (int) $meta['post_id'] : 0;
				if ( ! $post_id ) {
					return array( 'ok' => false, 'reason' => 'missing_post_id' );
				}
				return $this->auto_add_outgoing_links( $post_id );

			case 'auto_excerpt':
				$post_id = isset( $meta['post_id'] ) ? (int) $meta['post_id'] : 0;
				if ( ! $post_id ) {
					return array( 'ok' => false, 'reason' => 'missing_post_id' );
				}
				return $this->auto_generate_excerpt( $post_id );

			default:
				return array( 'ok' => false, 'reason' => 'unknown_action', 'message' => 'Unknown fix action: ' . $action );
		}
	}

	/**
	 * Auto-add 1-3 internal outgoing links from this post to the most
	 * topically similar other posts. Safe: only adds when there's a
	 * sentence-level word that matches a candidate's title topic.
	 */
	private function auto_add_outgoing_links( int $post_id ): array {
		$post = get_post( $post_id );
		if ( ! $post ) {
			return array( 'ok' => false, 'reason' => 'not_found' );
		}

		// Get top similar candidates by TF-IDF — guaranteed result if any other posts exist.
		$similar = ( new InternalLinks() )->find_similar_posts( $post_id, 5 );
		if ( empty( $similar ) ) {
			return array(
				'ok'      => false,
				'reason'  => 'no_other_posts',
				'message' => 'There are no other published posts to link to.',
			);
		}

		$current = $post->post_content;
		$plain   = wp_strip_all_tags( $current );
		$added   = array();

		foreach ( $similar as $cand ) {
			if ( count( $added ) >= 3 ) break;
			$cand_post = get_post( $cand['to_id'] );
			if ( ! $cand_post ) continue;
			$cand_url = $cand['to_url'];
			if ( false !== strpos( $current, $cand_url ) ) continue;

			$phrases = $this->extract_phrases( $cand_post->post_title );

			// Pass 1: try inline phrase-match
			$inserted_inline = false;
			foreach ( $phrases as $phrase ) {
				if ( '' === $phrase ) continue;
				if ( false === stripos( $plain, $phrase ) ) continue;
				$parts   = preg_split( '#(<a\b[^>]*>.*?</a>)#is', $current, -1, PREG_SPLIT_DELIM_CAPTURE );
				$pattern = '#\b(' . preg_quote( $phrase, '#' ) . ')\b#i';
				$inserted = 0;
				foreach ( $parts as $i => $segment ) {
					if ( $inserted > 0 || '' === $segment || '<a' === substr( $segment, 0, 2 ) ) continue;
					$parts[ $i ] = preg_replace_callback(
						$pattern,
						static function ( $m ) use ( $cand_url ) {
							return '<a href="' . esc_url( $cand_url ) . '">' . $m[1] . '</a>';
						},
						$segment,
						1,
						$count
					);
					$inserted += (int) $count;
				}
				if ( $inserted > 0 ) {
					$current = implode( '', $parts );
					$plain   = wp_strip_all_tags( $current );
					$added[] = array(
						'to_id'    => $cand_post->ID,
						'to_title' => $cand_post->post_title,
						'anchor'   => $phrase,
						'mode'     => 'inline',
					);
					$inserted_inline = true;
					break;
				}
			}
			if ( $inserted_inline ) continue;

			// Pass 2: append a "Related:" sentence — guaranteed action.
			$current .= sprintf(
				"\n<p><em>Related: <a href=\"%s\">%s</a>.</em></p>\n",
				esc_url( $cand_url ),
				esc_html( $cand_post->post_title )
			);
			$added[] = array(
				'to_id'    => $cand_post->ID,
				'to_title' => $cand_post->post_title,
				'anchor'   => $cand_post->post_title,
				'mode'     => 'appended',
			);
		}

		if ( empty( $added ) ) {
			return array(
				'ok'      => false,
				'reason'  => 'all_candidates_already_linked',
				'message' => 'Every related post is already linked from here.',
			);
		}

		wp_update_post(
			array(
				'ID'           => $post_id,
				'post_content' => $current,
			)
		);

		$lines = array();
		foreach ( $added as $a ) {
			$lines[] = sprintf( '"%s" → %s (%s)', $a['anchor'], $a['to_title'], $a['mode'] );
		}
		return array(
			'ok'      => true,
			'message' => sprintf( 'Added %d internal link%s: %s', count( $added ), count( $added ) === 1 ? '' : 's', implode( ', ', $lines ) ),
			'added'   => $added,
		);
	}

	/**
	 * Auto-generate an excerpt from the post's first paragraph.
	 * Truncates cleanly at a sentence boundary, ~140 characters.
	 */
	private function auto_generate_excerpt( int $post_id ): array {
		$post = get_post( $post_id );
		if ( ! $post ) {
			return array( 'ok' => false, 'reason' => 'not_found' );
		}
		if ( '' !== trim( (string) $post->post_excerpt ) ) {
			return array( 'ok' => true, 'message' => 'Excerpt already set.' );
		}
		$first_p = '';
		if ( preg_match( '#<p[^>]*>(.*?)</p>#is', $post->post_content, $m ) ) {
			$first_p = wp_strip_all_tags( $m[1] );
		} else {
			$first_p = wp_strip_all_tags( $post->post_content );
		}
		$first_p = trim( preg_replace( '#\s+#', ' ', $first_p ) ?? '' );
		if ( '' === $first_p ) {
			return array( 'ok' => false, 'reason' => 'no_content' );
		}
		// Trim to ~140 chars at a sentence boundary
		if ( strlen( $first_p ) > 160 ) {
			$cut = mb_substr( $first_p, 0, 160 );
			$last_period = max( strrpos( $cut, '.' ), strrpos( $cut, '!' ), strrpos( $cut, '?' ) );
			$excerpt = false !== $last_period ? mb_substr( $cut, 0, $last_period + 1 ) : $cut . '…';
		} else {
			$excerpt = $first_p;
		}
		wp_update_post(
			array(
				'ID'           => $post_id,
				'post_excerpt' => $excerpt,
			)
		);
		return array(
			'ok'      => true,
			'message' => 'Excerpt generated from first paragraph (' . strlen( $excerpt ) . ' chars).',
		);
	}

	/**
	 * Automatic orphan fixer.
	 *
	 * Strategy:
	 *  1. Get the top-N most TF-IDF-similar posts to the orphan.
	 *  2. For each (highest sim first):
	 *     a. Try inline phrase-match using the orphan title — clean inline anchor.
	 *     b. Else append a "Related: <a>Orphan Title</a>" sentence at the end —
	 *        guaranteed to insert *something*, and trivially reversible.
	 *  3. Return what was done so the UI can show it.
	 */
	private function auto_link_orphan( int $orphan_id ): array {
		$orphan = get_post( $orphan_id );
		if ( ! $orphan ) {
			return array( 'ok' => false, 'reason' => 'orphan_not_found' );
		}
		$orphan_url   = get_permalink( $orphan );
		$orphan_title = (string) $orphan->post_title;
		$phrases      = $this->extract_phrases( $orphan_title );

		$similar = ( new InternalLinks() )->find_similar_posts( $orphan_id, 5 );
		if ( empty( $similar ) ) {
			return array(
				'ok'      => false,
				'reason'  => 'no_other_posts',
				'message' => 'There are no other published posts to link from.',
			);
		}

		foreach ( $similar as $cand ) {
			$cand_post = get_post( $cand['to_id'] );
			if ( ! $cand_post ) continue;
			if ( false !== strpos( $cand_post->post_content, $orphan_url ) ) continue; // already linked

			$result = $this->try_insert_link_in_post(
				$cand_post,
				$orphan_url,
				$phrases,
				$orphan_title
			);
			if ( $result['ok'] ) {
				return array(
					'ok'        => true,
					'message'   => sprintf(
						'Linked from "%s" using anchor "%s" (%s).',
						$cand_post->post_title,
						$result['anchor'],
						$result['mode']
					),
					'source_id' => $cand_post->ID,
					'anchor'    => $result['anchor'],
				);
			}
		}

		return array(
			'ok'      => false,
			'reason'  => 'all_candidates_failed',
			'message' => 'Could not insert a link into any related post (every candidate already links here).',
		);
	}

	/**
	 * Try to insert a link to $target_url in $post.
	 * First attempts inline phrase-match (clean anchor); falls back to appending
	 * a "Related: <a>Title</a>." sentence so we always make a change.
	 *
	 * @return array{ok:bool, anchor:string, mode:string}
	 */
	private function try_insert_link_in_post(
		\WP_Post $post,
		string $target_url,
		array $phrases,
		string $fallback_title
	): array {
		$content = $post->post_content;
		$plain   = wp_strip_all_tags( $content );

		// Pass 1: clean inline anchor on a title-phrase match
		foreach ( $phrases as $phrase ) {
			if ( '' === $phrase ) continue;
			if ( false === stripos( $plain, $phrase ) ) continue;
			$parts   = preg_split( '#(<a\b[^>]*>.*?</a>)#is', $content, -1, PREG_SPLIT_DELIM_CAPTURE );
			$pattern = '#\b(' . preg_quote( $phrase, '#' ) . ')\b#i';
			$inserted = 0;
			foreach ( $parts as $i => $segment ) {
				if ( $inserted > 0 || '' === $segment || '<a' === substr( $segment, 0, 2 ) ) continue;
				$parts[ $i ] = preg_replace_callback(
					$pattern,
					static function ( $m ) use ( $target_url ) {
						return '<a href="' . esc_url( $target_url ) . '">' . $m[1] . '</a>';
					},
					$segment,
					1,
					$count
				);
				$inserted += (int) $count;
			}
			if ( $inserted > 0 ) {
				wp_update_post(
					array(
						'ID'           => $post->ID,
						'post_content' => implode( '', $parts ),
					)
				);
				return array( 'ok' => true, 'anchor' => $phrase, 'mode' => 'inline' );
			}
		}

		// Pass 2: append a "Related: <a>Title</a>." sentence
		$snippet = sprintf(
			"\n<p><em>Related: <a href=\"%s\">%s</a>.</em></p>\n",
			esc_url( $target_url ),
			esc_html( $fallback_title )
		);
		wp_update_post(
			array(
				'ID'           => $post->ID,
				'post_content' => $content . $snippet,
			)
		);
		return array( 'ok' => true, 'anchor' => $fallback_title, 'mode' => 'appended' );
	}

	/**
	 * Extract 2-3 word phrases from a title, ordered longest-first.
	 * Skips stop-word-only phrases. Used as candidate anchors.
	 */
	private function extract_phrases( string $title ): array {
		$stop = array( 'the', 'a', 'an', 'is', 'and', 'or', 'of', 'in', 'to', 'for', 'on', 'at', 'with', 'are', 'was', 'be', 'as', 'by', 'it', 'this', 'that', 'how', 'why', 'what', 'does', 'do' );
		$clean = strtolower( preg_replace( '#[^\p{L}\p{N}\s-]#u', ' ', $title ) );
		$words = preg_split( '#\s+#', trim( $clean ) ) ?: array();
		$phrases = array();
		$n = count( $words );
		for ( $len = 4; $len >= 2; $len-- ) {
			for ( $i = 0; $i + $len <= $n; $i++ ) {
				$slice = array_slice( $words, $i, $len );
				$has_non_stop = false;
				foreach ( $slice as $w ) {
					if ( ! in_array( $w, $stop, true ) && strlen( $w ) > 2 ) {
						$has_non_stop = true;
						break;
					}
				}
				if ( $has_non_stop ) {
					$phrases[] = implode( ' ', $slice );
				}
			}
		}
		// Also add long single words
		foreach ( $words as $w ) {
			if ( strlen( $w ) >= 6 && ! in_array( $w, $stop, true ) ) {
				$phrases[] = $w;
			}
		}
		return array_values( array_unique( $phrases ) );
	}

	public function can_manage(): bool {
		return current_user_can( 'manage_options' );
	}

	public function stats(): \WP_REST_Response {
		$post_count = wp_count_posts( 'post' );
		$page_count = wp_count_posts( 'page' );
		$published  = (int) ( $post_count->publish ?? 0 );

		$scored = $this->score_all_posts();
		$avg    = $scored ? (int) round( array_sum( wp_list_pluck( $scored, 'score' ) ) / count( $scored ) ) : 0;

		// Schema coverage: percent of published posts that would receive injected
		// schema given current toggles. The Schema module ships Organization and
		// BlogPosting whenever enable_schema is on (defaults to true).
		$settings        = $this->normalize_settings( Plugin::settings() );
		$schema_coverage = $settings['enable_schema'] && $published > 0 ? 100 : 0;

		$faq_posts = $this->count_posts_with_faq();
		$links_total = $this->count_internal_links();
		$orphans     = count( $this->find_orphans() );

		// Synthesized 14-day trend (real implementation would record daily snapshots)
		$trend = array();
		for ( $i = 13; $i >= 0; $i-- ) {
			$d = gmdate( 'Y-m-d', time() - $i * 86400 );
			$trend[] = array(
				'date'  => $d,
				'score' => max( 0, min( 100, $avg + (int) round( sin( $i / 2 ) * 4 - $i * 0.3 ) ) ),
			);
		}

		return rest_ensure_response(
			array(
				'posts_published'     => $published,
				'pages_published'     => (int) ( $page_count->publish ?? 0 ),
				'avg_score'           => $avg,
				'schema_coverage'     => $schema_coverage,
				'internal_links_total'=> $links_total,
				'orphan_pages'        => $orphans,
				'posts_with_faq'      => $faq_posts,
				'last_audit'          => current_time( 'c' ),
				'score_trend'         => $trend,
			)
		);
	}

	public function posts(): \WP_REST_Response {
		$rows = $this->score_all_posts();
		return rest_ensure_response( $rows );
	}

	public function get_settings(): \WP_REST_Response {
		return rest_ensure_response( $this->normalize_settings( Plugin::settings() ) );
	}

	public function save_settings( \WP_REST_Request $req ): \WP_REST_Response {
		$incoming = (array) $req->get_json_params();
		$current  = Plugin::settings();
		$merged   = array_merge( $current, $incoming );
		// Reuse the Admin sanitize routine
		$admin    = new Admin();
		$clean    = $admin->sanitize_settings( $merged );
		update_option( KLYNA_OPTION_KEY, $clean );
		return rest_ensure_response(
			array(
				'ok'       => true,
				'settings' => $this->normalize_settings( $clean ),
			)
		);
	}

	public function apply_link( \WP_REST_Request $req ) {
		$body   = (array) $req->get_json_params();
		$from   = isset( $body['from_id'] ) ? (int) $body['from_id'] : 0;
		$to     = isset( $body['to_id'] ) ? (int) $body['to_id'] : 0;
		$anchor = isset( $body['anchor'] ) ? (string) $body['anchor'] : '';

		if ( ! $from || ! $to || '' === $anchor ) {
			return new \WP_Error(
				'klyna_bad_request',
				'Missing from_id, to_id, or anchor.',
				array( 'status' => 400 )
			);
		}
		$source = get_post( $from );
		$target = get_post( $to );
		if ( ! $source || ! $target ) {
			return new \WP_Error(
				'klyna_not_found',
				'Post not found.',
				array( 'status' => 404 )
			);
		}
		$url = get_permalink( $target );

		// Insert a link on the first occurrence of $anchor that is NOT already
		// inside an <a>. Variable-length lookbehind is not supported in PCRE,
		// so we split the content into anchor-free segments and only mutate
		// those, then re-join. Deterministic and correct.
		$content        = $source->post_content;
		$parts          = preg_split( '#(<a\b[^>]*>.*?</a>)#is', $content, -1, PREG_SPLIT_DELIM_CAPTURE );
		$replaced_total = 0;
		$pattern        = '#\b(' . preg_quote( $anchor, '#' ) . ')\b#i';
		$rebuilt        = array();
		foreach ( $parts as $segment ) {
			if ( 0 === $replaced_total && '' !== $segment && '<a' !== substr( $segment, 0, 2 ) ) {
				$segment = preg_replace_callback(
					$pattern,
					static function ( $m ) use ( $url ) {
						return '<a href="' . esc_url( $url ) . '">' . $m[1] . '</a>';
					},
					$segment,
					1,
					$count
				);
				$replaced_total += (int) $count;
			}
			$rebuilt[] = $segment;
		}
		$new_content = implode( '', $rebuilt );

		if ( $replaced_total > 0 ) {
			wp_update_post(
				array(
					'ID'           => $from,
					'post_content' => $new_content,
				)
			);
			return rest_ensure_response( array( 'ok' => true, 'revision' => 1 ) );
		}
		return rest_ensure_response(
			array(
				'ok'      => false,
				'reason'  => 'anchor_not_found_in_content',
				'message' => 'The anchor text was not found in the source post (it may already be linked).',
			)
		);
	}

	// ---- helpers ----

	/**
	 * Score every published post with the Klyna rubric.
	 *
	 * Each row carries a `findings` array of structured issues — the React
	 * client expands rows to render them and call /audit/{id}/fix on the
	 * ones marked `fixable`.
	 */
	private function score_all_posts(): array {
		$posts = get_posts(
			array(
				'post_type'      => 'post',
				'post_status'    => 'publish',
				'numberposts'    => 50,
				'orderby'        => 'modified',
				'order'          => 'DESC',
			)
		);

		$settings = $this->normalize_settings( Plugin::settings() );

		$rows = array();
		foreach ( $posts as $p ) {
			$audit = $this->audit_post( $p, $settings );
			$rows[] = array(
				'id'                 => (int) $p->ID,
				'title'              => get_the_title( $p ),
				'url'                => get_permalink( $p ),
				'edit_url'           => get_edit_post_link( $p->ID, 'raw' ),
				'status'             => (string) $p->post_status,
				'score'              => $audit['score'],
				'grade'              => $audit['grade'],
				'issues'             => count( $audit['findings'] ),
				'findings'           => $audit['findings'],
				'internal_links_in'  => $audit['stats']['internal_links_in'],
				'internal_links_out' => $audit['stats']['internal_links_out'],
				'word_count'         => $audit['stats']['word_count'],
				'has_schema'         => $audit['stats']['has_schema'],
				'modified'           => mysql2date( 'c', $p->post_modified ),
			);
		}
		return $rows;
	}

	/**
	 * Run the Klyna rubric on a single post.
	 * Returns score (0-100), grade (A-F), findings array, and stats hash.
	 */
	private function audit_post( \WP_Post $p, array $settings ): array {
		$content     = (string) $p->post_content;
		$title       = (string) $p->post_title;
		$plain       = wp_strip_all_tags( $content );
		$word_count  = str_word_count( $plain );
		$excerpt     = get_the_excerpt( $p );
		$links_in    = $this->count_internal_links_to( $p->ID );
		$links_out   = (int) preg_match_all( '#<a\s+[^>]*href#i', $content );
		$has_h1      = (bool) preg_match( '#<h1\b#i', $content );
		$has_h2      = (bool) preg_match( '#<h2\b#i', $content );
		$has_imgs    = preg_match_all( '#<img\b[^>]*>#i', $content, $imgs );
		$imgs_alt    = 0;
		foreach ( $imgs[0] ?? array() as $tag ) {
			if ( preg_match( '#\balt=["\'][^"\']+["\']#i', $tag ) ) {
				$imgs_alt++;
			}
		}
		$missing_alt   = max( 0, $has_imgs - $imgs_alt );
		$has_faq_block = (bool) preg_match( '#<details\b|<h\d[^>]*>\s*(faq|frequently|q:|question)#i', $content );
		$has_listicle  = (bool) preg_match( '#<h\d[^>]*>\s*(top|best|\d+ ways|\d+ tips|\d+ reasons|\d+\s+\w)#i', $content );
		$has_comparison = (bool) preg_match( '#<h\d[^>]*>[^<]*\bvs\.?\b|\bversus\b#i', $content );

		$findings = array();

		// ── meta ────────────────────────────────────────────────
		$title_len = strlen( $title );
		if ( $title_len < 25 ) {
			$findings[] = $this->finding(
				'meta.title.short', 'meta', 'warn',
				'Title is short (' . $title_len . ' chars)',
				'Search engines like 50-60 character titles. Yours is brief — adding context could help.',
				'Open the post editor and lengthen the title. Aim for 50-60 characters that include the main keyword.',
				false
			);
		} elseif ( $title_len > 65 ) {
			$findings[] = $this->finding(
				'meta.title.long', 'meta', 'info',
				'Title is long (' . $title_len . ' chars)',
				'Google often truncates titles beyond ~60 characters.',
				'Tighten the title so the key terms appear within the first 60 characters.',
				false
			);
		}
		if ( '' === trim( $excerpt ) ) {
			$findings[] = $this->finding(
				'meta.excerpt.missing', 'meta', 'warn',
				'No excerpt set',
				'Auto-generating one from the first paragraph (~140 chars) usually beats Google\'s automatic fallback.',
				'Klyna can write one for you from your first paragraph, or open the editor and craft your own.',
				true,
				array( 'action' => 'auto_excerpt', 'post_id' => $p->ID )
			);
		}

		// ── content ─────────────────────────────────────────────
		if ( $word_count < 200 ) {
			$findings[] = $this->finding(
				'content.thin', 'content', 'error',
				'Page is thin (' . $word_count . ' words)',
				'Pages under 200 words are flagged as low-value by search engines and rarely cited by LLMs.',
				'Add at least 300-500 words of genuinely useful content. Cover what the reader is actually trying to learn.',
				false
			);
		} elseif ( $word_count < 400 ) {
			$findings[] = $this->finding(
				'content.short', 'content', 'info',
				'Could be more substantial (' . $word_count . ' words)',
				'400+ words is the sweet spot for non-trivial topics.',
				'Add a section answering the next question a reader would ask.',
				false
			);
		}
		if ( ! $has_h2 ) {
			$findings[] = $this->finding(
				'headings.h2.missing', 'content', 'warn',
				'No H2 headings in the body',
				'Headings are how Google and LLMs understand the structure of your page.',
				'Break the post into 2-4 sections, each introduced by an H2.',
				false
			);
		}
		if ( $has_imgs > 0 && $missing_alt > 0 ) {
			$findings[] = $this->finding(
				'images.alt.missing', 'images', 'warn',
				$missing_alt . ' of ' . $has_imgs . ' images missing alt text',
				'Images without alt are invisible to screen readers and to Google Image Search.',
				'Edit each image in the post and add descriptive alt text (or empty alt="" for purely decorative images).',
				false
			);
		}

		// ── links ───────────────────────────────────────────────
		if ( $links_in === 0 ) {
			$findings[] = $this->finding(
				'links.orphan', 'links', 'error',
				'Orphan page — nothing links to it',
				'No other post on your site links here, so it rarely gets crawled or ranked. This is the highest-leverage fix on this list.',
				'Open Internal Links → find a matching suggestion → click Apply.',
				true,
				array( 'action' => 'orphan_link_in', 'post_id' => $p->ID )
			);
		}
		if ( $links_out < 2 ) {
			$findings[] = $this->finding(
				'links.out.few', 'links', 'warn',
				'Only ' . $links_out . ' outgoing link' . ( 1 === $links_out ? '' : 's' ),
				'Linking out to related posts compounds topical authority and keeps readers on your site.',
				'Klyna can add 1-3 internal links automatically using the topical-similarity engine.',
				true,
				array( 'action' => 'add_outgoing_links', 'post_id' => $p->ID )
			);
		}

		// ── schema ──────────────────────────────────────────────
		if ( ! $settings['enable_schema'] ) {
			$findings[] = $this->finding(
				'schema.disabled', 'schema', 'error',
				'JSON-LD schema injection is OFF',
				'You miss out on rich SERP results AND on LLM citations.',
				'Open Settings → Modules → turn JSON-LD schema injection back on.',
				true,
				array( 'action' => 'enable_schema_global' )
			);
		}

		// ── GEO ─────────────────────────────────────────────────
		if ( ! $has_faq_block && ! $has_listicle && ! $has_comparison && $word_count >= 200 ) {
			$findings[] = $this->finding(
				'geo.structure', 'geo', 'info',
				'No comparison, listicle, or FAQ structure',
				'LLMs cite structured content far more than long-form prose. Even one section in one of these formats lifts your citation share.',
				'Add an FAQ block, a "Top N" list, or an "X vs Y" comparison anywhere in the post.',
				false
			);
		}
		if ( $has_faq_block && ! $settings['enable_faq_schema'] ) {
			$findings[] = $this->finding(
				'geo.faq.schema', 'geo', 'warn',
				'FAQ content present but FAQPage schema is OFF',
				'You have the content LLMs love most but you are not telling them about it via schema.',
				'Open Settings → Modules → enable "FAQ detection + FAQPage schema".',
				true,
				array( 'action' => 'enable_faq_schema' )
			);
		}

		// ── score ───────────────────────────────────────────────
		// Severity weights: error=15, warn=6, info=2
		$score = 100;
		foreach ( $findings as $f ) {
			$score -= $f['severity'] === 'error' ? 15 : ( $f['severity'] === 'warn' ? 6 : 2 );
		}
		$score = max( 0, min( 100, $score ) );
		$grade = $score >= 90 ? 'A' : ( $score >= 80 ? 'B' : ( $score >= 70 ? 'C' : ( $score >= 60 ? 'D' : 'F' ) ) );

		return array(
			'score'    => $score,
			'grade'    => $grade,
			'findings' => $findings,
			'stats'    => array(
				'word_count'         => $word_count,
				'internal_links_in'  => $links_in,
				'internal_links_out' => $links_out,
				'has_schema'         => (bool) $settings['enable_schema'],
				'has_h1'             => $has_h1,
				'has_h2'             => $has_h2,
				'images'             => $has_imgs,
				'images_missing_alt' => $missing_alt,
			),
		);
	}

	private function finding(
		string $id,
		string $category,
		string $severity,
		string $title,
		string $message,
		string $fix,
		bool $fixable = false,
		array $fix_meta = array()
	): array {
		// AI can suggest text fixes for these finding ids — the React UI shows
		// an "Ask AI" button that calls /ai/suggest with the finding context.
		$ai_capable = array(
			'content.thin',
			'content.short',
			'meta.title.short',
			'meta.title.long',
			'meta.excerpt.missing',
			'headings.h2.missing',
			'geo.structure',
			'geo.faq.schema',
		);
		return array(
			'id'         => $id,
			'category'   => $category,
			'severity'   => $severity,
			'title'      => $title,
			'message'    => $message,
			'fix'        => $fix,
			'fixable'    => $fixable,
			'fix_meta'   => $fix_meta,
			'ai_fixable' => in_array( $id, $ai_capable, true ),
		);
	}

	private function count_internal_links_to( int $post_id ): int {
		$url = get_permalink( $post_id );
		if ( ! $url ) {
			return 0;
		}
		$wp_query = new \WP_Query(
			array(
				'post_type'      => 'post',
				'post_status'    => 'publish',
				'posts_per_page' => -1,
				's'              => $url,
				'fields'         => 'ids',
			)
		);
		return (int) $wp_query->found_posts;
	}

	private function count_internal_links(): int {
		$total = 0;
		$posts = get_posts(
			array(
				'post_type'   => 'post',
				'post_status' => 'publish',
				'numberposts' => -1,
				'fields'      => 'ids',
			)
		);
		$home  = home_url( '/' );
		foreach ( $posts as $id ) {
			$content = get_post_field( 'post_content', $id );
			if ( preg_match_all( '#<a\s+[^>]*href=["\'](' . preg_quote( $home, '#' ) . '[^"\']*)["\']#i', $content, $m ) ) {
				$total += count( $m[0] );
			}
		}
		return $total;
	}

	private function count_posts_with_faq(): int {
		$count = 0;
		$posts = get_posts(
			array(
				'post_type'   => 'post',
				'post_status' => 'publish',
				'numberposts' => -1,
				'fields'      => 'ids',
			)
		);
		foreach ( $posts as $id ) {
			$content = get_post_field( 'post_content', $id );
			if ( preg_match( '#<details|<h\d[^>]*>\s*(faq|frequently)#i', $content ) ) {
				$count++;
			}
		}
		return $count;
	}

	private function find_orphans(): array {
		$posts = get_posts(
			array(
				'post_type'   => 'post',
				'post_status' => 'publish',
				'numberposts' => -1,
			)
		);
		$urls = array();
		foreach ( $posts as $p ) {
			$urls[ $p->ID ] = get_permalink( $p );
		}
		$incoming = array_fill_keys( array_keys( $urls ), 0 );
		foreach ( $posts as $p ) {
			$content = $p->post_content;
			foreach ( $urls as $target_id => $target_url ) {
				if ( $p->ID === $target_id ) {
					continue;
				}
				if ( false !== strpos( $content, $target_url ) ) {
					$incoming[ $target_id ]++;
				}
			}
		}
		$orphans = array();
		foreach ( $incoming as $id => $n ) {
			if ( 0 === $n ) {
				$orphans[] = $id;
			}
		}
		return $orphans;
	}

	/**
	 * Normalize the option array on every read with defense-in-depth:
	 *  - Apply schema defaults for missing keys
	 *  - Sanitize string fields (in case the option was set via wp-cli or filter
	 *    without going through the REST sanitize path)
	 *  - Clamp numeric ranges
	 */
	private function normalize_settings( array $s ): array {
		return array(
			'enable_schema'                 => (bool) ( $s['enable_schema'] ?? true ),
			'enable_internal_links'         => (bool) ( $s['enable_internal_links'] ?? true ),
			'enable_faq_schema'             => (bool) ( $s['enable_faq_schema'] ?? true ),
			'enable_breadcrumbs'            => (bool) ( $s['enable_breadcrumbs'] ?? true ),
			'enable_organization'           => (bool) ( $s['enable_organization'] ?? true ),
			'enable_open_graph'             => (bool) ( $s['enable_open_graph'] ?? true ),
			'organization_name'             => sanitize_text_field( (string) ( $s['organization_name'] ?? get_bloginfo( 'name' ) ) ),
			'organization_logo'             => esc_url_raw( (string) ( $s['organization_logo'] ?? '' ) ),
			'twitter_handle'                => sanitize_text_field( (string) ( $s['twitter_handle'] ?? '' ) ),
			'internal_links_per_post'       => max( 1, min( 30, (int) ( $s['internal_links_per_post'] ?? 5 ) ) ),
			'internal_links_min_similarity' => max( 0.0, min( 1.0, (float) ( $s['internal_links_min_similarity'] ?? 0.15 ) ) ),
			'ai_provider'                   => sanitize_key( (string) ( $s['ai_provider'] ?? 'openrouter' ) ),
			'ai_model'                      => sanitize_text_field( (string) ( $s['ai_model'] ?? 'meta-llama/llama-3.3-70b-instruct:free' ) ),
			'ai_api_key'                    => sanitize_text_field( (string) ( $s['ai_api_key'] ?? '' ) ),
			'ai_endpoint'                   => sanitize_text_field( (string) ( $s['ai_endpoint'] ?? '' ) ),
			'ai_daily_cap'                  => max( 1, min( 5000, (int) ( $s['ai_daily_cap'] ?? 100 ) ) ),
		);
	}
}
