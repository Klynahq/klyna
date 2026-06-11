<?php
/**
 * Admin UI — table manager, builder, CSV import, and settings.
 *
 * The whole admin app is one PHP-rendered shell hydrated by assets/admin/admin.js,
 * which talks to the klyna-tables/v1 REST API. No React, no build step.
 *
 * @package KlynaTables
 */

namespace KlynaTables;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Admin {

	private const MENU_SLUG = 'klyna-tables';

	public function register(): void {
		add_action( 'admin_menu', array( $this, 'register_menu' ) );
		add_action( 'admin_init', array( $this, 'register_settings' ) );
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue_assets' ) );
		add_filter(
			'plugin_action_links_' . plugin_basename( KLYNA_TABLES_PLUGIN_FILE ),
			array( $this, 'add_settings_link' )
		);
	}

	public function register_menu(): void {
		add_menu_page(
			__( 'Klyna Tables', 'wp-tables' ),
			__( 'Klyna Tables', 'wp-tables' ),
			'manage_options',
			self::MENU_SLUG,
			array( $this, 'render_manager' ),
			'data:image/svg+xml;base64,' . base64_encode( $this->menu_icon() ),
			66
		);
		add_submenu_page(
			self::MENU_SLUG,
			__( 'All tables', 'wp-tables' ),
			__( 'All tables', 'wp-tables' ),
			'manage_options',
			self::MENU_SLUG,
			array( $this, 'render_manager' )
		);
		add_submenu_page(
			self::MENU_SLUG,
			__( 'Settings', 'wp-tables' ),
			__( 'Settings', 'wp-tables' ),
			'manage_options',
			'klyna-tables-settings',
			array( $this, 'render_settings' )
		);
	}

	public function register_settings(): void {
		register_setting(
			'klyna_tables_settings_group',
			KLYNA_TABLES_OPTION_KEY,
			array(
				'type'              => 'array',
				'sanitize_callback' => array( $this, 'sanitize_settings' ),
				'default'           => array(),
			)
		);
	}

	/**
	 * Settings API sanitizer (form POST path). The REST path reuses
	 * Rest::sanitize_settings for the same guarantees.
	 *
	 * @param mixed $input
	 * @return array<string,mixed>
	 */
	public function sanitize_settings( $input ): array {
		$input = is_array( $input ) ? $input : array();
		$rest  = new Rest();
		return $rest->sanitize_settings( $input );
	}

	public function enqueue_assets( string $hook ): void {
		if ( strpos( $hook, self::MENU_SLUG ) === false && strpos( $hook, 'klyna-tables' ) === false ) {
			return;
		}
		wp_enqueue_style(
			'klyna-tables-admin',
			KLYNA_TABLES_PLUGIN_URL . 'assets/admin/admin.css',
			array(),
			KLYNA_TABLES_VERSION
		);
		wp_enqueue_script(
			'klyna-tables-admin',
			KLYNA_TABLES_PLUGIN_URL . 'assets/admin/admin.js',
			array( 'wp-api-fetch', 'wp-i18n' ),
			KLYNA_TABLES_VERSION,
			true
		);
		wp_set_script_translations( 'klyna-tables-admin', 'wp-tables', KLYNA_TABLES_PLUGIN_DIR . 'languages' );
		wp_localize_script(
			'klyna-tables-admin',
			'KlynaTablesAdmin',
			array(
				'apiBase'  => esc_url_raw( rest_url( 'klyna-tables/v1' ) ),
				'nonce'    => wp_create_nonce( 'wp_rest' ),
				'hasWoo'   => class_exists( 'WooCommerce' ),
				'settings' => Plugin::settings(),
				'strings'  => array(
					'confirmDelete' => __( 'Delete this table permanently? This cannot be undone.', 'wp-tables' ),
					'saved'         => __( 'Saved.', 'wp-tables' ),
					'saving'        => __( 'Saving…', 'wp-tables' ),
					'copied'        => __( 'Shortcode copied.', 'wp-tables' ),
					'importDone'    => __( 'CSV imported.', 'wp-tables' ),
				),
			)
		);
	}

