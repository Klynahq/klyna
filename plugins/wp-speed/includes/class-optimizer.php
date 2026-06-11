<?php
/**
 * Front-end output optimizer.
 *
 * A single output-buffer pass over the rendered HTML applies the lightweight,
 * safe transforms that move Core Web Vitals:
 *
 *  - Image / iframe lazy-loading (adds loading="lazy" + decoding="async").
 *  - Defer non-critical <script src> tags.
 *  - Collapse HTML whitespace (preserving <pre>, <textarea>, <script>).
 *  - Preload key assets (<link rel="preload">) injected into <head>.
 *
 * CSS minification runs separately, on enqueued stylesheets, via a
 * `style_loader_tag` filter so we never rewrite third-party CDN assets.
 *
 * Everything here is conservative: transforms bail out on the admin, on the
 * customizer/preview, on AMP, and on feeds. No external services.
 *
 * @package KlynaSpeed
 */

namespace KlynaSpeed;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Optimizer {

	/**
	 * Script handles / src fragments that must never be deferred.
	 *
	 * @var string[]
	 */
	private const DEFER_DENYLIST = array(
		'jquery-core',
		'jquery-migrate',
		'wp-i18n',
		'wp-hooks',
	);

	public function register(): void {
		// CSS minify acts on the enqueue tag, before the buffer runs.
		if ( (bool) Plugin::get( 'enable_minify_css', true ) ) {
			add_filter( 'style_loader_tag', array( $this, 'minify_inline_after_tag' ), 10, 4 );
		}

		// Preload links inject into <head> directly.
		if ( (bool) Plugin::get( 'enable_preload', true ) ) {
			add_action( 'wp_head', array( $this, 'inject_preloads' ), 2 );
		}

		// Front-end lazy-load progressive-enhancement asset.
		if ( (bool) Plugin::get( 'enable_lazyload', true ) ) {
			add_action( 'wp_enqueue_scripts', array( $this, 'enqueue_frontend' ) );
		}

		// Single HTML buffer pass for lazyload + defer + html-minify.
		add_action( 'template_redirect', array( $this, 'maybe_start_buffer' ), 5 );
	}

	/**
	 * Enqueue the tiny vanilla lazy-load enhancement on the front end.
	 *
	 * The transform itself uses the native loading="lazy" attribute; this asset
	 * only hydrates data-klyna-src placeholders on browsers that lack it.
	 */
	public function enqueue_frontend(): void {
		if ( ! $this->is_processable() ) {
			return;
		}
		wp_enqueue_style(
			'klyna-speed-lazyload',
			KLYNA_SPEED_PLUGIN_URL . 'assets/css/lazyload.css',
			array(),
			KLYNA_SPEED_VERSION
		);
		wp_enqueue_script(
			'klyna-speed-lazyload',
			KLYNA_SPEED_PLUGIN_URL . 'assets/js/lazyload.js',
			array(),
			KLYNA_SPEED_VERSION,
			true
		);
	}

	/**
	 * Open an output buffer when at least one buffer-based transform is on.
	 */
	public function maybe_start_buffer(): void {
		if ( ! $this->is_processable() ) {
			return;
		}
		$any = (bool) Plugin::get( 'enable_lazyload', true )
			|| (bool) Plugin::get( 'enable_defer_js', true )
			|| (bool) Plugin::get( 'enable_minify_html', true );
		if ( ! $any ) {
			return;
		}
		ob_start( array( $this, 'process' ) );
	}

	/**
	 * Transform the buffered page HTML.
	 *
	 * @param string $html Page markup.
	 * @return string
	 */
	public function process( string $html ): string {
		if ( '' === trim( $html ) || ! $this->is_processable() ) {
			return $html;
		}

		if ( (bool) Plugin::get( 'enable_lazyload', true ) ) {
			$html = $this->add_lazyload( $html );
		}
		if ( (bool) Plugin::get( 'enable_defer_js', true ) ) {
			$html = $this->defer_scripts( $html );
		}
		if ( (bool) Plugin::get( 'enable_minify_html', true ) ) {
			$html = $this->minify_html( $html );
		}

		return $html;
	}

	/* ------------------------------------------------------------------ *
	 * Lazy-load
	 * ------------------------------------------------------------------ */

