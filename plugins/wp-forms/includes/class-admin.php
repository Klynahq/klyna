<?php
/**
 * Admin UI — forms list, form builder, entries viewer + CSV export, settings.
 *
 * The form builder is a small client-enhanced HTML form: field rows are added
 * and reordered in JS, then posted back as a flat array and rebuilt by
 * Forms::save_fields(). No REST round-trips for the builder itself — a plain
 * nonce-protected POST keeps it dependency-light and resilient.
 *
 * @package KlynaForms
 */

namespace KlynaForms;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Admin {

	private const MENU_SLUG = 'wp-forms';

	public function register(): void {
		add_action( 'admin_menu', array( $this, 'register_menu' ) );
		add_action( 'admin_init', array( $this, 'register_settings' ) );
		add_action( 'admin_init', array( $this, 'handle_post_actions' ) );
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue_assets' ) );
		add_filter(
			'plugin_action_links_' . plugin_basename( KLYNA_FORMS_PLUGIN_FILE ),
			array( $this, 'add_settings_link' )
		);
	}

	public function register_menu(): void {
		add_menu_page(
			__( 'Klyna Forms', 'wp-forms' ),
			__( 'Klyna Forms', 'wp-forms' ),
			'manage_options',
			self::MENU_SLUG,
			array( $this, 'render_forms_list' ),
			'data:image/svg+xml;base64,' . base64_encode(
				'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#9ca3af"><rect x="2" y="2" width="20" height="20" rx="5"/><rect x="7" y="6.5" width="10" height="12" rx="1.5" stroke="white" stroke-width="1.6" fill="none"/><path d="M9.5 6.5V6a2.5 2.5 0 0 1 5 0v.5" stroke="white" stroke-width="1.6" stroke-linecap="round" fill="none"/><path d="M9 11l1 1 1.6-1.8M13 11h2.5M9 14.5l1 1 1.6-1.8M13 14.5h2.5" stroke="white" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>'
			),
			58
		);
		add_submenu_page(
			self::MENU_SLUG,
			__( 'All forms', 'wp-forms' ),
			__( 'All forms', 'wp-forms' ),
			'manage_options',
			self::MENU_SLUG,
			array( $this, 'render_forms_list' )
		);
		add_submenu_page(
			self::MENU_SLUG,
			__( 'Add form', 'wp-forms' ),
			__( 'Add form', 'wp-forms' ),
			'manage_options',
			'wp-forms-edit',
			array( $this, 'render_form_editor' )
		);
		$unread = Entries::unread_count();
		$label  = __( 'Entries', 'wp-forms' );
		if ( $unread > 0 ) {
			$label .= ' <span class="awaiting-mod">' . esc_html( (string) $unread ) . '</span>';
		}
		add_submenu_page(
			self::MENU_SLUG,
			__( 'Entries', 'wp-forms' ),
			$label,
			'manage_options',
			'wp-forms-entries',
			array( $this, 'render_entries' )
		);
		add_submenu_page(
			self::MENU_SLUG,
			__( 'Settings', 'wp-forms' ),
			__( 'Settings', 'wp-forms' ),
			'manage_options',
			'wp-forms-settings',
			array( $this, 'render_settings' )
		);
	}

	public function register_settings(): void {
		register_setting(
			'wp_forms_settings_group',
			KLYNA_FORMS_OPTION_KEY,
			array(
				'type'              => 'array',
				'sanitize_callback' => array( $this, 'sanitize_settings' ),
				'default'           => array(),
			)
		);
	}

	/**
	 * @param mixed $input Raw settings.
	 * @return array<string,mixed>
	 */
	public function sanitize_settings( $input ): array {
		$input     = is_array( $input ) ? $input : array();
		$out       = array();
		$bool_keys = array( 'notify_enabled', 'honeypot_enabled', 'time_trap_enabled', 'store_entries', 'store_ip' );
		foreach ( $bool_keys as $k ) {
			$out[ $k ] = ! empty( $input[ $k ] );
		}
		$out['notify_to']      = Forms::sanitize_recipient_list( (string) ( $input['notify_to'] ?? '' ) );
		$out['notify_subject'] = sanitize_text_field( (string) ( $input['notify_subject'] ?? '' ) );
		$out['from_name']      = sanitize_text_field( (string) ( $input['from_name'] ?? '' ) );
		$from_email            = sanitize_email( (string) ( $input['from_email'] ?? '' ) );
		$out['from_email']     = ( $from_email && is_email( $from_email ) ) ? $from_email : '';
		$seconds               = (int) ( $input['time_trap_seconds'] ?? 3 );
		$out['time_trap_seconds'] = max( 0, min( 60, $seconds ) );

		// AI assistant settings (all optional — default off).
		$providers = array( 'off', 'openrouter', 'groq', 'gemini', 'cloudflare', 'ollama' );
		$provider  = (string) ( $input['ai_provider'] ?? 'off' );
		$out['ai_provider']  = in_array( $provider, $providers, true ) ? $provider : 'off';
		$submitted_key = sanitize_text_field( (string) ( $input['ai_api_key'] ?? '' ) );
		$keep_key      = ! empty( $input['ai_api_key_keep'] );
		if ( '' === $submitted_key && $keep_key ) {
			$existing          = get_option( KLYNA_FORMS_OPTION_KEY, array() );
			$out['ai_api_key'] = (string) ( is_array( $existing ) && isset( $existing['ai_api_key'] ) ? $existing['ai_api_key'] : '' );
		} else {
			$out['ai_api_key'] = $submitted_key;
		}
		$out['ai_model']     = sanitize_text_field( (string) ( $input['ai_model'] ?? '' ) );
		$out['ai_endpoint']  = sanitize_text_field( (string) ( $input['ai_endpoint'] ?? '' ) );
		$cap                 = (int) ( $input['ai_daily_cap'] ?? 100 );
		$out['ai_daily_cap'] = max( 1, min( 10000, $cap ) );

		return $out;
	}

	/* ---------------------------------------------------------------------
	 * POST handlers (nonce + capability checked) — builder save, entry
	 * actions, and CSV export.
	 * ------------------------------------------------------------------- */

	public function handle_post_actions(): void {
		if ( ! is_admin() ) {
			return;
		}

		if ( isset( $_POST['klyna_forms_save_form'] ) ) {
			$this->save_form_from_post();
		}

		if ( isset( $_REQUEST['klyna_forms_entry_action'] ) ) {
			$this->handle_entry_action();
		}

		if ( isset( $_GET['klyna_forms_export'] ) ) {
			$this->export_csv();
		}
	}

	/**
	 * Persist a form built in the editor.
	 */
	private function save_form_from_post(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You are not allowed to do that.', 'wp-forms' ) );
		}
		check_admin_referer( 'klyna_forms_save_form', '_klyna_forms_nonce' );

		$form_id = isset( $_POST['form_id'] ) ? (int) $_POST['form_id'] : 0;
		$title   = isset( $_POST['form_title'] )
			? sanitize_text_field( wp_unslash( (string) $_POST['form_title'] ) )
			: __( 'Untitled form', 'wp-forms' );
		if ( '' === $title ) {
			$title = __( 'Untitled form', 'wp-forms' );
		}