	public function render_manager(): void {
		?>
		<div class="wrap klyna-tables-wrap">
			<div class="klyna-tables-head">
				<h1><?php esc_html_e( 'Klyna Tables', 'wp-tables' ); ?></h1>
				<p class="klyna-tables-tagline"><?php esc_html_e( 'Responsive, sortable, searchable data &amp; product tables. Build by hand or import a CSV, drop in a shortcode or block.', 'wp-tables' ); ?></p>
			</div>

			<noscript>
				<div class="notice notice-warning"><p><?php esc_html_e( 'The Klyna Tables builder needs JavaScript enabled.', 'wp-tables' ); ?></p></div>
			</noscript>

			<div id="klyna-tables-app" data-view="list">
				<p class="klyna-tables-loading"><?php esc_html_e( 'Loading tables…', 'wp-tables' ); ?></p>
			</div>
		</div>
		<?php
	}

	public function render_settings(): void {
		$settings = Plugin::settings();
		$woo_all  = array(
			'image'    => __( 'Image', 'wp-tables' ),
			'title'    => __( 'Product name', 'wp-tables' ),
			'sku'      => __( 'SKU', 'wp-tables' ),
			'category' => __( 'Category', 'wp-tables' ),
			'price'    => __( 'Price', 'wp-tables' ),
			'stock'    => __( 'Stock status', 'wp-tables' ),
			'cart'     => __( 'Add to cart', 'wp-tables' ),
		);
		$woo_cols = (array) ( $settings['woo_columns'] ?? array() );
		?>
		<div class="wrap klyna-tables-wrap">
			<h1><?php esc_html_e( 'Klyna Tables — Settings', 'wp-tables' ); ?></h1>
			<p class="klyna-tables-tagline"><?php esc_html_e( 'Defaults applied to every table. Individual tables can override these in the builder.', 'wp-tables' ); ?></p>

			<form method="post" action="options.php">
				<?php settings_fields( 'klyna_tables_settings_group' ); ?>
				<table class="form-table" role="presentation">
					<tbody>
						<tr>
							<th scope="row"><?php esc_html_e( 'Default features', 'wp-tables' ); ?></th>
							<td>
								<?php
								$rows = array(
									'enable_search'     => __( 'Live search box above each table', 'wp-tables' ),
									'enable_sort'       => __( 'Click-to-sort column headers', 'wp-tables' ),
									'enable_pagination' => __( 'Paginate long tables', 'wp-tables' ),
									'responsive_stack'  => __( 'Stack into cards on mobile', 'wp-tables' ),
									'striped'           => __( 'Striped (zebra) rows', 'wp-tables' ),
								);
								foreach ( $rows as $key => $label ) {
									printf(
										'<label style="display:block;margin-bottom:8px;"><input type="checkbox" name="%1$s[%2$s]" value="1" %3$s> %4$s</label>',
										esc_attr( KLYNA_TABLES_OPTION_KEY ),
										esc_attr( $key ),
										checked( ! empty( $settings[ $key ] ), true, false ),
										esc_html( $label )
									);
								}
								?>
							</td>
						</tr>
						<tr>
							<th scope="row"><label for="default_rows_per_page"><?php esc_html_e( 'Rows per page', 'wp-tables' ); ?></label></th>
							<td>
								<input type="number" min="1" max="500" id="default_rows_per_page" name="<?php echo esc_attr( KLYNA_TABLES_OPTION_KEY ); ?>[default_rows_per_page]" value="<?php echo esc_attr( (string) ( $settings['default_rows_per_page'] ?? 10 ) ); ?>" class="small-text">
							</td>
						</tr>
						<tr>
							<th scope="row"><label for="accent"><?php esc_html_e( 'Accent color', 'wp-tables' ); ?></label></th>
							<td>
								<input type="color" id="accent" name="<?php echo esc_attr( KLYNA_TABLES_OPTION_KEY ); ?>[accent]" value="<?php echo esc_attr( (string) ( $settings['accent'] ?? '#7c5cff' ) ); ?>">
								<p class="description"><?php esc_html_e( 'Used for sort indicators, links, and the active page in pagination.', 'wp-tables' ); ?></p>
							</td>
						</tr>
						<tr>
							<th scope="row"><?php esc_html_e( 'WooCommerce product columns', 'wp-tables' ); ?></th>
							<td>
								<?php if ( class_exists( 'WooCommerce' ) ) : ?>
									<?php
									foreach ( $woo_all as $key => $label ) {
										printf(
											'<label style="display:block;margin-bottom:8px;"><input type="checkbox" name="%1$s[woo_columns][]" value="%2$s" %3$s> %4$s</label>',
											esc_attr( KLYNA_TABLES_OPTION_KEY ),
											esc_attr( $key ),
											checked( in_array( $key, $woo_cols, true ), true, false ),
											esc_html( $label )
										);
									}
									?>
									<p class="description"><?php esc_html_e( 'Columns shown by the [klyna_products] shortcode and the product block.', 'wp-tables' ); ?></p>
								<?php else : ?>
									<p class="description"><?php esc_html_e( 'WooCommerce is not active. Install it to enable product tables.', 'wp-tables' ); ?></p>
								<?php endif; ?>
							</td>
						</tr>
						<tr>
							<th scope="row" colspan="2"><h2 style="margin:24px 0 4px;"><?php esc_html_e( 'AI assistant', 'wp-tables' ); ?></h2><p class="description"><?php esc_html_e( 'Pick a provider, paste your API key, and Klyna Tables can generate a one-paragraph plain-English insight for any table. Default: off. Plugin works fully without AI.', 'wp-tables' ); ?></p></th>
						</tr>
						<tr>
							<th scope="row"><label for="ai_provider"><?php esc_html_e( 'Provider', 'wp-tables' ); ?></label></th>
							<td>
								<select id="ai_provider" name="<?php echo esc_attr( KLYNA_TABLES_OPTION_KEY ); ?>[ai_provider]">
									<?php
									$current_provider = (string) ( $settings['ai_provider'] ?? 'off' );
									$choices          = array( 'off' => __( 'Off', 'wp-tables' ) );
									foreach ( Ai::provider_catalog() as $pk => $pdef ) {
										$choices[ $pk ] = (string) $pdef['label'];
									}
									foreach ( $choices as $val => $label ) {
										printf(
											'<option value="%1$s" %2$s>%3$s</option>',
											esc_attr( $val ),
											selected( $current_provider, $val, false ),
											esc_html( $label )
										);
									}
									?>
								</select>
							</td>
						</tr>
						<tr>
							<th scope="row"><label for="ai_api_key"><?php esc_html_e( 'API key', 'wp-tables' ); ?></label></th>
							<td>
								<input type="password" id="ai_api_key" class="regular-text" name="<?php echo esc_attr( KLYNA_TABLES_OPTION_KEY ); ?>[ai_api_key]" value="<?php echo esc_attr( (string) ( $settings['ai_api_key'] ?? '' ) ); ?>" autocomplete="off">
								<p class="description"><?php esc_html_e( 'Stored in wp_options. Leave blank for Ollama.', 'wp-tables' ); ?></p>
							</td>
						</tr>
						<tr>
							<th scope="row"><label for="ai_model"><?php esc_html_e( 'Model', 'wp-tables' ); ?></label></th>
							<td>
								<input type="text" id="ai_model" class="regular-text" name="<?php echo esc_attr( KLYNA_TABLES_OPTION_KEY ); ?>[ai_model]" value="<?php echo esc_attr( (string) ( $settings['ai_model'] ?? '' ) ); ?>" placeholder="<?php esc_attr_e( 'Leave blank to use the provider default', 'wp-tables' ); ?>">
								<p class="description"><?php esc_html_e( 'Each provider has a sensible default; override only if you need a specific model.', 'wp-tables' ); ?></p>
							</td>
						</tr>
						<tr>
							<th scope="row"><label for="ai_endpoint"><?php esc_html_e( 'Endpoint / account ID', 'wp-tables' ); ?></label></th>
							<td>
								<input type="text" id="ai_endpoint" class="regular-text" name="<?php echo esc_attr( KLYNA_TABLES_OPTION_KEY ); ?>[ai_endpoint]" value="<?php echo esc_attr( (string) ( $settings['ai_endpoint'] ?? '' ) ); ?>">
								<p class="description"><?php esc_html_e( 'Ollama: http://localhost:11434. Cloudflare: your Account ID. Ignored otherwise.', 'wp-tables' ); ?></p>
							</td>
						</tr>
						<tr>
							<th scope="row"><label for="ai_daily_cap"><?php esc_html_e( 'Daily cap', 'wp-tables' ); ?></label></th>
							<td>
								<input type="number" min="1" max="10000" id="ai_daily_cap" class="small-text" name="<?php echo esc_attr( KLYNA_TABLES_OPTION_KEY ); ?>[ai_daily_cap]" value="<?php echo esc_attr( (string) ( $settings['ai_daily_cap'] ?? 100 ) ); ?>">
								<p class="description"><?php esc_html_e( 'Max AI calls per day across all tables. Resets at 00:00 UTC.', 'wp-tables' ); ?></p>
							</td>
						</tr>
						<tr>
							<th scope="row"><?php esc_html_e( 'Test connection', 'wp-tables' ); ?></th>
							<td>
								<button type="button" class="button" id="klyna-tables-ai-test"><?php esc_html_e( 'Run test', 'wp-tables' ); ?></button>
								<span id="klyna-tables-ai-test-result" style="margin-left:10px;"></span>
								<p class="description"><?php esc_html_e( 'Save settings first, then run a tiny prompt to verify the credentials.', 'wp-tables' ); ?></p>
							</td>
						</tr>
					</tbody>
				</table>
				<?php submit_button(); ?>
			</form>
			<?php \KlynaTables\Telemetry::render_form(); ?>

			<script>
			(function(){
				var btn = document.getElementById('klyna-tables-ai-test');
				var out = document.getElementById('klyna-tables-ai-test-result');
				if(!btn) return;
				btn.addEventListener('click', function(){
					out.textContent = <?php echo wp_json_encode( __( 'Testing…', 'wp-tables' ) ); ?>;
					btn.disabled = true;
					fetch(<?php echo wp_json_encode( esc_url_raw( rest_url( 'klyna-tables/v1/ai/test' ) ) ); ?>, {
						method: 'POST',
						headers: { 'X-WP-Nonce': <?php echo wp_json_encode( wp_create_nonce( 'wp_rest' ) ); ?>, 'Content-Type': 'application/json' }
					}).then(function(r){ return r.json().then(function(j){ return { ok:r.ok, body:j }; }); })
					.then(function(res){
						out.textContent = (res.ok && res.body.ok) ? (<?php echo wp_json_encode( __( 'OK: ', 'wp-tables' ) ); ?> + (res.body.text || '')) : (<?php echo wp_json_encode( __( 'Failed: ', 'wp-tables' ) ); ?> + (res.body.reason || res.body.text || 'error'));
					})
					.catch(function(e){ out.textContent = 'Error: ' + e.message; })
					.finally(function(){ btn.disabled = false; });
				});
			})();
			</script>
		</div>
		<?php
	}

	/**
	 * @param string[] $links
	 * @return string[]
	 */
	public function add_settings_link( array $links ): array {
		$first = sprintf(
			'<a href="%s">%s</a>',
			esc_url( admin_url( 'admin.php?page=' . self::MENU_SLUG ) ),
			esc_html__( 'Tables', 'wp-tables' )
		);
		array_unshift( $links, $first );
		return $links;
	}

	private function menu_icon(): string {
		return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#9ca3af"><rect x="2" y="2" width="20" height="20" rx="5"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18" stroke="white" stroke-width="1.8" fill="none"/></svg>';
	}
}