	/**
	 * Add loading="lazy" + decoding="async" to images (and iframes, optionally).
	 *
	 * Skips any element that already declares loading=, and skips the first
	 * image on the page so the LCP element is never lazy-loaded.
	 *
	 * @param string $html Page markup.
	 * @return string
	 */
	private function add_lazyload( string $html ): string {
		$first_skipped = false;

		$html = preg_replace_callback(
			'/<img\b(?![^>]*\bloading\s*=)[^>]*>/i',
			static function ( $m ) use ( &$first_skipped ) {
				$tag = $m[0];
				// Never lazy-load the LCP candidate (first image) or no-lazy opt-outs.
				if ( ! $first_skipped || false !== stripos( $tag, 'data-no-lazy' ) || false !== stripos( $tag, 'skip-lazy' ) ) {
					$first_skipped = true;
					return $tag;
				}
				$inject = ' loading="lazy"';
				if ( false === stripos( $tag, 'decoding=' ) ) {
					$inject .= ' decoding="async"';
				}
				return preg_replace( '/<img\b/i', '<img' . $inject, $tag, 1 );
			},
			$html
		);

		if ( (bool) Plugin::get( 'lazyload_iframes', true ) ) {
			$html = preg_replace_callback(
				'/<iframe\b(?![^>]*\bloading\s*=)[^>]*>/i',
				static fn( $m ) => preg_replace( '/<iframe\b/i', '<iframe loading="lazy"', $m[0], 1 ),
				$html
			);
		}

		return is_string( $html ) ? $html : '';
	}

	/* ------------------------------------------------------------------ *
	 * Defer JS
	 * ------------------------------------------------------------------ */

	/**
	 * Add the `defer` attribute to external script tags that are safe to defer.
	 *
	 * @param string $html Page markup.
	 * @return string
	 */
	private function defer_scripts( string $html ): string {
		$result = preg_replace_callback(
			'/<script\b[^>]*>/i',
			function ( $m ) {
				$tag = $m[0];

				// Only external scripts with a src.
				if ( false === stripos( $tag, 'src=' ) ) {
					return $tag;
				}
				// Already deferred / async / module — leave it.
				if ( preg_match( '/\b(defer|async|type\s*=\s*["\']module["\'])/i', $tag ) ) {
					return $tag;
				}
				// Respect explicit opt-out.
				if ( false !== stripos( $tag, 'data-no-defer' ) ) {
					return $tag;
				}
				foreach ( self::DEFER_DENYLIST as $needle ) {
					if ( false !== stripos( $tag, $needle ) ) {
						return $tag;
					}
				}
				return preg_replace( '/<script\b/i', '<script defer', $tag, 1 );
			},
			$html
		);

		return is_string( $result ) ? $result : $html;
	}

	/* ------------------------------------------------------------------ *
	 * Preload
	 * ------------------------------------------------------------------ */

	/**
	 * Emit <link rel="preload"> tags for the user's configured key assets.
	 */
	public function inject_preloads(): void {
		if ( ! $this->is_processable() ) {
			return;
		}
		$raw = (string) Plugin::get( 'preload_urls', '' );
		if ( '' === trim( $raw ) ) {
			return;
		}
		$urls = preg_split( '/[\r\n]+/', $raw );
		if ( ! is_array( $urls ) ) {
			return;
		}
		foreach ( $urls as $url ) {
			$url = trim( $url );
			if ( '' === $url ) {
				continue;
			}
			$as    = $this->preload_as( $url );
			$type  = $this->preload_type( $url );
			$cross = ( 'font' === $as ) ? ' crossorigin' : '';
			printf(
				'<link rel="preload" href="%1$s" as="%2$s"%3$s%4$s>' . "\n",
				esc_url( $url ),
				esc_attr( $as ),
				$type ? ' type="' . esc_attr( $type ) . '"' : '',
				$cross // Literal ' crossorigin' or '' — no user data, safe to emit verbatim.
			);
		}
	}

	/**
	 * Map a file extension to a preload `as` token.
	 */
	private function preload_as( string $url ): string {
		$ext = strtolower( pathinfo( wp_parse_url( $url, PHP_URL_PATH ) ?? '', PATHINFO_EXTENSION ) );
		return match ( $ext ) {
			'css'                                  => 'style',
			'js'                                   => 'script',
			'woff', 'woff2', 'ttf', 'otf', 'eot'   => 'font',
			'jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg' => 'image',
			default                                => 'fetch',
		};
	}

	/**
	 * Map a font/style extension to a MIME type for the preload hint.
	 */
	private function preload_type( string $url ): string {
		$ext = strtolower( pathinfo( wp_parse_url( $url, PHP_URL_PATH ) ?? '', PATHINFO_EXTENSION ) );
		return match ( $ext ) {
			'woff2' => 'font/woff2',
			'woff'  => 'font/woff',
			'ttf'   => 'font/ttf',
			default => '',
		};
	}

	/* ------------------------------------------------------------------ *
	 * CSS minify
	 * ------------------------------------------------------------------ */

	/**
	 * For local stylesheets, swap in a minified, cached copy of the file.
	 *
	 * We never touch off-site (CDN) URLs — only assets that live inside this
	 * install's content/includes directories, which we are free to rewrite.
	 *
	 * @param string $tag    The full <link> tag.
	 * @param string $handle Style handle.
	 * @param string $href   Stylesheet URL.
	 * @param string $media  Media attribute.
	 * @return string
	 */
	public function minify_inline_after_tag( $tag, $handle, $href, $media ): string {
		$local = $this->local_path_for_url( (string) $href );
		if ( ! $local || ! is_readable( $local ) || ! str_ends_with( $local, '.css' ) ) {
			return $tag;
		}
		// Skip already-minified files.
		if ( str_ends_with( $local, '.min.css' ) ) {
			return $tag;
		}

		$minified_url = $this->ensure_minified_css( $local );
		if ( ! $minified_url ) {
			return $tag;
		}
		return str_replace( $href, $minified_url, $tag );
	}