		if ( $form_id ) {
			wp_update_post(
				array(
					'ID'         => $form_id,
					'post_title' => $title,
				)
			);
		} else {
			$form_id = (int) wp_insert_post(
				array(
					'post_type'   => KLYNA_FORMS_POST_TYPE,
					'post_status' => 'publish',
					'post_title'  => $title,
				)
			);
		}

		if ( ! $form_id ) {
			wp_die( esc_html__( 'Could not save the form.', 'wp-forms' ) );
		}

		// Fields arrive as parallel arrays; zip them into definitions.
		$fields = $this->parse_fields_from_post();
		Forms::save_fields( $form_id, $fields );

		// Config block. wp_unslash before sanitizing.
		$config = array(
			'submit_label'    => isset( $_POST['config']['submit_label'] ) ? sanitize_text_field( wp_unslash( (string) $_POST['config']['submit_label'] ) ) : '',
			'success_message' => isset( $_POST['config']['success_message'] ) ? sanitize_textarea_field( wp_unslash( (string) $_POST['config']['success_message'] ) ) : '',
			'success_action'  => isset( $_POST['config']['success_action'] ) ? sanitize_text_field( wp_unslash( (string) $_POST['config']['success_action'] ) ) : 'message',
			'redirect_url'    => isset( $_POST['config']['redirect_url'] ) ? esc_url_raw( wp_unslash( (string) $_POST['config']['redirect_url'] ) ) : '',
			'notify_to'       => isset( $_POST['config']['notify_to'] ) ? sanitize_text_field( wp_unslash( (string) $_POST['config']['notify_to'] ) ) : '',
		);
		Forms::save_config( $form_id, $config );

		// AI auto-reply settings (per-form).
		$autoreply_enabled     = ! empty( $_POST['autoreply']['enabled'] );
		$autoreply_instruction = isset( $_POST['autoreply']['instruction'] )
			? sanitize_textarea_field( wp_unslash( (string) $_POST['autoreply']['instruction'] ) )
			: '';
		$autoreply_subject = isset( $_POST['autoreply']['subject'] )
			? sanitize_text_field( wp_unslash( (string) $_POST['autoreply']['subject'] ) )
			: '';
		update_post_meta( $form_id, Auto_Reply::META_ENABLED, $autoreply_enabled ? 1 : 0 );
		update_post_meta( $form_id, Auto_Reply::META_INSTRUCTION, $autoreply_instruction );
		update_post_meta( $form_id, Auto_Reply::META_SUBJECT, $autoreply_subject );

