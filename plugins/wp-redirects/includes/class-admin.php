<?php
/**
 * Klyna Redirects — admin UI (settings + redirect manager + 404 log).
 *
 * @package KlynaRedirects
 */

namespace KlynaRedirects;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Admin {

	public function register(): void {
		add_action( 'admin_menu', array( $this, 'add_menu' ) );
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue' ) );
		add_action( 'admin_post_klyna_redirects_save', array( $this, 'handle_save_redirect' ) );
		add_action( 'admin_post_klyna_redirects_delete', array( $this, 'handle_delete_redirect' ) );
		add_action( 'admin_post_klyna_redirects_from_404', array( $this, 'handle_from_404' ) );
		add_action( 'admin_post_klyna_redirects_settings', array( $this, 'handle_settings' ) );
	}

	public function add_menu(): void {
		add_menu_page(
			__( 'Klyna Redirects', 'wp-redirects' ),
			__( 'Redirects', 'wp-redirects' ),
			'manage_options',
			'klyna-redirects',
			array( $this, 'page_redirects' ),
			'dashicons-randomize',
			75
		);
		add_submenu_page(
			'klyna-redirects',
			__( '404 Monitor', 'wp-redirects' ),
			__( '404 Monitor', 'wp-redirects' ),
			'manage_options',
			'klyna-redirects-404',
			array( $this, 'page_404' )
		);
		add_submenu_page(
			'klyna-redirects',
			__( 'Settings', 'wp-redirects' ),
			__( 'Settings', 'wp-redirects' ),
			'manage_options',
			'klyna-redirects-settings',
			array( $this, 'page_settings' )
		);
	}

	public function enqueue( string $hook ): void {
		if ( strpos( $hook, 'klyna-redirects' ) === false ) {
			return;
		}
		wp_enqueue_style(
			'klyna-redirects-admin',
			KLYNA_REDIRECTS_PLUGIN_URL . 'assets/admin/admin.css',
			array(),
			KLYNA_REDIRECTS_VERSION
		);
		wp_enqueue_script(
			'klyna-redirects-admin',
			KLYNA_REDIRECTS_PLUGIN_URL . 'assets/admin/admin.js',
			array(),
			KLYNA_REDIRECTS_VERSION,
			true
		);
	}

	public function page_redirects(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}

		global $wpdb;
		$redirects = $wpdb->get_results(
			"SELECT * FROM {$wpdb->prefix}klyna_redirects ORDER BY id DESC",
			ARRAY_A
		);

		$edit = null;
		if ( isset( $_GET['edit'] ) ) {
			$edit = $wpdb->get_row(
				$wpdb->prepare( "SELECT * FROM {$wpdb->prefix}klyna_redirects WHERE id = %d", absint( $_GET['edit'] ) ),
				ARRAY_A
			);
		}
		?>
		<div class="wrap klyna-wrap">
			<h1 class="klyna-title">
				<img src="<?php echo esc_url( KLYNA_REDIRECTS_PLUGIN_URL . 'assets/logo.svg' ); ?>" alt="Klyna" width="24" height="24">
				<?php esc_html_e( 'Redirect Manager', 'wp-redirects' ); ?>
			</h1>

			<?php if ( isset( $_GET['saved'] ) ) : ?>
				<div class="notice notice-success is-dismissible"><p><?php esc_html_e( 'Redirect saved.', 'wp-redirects' ); ?></p></div>
			<?php endif; ?>
			<?php if ( isset( $_GET['deleted'] ) ) : ?>
				<div class="notice notice-success is-dismissible"><p><?php esc_html_e( 'Redirect deleted.', 'wp-redirects' ); ?></p></div>
			<?php endif; ?>

