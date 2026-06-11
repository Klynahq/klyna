<?php
/**
 * Admin UI — registers the WP admin menu and mounts the React app.
 *
 * The old PHP-rendered settings/internal-link pages are replaced with a
 * single `<div id="klyna-admin-root"></div>` mount point. All UI lives
 * in the React bundle at `assets/admin/index.js` + `index.css`.
 * React talks to PHP via the REST routes in class-rest.php.
 *
 * @package Klyna
 */

namespace Klyna;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Admin {

	private const MENU_SLUG = 'klyna';

	public function register(): void {
		add_action( 'admin_menu', array( $this, 'register_menu' ) );
		add_action( 'admin_init', array( $this, 'register_settings_for_compat' ) );
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue_assets' ) );
		add_action( 'enqueue_block_editor_assets', array( $this, 'enqueue_editor_sidebar' ) );
		add_filter(
			'plugin_action_links_' . plugin_basename( KLYNA_PLUGIN_FILE ),
			array( $this, 'add_settings_link' )
		);
	}

	/**
	 * Enqueue the editor sidebar bundle on Gutenberg post-edit screens.
	 * The bundle registers a PluginSidebar via wp.plugins.registerPlugin.
	 */
	public function enqueue_editor_sidebar(): void {
		$ver  = defined( 'KLYNA_PLUGIN_VERSION' ) ? KLYNA_PLUGIN_VERSION : '0.0.0';
		$base = plugins_url( 'assets/editor', KLYNA_PLUGIN_FILE );

		wp_enqueue_style(
			'klyna-editor',
			$base . '/index.css',
			array(),
			$ver
		);
		wp_enqueue_script(
			'klyna-editor',
			$base . '/index.js',
			array( 'wp-plugins', 'wp-edit-post', 'wp-element', 'wp-data', 'wp-components', 'wp-i18n' ),
			$ver,
			array(
				'in_footer' => true,
			)
		);

		// Bridge: the editor bundle is built as IIFE with React externalized.
		// Map global `React` → `wp.element` so the editor sidebar uses Gutenberg's
		// React, not a second copy.
		// Same klynaBoot bootstrap as the admin pages — auth nonce + REST URL.
		$boot = array(
			'restUrl'   => esc_url_raw( rest_url( 'klyna/v1/' ) ),
			'nonce'     => wp_create_nonce( 'wp_rest' ),
			'ajaxUrl'   => admin_url( 'admin-ajax.php' ),
			'pluginUrl' => plugins_url( '/', KLYNA_PLUGIN_FILE ),
			'siteUrl'   => home_url( '/' ),
			'adminUrl'  => admin_url(),
			'version'   => $ver,
			'settings'  => (object) Plugin::settings(),
		);
		wp_add_inline_script(
			'klyna-editor',
			"window.React=window.React||window.wp.element;window.klynaBoot=" . wp_json_encode( $boot ) . ';',
			'before'
		);
	}

	public function register_menu(): void {
		add_menu_page(
			__( 'Klyna SEO Suite', 'klyna' ),
			__( 'Klyna', 'klyna' ),
			'manage_options',
			self::MENU_SLUG,
			array( $this, 'render_mount' ),
			'data:image/svg+xml;base64,' . base64_encode(
				'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#9ca3af"><rect x="2" y="2" width="20" height="20" rx="5"/><path d="M9 7v10M9 12l6-5M9 12l6 5" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>'
			),
			65
		);
		// Submenus all render the SAME React mount; the React router
		// picks the page from the `?page=` slug or hash. This keeps
		// WP admin sidebar navigation working naturally.
		add_submenu_page( self::MENU_SLUG, __( 'Dashboard', 'klyna' ), __( 'Dashboard', 'klyna' ), 'manage_options', self::MENU_SLUG, array( $this, 'render_mount' ) );
		add_submenu_page( self::MENU_SLUG, __( 'Audit', 'klyna' ), __( 'Audit', 'klyna' ), 'manage_options', 'klyna-audit', array( $this, 'render_mount' ) );
		add_submenu_page( self::MENU_SLUG, __( 'Internal links', 'klyna' ), __( 'Internal links', 'klyna' ), 'manage_options', 'klyna-internal-links', array( $this, 'render_mount' ) );
		add_submenu_page( self::MENU_SLUG, __( 'Schema', 'klyna' ), __( 'Schema', 'klyna' ), 'manage_options', 'klyna-schema', array( $this, 'render_mount' ) );
		add_submenu_page( self::MENU_SLUG, __( 'Settings', 'klyna' ), __( 'Settings', 'klyna' ), 'manage_options', 'klyna-settings', array( $this, 'render_mount' ) );
	}

	/**
	 * Register the settings option so other parts of the plugin that read
	 * it (Schema/Faq/InternalLinks classes) still work seamlessly. The
	 * actual editing happens through the REST API now.
	 */
	public function register_settings_for_compat(): void {
		register_setting(
			'klyna_settings_group',
			KLYNA_OPTION_KEY,
			array(
				'type'              => 'array',
				'sanitize_callback' => array( $this, 'sanitize_settings' ),
				'default'           => array(),
				'show_in_rest'      => false,
			)
		);
	}