		wp_safe_redirect(
			add_query_arg(
				array(
					'page'    => 'wp-forms-edit',
					'form_id' => $form_id,
					'updated' => '1',
				),
				admin_url( 'admin.php' )
			)
		);
		exit;
	}

	/**
	 * Reconstruct field definitions from the posted parallel arrays.
	 *
	 * @return array<int, array<string,mixed>>
	 */
	private function parse_fields_from_post(): array {
		if ( empty( $_POST['fields'] ) || ! is_array( $_POST['fields'] ) ) {
			return array();
		}
		$raw    = wp_unslash( $_POST['fields'] ); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- sanitized per-field below.
		$fields = array();
		foreach ( $raw as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			$fields[] = array(
				'key'         => isset( $row['key'] ) ? sanitize_key( (string) $row['key'] ) : '',
				'type'        => isset( $row['type'] ) ? sanitize_text_field( (string) $row['type'] ) : 'text',
				'label'       => isset( $row['label'] ) ? sanitize_text_field( (string) $row['label'] ) : '',
				'placeholder' => isset( $row['placeholder'] ) ? sanitize_text_field( (string) $row['placeholder'] ) : '',
				'required'    => ! empty( $row['required'] ),
				'options'     => isset( $row['options'] ) ? sanitize_textarea_field( (string) $row['options'] ) : '',
			);
		}
		return $fields;
	}

	/**
	 * Mark read/unread or delete an entry.
	 */
	private function handle_entry_action(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You are not allowed to do that.', 'wp-forms' ) );
		}
		$action   = sanitize_key( (string) wp_unslash( $_REQUEST['klyna_forms_entry_action'] ) );
		$entry_id = isset( $_REQUEST['entry_id'] ) ? (int) $_REQUEST['entry_id'] : 0;
		check_admin_referer( 'klyna_forms_entry_' . $entry_id );

		if ( $entry_id ) {
			switch ( $action ) {
				case 'read':
					Entries::set_status( $entry_id, 'read' );
					break;
				case 'unread':
					Entries::set_status( $entry_id, 'unread' );
					break;
				case 'delete':
					Entries::delete( $entry_id );
					break;
			}
		}

		$redirect = remove_query_arg(
			array( 'klyna_forms_entry_action', 'entry_id', '_wpnonce' ),
			wp_get_referer() ?: admin_url( 'admin.php?page=wp-forms-entries' )
		);
		wp_safe_redirect( $redirect );
		exit;
	}

	/**
	 * Stream a CSV export of a form's entries.
	 */
	private function export_csv(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You are not allowed to do that.', 'wp-forms' ) );
		}
		$form_id = isset( $_GET['form_id'] ) ? (int) $_GET['form_id'] : 0;
		check_admin_referer( 'klyna_forms_export_' . $form_id );

		$form    = $form_id ? get_post( $form_id ) : null;
		$fields  = $form_id ? Forms::get_fields( $form_id ) : array();
		$entries = $form_id ? Entries::all_for_form( $form_id ) : array();

		$slug     = $form ? sanitize_title( $form->post_title ) : 'form';
		$filename = 'klyna-' . $slug . '-' . gmdate( 'Y-m-d' ) . '.csv';

		nocache_headers();
		header( 'Content-Type: text/csv; charset=utf-8' );
		header( 'Content-Disposition: attachment; filename=' . $filename );

		$handle = fopen( 'php://output', 'w' );

		// Header row: fixed columns + one per field label.
		$header = array( 'ID', __( 'Date', 'wp-forms' ), __( 'Status', 'wp-forms' ) );
		foreach ( $fields as $field ) {
			$header[] = $field['label'];
		}
		$header[] = 'IP';
		fputcsv( $handle, $header );

		foreach ( $entries as $entry ) {
			$row = array(
				$entry['id'],
				$entry['created_at'],
				$entry['status'],
			);
			foreach ( $fields as $field ) {
				$value = $entry['data'][ $field['key'] ] ?? '';
				$row[] = is_array( $value ) ? implode( ', ', $value ) : (string) $value;
			}
			$row[] = $entry['ip'];
			fputcsv( $handle, $row );
		}

		fclose( $handle );
		exit;
	}

	/* ---------------------------------------------------------------------
	 * Assets
	 * ------------------------------------------------------------------- */

	public function enqueue_assets( string $hook ): void {
		if ( strpos( $hook, 'wp-forms' ) === false && strpos( $hook, self::MENU_SLUG ) === false ) {
			return;
		}
		wp_enqueue_style(
			'klyna-forms-admin',
			KLYNA_FORMS_PLUGIN_URL . 'assets/admin/admin.css',
			array(),
			KLYNA_FORMS_VERSION
		);
		wp_enqueue_script(
			'klyna-forms-admin',
			KLYNA_FORMS_PLUGIN_URL . 'assets/admin/admin.js',
			array( 'wp-i18n' ),
			KLYNA_FORMS_VERSION,
			true
		);
		wp_localize_script(
			'klyna-forms-admin',
			'KlynaFormsAdmin',
			array(
				'restUrl' => esc_url_raw( rest_url( 'klyna-forms/v1/' ) ),
				'nonce'   => wp_create_nonce( 'wp_rest' ),
				'i18n'    => array(
					'confirmDelete' => __( 'Delete this field?', 'wp-forms' ),
					'removeLabel'   => __( 'Remove', 'wp-forms' ),
					'optionsHelp'   => __( 'One option per line', 'wp-forms' ),
					'testing'       => __( 'Testing…', 'wp-forms' ),
					'testOk'        => __( 'Connection OK.', 'wp-forms' ),
					'testFail'      => __( 'Connection failed:', 'wp-forms' ),
					'generating'    => __( 'Generating…', 'wp-forms' ),
					'sending'       => __( 'Sending…', 'wp-forms' ),
					'sent'          => __( 'Sent.', 'wp-forms' ),
					'saved'         => __( 'Saved.', 'wp-forms' ),
				),
			)
		);
	}

	/* ---------------------------------------------------------------------
	 * Views
	 * ------------------------------------------------------------------- */

	public function render_forms_list(): void {
		$forms = get_posts(
			array(
				'post_type'      => KLYNA_FORMS_POST_TYPE,
				'post_status'    => array( 'publish', 'draft' ),
				'posts_per_page' => -1,
				'orderby'        => 'date',
				'order'          => 'DESC',
			)
		);
		?>
		<div class="wrap klyna-forms-wrap">
			<h1 class="wp-heading-inline"><?php esc_html_e( 'Klyna Forms', 'wp-forms' ); ?></h1>
			<a class="page-title-action" href="<?php echo esc_url( admin_url( 'admin.php?page=wp-forms-edit' ) ); ?>"><?php esc_html_e( 'Add form', 'wp-forms' ); ?></a>
			<p class="klyna-forms-tagline"><?php esc_html_e( 'Tools that help your work get found. Lead-gen forms with entry storage, spam protection & notifications.', 'wp-forms' ); ?></p>

			<?php if ( empty( $forms ) ) : ?>
				<div class="klyna-forms-empty">
					<h2><?php esc_html_e( 'No forms yet', 'wp-forms' ); ?></h2>
					<p><?php esc_html_e( 'Build your first form in under a minute — add fields, drop the shortcode on any page, and start collecting leads.', 'wp-forms' ); ?></p>
					<a class="button button-primary button-hero" href="<?php echo esc_url( admin_url( 'admin.php?page=wp-forms-edit' ) ); ?>"><?php esc_html_e( 'Create a form', 'wp-forms' ); ?></a>
				</div>
			<?php else : ?>
				<table class="wp-list-table widefat fixed striped klyna-forms-table">
					<thead>
						<tr>
							<th><?php esc_html_e( 'Form', 'wp-forms' ); ?></th>
							<th><?php esc_html_e( 'Shortcode', 'wp-forms' ); ?></th>
							<th><?php esc_html_e( 'Fields', 'wp-forms' ); ?></th>
							<th><?php esc_html_e( 'Entries', 'wp-forms' ); ?></th>
							<th></th>
						</tr>
					</thead>
					<tbody>
						<?php foreach ( $forms as $form ) : ?>
							<?php
							$count   = count( Forms::get_fields( $form->ID ) );
							$entries = Entries::query( array( 'form_id' => $form->ID, 'per_page' => 1 ) );
							$unread  = Entries::unread_count( $form->ID );
							$edit    = admin_url( 'admin.php?page=wp-forms-edit&form_id=' . $form->ID );
							$view    = admin_url( 'admin.php?page=wp-forms-entries&form_id=' . $form->ID );
							?>
							<tr>
								<td>
									<strong><a href="<?php echo esc_url( $edit ); ?>"><?php echo esc_html( $form->post_title ); ?></a></strong>
								</td>
								<td><code class="klyna-forms-shortcode">[klyna_form id="<?php echo esc_attr( (string) $form->ID ); ?>"]</code></td>
								<td><?php echo esc_html( (string) $count ); ?></td>
								<td>
									<a href="<?php echo esc_url( $view ); ?>"><?php echo esc_html( (string) $entries['total'] ); ?></a>
									<?php if ( $unread ) : ?>
										<span class="klyna-forms-pill"><?php echo esc_html( sprintf( /* translators: %d: count */ __( '%d new', 'wp-forms' ), $unread ) ); ?></span>
									<?php endif; ?>
								</td>
								<td class="klyna-forms-row-actions">
									<a class="button button-small" href="<?php echo esc_url( $edit ); ?>"><?php esc_html_e( 'Edit', 'wp-forms' ); ?></a>
									<a class="button button-small" href="<?php echo esc_url( $view ); ?>"><?php esc_html_e( 'Entries', 'wp-forms' ); ?></a>
								</td>
							</tr>
						<?php endforeach; ?>
					</tbody>
				</table>
			<?php endif; ?>
		</div>
		<?php
	}

	public function render_form_editor(): void {
		$form_id = isset( $_GET['form_id'] ) ? (int) $_GET['form_id'] : 0; // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only view.
		$form    = $form_id ? get_post( $form_id ) : null;
		$title   = $form ? $form->post_title : '';
		$fields  = $form_id ? Forms::get_fields( $form_id ) : array();
		$config  = Forms::get_config( $form_id );
		$updated = isset( $_GET['updated'] ); // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		?>
		<div class="wrap klyna-forms-wrap klyna-forms-editor">
			<h1><?php echo $form_id ? esc_html__( 'Edit form', 'wp-forms' ) : esc_html__( 'Add form', 'wp-forms' ); ?></h1>

			<?php if ( $updated ) : ?>
				<div class="notice notice-success is-dismissible"><p><?php esc_html_e( 'Form saved.', 'wp-forms' ); ?></p></div>
			<?php endif; ?>

			<?php if ( $form_id ) : ?>
				<p class="klyna-forms-tagline">
					<?php esc_html_e( 'Embed this form with the shortcode', 'wp-forms' ); ?>
					<code class="klyna-forms-shortcode">[klyna_form id="<?php echo esc_attr( (string) $form_id ); ?>"]</code>
					<?php esc_html_e( 'or the Klyna Form block.', 'wp-forms' ); ?>
				</p>
			<?php endif; ?>

			<form method="post" action="<?php echo esc_url( admin_url( 'admin.php?page=wp-forms-edit' ) ); ?>" class="klyna-forms-builder" id="klyna-forms-builder">
				<?php wp_nonce_field( 'klyna_forms_save_form', '_klyna_forms_nonce' ); ?>
				<input type="hidden" name="form_id" value="<?php echo esc_attr( (string) $form_id ); ?>">

				<div class="klyna-forms-builder__grid">
					<div class="klyna-forms-builder__main">
						<p class="klyna-forms-field-block">
							<label class="klyna-forms-strong" for="form_title"><?php esc_html_e( 'Form name', 'wp-forms' ); ?></label>
							<input type="text" id="form_title" name="form_title" class="regular-text" value="<?php echo esc_attr( $title ); ?>" placeholder="<?php esc_attr_e( 'Contact form', 'wp-forms' ); ?>" required>
						</p>

						<h2><?php esc_html_e( 'Fields', 'wp-forms' ); ?></h2>
						<div id="klyna-forms-fields" class="klyna-forms-fields">
							<?php
							if ( empty( $fields ) ) {
								$fields = $this->starter_fields();
							}
							foreach ( $fields as $i => $field ) {
								echo $this->render_builder_row( $i, $field ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escapes internally.
							}
							?>
						</div>

						<p>
							<button type="button" class="button" id="klyna-forms-add-field"><?php esc_html_e( '+ Add field', 'wp-forms' ); ?></button>
						</p>
					</div>

					<div class="klyna-forms-builder__side">
						<div class="klyna-forms-panel">
							<h2><?php esc_html_e( 'After submit', 'wp-forms' ); ?></h2>
							<p class="klyna-forms-field-block">
								<label class="klyna-forms-strong" for="success_action"><?php esc_html_e( 'On success', 'wp-forms' ); ?></label>
								<select id="success_action" name="config[success_action]" class="klyna-forms-success-action">
									<option value="message" <?php selected( $config['success_action'], 'message' ); ?>><?php esc_html_e( 'Show a message', 'wp-forms' ); ?></option>
									<option value="redirect" <?php selected( $config['success_action'], 'redirect' ); ?>><?php esc_html_e( 'Redirect to a URL', 'wp-forms' ); ?></option>
								</select>
							</p>
							<p class="klyna-forms-field-block klyna-forms-when-message">
								<label class="klyna-forms-strong" for="success_message"><?php esc_html_e( 'Success message', 'wp-forms' ); ?></label>
								<textarea id="success_message" name="config[success_message]" rows="3" class="large-text"><?php echo esc_textarea( $config['success_message'] ); ?></textarea>
							</p>
							<p class="klyna-forms-field-block klyna-forms-when-redirect">
								<label class="klyna-forms-strong" for="redirect_url"><?php esc_html_e( 'Redirect URL', 'wp-forms' ); ?></label>
								<input type="url" id="redirect_url" name="config[redirect_url]" class="large-text" value="<?php echo esc_attr( $config['redirect_url'] ); ?>" placeholder="https://…">
							</p>
							<p class="klyna-forms-field-block">
								<label class="klyna-forms-strong" for="submit_label"><?php esc_html_e( 'Submit button label', 'wp-forms' ); ?></label>
								<input type="text" id="submit_label" name="config[submit_label]" class="regular-text" value="<?php echo esc_attr( $config['submit_label'] ); ?>">
							</p>
						</div>

						<div class="klyna-forms-panel">
							<h2><?php esc_html_e( 'Notifications', 'wp-forms' ); ?></h2>
							<p class="klyna-forms-field-block">
								<label class="klyna-forms-strong" for="notify_to"><?php esc_html_e( 'Send entries to', 'wp-forms' ); ?></label>
								<input type="text" id="notify_to" name="config[notify_to]" class="regular-text" value="<?php echo esc_attr( $config['notify_to'] ); ?>" placeholder="<?php echo esc_attr( (string) Plugin::setting( 'notify_to', get_option( 'admin_email' ) ) ); ?>">
								<span class="description"><?php esc_html_e( 'Comma-separated. Leave blank to use the global recipient from Settings.', 'wp-forms' ); ?></span>
							</p>
						</div>

						<?php
						$ar_enabled     = (bool) get_post_meta( $form_id, Auto_Reply::META_ENABLED, true );
						$ar_instruction = (string) get_post_meta( $form_id, Auto_Reply::META_INSTRUCTION, true );
						$ar_subject     = (string) get_post_meta( $form_id, Auto_Reply::META_SUBJECT, true );
						$ai_provider    = (string) Plugin::setting( 'ai_provider', 'off' );
						?>
						<div class="klyna-forms-panel">
							<h2><?php esc_html_e( 'AI auto-reply', 'wp-forms' ); ?></h2>
							<?php if ( 'off' === $ai_provider || '' === $ai_provider ) : ?>
								<p class="description">
									<?php
									echo wp_kses_post(
										sprintf(
											/* translators: %s: settings page link */
											__( 'Pick a provider on the %s page to enable AI auto-reply drafts.', 'wp-forms' ),
											'<a href="' . esc_url( admin_url( 'admin.php?page=wp-forms-settings' ) ) . '">' . esc_html__( 'Settings', 'wp-forms' ) . '</a>'
										)
									);
									?>
								</p>
							<?php endif; ?>
							<p class="klyna-forms-field-block">
								<label>
									<input type="checkbox" name="autoreply[enabled]" value="1" <?php checked( $ar_enabled ); ?>>
									<?php esc_html_e( 'Draft an AI auto-reply on every submission', 'wp-forms' ); ?>
								</label>
								<span class="description"><?php esc_html_e( 'Drafts are saved for review. Never sent automatically.', 'wp-forms' ); ?></span>
							</p>
							<p class="klyna-forms-field-block">
								<label class="klyna-forms-strong" for="autoreply_subject"><?php esc_html_e( 'Subject line', 'wp-forms' ); ?></label>
								<input type="text" id="autoreply_subject" name="autoreply[subject]" class="regular-text" value="<?php echo esc_attr( $ar_subject ); ?>" placeholder="<?php esc_attr_e( 'Thanks for reaching out', 'wp-forms' ); ?>">
							</p>
							<p class="klyna-forms-field-block">
								<label class="klyna-forms-strong" for="autoreply_instruction"><?php esc_html_e( 'Instructions for the AI', 'wp-forms' ); ?></label>
								<textarea id="autoreply_instruction" name="autoreply[instruction]" rows="4" class="large-text" placeholder="<?php esc_attr_e( 'e.g. Confirm we received the message, mention our 24h response time, sign as the team.', 'wp-forms' ); ?>"><?php echo esc_textarea( $ar_instruction ); ?></textarea>
								<span class="description"><?php esc_html_e( 'Replies stay under 120 words.', 'wp-forms' ); ?></span>
							</p>
						</div>
					</div>
				</div>

				<p class="submit">
					<button type="submit" name="klyna_forms_save_form" value="1" class="button button-primary button-large"><?php esc_html_e( 'Save form', 'wp-forms' ); ?></button>
				</p>
			</form>

			<?php echo $this->render_builder_template(); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escapes internally. ?>
		</div>
		<?php
	}

	/**
	 * One builder row. Reused by the JS "add field" template (index __INDEX__).
	 *
	 * @param int|string          $index Numeric index or template token.
	 * @param array<string,mixed> $field Field definition.
	 */
	private function render_builder_row( $index, array $field ): string {
		$types = array(
			'text'     => __( 'Text', 'wp-forms' ),
			'email'    => __( 'Email', 'wp-forms' ),
			'tel'      => __( 'Phone', 'wp-forms' ),
			'url'      => __( 'URL', 'wp-forms' ),
			'number'   => __( 'Number', 'wp-forms' ),
			'textarea' => __( 'Paragraph', 'wp-forms' ),
			'select'   => __( 'Dropdown', 'wp-forms' ),
			'radio'    => __( 'Radio', 'wp-forms' ),
			'checkbox' => __( 'Checkbox', 'wp-forms' ),
		);
		$name    = 'fields[' . $index . ']';
		$type    = (string) ( $field['type'] ?? 'text' );
		$options = '';
		if ( isset( $field['options'] ) ) {
			$options = is_array( $field['options'] ) ? implode( "\n", $field['options'] ) : (string) $field['options'];
		}
		$has_options = in_array( $type, array( 'select', 'radio', 'checkbox' ), true );

		ob_start();
		?>
		<div class="klyna-forms-field-row" data-index="<?php echo esc_attr( (string) $index ); ?>">
			<div class="klyna-forms-field-row__handle" title="<?php esc_attr_e( 'Drag to reorder', 'wp-forms' ); ?>">⋮⋮</div>
			<div class="klyna-forms-field-row__body">
				<div class="klyna-forms-field-row__top">
					<label>
						<span class="klyna-forms-mini-label"><?php esc_html_e( 'Label', 'wp-forms' ); ?></span>
						<input type="text" name="<?php echo esc_attr( $name ); ?>[label]" value="<?php echo esc_attr( (string) ( $field['label'] ?? '' ) ); ?>" class="klyna-forms-field-label" placeholder="<?php esc_attr_e( 'Field label', 'wp-forms' ); ?>">
					</label>
					<label>
						<span class="klyna-forms-mini-label"><?php esc_html_e( 'Type', 'wp-forms' ); ?></span>
						<select name="<?php echo esc_attr( $name ); ?>[type]" class="klyna-forms-field-type">
							<?php foreach ( $types as $value => $tlabel ) : ?>
								<option value="<?php echo esc_attr( $value ); ?>" <?php selected( $type, $value ); ?>><?php echo esc_html( $tlabel ); ?></option>
							<?php endforeach; ?>
						</select>
					</label>
					<label class="klyna-forms-required-toggle">
						<input type="checkbox" name="<?php echo esc_attr( $name ); ?>[required]" value="1" <?php checked( ! empty( $field['required'] ) ); ?>>
						<span><?php esc_html_e( 'Required', 'wp-forms' ); ?></span>
					</label>
					<button type="button" class="button-link klyna-forms-remove-field" aria-label="<?php esc_attr_e( 'Remove field', 'wp-forms' ); ?>">×</button>
				</div>
				<div class="klyna-forms-field-row__extra">
					<input type="hidden" name="<?php echo esc_attr( $name ); ?>[key]" value="<?php echo esc_attr( (string) ( $field['key'] ?? '' ) ); ?>">
					<label class="klyna-forms-placeholder-wrap">
						<span class="klyna-forms-mini-label"><?php esc_html_e( 'Placeholder', 'wp-forms' ); ?></span>
						<input type="text" name="<?php echo esc_attr( $name ); ?>[placeholder]" value="<?php echo esc_attr( (string) ( $field['placeholder'] ?? '' ) ); ?>">
					</label>
					<label class="klyna-forms-options-wrap" <?php echo $has_options ? '' : 'hidden'; ?>>
						<span class="klyna-forms-mini-label"><?php esc_html_e( 'Options (one per line)', 'wp-forms' ); ?></span>
						<textarea name="<?php echo esc_attr( $name ); ?>[options]" rows="3"><?php echo esc_textarea( $options ); ?></textarea>
					</label>
				</div>
			</div>
		</div>
		<?php
		return (string) ob_get_clean();
	}

	/**
	 * Hidden template the JS clones for new fields.
	 */
	private function render_builder_template(): string {
		$row = $this->render_builder_row( '__INDEX__', array( 'type' => 'text' ) );
		return '<script type="text/html" id="klyna-forms-field-template">' . $row . '</script>';
	}

	/**
	 * Sensible starter fields for a brand-new form.
	 *
	 * @return array<int, array<string,mixed>>
	 */
	private function starter_fields(): array {
		return array(
			array( 'key' => 'name', 'type' => 'text', 'label' => __( 'Name', 'wp-forms' ), 'required' => true, 'placeholder' => '' ),
			array( 'key' => 'email', 'type' => 'email', 'label' => __( 'Email', 'wp-forms' ), 'required' => true, 'placeholder' => '' ),
			array( 'key' => 'message', 'type' => 'textarea', 'label' => __( 'Message', 'wp-forms' ), 'required' => true, 'placeholder' => '' ),
		);
	}

	public function render_entries(): void {
		$form_id  = isset( $_GET['form_id'] ) ? (int) $_GET['form_id'] : 0; // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only listing.
		$paged    = isset( $_GET['paged'] ) ? max( 1, (int) $_GET['paged'] ) : 1; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		$per_page = 20;

		$forms = get_posts(
			array(
				'post_type'      => KLYNA_FORMS_POST_TYPE,
				'post_status'    => array( 'publish', 'draft' ),
				'posts_per_page' => -1,
			)
		);

		// Default to the first form when none chosen.
		if ( ! $form_id && ! empty( $forms ) ) {
			$form_id = $forms[0]->ID;
		}

		$result = $form_id
			? Entries::query( array( 'form_id' => $form_id, 'per_page' => $per_page, 'page' => $paged ) )
			: array( 'rows' => array(), 'total' => 0 );
		$fields = $form_id ? Forms::get_fields( $form_id ) : array();
		$pages  = (int) ceil( ( $result['total'] ?: 0 ) / $per_page );
		?>
		<div class="wrap klyna-forms-wrap">
			<h1 class="wp-heading-inline"><?php esc_html_e( 'Entries', 'wp-forms' ); ?></h1>
			<?php if ( $form_id && ! empty( $result['rows'] ) ) : ?>
				<?php
				$export_url = wp_nonce_url(
					admin_url( 'admin.php?page=wp-forms-entries&klyna_forms_export=1&form_id=' . $form_id ),
					'klyna_forms_export_' . $form_id
				);
				?>
				<a class="page-title-action" href="<?php echo esc_url( $export_url ); ?>"><?php esc_html_e( 'Export CSV', 'wp-forms' ); ?></a>
			<?php endif; ?>

			<form method="get" class="klyna-forms-entries-filter">
				<input type="hidden" name="page" value="wp-forms-entries">
				<label for="form_id" class="screen-reader-text"><?php esc_html_e( 'Choose form', 'wp-forms' ); ?></label>
				<select id="form_id" name="form_id" onchange="this.form.submit()">
					<?php foreach ( $forms as $f ) : ?>
						<option value="<?php echo esc_attr( (string) $f->ID ); ?>" <?php selected( $form_id, $f->ID ); ?>><?php echo esc_html( $f->post_title ); ?></option>
					<?php endforeach; ?>
				</select>
			</form>

			<?php if ( empty( $forms ) ) : ?>
				<p><?php esc_html_e( 'Create a form first to start collecting entries.', 'wp-forms' ); ?></p>
			<?php elseif ( empty( $result['rows'] ) ) : ?>
				<p><?php esc_html_e( 'No entries yet for this form.', 'wp-forms' ); ?></p>
			<?php else : ?>
				<table class="wp-list-table widefat fixed striped klyna-forms-entries-table">
					<thead>
						<tr>
							<th class="klyna-forms-col-date"><?php esc_html_e( 'Date', 'wp-forms' ); ?></th>
							<?php foreach ( $fields as $field ) : ?>
								<th><?php echo esc_html( $field['label'] ); ?></th>
							<?php endforeach; ?>
							<th class="klyna-forms-col-actions"></th>
						</tr>
					</thead>
					<tbody>
						<?php foreach ( $result['rows'] as $entry ) : ?>
							<?php
							$is_unread = 'unread' === $entry['status'];
							$base      = admin_url( 'admin.php?page=wp-forms-entries&form_id=' . $form_id );
							$toggle    = $is_unread ? 'read' : 'unread';
							$toggle_url = wp_nonce_url(
								add_query_arg(
									array( 'klyna_forms_entry_action' => $toggle, 'entry_id' => $entry['id'] ),
									$base
								),
								'klyna_forms_entry_' . $entry['id']
							);
							$delete_url = wp_nonce_url(
								add_query_arg(
									array( 'klyna_forms_entry_action' => 'delete', 'entry_id' => $entry['id'] ),
									$base
								),
								'klyna_forms_entry_' . $entry['id']
							);
							?>
							<tr class="<?php echo $is_unread ? 'klyna-forms-entry--unread' : ''; ?>">
								<td class="klyna-forms-col-date">
									<?php echo esc_html( mysql2date( get_option( 'date_format' ) . ' ' . get_option( 'time_format' ), $entry['created_at'] ) ); ?>
									<?php if ( $is_unread ) : ?>
										<span class="klyna-forms-pill"><?php esc_html_e( 'New', 'wp-forms' ); ?></span>
									<?php endif; ?>
								</td>
								<?php foreach ( $fields as $field ) : ?>
									<?php
									$value = $entry['data'][ $field['key'] ] ?? '';
									$shown = is_array( $value ) ? implode( ', ', $value ) : (string) $value;
									?>
									<td>
										<?php if ( 'email' === $field['type'] && $shown && is_email( $shown ) ) : ?>
											<a href="<?php echo esc_attr( 'mailto:' . antispambot( $shown ) ); ?>"><?php echo esc_html( $shown ); ?></a>
										<?php else : ?>
											<?php echo esc_html( wp_trim_words( $shown, 24 ) ); ?>
										<?php endif; ?>
									</td>
								<?php endforeach; ?>
								<td class="klyna-forms-col-actions klyna-forms-row-actions">
									<a class="button button-small" href="<?php echo esc_url( $toggle_url ); ?>"><?php echo $is_unread ? esc_html__( 'Mark read', 'wp-forms' ) : esc_html__( 'Mark unread', 'wp-forms' ); ?></a>
									<a class="button button-small klyna-forms-delete" href="<?php echo esc_url( $delete_url ); ?>" onclick="return confirm('<?php echo esc_js( __( 'Delete this entry permanently?', 'wp-forms' ) ); ?>');"><?php esc_html_e( 'Delete', 'wp-forms' ); ?></a>
								</td>
							</tr>
							<?php
							$reply        = Replies::latest_for_entry( (int) $entry['id'] );
							$colspan      = 2 + count( $fields );
							$ai_provider  = (string) Plugin::setting( 'ai_provider', 'off' );
							$ai_available = 'off' !== $ai_provider && '' !== $ai_provider;
							?>
							<tr class="klyna-forms-reply-row">
								<td colspan="<?php echo esc_attr( (string) $colspan ); ?>">
									<details class="klyna-forms-reply" data-entry-id="<?php echo esc_attr( (string) $entry['id'] ); ?>" data-reply-id="<?php echo esc_attr( (string) ( $reply['id'] ?? 0 ) ); ?>" <?php echo $reply ? 'open' : ''; ?>>
										<summary>
											<?php if ( $reply ) : ?>
												<?php if ( 'sent' === $reply['status'] ) : ?>
													<strong><?php esc_html_e( 'AI reply: sent', 'wp-forms' ); ?></strong>
													<span class="description"><?php echo esc_html( (string) $reply['sent_at'] ); ?></span>
												<?php else : ?>
													<strong><?php esc_html_e( 'AI reply draft', 'wp-forms' ); ?></strong>
												<?php endif; ?>
											<?php else : ?>
												<strong><?php esc_html_e( 'AI reply', 'wp-forms' ); ?></strong>
												<span class="description"><?php esc_html_e( 'No draft yet.', 'wp-forms' ); ?></span>
											<?php endif; ?>
										</summary>
										<div class="klyna-forms-reply__body">
											<?php if ( ! $ai_available ) : ?>
												<p class="description">
													<?php
													echo wp_kses_post(
														sprintf(
															/* translators: %s: settings page link */
															__( 'Configure an AI provider on %s to draft replies.', 'wp-forms' ),
															'<a href="' . esc_url( admin_url( 'admin.php?page=wp-forms-settings' ) ) . '">' . esc_html__( 'Settings', 'wp-forms' ) . '</a>'
														)
													);
													?>
												</p>
											<?php endif; ?>
											<p class="klyna-forms-field-block">
												<label class="klyna-forms-mini-label" for="reply_to_<?php echo esc_attr( (string) $entry['id'] ); ?>"><?php esc_html_e( 'To', 'wp-forms' ); ?></label>
												<input type="email" id="reply_to_<?php echo esc_attr( (string) $entry['id'] ); ?>" class="regular-text klyna-forms-reply__to" value="<?php echo esc_attr( (string) ( $reply['to_email'] ?? '' ) ); ?>">
											</p>
											<p class="klyna-forms-field-block">
												<label class="klyna-forms-mini-label" for="reply_subj_<?php echo esc_attr( (string) $entry['id'] ); ?>"><?php esc_html_e( 'Subject', 'wp-forms' ); ?></label>
												<input type="text" id="reply_subj_<?php echo esc_attr( (string) $entry['id'] ); ?>" class="regular-text klyna-forms-reply__subject" value="<?php echo esc_attr( (string) ( $reply['subject'] ?? '' ) ); ?>">
											</p>
											<p class="klyna-forms-field-block">
												<label class="klyna-forms-mini-label" for="reply_body_<?php echo esc_attr( (string) $entry['id'] ); ?>"><?php esc_html_e( 'Message', 'wp-forms' ); ?></label>
												<textarea id="reply_body_<?php echo esc_attr( (string) $entry['id'] ); ?>" rows="6" class="large-text klyna-forms-reply__body-text"><?php echo esc_textarea( (string) ( $reply['body'] ?? '' ) ); ?></textarea>
											</p>
											<p>
												<?php if ( $ai_available ) : ?>
													<button type="button" class="button klyna-forms-reply__generate"><?php echo $reply ? esc_html__( 'Regenerate draft', 'wp-forms' ) : esc_html__( 'Generate draft', 'wp-forms' ); ?></button>
												<?php endif; ?>
												<button type="button" class="button klyna-forms-reply__save" <?php disabled( ! $reply ); ?>><?php esc_html_e( 'Save edits', 'wp-forms' ); ?></button>
												<button type="button" class="button button-primary klyna-forms-reply__send" <?php disabled( ! $reply || 'sent' === ( $reply['status'] ?? '' ) ); ?>><?php esc_html_e( 'Edit + send', 'wp-forms' ); ?></button>
												<span class="klyna-forms-reply__status description" style="margin-left:8px;"></span>
											</p>
										</div>
									</details>
								</td>
							</tr>
						<?php endforeach; ?>
					</tbody>
				</table>

				<?php if ( $pages > 1 ) : ?>
					<div class="tablenav"><div class="tablenav-pages">
						<?php
						echo wp_kses_post(
							paginate_links(
								array(
									'base'      => add_query_arg( 'paged', '%#%', admin_url( 'admin.php?page=wp-forms-entries&form_id=' . $form_id ) ),
									'format'    => '',
									'current'   => $paged,
									'total'     => $pages,
									'prev_text' => '‹',
									'next_text' => '›',
								)
							)
						);
						?>
					</div></div>
				<?php endif; ?>
			<?php endif; ?>
		</div>
		<?php
	}

	public function render_settings(): void {
		$settings = wp_parse_args(
			Plugin::settings(),
			array(
				'notify_enabled'    => true,
				'notify_to'         => get_option( 'admin_email' ),
				'notify_subject'    => __( 'New form submission: {form_title}', 'wp-forms' ),
				'from_name'         => get_bloginfo( 'name' ),
				'from_email'        => get_option( 'admin_email' ),
				'honeypot_enabled'  => true,
				'time_trap_enabled' => true,
				'time_trap_seconds' => 3,
				'store_entries'     => true,
				'store_ip'          => true,
			)
		);
		$settings = wp_parse_args(
			$settings,
			array(
				'ai_provider'   => 'off',
				'ai_api_key'    => '',
				'ai_model'      => '',
				'ai_endpoint'   => '',
				'ai_daily_cap'  => 100,
			)
		);
		$key       = KLYNA_FORMS_OPTION_KEY;
		$providers = array(
			'off'        => __( 'Off — no AI features', 'wp-forms' ),
			'openrouter' => 'OpenRouter (free models)',
			'groq'       => 'Groq (fast & free)',
			'gemini'     => 'Google Gemini',
			'cloudflare' => 'Cloudflare Workers AI',
			'ollama'     => 'Ollama (self-hosted)',
		);
		?>
		<div class="wrap klyna-forms-wrap">
			<h1><?php esc_html_e( 'Klyna Forms settings', 'wp-forms' ); ?></h1>
			<form method="post" action="options.php">
				<?php settings_fields( 'wp_forms_settings_group' ); ?>

				<h2><?php esc_html_e( 'Notifications', 'wp-forms' ); ?></h2>
				<table class="form-table" role="presentation">
					<tbody>
						<tr>
							<th scope="row"><?php esc_html_e( 'Email notifications', 'wp-forms' ); ?></th>
							<td>
								<label>
									<input type="checkbox" name="<?php echo esc_attr( $key ); ?>[notify_enabled]" value="1" <?php checked( ! empty( $settings['notify_enabled'] ) ); ?>>
									<?php esc_html_e( 'Email an admin when a form is submitted', 'wp-forms' ); ?>
								</label>
							</td>
						</tr>
						<tr>
							<th scope="row"><label for="notify_to"><?php esc_html_e( 'Default recipient(s)', 'wp-forms' ); ?></label></th>
							<td>
								<input type="text" id="notify_to" name="<?php echo esc_attr( $key ); ?>[notify_to]" class="regular-text" value="<?php echo esc_attr( (string) $settings['notify_to'] ); ?>">
								<p class="description"><?php esc_html_e( 'Comma-separated. A form can override this with its own recipient.', 'wp-forms' ); ?></p>
							</td>
						</tr>
						<tr>
							<th scope="row"><label for="notify_subject"><?php esc_html_e( 'Subject line', 'wp-forms' ); ?></label></th>
							<td>
								<input type="text" id="notify_subject" name="<?php echo esc_attr( $key ); ?>[notify_subject]" class="large-text" value="<?php echo esc_attr( (string) $settings['notify_subject'] ); ?>">
								<p class="description"><?php esc_html_e( 'Use {form_title} as a placeholder.', 'wp-forms' ); ?></p>
							</td>
						</tr>
						<tr>
							<th scope="row"><label for="from_name"><?php esc_html_e( 'From name', 'wp-forms' ); ?></label></th>
							<td><input type="text" id="from_name" name="<?php echo esc_attr( $key ); ?>[from_name]" class="regular-text" value="<?php echo esc_attr( (string) $settings['from_name'] ); ?>"></td>
						</tr>
						<tr>
							<th scope="row"><label for="from_email"><?php esc_html_e( 'From email', 'wp-forms' ); ?></label></th>
							<td><input type="email" id="from_email" name="<?php echo esc_attr( $key ); ?>[from_email]" class="regular-text" value="<?php echo esc_attr( (string) $settings['from_email'] ); ?>"></td>
						</tr>
					</tbody>
				</table>

				<h2><?php esc_html_e( 'Spam protection', 'wp-forms' ); ?></h2>
				<table class="form-table" role="presentation">
					<tbody>
						<tr>
							<th scope="row"><?php esc_html_e( 'Honeypot', 'wp-forms' ); ?></th>
							<td>
								<label>
									<input type="checkbox" name="<?php echo esc_attr( $key ); ?>[honeypot_enabled]" value="1" <?php checked( ! empty( $settings['honeypot_enabled'] ) ); ?>>
									<?php esc_html_e( 'Add an invisible honeypot field bots fill in', 'wp-forms' ); ?>
								</label>
							</td>
						</tr>
						<tr>
							<th scope="row"><?php esc_html_e( 'Time-trap', 'wp-forms' ); ?></th>
							<td>
								<label>
									<input type="checkbox" name="<?php echo esc_attr( $key ); ?>[time_trap_enabled]" value="1" <?php checked( ! empty( $settings['time_trap_enabled'] ) ); ?>>
									<?php esc_html_e( 'Reject submissions sent faster than a human could fill the form', 'wp-forms' ); ?>
								</label>
								<p class="klyna-forms-inline-field">
									<label for="time_trap_seconds"><?php esc_html_e( 'Minimum seconds:', 'wp-forms' ); ?></label>
									<input type="number" id="time_trap_seconds" name="<?php echo esc_attr( $key ); ?>[time_trap_seconds]" min="0" max="60" value="<?php echo esc_attr( (string) $settings['time_trap_seconds'] ); ?>" class="small-text">
								</p>
							</td>
						</tr>
					</tbody>
				</table>

				<h2><?php esc_html_e( 'Storage & privacy', 'wp-forms' ); ?></h2>
				<table class="form-table" role="presentation">
					<tbody>
						<tr>
							<th scope="row"><?php esc_html_e( 'Store entries', 'wp-forms' ); ?></th>
							<td>
								<label>
									<input type="checkbox" name="<?php echo esc_attr( $key ); ?>[store_entries]" value="1" <?php checked( ! empty( $settings['store_entries'] ) ); ?>>
									<?php esc_html_e( 'Save every submission to the database', 'wp-forms' ); ?>
								</label>
							</td>
						</tr>
						<tr>
							<th scope="row"><?php esc_html_e( 'Store IP address', 'wp-forms' ); ?></th>
							<td>
								<label>
									<input type="checkbox" name="<?php echo esc_attr( $key ); ?>[store_ip]" value="1" <?php checked( ! empty( $settings['store_ip'] ) ); ?>>
									<?php esc_html_e( 'Record the submitter IP with each entry', 'wp-forms' ); ?>
								</label>
							</td>
						</tr>
					</tbody>
				</table>

				<h2><?php esc_html_e( 'AI assistant', 'wp-forms' ); ?></h2>
				<p class="description"><?php esc_html_e( 'Powers AI auto-reply drafts on submissions. Bring your own key. Defaults to Off — the plugin works without AI.', 'wp-forms' ); ?></p>
				<table class="form-table" role="presentation">
					<tbody>
						<tr>
							<th scope="row"><label for="ai_provider"><?php esc_html_e( 'Provider', 'wp-forms' ); ?></label></th>
							<td>
								<select id="ai_provider" name="<?php echo esc_attr( $key ); ?>[ai_provider]">
									<?php foreach ( $providers as $value => $label ) : ?>
										<option value="<?php echo esc_attr( $value ); ?>" <?php selected( $settings['ai_provider'], $value ); ?>><?php echo esc_html( $label ); ?></option>
									<?php endforeach; ?>
								</select>
							</td>
						</tr>
						<tr>
							<th scope="row"><label for="ai_api_key"><?php esc_html_e( 'API key', 'wp-forms' ); ?></label></th>
							<td>
								<?php
								$kf_key    = (string) ( $settings['ai_api_key'] ?? '' );
								$kf_has    = ! empty( $kf_key );
								$kf_masked = $kf_has ? str_repeat( "\xE2\x80\xA2", 4 ) . ' ' . substr( $kf_key, -4 ) : '';
								?>
								<?php if ( $kf_has ) : ?>
									<div id="kf-ai-key-display">
										<code style="padding:4px 8px;background:#f0f0f1;border-radius:3px;"><?php echo esc_html( $kf_masked ); ?></code>
										<button type="button" class="button button-secondary" id="kf-ai-key-replace" style="margin-left:8px;"><?php esc_html_e( 'Replace key', 'wp-forms' ); ?></button>
									</div>
									<input type="hidden" name="<?php echo esc_attr( $key ); ?>[ai_api_key_keep]" value="1">
									<input type="password" id="ai_api_key" name="<?php echo esc_attr( $key ); ?>[ai_api_key]" class="regular-text" value="" autocomplete="new-password" style="display:none;margin-top:8px;">
									<script>
									(function(){
										var btn=document.getElementById('kf-ai-key-replace');
										var inp=document.getElementById('ai_api_key');
										var disp=document.getElementById('kf-ai-key-display');
										if(btn&&inp&&disp){btn.addEventListener('click',function(){inp.style.display='';inp.focus();disp.style.display='none';});}
									})();
									</script>
								<?php else : ?>
									<input type="password" id="ai_api_key" name="<?php echo esc_attr( $key ); ?>[ai_api_key]" class="regular-text" value="" autocomplete="new-password">
								<?php endif; ?>
								<p class="description"><?php esc_html_e( 'Stored in the WordPress options table. Free-tier keys are fine.', 'wp-forms' ); ?></p>
							</td>
						</tr>
						<tr>
							<th scope="row"><label for="ai_model"><?php esc_html_e( 'Model', 'wp-forms' ); ?></label></th>
							<td>
								<input type="text" id="ai_model" name="<?php echo esc_attr( $key ); ?>[ai_model]" class="regular-text" value="<?php echo esc_attr( (string) $settings['ai_model'] ); ?>" placeholder="<?php esc_attr_e( 'Leave blank for the provider default', 'wp-forms' ); ?>">
								<p class="description"><?php esc_html_e( 'OpenRouter: meta-llama/llama-3.3-70b-instruct:free. Groq: llama-3.3-70b-versatile. Gemini: gemini-2.0-flash. Cloudflare: @cf/meta/llama-3.1-8b-instruct. Ollama: llama3.2.', 'wp-forms' ); ?></p>
							</td>
						</tr>
						<tr>
							<th scope="row"><label for="ai_endpoint"><?php esc_html_e( 'Endpoint / Account ID', 'wp-forms' ); ?></label></th>
							<td>
								<input type="text" id="ai_endpoint" name="<?php echo esc_attr( $key ); ?>[ai_endpoint]" class="regular-text" value="<?php echo esc_attr( (string) $settings['ai_endpoint'] ); ?>" placeholder="<?php esc_attr_e( 'Cloudflare Account ID or Ollama URL', 'wp-forms' ); ?>">
							</td>
						</tr>
						<tr>
							<th scope="row"><label for="ai_daily_cap"><?php esc_html_e( 'Daily call cap', 'wp-forms' ); ?></label></th>
							<td>
								<input type="number" id="ai_daily_cap" name="<?php echo esc_attr( $key ); ?>[ai_daily_cap]" value="<?php echo esc_attr( (string) $settings['ai_daily_cap'] ); ?>" min="1" max="10000" class="small-text">
								<p class="description"><?php esc_html_e( 'Safety net so a hot inbox does not burn through your free-tier quota.', 'wp-forms' ); ?></p>
							</td>
						</tr>
						<tr>
							<th scope="row"><?php esc_html_e( 'Connection', 'wp-forms' ); ?></th>
							<td>
								<button type="button" class="button" id="klyna-forms-ai-test"><?php esc_html_e( 'Test connection', 'wp-forms' ); ?></button>
								<span id="klyna-forms-ai-test-result" class="description" style="margin-left:8px;"></span>
							</td>
						</tr>
					</tbody>
				</table>

				<?php submit_button(); ?>
			</form>
			<?php \KlynaForms\Telemetry::render_form(); ?>

		</div>
		<?php
	}

	/**
	 * @param string[] $links Existing action links.
	 * @return string[]
	 */
	public function add_settings_link( array $links ): array {
		$url   = admin_url( 'admin.php?page=wp-forms-settings' );
		$label = __( 'Settings', 'wp-forms' );
		$first = sprintf( '<a href="%s">%s</a>', esc_url( $url ), esc_html( $label ) );
		array_unshift( $links, $first );
		return $links;
	}
}
