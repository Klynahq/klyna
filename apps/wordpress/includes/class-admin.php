<?php
/**
 * Admin UI — settings page + internal-linking tool.
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
		add_action( 'admin_init', array( $this, 'register_settings' ) );
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue_assets' ) );
		add_filter(
			'plugin_action_links_' . plugin_basename( KLYNA_PLUGIN_FILE ),
			array( $this, 'add_settings_link' )
		);
	}

	public function register_menu(): void {
		add_menu_page(
			__( 'Klyna SEO Suite', 'klyna' ),
			__( 'Klyna SEO', 'klyna' ),
			'manage_options',
			self::MENU_SLUG,
			array( $this, 'render_dashboard' ),
			'data:image/svg+xml;base64,' . base64_encode(
				'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#9ca3af"><rect x="2" y="2" width="20" height="20" rx="5"/><path d="M8 7v10M8 12l5-5M8 12l5 5" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>'
			),
			65
		);
		add_submenu_page(
			self::MENU_SLUG,
			__( 'Dashboard', 'klyna' ),
			__( 'Dashboard', 'klyna' ),
			'manage_options',
			self::MENU_SLUG,
			array( $this, 'render_dashboard' )
		);
		add_submenu_page(
			self::MENU_SLUG,
			__( 'Internal links', 'klyna' ),
			__( 'Internal links', 'klyna' ),
			'edit_posts',
			'klyna-internal-links',
			array( $this, 'render_links_tool' )
		);
		add_submenu_page(
			self::MENU_SLUG,
			__( 'Settings', 'klyna' ),
			__( 'Settings', 'klyna' ),
			'manage_options',
			'klyna-settings',
			array( $this, 'render_settings' )
		);
	}

	public function register_settings(): void {
		register_setting(
			'klyna_settings_group',
			KLYNA_OPTION_KEY,
			array(
				'type'              => 'array',
				'sanitize_callback' => array( $this, 'sanitize_settings' ),
				'default'           => array(),
			)
		);
	}

	/**
	 * @param mixed $input
	 * @return array<string,mixed>
	 */
	public function sanitize_settings( $input ): array {
		$input = is_array( $input ) ? $input : array();
		$out   = array();
		$bool_keys = array(
			'enable_org_schema',
			'enable_article_schema',
			'enable_faq_schema',
			'enable_breadcrumbs',
			'auto_internal_links',
		);
		foreach ( $bool_keys as $k ) {
			$out[ $k ] = ! empty( $input[ $k ] );
		}
		$text_keys = array( 'org_name', 'org_logo', 'org_same_as', 'author_url' );
		foreach ( $text_keys as $k ) {
			$out[ $k ] = isset( $input[ $k ] ) ? sanitize_text_field( (string) $input[ $k ] ) : '';
		}
		return $out;
	}

	public function enqueue_assets( string $hook ): void {
		if ( strpos( $hook, 'klyna' ) === false ) {
			return;
		}
		wp_enqueue_style(
			'klyna-admin',
			KLYNA_PLUGIN_URL . 'assets/css/admin.css',
			array(),
			KLYNA_VERSION
		);
		wp_enqueue_script(
			'klyna-admin',
			KLYNA_PLUGIN_URL . 'assets/js/admin.js',
			array( 'wp-api-fetch' ),
			KLYNA_VERSION,
			true
		);
		wp_localize_script(
			'klyna-admin',
			'KLYNA',
			array(
				'apiBase' => esc_url_raw( rest_url( 'klyna/v1' ) ),
				'nonce'   => wp_create_nonce( 'wp_rest' ),
			)
		);
	}

	public function render_dashboard(): void {
		$settings = Plugin::settings();
		?>
		<div class="wrap klyna-wrap">
			<h1><?php esc_html_e( 'Klyna SEO Suite', 'klyna' ); ?></h1>
			<p class="klyna-tagline"><?php esc_html_e( 'Autopilot SEO. Schema markup, internal linking, FAQ, content freshness — all from one plugin.', 'klyna' ); ?></p>

			<div class="klyna-cards">
				<div class="klyna-card">
					<h2><?php esc_html_e( 'Schema markup', 'klyna' ); ?></h2>
					<p>
						<?php
						echo $settings['enable_article_schema']
							? '✓ ' . esc_html__( 'Auto-injecting Article + Organization schema.', 'klyna' )
							: esc_html__( 'Disabled.', 'klyna' );
						?>
					</p>
					<a class="button" href="<?php echo esc_url( admin_url( 'admin.php?page=klyna-settings' ) ); ?>">
						<?php esc_html_e( 'Configure', 'klyna' ); ?>
					</a>
				</div>

				<div class="klyna-card">
					<h2><?php esc_html_e( 'FAQ schema', 'klyna' ); ?></h2>
					<p>
						<?php esc_html_e( 'Detects FAQ-shaped content in your posts and emits FAQPage JSON-LD. Big GEO win.', 'klyna' ); ?>
					</p>
				</div>

				<div class="klyna-card">
					<h2><?php esc_html_e( 'Internal links', 'klyna' ); ?></h2>
					<p><?php esc_html_e( 'Find link opportunities across every post using TF-IDF similarity. Local, free, fast.', 'klyna' ); ?></p>
					<a class="button button-primary" href="<?php echo esc_url( admin_url( 'admin.php?page=klyna-internal-links' ) ); ?>">
						<?php esc_html_e( 'Open tool', 'klyna' ); ?>
					</a>
				</div>
			</div>
		</div>
		<?php
	}

	public function render_links_tool(): void {
		?>
		<div class="wrap klyna-wrap">
			<h1><?php esc_html_e( 'Internal link suggestions', 'klyna' ); ?></h1>
			<p><?php esc_html_e( 'Klyna scans every published post and surfaces the strongest missing internal links. Local TF-IDF similarity — no external services.', 'klyna' ); ?></p>
			<button id="klyna-run-links" class="button button-primary"><?php esc_html_e( 'Scan corpus', 'klyna' ); ?></button>
			<div id="klyna-links-output" style="margin-top:24px;"></div>
		</div>
		<?php
	}

	public function render_settings(): void {
		$settings = Plugin::settings();
		?>
		<div class="wrap klyna-wrap">
			<h1><?php esc_html_e( 'Klyna settings', 'klyna' ); ?></h1>
			<form method="post" action="options.php">
				<?php settings_fields( 'klyna_settings_group' ); ?>
				<table class="form-table" role="presentation">
					<tbody>
						<tr>
							<th scope="row"><?php esc_html_e( 'Schema markup', 'klyna' ); ?></th>
							<td>
								<?php
								$rows = array(
									'enable_org_schema'     => __( 'Organization + WebSite schema (sitewide)', 'klyna' ),
									'enable_article_schema' => __( 'BlogPosting schema on single posts', 'klyna' ),
									'enable_breadcrumbs'    => __( 'BreadcrumbList schema on posts', 'klyna' ),
									'enable_faq_schema'     => __( 'FAQPage schema (auto-detected)', 'klyna' ),
								);
								foreach ( $rows as $key => $label ) {
									printf(
										'<label style="display:block;margin-bottom:8px;"><input type="checkbox" name="%1$s[%2$s]" value="1" %3$s> %4$s</label>',
										esc_attr( KLYNA_OPTION_KEY ),
										esc_attr( $key ),
										checked( ! empty( $settings[ $key ] ), true, false ),
										esc_html( $label )
									);
								}
								?>
							</td>
						</tr>
						<tr>
							<th scope="row"><label for="org_name"><?php esc_html_e( 'Organization name', 'klyna' ); ?></label></th>
							<td>
								<input type="text" id="org_name" name="<?php echo esc_attr( KLYNA_OPTION_KEY ); ?>[org_name]" class="regular-text" value="<?php echo esc_attr( $settings['org_name'] ?? '' ); ?>">
							</td>
						</tr>
						<tr>
							<th scope="row"><label for="org_logo"><?php esc_html_e( 'Logo URL', 'klyna' ); ?></label></th>
							<td>
								<input type="url" id="org_logo" name="<?php echo esc_attr( KLYNA_OPTION_KEY ); ?>[org_logo]" class="regular-text" value="<?php echo esc_attr( $settings['org_logo'] ?? '' ); ?>" placeholder="https://...">
							</td>
						</tr>
						<tr>
							<th scope="row"><label for="org_same_as"><?php esc_html_e( 'Social URLs (one per line)', 'klyna' ); ?></label></th>
							<td>
								<textarea id="org_same_as" name="<?php echo esc_attr( KLYNA_OPTION_KEY ); ?>[org_same_as]" rows="4" class="large-text" placeholder="https://x.com/yourbrand&#10;https://github.com/yourbrand"><?php echo esc_textarea( $settings['org_same_as'] ?? '' ); ?></textarea>
							</td>
						</tr>
					</tbody>
				</table>
				<?php submit_button(); ?>
			</form>
		</div>
		<?php
	}

	/**
	 * @param string[] $links
	 * @return string[]
	 */
	public function add_settings_link( array $links ): array {
		$url       = admin_url( 'admin.php?page=klyna-settings' );
		$label     = __( 'Settings', 'klyna' );
		$first     = sprintf( '<a href="%s">%s</a>', esc_url( $url ), esc_html( $label ) );
		array_unshift( $links, $first );
		return $links;
	}
}