	public function sanitize_settings( $value ): array {
		$value = is_array( $value ) ? $value : array();
		$out   = array();
		$bool_keys = array(
			'enable_schema',
			'enable_internal_links',
			'enable_faq_schema',
			'enable_breadcrumbs',
			'enable_organization',
			'enable_open_graph',
		);
		foreach ( $bool_keys as $k ) {
			if ( isset( $value[ $k ] ) ) {
				$out[ $k ] = (bool) $value[ $k ];
			}
		}
		if ( isset( $value['organization_name'] ) ) {
			$out['organization_name'] = sanitize_text_field( (string) $value['organization_name'] );
		}
		if ( isset( $value['organization_logo'] ) ) {
			$out['organization_logo'] = esc_url_raw( (string) $value['organization_logo'] );
		}
		if ( isset( $value['twitter_handle'] ) ) {
			$out['twitter_handle'] = sanitize_text_field( (string) $value['twitter_handle'] );
		}
		if ( isset( $value['internal_links_per_post'] ) ) {
			$out['internal_links_per_post'] = max( 1, min( 30, (int) $value['internal_links_per_post'] ) );
		}
		if ( isset( $value['internal_links_min_similarity'] ) ) {
			$sim = (float) $value['internal_links_min_similarity'];
			$out['internal_links_min_similarity'] = max( 0.0, min( 1.0, $sim ) );
		}
		// AI settings
		if ( isset( $value['ai_provider'] ) ) {
			$out['ai_provider'] = sanitize_key( (string) $value['ai_provider'] );
		}
		if ( isset( $value['ai_model'] ) ) {
			$out['ai_model'] = sanitize_text_field( (string) $value['ai_model'] );
		}
		if ( isset( $value['ai_api_key'] ) ) {
			$out['ai_api_key'] = sanitize_text_field( (string) $value['ai_api_key'] );
		}
		if ( isset( $value['ai_endpoint'] ) ) {
			$out['ai_endpoint'] = sanitize_text_field( (string) $value['ai_endpoint'] );
		}
		if ( isset( $value['ai_daily_cap'] ) ) {
			$out['ai_daily_cap'] = max( 1, min( 5000, (int) $value['ai_daily_cap'] ) );
		}
		return $out;
	}

	public function enqueue_assets( string $hook ): void {
		if ( ! $this->is_klyna_screen( $hook ) ) {
			return;
		}
		$ver  = defined( 'KLYNA_PLUGIN_VERSION' ) ? KLYNA_PLUGIN_VERSION : '0.0.0';
		$base = plugins_url( 'assets/admin', KLYNA_PLUGIN_FILE );

		wp_enqueue_style(
			'klyna-admin',
			$base . '/index.css',
			array(),
			$ver
		);
		// Tell WordPress this is a module so import {} works.
		wp_enqueue_script(
			'klyna-admin',
			$base . '/index.js',
			array(),
			$ver,
			array(
				'in_footer' => true,
				'strategy'  => 'defer',
			)
		);
		add_filter( 'script_loader_tag', array( $this, 'add_type_module' ), 10, 3 );

		// Bootstrap data the React app reads off `window.klynaBoot`.
		$boot = array(
			'restUrl'  => esc_url_raw( rest_url( 'klyna/v1/' ) ),
			'nonce'    => wp_create_nonce( 'wp_rest' ),
			'ajaxUrl'  => admin_url( 'admin-ajax.php' ),
			'pluginUrl'=> plugins_url( '/', KLYNA_PLUGIN_FILE ),
			'siteUrl'  => home_url( '/' ),
			'adminUrl' => admin_url(),
			'version'  => $ver,
			'settings' => (object) Plugin::settings(),
		);
		wp_add_inline_script(
			'klyna-admin',
			'window.klynaBoot=' . wp_json_encode( $boot ) . ';',
			'before'
		);
	}

	public function add_type_module( string $tag, string $handle, string $src ): string {
		if ( 'klyna-admin' !== $handle ) {
			return $tag;
		}
		// Convert <script src=...> to <script type="module" src=...>
		return str_replace( '<script ', '<script type="module" ', $tag );
	}

	public function render_mount(): void {
		echo '<div id="klyna-admin-root"></div>';
		echo '<noscript style="padding:20px;color:#666"><p><strong>' . esc_html__( 'JavaScript is required for the Klyna admin UI.', 'klyna' ) . '</strong></p></noscript>';
	}

	public function add_settings_link( array $links ): array {
		$link    = '<a href="' . esc_url( admin_url( 'admin.php?page=' . self::MENU_SLUG ) ) . '">' . esc_html__( 'Dashboard', 'klyna' ) . '</a>';
		array_unshift( $links, $link );
		return $links;
	}

	private function is_klyna_screen( string $hook ): bool {
		// Hook names look like: toplevel_page_klyna, klyna_page_klyna-settings, etc.
		return false !== strpos( $hook, 'klyna' ) || false !== strpos( $hook, 'page_klyna' );
	}
}