			<div class="klyna-card">
				<h2><?php echo $edit ? esc_html__( 'Edit Redirect', 'wp-redirects' ) : esc_html__( 'Add Redirect', 'wp-redirects' ); ?></h2>
				<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
					<?php wp_nonce_field( 'klyna_redirects_save', '_nonce_save' ); ?>
					<input type="hidden" name="action" value="klyna_redirects_save">
					<?php if ( $edit ) : ?>
						<input type="hidden" name="redirect_id" value="<?php echo esc_attr( $edit['id'] ); ?>">
					<?php endif; ?>
					<table class="form-table">
						<tr>
							<th><label for="source"><?php esc_html_e( 'Source URL / Pattern', 'wp-redirects' ); ?></label></th>
							<td><input type="text" id="source" name="source" class="large-text" value="<?php echo $edit ? esc_attr( $edit['source'] ) : ''; ?>" required placeholder="/old-page/"></td>
						</tr>
						<tr>
							<th><label for="destination"><?php esc_html_e( 'Destination URL', 'wp-redirects' ); ?></label></th>
							<td><input type="text" id="destination" name="destination" class="large-text" value="<?php echo $edit ? esc_attr( $edit['destination'] ) : ''; ?>" required placeholder="/new-page/"></td>
						</tr>
						<tr>
							<th><label for="status_code"><?php esc_html_e( 'Redirect Type', 'wp-redirects' ); ?></label></th>
							<td>
								<select id="status_code" name="status_code">
									<?php foreach ( array( 301 => '301 Permanent', 302 => '302 Temporary', 307 => '307 Temporary (method preserved)', 410 => '410 Gone' ) as $code => $label ) : ?>
										<option value="<?php echo esc_attr( $code ); ?>" <?php selected( $edit ? $edit['status_code'] : 301, $code ); ?>><?php echo esc_html( $label ); ?></option>
									<?php endforeach; ?>
								</select>
							</td>
						</tr>
						<tr>
							<th><label for="is_regex"><?php esc_html_e( 'Regex match', 'wp-redirects' ); ?></label></th>
							<td><label><input type="checkbox" id="is_regex" name="is_regex" value="1" <?php checked( $edit ? $edit['is_regex'] : 0, 1 ); ?>> <?php esc_html_e( 'Treat source as a regular expression', 'wp-redirects' ); ?></label></td>
						</tr>
						<tr>
							<th><label for="note"><?php esc_html_e( 'Note (optional)', 'wp-redirects' ); ?></label></th>
							<td><input type="text" id="note" name="note" class="large-text" value="<?php echo $edit ? esc_attr( $edit['note'] ) : ''; ?>"></td>
						</tr>
					</table>
					<?php submit_button( $edit ? __( 'Update Redirect', 'wp-redirects' ) : __( 'Add Redirect', 'wp-redirects' ), 'klyna-btn' ); ?>
					<?php if ( $edit ) : ?>
						<a href="<?php echo esc_url( admin_url( 'admin.php?page=klyna-redirects' ) ); ?>" class="button"><?php esc_html_e( 'Cancel', 'wp-redirects' ); ?></a>
					<?php endif; ?>
				</form>
			</div>

