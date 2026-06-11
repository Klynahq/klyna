<?php
/**
 * Full-page disk cache with smart invalidation.
 *
 * Captures the rendered HTML of cacheable front-end requests via an output
 * buffer, writes it to a per-URL file under wp-content/cache/klyna-speed, and
 * serves it on the next request. Invalidation is automatic: saving or deleting
 * a post, changing a comment's status, switching themes, or updating options
 * purges the affected entries (or the whole store, when scope is sitewide).
 *
 * Pure PHP, zero external services — the cache lives entirely on the customer's
 * disk and never phones home.
 *
 * @package KlynaSpeed
 */

namespace KlynaSpeed;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Cache {

	/**
	 * Absolute path to the file written for the current request, if any.
	 *
	 * @var string
	 */
	private string $current_file = '';

	public function register(): void {
		// Front-end serve + capture. Run early so we can short-circuit.
		add_action( 'template_redirect', array( $this, 'maybe_start_buffer' ), 0 );

		// Smart invalidation.
		add_action( 'save_post', array( $this, 'on_save_post' ), 10, 1 );
		add_action( 'deleted_post', array( $this, 'on_save_post' ), 10, 1 );
		add_action( 'trashed_post', array( $this, 'on_save_post' ), 10, 1 );
		add_action( 'comment_post', array( $this, 'on_comment' ), 10, 1 );
		add_action( 'edit_comment', array( $this, 'on_comment' ), 10, 1 );
		add_action( 'transition_comment_status', array( $this, 'on_comment_status' ), 10, 3 );
		add_action( 'switch_theme', array( $this, 'purge_all_action' ) );
		add_action( 'customize_save_after', array( $this, 'purge_all_action' ) );
		add_action( 'update_option_' . KLYNA_SPEED_OPTION_KEY, array( $this, 'purge_all_action' ) );
		add_action( 'wp_update_nav_menu', array( $this, 'purge_all_action' ) );
		add_action( 'klyna_speed_purge_all', array( $this, 'purge_all_action' ) );
	}

	/**
	 * Decide whether to serve a cached copy or capture a fresh one.
	 */
	public function maybe_start_buffer(): void {
		if ( ! (bool) Plugin::get( 'enable_page_cache', true ) ) {
			return;
		}
		if ( ! $this->is_cacheable_request() ) {
			return;
		}

		$file = $this->path_for_request();
		$ttl  = max( 1, (int) Plugin::get( 'cache_ttl_hours', 10 ) ) * HOUR_IN_SECONDS;

		// Serve hit.
		if ( is_readable( $file ) && ( time() - filemtime( $file ) ) < $ttl ) {
			$this->serve_file( $file );
			// serve_file() ends the request.
		}

		// Capture miss.
		$this->current_file = $file;
		ob_start( array( $this, 'capture' ) );
	}