	/**
	 * Build (and cache on disk) a minified twin of a local CSS file.
	 *
	 * @param string $path Absolute path to the source CSS.
	 * @return string Minified file URL, or '' on failure.
	 */
	private function ensure_minified_css( string $path ): string {
		$dir = Cache::base_dir() . '/min';
		if ( ! is_dir( $dir ) ) {
			wp_mkdir_p( $dir );
		}
		$key  = md5( $path . filemtime( $path ) );
		$out  = $dir . '/' . $key . '.css';

		if ( ! is_readable( $out ) ) {
			$css = file_get_contents( $path ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_get_contents
			if ( false === $css ) {
				return '';
			}
			$min = $this->minify_css_string( $css );
			if ( false === file_put_contents( $out, $min, LOCK_EX ) ) { // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
				return '';
			}
		}

		$base_url = content_url( 'cache/klyna-speed/min/' );
		return $base_url . $key . '.css';
	}

	/**
	 * Strip comments and collapse whitespace in a CSS string.
	 *
	 * @param string $css Raw CSS.
	 * @return string
	 */
	private function minify_css_string( string $css ): string {
		$css = preg_replace( '#/\*(?!!)[^*]*\*+([^/*][^*]*\*+)*/#', '', $css );
		$css = preg_replace( '/\s*([{}:;,>+~])\s*/', '$1', (string) $css );
		$css = preg_replace( '/;}/', '}', (string) $css );
		$css = preg_replace( '/\s+/', ' ', (string) $css );
		return trim( (string) $css );
	}

	/* ------------------------------------------------------------------ *
	 * HTML minify
	 * ------------------------------------------------------------------ */

	/**
	 * Collapse insignificant whitespace in HTML, preserving sensitive blocks.
	 *
	 * @param string $html Page markup.
	 * @return string
	 */
	private function minify_html( string $html ): string {
		$preserve = array();

		// Stash <pre>, <textarea>, <script>, <style> verbatim.
		$html = preg_replace_callback(
			'#<(pre|textarea|script|style)\b[^>]*>.*?</\1>#is',
			static function ( $m ) use ( &$preserve ) {
				$token              = '<!--klyna-preserve-' . count( $preserve ) . '-->';
				$preserve[ $token ] = $m[0];
				return $token;
			},
			$html
		);
		if ( ! is_string( $html ) ) {
			return '';
		}

		// Drop HTML comments (but not IE conditionals).
		$html = preg_replace( '/<!--(?!\[if)(?!\s*klyna-preserve).*?-->/s', '', $html );
		// Collapse runs of whitespace between tags.
		$html = preg_replace( '/>\s+</', '><', (string) $html );
		// Collapse remaining multi-space runs.
		$html = preg_replace( '/[ \t]{2,}/', ' ', (string) $html );

		// Restore preserved blocks.
		if ( $preserve ) {
			$html = strtr( (string) $html, $preserve );
		}

		return is_string( $html ) ? $html : '';
	}

	/* ------------------------------------------------------------------ *
	 * Helpers
	 * ------------------------------------------------------------------ */

	/**
	 * Should the current request be transformed at all?
	 */
	private function is_processable(): bool {
		if ( is_admin() || wp_doing_ajax() || wp_doing_cron() ) {
			return false;
		}
		if ( is_feed() || is_preview() || is_customize_preview() ) {
			return false;
		}
		if ( defined( 'REST_REQUEST' ) && REST_REQUEST ) {
			return false;
		}
		if ( defined( 'DOING_AJAX' ) && DOING_AJAX ) {
			return false;
		}
		return true;
	}

	/**
	 * Resolve a same-origin URL to its absolute path on disk.
	 *
	 * @param string $url Asset URL.
	 * @return string Absolute path, or '' for off-site/unknown URLs.
	 */
	private function local_path_for_url( string $url ): string {
		$content_url = content_url();
		$includes_url = includes_url();
		$content_dir  = WP_CONTENT_DIR;
		$includes_dir = ABSPATH . WPINC;

		// Normalize protocol-relative URLs.
		$url = preg_replace( '#^//#', ( is_ssl() ? 'https:' : 'http:' ) . '//', $url );
		$url = (string) preg_replace( '/\?.*$/', '', (string) $url ); // strip version query.

		if ( str_starts_with( $url, $content_url ) ) {
			return $content_dir . substr( $url, strlen( $content_url ) );
		}
		if ( str_starts_with( $url, $includes_url ) ) {
			return $includes_dir . substr( $url, strlen( $includes_url ) );
		}
		return '';
	}
}