			<div class="klyna-card">
				<h2><?php esc_html_e( 'All Redirects', 'wp-redirects' ); ?></h2>
				<?php if ( empty( $redirects ) ) : ?>
					<p class="klyna-muted"><?php esc_html_e( 'No redirects yet. Add one above.', 'wp-redirects' ); ?></p>
				<?php else : ?>
					<table class="wp-list-table widefat striped klyna-table">
						<thead><tr>
							<th><?php esc_html_e( 'Source', 'wp-redirects' ); ?></th>
							<th><?php esc_html_e( 'Destination', 'wp-redirects' ); ?></th>
							<th><?php esc_html_e( 'Type', 'wp-redirects' ); ?></th>
							<th><?php esc_html_e( 'Hits', 'wp-redirects' ); ?></th>
							<th><?php esc_html_e( 'Actions', 'wp-redirects' ); ?></th>
						</tr></thead>
						<tbody>
						<?php foreach ( $redirects as $r ) : ?>
							<tr class="<?php echo $r['enabled'] ? '' : 'klyna-disabled'; ?>">
								<td><code><?php echo esc_html( $r['source'] ); ?></code> <?php if ( $r['is_regex'] ) echo '<span class="klyna-badge">regex</span>'; ?></td>
								<td><code><?php echo esc_html( $r['destination'] ); ?></code></td>
								<td><?php echo esc_html( $r['status_code'] ); ?></td>
								<td><?php echo esc_html( number_format_i18n( $r['hit_count'] ) ); ?></td>
								<td>
									<a href="<?php echo esc_url( add_query_arg( 'edit', $r['id'], admin_url( 'admin.php?page=klyna-redirects' ) ) ); ?>"><?php esc_html_e( 'Edit', 'wp-redirects' ); ?></a> |
									<form style="display:inline" method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
										<?php wp_nonce_field( 'klyna_redirects_delete_' . $r['id'], '_nonce_delete' ); ?>
										<input type="hidden" name="action" value="klyna_redirects_delete">
										<input type="hidden" name="redirect_id" value="<?php echo esc_attr( $r['id'] ); ?>">
										<button type="submit" class="button-link klyna-link-danger" onclick="return confirm('<?php esc_attr_e( 'Delete this redirect?', 'wp-redirects' ); ?>')"><?php esc_html_e( 'Delete', 'wp-redirects' ); ?></button>
									</form>
								</td>
							</tr>
						<?php endforeach; ?>
						</tbody>
					</table>
				<?php endif; ?>
			</div>
		</div>
		<?php
	}

	public function page_404(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		global $wpdb;
		$rows = $wpdb->get_results(
			"SELECT * FROM {$wpdb->prefix}klyna_404_log ORDER BY hit_count DESC LIMIT 200",
			ARRAY_A
		);
		?>
		<div class="wrap klyna-wrap">
			<h1 class="klyna-title">
				<img src="<?php echo esc_url( KLYNA_REDIRECTS_PLUGIN_URL . 'assets/logo.svg' ); ?>" alt="Klyna" width="24" height="24">
				<?php esc_html_e( '404 Monitor', 'wp-redirects' ); ?>
			</h1>
			<?php if ( isset( $_GET['created'] ) ) : ?>
				<div class="notice notice-success is-dismissible"><p><?php esc_html_e( 'Redirect created from 404.', 'wp-redirects' ); ?></p></div>
			<?php endif; ?>
			<div class="klyna-card">
				<?php if ( empty( $rows ) ) : ?>
					<p class="klyna-muted"><?php esc_html_e( 'No 404s logged yet.', 'wp-redirects' ); ?></p>
				<?php else : ?>
					<table class="wp-list-table widefat striped klyna-table">
						<thead><tr>
							<th><?php esc_html_e( 'URL', 'wp-redirects' ); ?></th>
							<th><?php esc_html_e( 'Hits', 'wp-redirects' ); ?></th>
							<th><?php esc_html_e( 'Last Seen', 'wp-redirects' ); ?></th>
							<th><?php esc_html_e( 'Action', 'wp-redirects' ); ?></th>
						</tr></thead>
						<tbody>
						<?php foreach ( $rows as $row ) : ?>
							<tr>
								<td><code><?php echo esc_html( $row['url'] ); ?></code></td>
								<td><?php echo esc_html( number_format_i18n( $row['hit_count'] ) ); ?></td>
								<td><?php echo esc_html( $row['last_seen'] ); ?></td>
								<td>
									<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
										<?php wp_nonce_field( 'klyna_from_404_' . $row['id'], '_nonce_404' ); ?>
										<input type="hidden" name="action" value="klyna_redirects_from_404">
										<input type="hidden" name="log_id" value="<?php echo esc_attr( $row['id'] ); ?>">
										<input type="hidden" name="source" value="<?php echo esc_attr( str_replace( home_url(), '', $row['url'] ) ); ?>">
										<input type="text" name="destination" placeholder="/new-url/" class="klyna-inline-input" required>
										<button type="submit" class="button klyna-btn-sm"><?php esc_html_e( 'Create 301', 'wp-redirects' ); ?></button>
									</form>
								</td>
							</tr>
						<?php endforeach; ?>
						</tbody>
					</table>
				<?php endif; ?>
			</div>
		</div>
		<?php
	}

	public function page_settings(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		$s = Plugin::settings();
		?>
		<div class="wrap klyna-wrap">
			<h1 class="klyna-title">
				<img src="<?php echo esc_url( KLYNA_REDIRECTS_PLUGIN_URL . 'assets/logo.svg' ); ?>" alt="Klyna" width="24" height="24">
				<?php esc_html_e( 'Redirect Settings', 'wp-redirects' ); ?>
			</h1>
			<?php if ( isset( $_GET['saved'] ) ) : ?>
				<div class="notice notice-success is-dismissible"><p><?php esc_html_e( 'Settings saved.', 'wp-redirects' ); ?></p></div>
			<?php endif; ?>
			<div class="klyna-card">
				<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
					<?php wp_nonce_field( 'klyna_redirects_settings', '_nonce_settings' ); ?>
					<input type="hidden" name="action" value="klyna_redirects_settings">
					<table class="form-table">
						<tr>
							<th><?php esc_html_e( 'Enable Redirects', 'wp-redirects' ); ?></th>
							<td><label><input type="checkbox" name="enable_redirects" value="1" <?php checked( $s['enable_redirects'] ?? true ); ?>> <?php esc_html_e( 'Fire redirects on the front end', 'wp-redirects' ); ?></label></td>
						</tr>
						<tr>
							<th><?php esc_html_e( 'Log 404s', 'wp-redirects' ); ?></th>
							<td><label><input type="checkbox" name="log_404" value="1" <?php checked( $s['log_404'] ?? true ); ?>> <?php esc_html_e( 'Record 404 hits in the monitor', 'wp-redirects' ); ?></label></td>
						</tr>
						<tr>
							<th><?php esc_html_e( 'Auto-redirect on slug change', 'wp-redirects' ); ?></th>
							<td><label><input type="checkbox" name="auto_redirect_slug" value="1" <?php checked( $s['auto_redirect_slug'] ?? true ); ?>> <?php esc_html_e( 'Create a 301 automatically when a published post slug changes', 'wp-redirects' ); ?></label></td>
						</tr>
						<tr>
							<th><?php esc_html_e( 'Monitor logged-in users', 'wp-redirects' ); ?></th>
							<td><label><input type="checkbox" name="monitor_logged_in" value="1" <?php checked( $s['monitor_logged_in'] ?? false ); ?>> <?php esc_html_e( 'Include logged-in admin visits in 404 log (off by default)', 'wp-redirects' ); ?></label></td>
						</tr>
						<tr>
							<th><label for="log_retention_days"><?php esc_html_e( '404 Log Retention (days)', 'wp-redirects' ); ?></label></th>
							<td><input type="number" id="log_retention_days" name="log_retention_days" value="<?php echo esc_attr( $s['log_retention_days'] ?? 90 ); ?>" min="7" max="365" class="small-text"></td>
						</tr>
					</table>
					<?php submit_button( __( 'Save Settings', 'wp-redirects' ), 'klyna-btn' ); ?>
				</form>
			</div>
		</div>
		<?php
	}

	public function handle_save_redirect(): void {
		if ( ! current_user_can( 'manage_options' ) || ! check_admin_referer( 'klyna_redirects_save', '_nonce_save' ) ) {
			wp_die( esc_html__( 'Not allowed.', 'wp-redirects' ) );
		}
		global $wpdb;

		$data = array(
			'source'      => sanitize_text_field( wp_unslash( $_POST['source'] ?? '' ) ),
			'destination' => sanitize_text_field( wp_unslash( $_POST['destination'] ?? '' ) ),
			'status_code' => absint( $_POST['status_code'] ?? 301 ),
			'is_regex'    => isset( $_POST['is_regex'] ) ? 1 : 0,
			'enabled'     => 1,
			'note'        => sanitize_text_field( wp_unslash( $_POST['note'] ?? '' ) ),
		);
		$fmt = array( '%s', '%s', '%d', '%d', '%d', '%s' );

		$id = absint( $_POST['redirect_id'] ?? 0 );
		if ( $id ) {
			$wpdb->update( $wpdb->prefix . 'klyna_redirects', $data, array( 'id' => $id ), $fmt, array( '%d' ) );
		} else {
			$wpdb->insert( $wpdb->prefix . 'klyna_redirects', $data, $fmt );
		}

		wp_redirect( add_query_arg( 'saved', '1', admin_url( 'admin.php?page=klyna-redirects' ) ) );
		exit;
	}

	public function handle_delete_redirect(): void {
		$id = absint( $_POST['redirect_id'] ?? 0 );
		if ( ! current_user_can( 'manage_options' ) || ! check_admin_referer( 'klyna_redirects_delete_' . $id, '_nonce_delete' ) ) {
			wp_die( esc_html__( 'Not allowed.', 'wp-redirects' ) );
		}
		global $wpdb;
		$wpdb->delete( $wpdb->prefix . 'klyna_redirects', array( 'id' => $id ), array( '%d' ) );
		wp_redirect( add_query_arg( 'deleted', '1', admin_url( 'admin.php?page=klyna-redirects' ) ) );
		exit;
	}

	public function handle_from_404(): void {
		$log_id = absint( $_POST['log_id'] ?? 0 );
		if ( ! current_user_can( 'manage_options' ) || ! check_admin_referer( 'klyna_from_404_' . $log_id, '_nonce_404' ) ) {
			wp_die( esc_html__( 'Not allowed.', 'wp-redirects' ) );
		}
		global $wpdb;
		$wpdb->insert(
			$wpdb->prefix . 'klyna_redirects',
			array(
				'source'      => sanitize_text_field( wp_unslash( $_POST['source'] ?? '' ) ),
				'destination' => sanitize_text_field( wp_unslash( $_POST['destination'] ?? '' ) ),
				'status_code' => 301,
				'is_regex'    => 0,
				'enabled'     => 1,
				'note'        => 'Created from 404 monitor',
			),
			array( '%s', '%s', '%d', '%d', '%d', '%s' )
		);
		wp_redirect( add_query_arg( 'created', '1', admin_url( 'admin.php?page=klyna-redirects-404' ) ) );
		exit;
	}

	public function handle_settings(): void {
		if ( ! current_user_can( 'manage_options' ) || ! check_admin_referer( 'klyna_redirects_settings', '_nonce_settings' ) ) {
			wp_die( esc_html__( 'Not allowed.', 'wp-redirects' ) );
		}
		$settings = array(
			'enable_redirects'   => isset( $_POST['enable_redirects'] ),
			'log_404'            => isset( $_POST['log_404'] ),
			'auto_redirect_slug' => isset( $_POST['auto_redirect_slug'] ),
			'monitor_logged_in'  => isset( $_POST['monitor_logged_in'] ),
			'log_retention_days' => absint( $_POST['log_retention_days'] ?? 90 ),
		);
		update_option( KLYNA_REDIRECTS_OPTION_KEY, $settings );
		wp_redirect( add_query_arg( 'saved', '1', admin_url( 'admin.php?page=klyna-redirects-settings' ) ) );
		exit;
	}
}