	/**
	 * Output-buffer callback. Persists the HTML and returns it for display.
	 *
	 * @param string $html Buffered page markup.
	 * @return string
	 */
	public function capture( string $html ): string {
		// Never cache empties, errors, or redirects.
		if ( '' === trim( $html ) || is_404() || strlen( $html ) < 255 ) {
			return $html;
		}
		if ( ! $this->is_cacheable_request() ) {
			return $html;
		}

		self::ensure_cache_dir();

		$stamp   = sprintf(
			"\n<!-- Cached by Klyna Speed on %s -->",
			esc_html( gmdate( 'Y-m-d H:i:s' ) . ' UTC' )
		);
		$payload = $html . $stamp;

		if ( $this->current_file ) {
			$dir = dirname( $this->current_file );
			if ( ! is_dir( $dir ) ) {
				wp_mkdir_p( $dir );
			}
			// Atomic-ish write: temp file then rename.
			$tmp = $this->current_file . '.' . wp_generate_password( 6, false ) . '.tmp';
			if ( false !== file_put_contents( $tmp, $payload, LOCK_EX ) ) { // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
				@rename( $tmp, $this->current_file ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
			}
		}

		return $payload;
	}

	/**
	 * Stream a cached file to the client and end the request.
	 *
	 * @param string $file Absolute path.
	 */
	private function serve_file( string $file ): void {
		$html = file_get_contents( $file ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_get_contents
		if ( false === $html ) {
			return;
		}
		if ( ! headers_sent() ) {
			header( 'X-Klyna-Speed: hit' );
			header( 'Content-Type: text/html; charset=' . get_option( 'blog_charset', 'UTF-8' ) );
		}
		echo $html; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Pre-rendered, pre-escaped page HTML.
		exit;
	}

	/**
	 * Is the current request safe to cache?
	 */
	private function is_cacheable_request(): bool {
		if ( is_admin() || wp_doing_ajax() || wp_doing_cron() ) {
			return false;
		}
		if ( ( defined( 'REST_REQUEST' ) && REST_REQUEST ) || ( defined( 'XMLRPC_REQUEST' ) && XMLRPC_REQUEST ) ) {
			return false;
		}
		$method = isset( $_SERVER['REQUEST_METHOD'] ) ? strtoupper( sanitize_text_field( wp_unslash( $_SERVER['REQUEST_METHOD'] ) ) ) : 'GET';
		if ( 'GET' !== $method ) {
			return false;
		}
		// Never cache query strings (search, pagination params, tracking) by default.
		if ( ! empty( $_GET ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended
			return false;
		}
		if ( is_user_logged_in() && ! (bool) Plugin::get( 'cache_logged_in', false ) ) {
			return false;
		}
		if ( is_404() || is_search() || is_preview() || is_trackback() || is_feed() || is_robots() ) {
			return false;
		}
		// Don't cache pages with a non-empty comment cookie (commenter just posted).
		foreach ( array_keys( $_COOKIE ) as $cookie ) {
			$cookie = (string) $cookie;
			if ( str_starts_with( $cookie, 'comment_author' ) || str_starts_with( $cookie, 'wp-postpass' ) ) {
				return false;
			}
		}
		if ( $this->is_excluded( $this->current_uri() ) ) {
			return false;
		}
		return true;
	}

	/**
	 * Match the request URI against the user's exclusion list (one path/glob per line).
	 */
	private function is_excluded( string $uri ): bool {
		$raw = (string) Plugin::get( 'exclude_urls', '' );
		if ( '' === trim( $raw ) ) {
			return false;
		}
		$patterns = preg_split( '/[\r\n]+/', $raw );
		if ( ! is_array( $patterns ) ) {
			return false;
		}
		foreach ( $patterns as $pattern ) {
			$pattern = trim( $pattern );
			if ( '' === $pattern ) {
				continue;
			}
			if ( false !== strpos( $pattern, '*' ) ) {
				$regex = '#^' . str_replace( '\*', '.*', preg_quote( $pattern, '#' ) ) . '#';
				if ( preg_match( $regex, $uri ) ) {
					return true;
				}
			} elseif ( str_starts_with( $uri, $pattern ) ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Resolve the cache file path for the current request.
	 */
	private function path_for_request(): string {
		return $this->path_for_uri( $this->current_uri(), is_ssl() );
	}

	/**
	 * Deterministic file path for a host + URI pair.
	 *
	 * @param string $uri   Request path (leading slash).
	 * @param bool   $https Whether the request is over TLS.
	 */
	private function path_for_uri( string $uri, bool $https ): string {
		$host  = wp_parse_url( home_url(), PHP_URL_HOST );
		$host  = is_string( $host ) ? $host : 'site';
		$path  = trim( wp_parse_url( $uri, PHP_URL_PATH ) ?? '/', '/' );
		$path  = '' === $path ? '_index' : sanitize_file_name( str_replace( '/', '__', $path ) );
		$proto = $https ? 'https' : 'http';
		return self::base_dir() . '/' . sanitize_file_name( $host ) . '/' . $proto . '-' . $path . '.html';
	}

	private function current_uri(): string {
		$uri = isset( $_SERVER['REQUEST_URI'] ) ? esc_url_raw( wp_unslash( $_SERVER['REQUEST_URI'] ) ) : '/';
		return '' === $uri ? '/' : $uri;
	}

	/* ------------------------------------------------------------------ *
	 * Invalidation handlers
	 * ------------------------------------------------------------------ */

	/**
	 * Purge a post's own URL plus the home/archive pages it appears on.
	 *
	 * @param int $post_id Post ID.
	 */
	public function on_save_post( $post_id ): void {
		$post_id = (int) $post_id;
		if ( wp_is_post_revision( $post_id ) || wp_is_post_autosave( $post_id ) ) {
			return;
		}
		$status = get_post_status( $post_id );
		if ( 'auto-draft' === $status ) {
			return;
		}

		$permalink = get_permalink( $post_id );
		if ( $permalink ) {
			$this->purge_url( $permalink );
		}

		// The home page and the blog index almost always change when a post does.
		$this->purge_url( home_url( '/' ) );
		$page_for_posts = (int) get_option( 'page_for_posts' );
		if ( $page_for_posts ) {
			$link = get_permalink( $page_for_posts );
			if ( $link ) {
				$this->purge_url( $link );
			}
		}

		// Archives the post belongs to (categories + tags).
		foreach ( array( 'category', 'post_tag' ) as $taxonomy ) {
			$terms = get_the_terms( $post_id, $taxonomy );
			if ( is_array( $terms ) ) {
				foreach ( $terms as $term ) {
					$link = get_term_link( $term );
					if ( ! is_wp_error( $link ) ) {
						$this->purge_url( $link );
					}
				}
			}
		}
	}

	/**
	 * Purge the post a comment belongs to.
	 *
	 * @param int $comment_id Comment ID.
	 */
	public function on_comment( $comment_id ): void {
		$comment = get_comment( (int) $comment_id );
		if ( $comment && $comment->comment_post_ID ) {
			$this->on_save_post( (int) $comment->comment_post_ID );
		}
	}

	/**
	 * Purge when a comment is approved/unapproved/spammed.
	 *
	 * @param string      $new_status New status.
	 * @param string      $old_status Old status.
	 * @param \WP_Comment $comment    Comment object.
	 */
	public function on_comment_status( $new_status, $old_status, $comment ): void {
		if ( $comment instanceof \WP_Comment && $comment->comment_post_ID ) {
			$this->on_save_post( (int) $comment->comment_post_ID );
		}
	}

	/**
	 * Hook adapter so action callbacks can purge the whole store.
	 */
	public function purge_all_action(): void {
		self::purge_all();
	}

	/**
	 * Delete every cache entry for a single URL (both http + https variants).
	 *
	 * @param string $url Absolute URL.
	 */
	public function purge_url( string $url ): void {
		$path = wp_parse_url( $url, PHP_URL_PATH ) ?? '/';
		foreach ( array( true, false ) as $https ) {
			$file = $this->path_for_uri( $path, $https );
			if ( is_file( $file ) ) {
				wp_delete_file( $file );
			}
		}
	}

	/* ------------------------------------------------------------------ *
	 * Static helpers (used by activation, REST purge, uninstall)
	 * ------------------------------------------------------------------ */

	/**
	 * Cache root directory (constant with a safe fallback).
	 */
	public static function base_dir(): string {
		return defined( 'KLYNA_SPEED_CACHE_DIR' ) ? KLYNA_SPEED_CACHE_DIR : WP_CONTENT_DIR . '/cache/klyna-speed';
	}

	/**
	 * Create the cache directory and protect it from listing/PHP execution.
	 */
	public static function ensure_cache_dir(): void {
		$dir = self::base_dir();
		if ( ! is_dir( $dir ) ) {
			wp_mkdir_p( $dir );
		}
		$index = $dir . '/index.html';
		if ( ! is_file( $index ) ) {
			file_put_contents( $index, '<!-- Silence is golden. -->' ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
		}
		$htaccess = $dir . '/.htaccess';
		if ( ! is_file( $htaccess ) ) {
			$rules = "Options -Indexes\n<Files *.html>\nForceType text/html\n</Files>\n";
			file_put_contents( $htaccess, $rules ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
		}
	}

	/**
	 * Write a small marker so other code can detect the cache is installed.
	 */
	public static function write_drop_in_marker(): void {
		self::ensure_cache_dir();
		$marker = self::base_dir() . '/.klyna-speed';
		file_put_contents( $marker, KLYNA_SPEED_VERSION ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
	}

	/**
	 * Remove the marker file (deactivation).
	 */
	public static function remove_drop_in_marker(): void {
		$marker = self::base_dir() . '/.klyna-speed';
		if ( is_file( $marker ) ) {
			wp_delete_file( $marker );
		}
	}

	/**
	 * Recursively delete every cached page.
	 *
	 * @return int Number of HTML files removed.
	 */
	public static function purge_all(): int {
		$dir = self::base_dir();
		if ( ! is_dir( $dir ) ) {
			return 0;
		}
		$count    = 0;
		$iterator = new \RecursiveIteratorIterator(
			new \RecursiveDirectoryIterator( $dir, \FilesystemIterator::SKIP_DOTS ),
			\RecursiveIteratorIterator::CHILD_FIRST
		);
		foreach ( $iterator as $file ) {
			/** @var \SplFileInfo $file */
			$path = $file->getPathname();
			if ( $file->isDir() ) {
				@rmdir( $path ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.file_system_operations_rmdir
				continue;
			}
			if ( str_ends_with( $path, '.html' ) && 'index.html' !== $file->getFilename() ) {
				wp_delete_file( $path );
				++$count;
			}
		}
		self::ensure_cache_dir();
		return $count;
	}

	/**
	 * Count cached pages + their total disk footprint.
	 *
	 * @return array{files:int,bytes:int}
	 */
	public static function stats(): array {
		$dir = self::base_dir();
		if ( ! is_dir( $dir ) ) {
			return array(
				'files' => 0,
				'bytes' => 0,
			);
		}
		$files = 0;
		$bytes = 0;
		$iterator = new \RecursiveIteratorIterator(
			new \RecursiveDirectoryIterator( $dir, \FilesystemIterator::SKIP_DOTS )
		);
		foreach ( $iterator as $file ) {
			/** @var \SplFileInfo $file */
			if ( str_ends_with( $file->getPathname(), '.html' ) && 'index.html' !== $file->getFilename() ) {
				++$files;
				$bytes += (int) $file->getSize();
			}
		}
		return array(
			'files' => $files,
			'bytes' => $bytes,
		);
	}
}
