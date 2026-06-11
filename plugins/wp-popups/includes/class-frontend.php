<?php
/**
 * Front-end delivery.
 *
 * Decides which active popups are eligible for the current request (path,
 * device, audience — the parts that can be evaluated server-side), enqueues the
 * front-end bundle, and hands the popup configs to JavaScript. Per-visitor rules
 * that depend on cookies (frequency cap, new vs returning) are enforced in the
 * browser so they remain correct under page caching.
 *
 * @package KlynaPopups
 */

namespace KlynaPopups;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Frontend {

	public function register(): void {
		add_action( 'wp_enqueue_scripts', array( $this, 'enqueue' ) );
		add_action( 'wp_footer', array( $this, 'render_root' ) );
	}

	/**
	 * Enqueue the front-end CSS/JS and inject eligible popups.
	 */
	public function enqueue(): void {
		if ( is_admin() || ! Plugin::setting( 'enabled', true ) ) {
			return;
		}
		if ( is_feed() || is_preview() || is_robots() ) {
			return;
		}

		$popups = $this->eligible_popups();
		if ( empty( $popups ) ) {
			return;
		}

		wp_enqueue_style(
			'klyna-popups',
			KLYNA_POPUPS_PLUGIN_URL . 'assets/css/popup.css',
			array(),
			KLYNA_POPUPS_VERSION
		);
		wp_enqueue_script(
			'klyna-popups',
			KLYNA_POPUPS_PLUGIN_URL . 'assets/js/popup.js',
			array(),
			KLYNA_POPUPS_VERSION,
			true
		);

		wp_localize_script(
			'klyna-popups',
			'KlynaPopups',
			array(
				'restUrl'    => esc_url_raw( rest_url( 'klyna-popups/v1' ) ),
				'nonce'      => wp_create_nonce( 'wp_rest' ),
				'cookieDays' => (int) Plugin::setting( 'cookie_days', 7 ),
				'respectDnt' => (bool) Plugin::setting( 'respect_dnt', true ),
				'popups'     => $popups,
			)
		);
	}

	/**
	 * Footer mount point for the popup renderer.
	 */
	public function render_root(): void {
		if ( is_admin() || ! Plugin::setting( 'enabled', true ) ) {
			return;
		}
		echo '<div id="klyna-popups-root" aria-live="polite"></div>';
	}

	/**
	 * Collect active popups that pass the server-evaluable display rules.
	 *
	 * @return array<int, array<string,mixed>>
	 */
	private function eligible_popups(): array {
		$query = new \WP_Query(
			array(
				'post_type'      => Popups::POST_TYPE,
				'post_status'    => 'publish',
				'posts_per_page' => 30,
				'no_found_rows'  => true,
				'orderby'        => 'menu_order date',
				'order'          => 'ASC',
			)
		);

		$current_path = $this->current_path();
		$is_mobile    = wp_is_mobile();
		$out          = array();

		foreach ( $query->posts as $post ) {
			$config = Popups::config( $post->ID );

			if ( 'active' !== $config['status'] ) {
				continue;
			}
			if ( ! $this->device_matches( $config['rule_devices'], $is_mobile ) ) {
				continue;
			}
			if ( ! $this->path_matches( $config['rule_paths'], $config['rule_exclude'], $current_path ) ) {
				continue;
			}

			$out[] = $this->to_client_payload( $post, $config );
		}

		wp_reset_postdata();
		return $out;
	}

	/**
	 * Shape a popup + config into the minimal payload the front-end needs.
	 *
	 * @param \WP_Post            $post   Popup post.
	 * @param array<string,mixed> $config Sanitized config.
	 * @return array<string,mixed>
	 */
	private function to_client_payload( \WP_Post $post, array $config ): array {
		return array(
			'id'        => $post->ID,
			'body'      => $this->render_body( $post ),
			'design'    => array(
				'position'    => $config['position'],
				'animation'   => $config['animation'],
				'theme'       => $config['theme'],
				'width'       => $config['width'],
				'showOverlay' => $config['show_overlay'],
				'showClose'   => $config['show_close'],
				'collectName' => $config['collect_name'],
				'headline'    => $config['headline'],
				'subhead'     => $config['subhead'],
				'buttonLabel' => $config['button_label'],
				'imageUrl'    => $config['image_url'],
			),
			'trigger'   => array(
				'type'     => $config['trigger'],
				'seconds'  => $config['trigger_seconds'],
				'scroll'   => $config['trigger_scroll'],
				'selector' => $config['trigger_selector'],
			),
			'rules'     => array(
				'audience'      => $config['rule_audience'],
				'frequency'     => $config['frequency'],
				'frequencyDays' => $config['frequency_days'],
			),
		);
	}

	/**
	 * Render the popup post body to safe HTML for the front end.
	 */
	private function render_body( \WP_Post $post ): string {
		$content = apply_filters( 'the_content', $post->post_content );
		return wp_kses_post( $content );
	}

	/**
	 * The path portion of the current request, normalized with a leading slash.
	 */
	private function current_path(): string {
		$uri  = isset( $_SERVER['REQUEST_URI'] ) ? esc_url_raw( wp_unslash( (string) $_SERVER['REQUEST_URI'] ) ) : '/';
		$path = (string) wp_parse_url( $uri, PHP_URL_PATH );
		if ( '' === $path ) {
			$path = '/';
		}
		return $path;
	}

	/**
	 * Device rule check.
	 *
	 * @param string[] $devices   Allowed devices.
	 * @param bool     $is_mobile Whether the current request is mobile.
	 */
	private function device_matches( array $devices, bool $is_mobile ): bool {
		$want = $is_mobile ? 'mobile' : 'desktop';
		return in_array( $want, $devices, true );
	}

	/**
	 * Path inclusion / exclusion check using simple `*` globs.
	 */
	private function path_matches( string $include_raw, string $exclude_raw, string $path ): bool {
		$exclude = $this->lines( $exclude_raw );
		foreach ( $exclude as $glob ) {
			if ( $this->glob_match( $glob, $path ) ) {
				return false;
			}
		}

		$include = $this->lines( $include_raw );
		if ( empty( $include ) ) {
			return true; // Empty include list = everywhere.
		}
		foreach ( $include as $glob ) {
			if ( $this->glob_match( $glob, $path ) ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Match a path against a `*` glob. `*` matches any run of characters.
	 */
	private function glob_match( string $glob, string $path ): bool {
		$glob = trim( $glob );
		if ( '' === $glob ) {
			return false;
		}
		$pattern = '#^' . str_replace( '\*', '.*', preg_quote( $glob, '#' ) ) . '$#i';
		return (bool) preg_match( $pattern, $path );
	}

	/**
	 * Split a textarea value into trimmed, non-empty lines.
	 *
	 * @return string[]
	 */
	private function lines( string $raw ): array {
		$parts = preg_split( '/[\r\n]+/', $raw );
		if ( ! is_array( $parts ) ) {
			return array();
		}
		return array_values( array_filter( array_map( 'trim', $parts ) ) );
	}
}
