<?php
/**
 * Popup custom post type + per-popup configuration meta.
 *
 * Each popup is a `klyna_popup` post. The post content holds the popup body
 * (HTML), and a single serialized meta key (`_klyna_popup_config`) holds the
 * design controls, trigger config, and display rules. One meta blob keeps the
 * REST round-trip simple and mirrors the single-option settings pattern used by
 * the rest of the Klyna toolkit.
 *
 * @package KlynaPopups
 */

namespace KlynaPopups;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Popups {

	public const POST_TYPE = 'klyna_popup';
	public const META_KEY  = '_klyna_popup_config';

	public function register(): void {
		add_action( 'init', array( __CLASS__, 'register_post_type' ) );
		add_action( 'add_meta_boxes', array( $this, 'register_meta_box' ) );
		add_action( 'save_post_' . self::POST_TYPE, array( $this, 'save_meta' ), 10, 2 );
		add_filter( 'manage_' . self::POST_TYPE . '_posts_columns', array( $this, 'columns' ) );
		add_action( 'manage_' . self::POST_TYPE . '_posts_custom_column', array( $this, 'column_value' ), 10, 2 );
	}

	/**
	 * Register the popup post type. Static so the activation hook can call it
	 * before the orchestrator has booted.
	 */
	public static function register_post_type(): void {
		register_post_type(
			self::POST_TYPE,
			array(
				'labels'              => array(
					'name'               => __( 'Popups', 'wp-popups' ),
					'singular_name'      => __( 'Popup', 'wp-popups' ),
					'add_new'            => __( 'Add popup', 'wp-popups' ),
					'add_new_item'       => __( 'Add new popup', 'wp-popups' ),
					'edit_item'          => __( 'Edit popup', 'wp-popups' ),
					'new_item'           => __( 'New popup', 'wp-popups' ),
					'view_item'          => __( 'View popup', 'wp-popups' ),
					'search_items'       => __( 'Search popups', 'wp-popups' ),
					'not_found'          => __( 'No popups yet.', 'wp-popups' ),
					'not_found_in_trash' => __( 'No popups in trash.', 'wp-popups' ),
					'menu_name'          => __( 'Klyna Popups', 'wp-popups' ),
				),
				'public'              => false,
				'show_ui'             => true,
				'show_in_menu'        => false, // Surfaced under the Klyna Popups top-level menu instead.
				'show_in_rest'        => false,
				'exclude_from_search' => true,
				'publicly_queryable'  => false,
				'rewrite'             => false,
				'query_var'           => false,
				'supports'            => array( 'title', 'editor', 'author' ),
				'capability_type'     => 'post',
				'map_meta_cap'        => true,
			)
		);
	}

	/**
	 * Hardened default config for a brand-new popup.
	 *
	 * @return array<string,mixed>
	 */
	public static function default_config(): array {
		return array(
			'status'           => 'active',
			// Design.
			'position'         => 'center',
			'animation'        => 'fade',
			'theme'            => 'dark',
			'width'            => 460,
			'show_overlay'     => true,
			'show_close'       => true,
			'headline'         => __( 'Join the list', 'wp-popups' ),
			'subhead'          => __( 'Get the good stuff in your inbox.', 'wp-popups' ),
			'button_label'     => __( 'Subscribe', 'wp-popups' ),
			'collect_name'     => false,
			'image_url'        => '',
			// Trigger.
			'trigger'          => 'time',       // time | scroll | exit | click.
			'trigger_seconds'  => 5,
			'trigger_scroll'   => 50,           // Percent.
			'trigger_selector' => '',           // CSS selector for click trigger.
			// Display rules.
			'rule_paths'       => '',           // One URL path glob per line; empty = everywhere.
			'rule_exclude'     => '',           // Paths to never show on.
			'rule_devices'     => array( 'desktop', 'mobile' ),
			'rule_audience'    => 'all',        // all | new | returning.
			'frequency'        => 'session',    // always | session | once | days.
			'frequency_days'   => 7,
		);
	}

	/**
	 * Read and normalize a popup's config, applying defaults for missing keys.
	 *
	 * @param int $post_id Popup post ID.
	 * @return array<string,mixed>
	 */
	public static function config( int $post_id ): array {
		$raw = get_post_meta( $post_id, self::META_KEY, true );
		$raw = is_array( $raw ) ? $raw : array();
		return self::sanitize_config( wp_parse_args( $raw, self::default_config() ) );
	}

	/**
	 * Sanitize a config array. Used on save (defense in depth) and on read.
	 *
	 * @param array<string,mixed> $input Raw config.
	 * @return array<string,mixed>
	 */
	public static function sanitize_config( array $input ): array {
		$defaults = self::default_config();
		$out      = array();

		$enums = array(
			'status'    => array( 'active', 'paused' ),
			'position'  => array( 'center', 'top', 'bottom', 'corner', 'bar' ),
			'animation' => array( 'fade', 'slide', 'none' ),
			'theme'     => array( 'dark', 'light' ),
			'trigger'   => array( 'time', 'scroll', 'exit', 'click' ),
			'audience'  => array( 'all', 'new', 'returning' ),
			'frequency' => array( 'always', 'session', 'once', 'days' ),
		);
		$out['status']        = self::pick( $input['status'] ?? '', $enums['status'], $defaults['status'] );
		$out['position']      = self::pick( $input['position'] ?? '', $enums['position'], $defaults['position'] );
		$out['animation']     = self::pick( $input['animation'] ?? '', $enums['animation'], $defaults['animation'] );
		$out['theme']         = self::pick( $input['theme'] ?? '', $enums['theme'], $defaults['theme'] );
		$out['trigger']       = self::pick( $input['trigger'] ?? '', $enums['trigger'], $defaults['trigger'] );
		$out['rule_audience'] = self::pick( $input['rule_audience'] ?? '', $enums['audience'], $defaults['rule_audience'] );
		$out['frequency']     = self::pick( $input['frequency'] ?? '', $enums['frequency'], $defaults['frequency'] );

		$out['width']           = max( 280, min( 720, (int) ( $input['width'] ?? $defaults['width'] ) ) );
		$out['trigger_seconds'] = max( 0, min( 600, (int) ( $input['trigger_seconds'] ?? $defaults['trigger_seconds'] ) ) );
		$out['trigger_scroll']  = max( 1, min( 100, (int) ( $input['trigger_scroll'] ?? $defaults['trigger_scroll'] ) ) );
		$out['frequency_days']  = max( 1, min( 365, (int) ( $input['frequency_days'] ?? $defaults['frequency_days'] ) ) );

		$out['show_overlay'] = ! empty( $input['show_overlay'] );
		$out['show_close']   = ! empty( $input['show_close'] );
		$out['collect_name'] = ! empty( $input['collect_name'] );

		$out['headline']     = sanitize_text_field( (string) ( $input['headline'] ?? '' ) );
		$out['subhead']      = sanitize_text_field( (string) ( $input['subhead'] ?? '' ) );
		$out['button_label'] = sanitize_text_field( (string) ( $input['button_label'] ?? '' ) );
		$out['image_url']    = esc_url_raw( (string) ( $input['image_url'] ?? '' ) );

		$out['trigger_selector'] = self::sanitize_selector( (string) ( $input['trigger_selector'] ?? '' ) );
		$out['rule_paths']       = self::sanitize_paths( (string) ( $input['rule_paths'] ?? '' ) );
		$out['rule_exclude']     = self::sanitize_paths( (string) ( $input['rule_exclude'] ?? '' ) );

		$devices            = (array) ( $input['rule_devices'] ?? $defaults['rule_devices'] );
		$out['rule_devices'] = array_values(
			array_intersect( array( 'desktop', 'mobile' ), array_map( 'sanitize_key', $devices ) )
		);
		if ( empty( $out['rule_devices'] ) ) {
			$out['rule_devices'] = array( 'desktop', 'mobile' );
		}

		return $out;
	}

	/**
	 * Restrict a value to a known set, falling back to a default.
	 *
	 * @param mixed    $value    Candidate value.
	 * @param string[] $allowed  Allowed values.
	 * @param string   $fallback Fallback value.
	 */
	private static function pick( $value, array $allowed, string $fallback ): string {
		$value = sanitize_key( (string) $value );
		return in_array( $value, $allowed, true ) ? $value : $fallback;
	}

	/**
	 * Allow only a conservative subset of CSS-selector characters.
	 */
	private static function sanitize_selector( string $raw ): string {
		$raw = trim( $raw );
		if ( '' === $raw ) {
			return '';
		}
		return (string) preg_replace( '/[^a-zA-Z0-9 _.#>\-\[\]="\':()]/', '', $raw );
	}

	/**
	 * Sanitize a newline-separated list of URL path globs.
	 */
	private static function sanitize_paths( string $raw ): string {
		$lines = preg_split( '/[\r\n]+/', $raw );
		if ( ! is_array( $lines ) ) {
			return '';
		}
		$clean = array();
		foreach ( $lines as $line ) {
			$line = trim( $line );
			if ( '' === $line ) {
				continue;
			}
			// Keep path-ish characters and a leading glob.
			$clean[] = (string) preg_replace( '/[^a-zA-Z0-9_\-\/*.?]/', '', $line );
		}
		return implode( "\n", array_filter( $clean ) );
	}

	/**
	 * Render the configuration meta box on the popup editor.
	 */
	public function register_meta_box(): void {
		add_meta_box(
			'klyna-popup-config',
			__( 'Popup settings', 'wp-popups' ),
			array( $this, 'render_meta_box' ),
			self::POST_TYPE,
			'normal',
			'high'
		);
	}

	public function render_meta_box( \WP_Post $post ): void {
		$config = self::config( $post->ID );
		wp_nonce_field( 'klyna_popup_config', 'klyna_popup_config_nonce' );
		$stats = Entries::stats_for( $post->ID );
		?>
		<div class="klyna-wrap klyna-metabox">
			<p class="klyna-metabox-stats">
				<?php
				printf(
					/* translators: 1: impressions, 2: conversions, 3: conversion rate. */
					esc_html__( '%1$s impressions · %2$s conversions · %3$s%% conversion rate', 'wp-popups' ),
					'<strong>' . esc_html( number_format_i18n( $stats['impressions'] ) ) . '</strong>',
					'<strong>' . esc_html( number_format_i18n( $stats['conversions'] ) ) . '</strong>',
					'<strong>' . esc_html( $stats['rate'] ) . '</strong>'
				);
				?>
			</p>
			<p class="description">
				<?php esc_html_e( 'The popup body uses the editor above. Configure design, triggers, and display rules here.', 'wp-popups' ); ?>
			</p>

			<table class="form-table klyna-metabox-table" role="presentation">
				<tbody>
					<tr>
						<th scope="row"><?php esc_html_e( 'Status', 'wp-popups' ); ?></th>
						<td>
							<?php
							$this->select(
								'status',
								$config['status'],
								array(
									'active' => __( 'Active', 'wp-popups' ),
									'paused' => __( 'Paused', 'wp-popups' ),
								)
							);
							?>
						</td>
					</tr>
					<tr>
						<th scope="row"><?php esc_html_e( 'Trigger', 'wp-popups' ); ?></th>
						<td>
							<?php
							$this->select(
								'trigger',
								$config['trigger'],
								array(
									'time'   => __( 'After a delay', 'wp-popups' ),
									'scroll' => __( 'On scroll depth', 'wp-popups' ),
									'exit'   => __( 'On exit intent', 'wp-popups' ),
									'click'  => __( 'On click of element', 'wp-popups' ),
								)
							);
							?>
							<p class="klyna-trigger-field" data-when="time">
								<label><?php esc_html_e( 'Delay (seconds)', 'wp-popups' ); ?>
									<input type="number" min="0" max="600" name="klyna_config[trigger_seconds]" value="<?php echo esc_attr( (string) $config['trigger_seconds'] ); ?>">
								</label>
							</p>
							<p class="klyna-trigger-field" data-when="scroll">
								<label><?php esc_html_e( 'Scroll depth (%)', 'wp-popups' ); ?>
									<input type="number" min="1" max="100" name="klyna_config[trigger_scroll]" value="<?php echo esc_attr( (string) $config['trigger_scroll'] ); ?>">
								</label>
							</p>
							<p class="klyna-trigger-field" data-when="click">
								<label><?php esc_html_e( 'Element selector', 'wp-popups' ); ?>
									<input type="text" class="regular-text" name="klyna_config[trigger_selector]" value="<?php echo esc_attr( $config['trigger_selector'] ); ?>" placeholder="#offer-button">
								</label>
							</p>
						</td>
					</tr>
					<tr>
						<th scope="row"><?php esc_html_e( 'Design', 'wp-popups' ); ?></th>
						<td>
							<label class="klyna-inline"><?php esc_html_e( 'Position', 'wp-popups' ); ?>
								<?php
								$this->select(
									'position',
									$config['position'],
									array(
										'center' => __( 'Center modal', 'wp-popups' ),
										'top'    => __( 'Top slide-in', 'wp-popups' ),
										'bottom' => __( 'Bottom slide-in', 'wp-popups' ),
										'corner' => __( 'Bottom-right corner', 'wp-popups' ),
										'bar'    => __( 'Full-width bar', 'wp-popups' ),
									)
								);
								?>
							</label>
							<label class="klyna-inline"><?php esc_html_e( 'Animation', 'wp-popups' ); ?>
								<?php
								$this->select(
									'animation',
									$config['animation'],
									array(
										'fade'  => __( 'Fade', 'wp-popups' ),
										'slide' => __( 'Slide', 'wp-popups' ),
										'none'  => __( 'None', 'wp-popups' ),
									)
								);
								?>
							</label>
							<label class="klyna-inline"><?php esc_html_e( 'Theme', 'wp-popups' ); ?>
								<?php
								$this->select(
									'theme',
									$config['theme'],
									array(
										'dark'  => __( 'Dark', 'wp-popups' ),
										'light' => __( 'Light', 'wp-popups' ),
									)
								);
								?>
							</label>
							<label class="klyna-inline"><?php esc_html_e( 'Width (px)', 'wp-popups' ); ?>
								<input type="number" min="280" max="720" name="klyna_config[width]" value="<?php echo esc_attr( (string) $config['width'] ); ?>">
							</label>
							<br>
							<label class="klyna-check"><input type="checkbox" name="klyna_config[show_overlay]" value="1" <?php checked( $config['show_overlay'] ); ?>> <?php esc_html_e( 'Dim background overlay', 'wp-popups' ); ?></label>
							<label class="klyna-check"><input type="checkbox" name="klyna_config[show_close]" value="1" <?php checked( $config['show_close'] ); ?>> <?php esc_html_e( 'Show close button', 'wp-popups' ); ?></label>
							<label class="klyna-check"><input type="checkbox" name="klyna_config[collect_name]" value="1" <?php checked( $config['collect_name'] ); ?>> <?php esc_html_e( 'Collect a name field', 'wp-popups' ); ?></label>
						</td>
					</tr>
					<tr>
						<th scope="row"><?php esc_html_e( 'Copy', 'wp-popups' ); ?></th>
						<td>
							<label class="klyna-block"><?php esc_html_e( 'Headline', 'wp-popups' ); ?>
								<input type="text" class="large-text" name="klyna_config[headline]" value="<?php echo esc_attr( $config['headline'] ); ?>">
							</label>
							<label class="klyna-block"><?php esc_html_e( 'Subheadline', 'wp-popups' ); ?>
								<input type="text" class="large-text" name="klyna_config[subhead]" value="<?php echo esc_attr( $config['subhead'] ); ?>">
							</label>
							<label class="klyna-block"><?php esc_html_e( 'Button label', 'wp-popups' ); ?>
								<input type="text" class="regular-text" name="klyna_config[button_label]" value="<?php echo esc_attr( $config['button_label'] ); ?>">
							</label>
							<label class="klyna-block"><?php esc_html_e( 'Image URL (optional)', 'wp-popups' ); ?>
								<input type="url" class="large-text" name="klyna_config[image_url]" value="<?php echo esc_attr( $config['image_url'] ); ?>" placeholder="https://...">
							</label>
						</td>
					</tr>
					<tr>
						<th scope="row"><?php esc_html_e( 'Display rules', 'wp-popups' ); ?></th>
						<td>
							<label class="klyna-block"><?php esc_html_e( 'Show only on these paths (one per line, * wildcard). Empty = everywhere.', 'wp-popups' ); ?>
								<textarea name="klyna_config[rule_paths]" rows="3" class="large-text" placeholder="/blog/*&#10;/pricing"><?php echo esc_textarea( $config['rule_paths'] ); ?></textarea>
							</label>
							<label class="klyna-block"><?php esc_html_e( 'Never show on these paths', 'wp-popups' ); ?>
								<textarea name="klyna_config[rule_exclude]" rows="2" class="large-text" placeholder="/checkout/*"><?php echo esc_textarea( $config['rule_exclude'] ); ?></textarea>
							</label>
							<span class="klyna-block"><?php esc_html_e( 'Devices', 'wp-popups' ); ?></span>
							<label class="klyna-check"><input type="checkbox" name="klyna_config[rule_devices][]" value="desktop" <?php checked( in_array( 'desktop', $config['rule_devices'], true ) ); ?>> <?php esc_html_e( 'Desktop', 'wp-popups' ); ?></label>
							<label class="klyna-check"><input type="checkbox" name="klyna_config[rule_devices][]" value="mobile" <?php checked( in_array( 'mobile', $config['rule_devices'], true ) ); ?>> <?php esc_html_e( 'Mobile', 'wp-popups' ); ?></label>
							<br>
							<label class="klyna-inline"><?php esc_html_e( 'Audience', 'wp-popups' ); ?>
								<?php
								$this->select(
									'rule_audience',
									$config['rule_audience'],
									array(
										'all'       => __( 'Everyone', 'wp-popups' ),
										'new'       => __( 'New visitors', 'wp-popups' ),
										'returning' => __( 'Returning visitors', 'wp-popups' ),
									)
								);
								?>
							</label>
							<label class="klyna-inline"><?php esc_html_e( 'Frequency cap', 'wp-popups' ); ?>
								<?php
								$this->select(
									'frequency',
									$config['frequency'],
									array(
										'always'  => __( 'Every page view', 'wp-popups' ),
										'session' => __( 'Once per session', 'wp-popups' ),
										'once'    => __( 'Once, ever', 'wp-popups' ),
										'days'    => __( 'Once every N days', 'wp-popups' ),
									)
								);
								?>
							</label>
							<label class="klyna-inline klyna-freq-days"><?php esc_html_e( 'Days', 'wp-popups' ); ?>
								<input type="number" min="1" max="365" name="klyna_config[frequency_days]" value="<?php echo esc_attr( (string) $config['frequency_days'] ); ?>">
							</label>
						</td>
					</tr>
				</tbody>
			</table>
		</div>
		<?php
	}

	/**
	 * Render a <select> bound to a klyna_config[...] field.
	 *
	 * @param string                $key      Config key.
	 * @param string                $current  Current value.
	 * @param array<string,string>  $options  Value => label map.
	 */
	private function select( string $key, string $current, array $options ): void {
		printf( '<select name="klyna_config[%s]">', esc_attr( $key ) );
		foreach ( $options as $value => $label ) {
			printf(
				'<option value="%1$s" %2$s>%3$s</option>',
				esc_attr( $value ),
				selected( $current, $value, false ),
				esc_html( $label )
			);
		}
		echo '</select>';
	}

	/**
	 * Persist the config meta on save. Capability + nonce checked.
	 *
	 * @param int      $post_id Post ID.
	 * @param \WP_Post $post    Post object.
	 */
	public function save_meta( int $post_id, \WP_Post $post ): void {
		if ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) {
			return;
		}
		if ( ! isset( $_POST['klyna_popup_config_nonce'] ) ) {
			return;
		}
		$nonce = sanitize_text_field( wp_unslash( (string) $_POST['klyna_popup_config_nonce'] ) );
		if ( ! wp_verify_nonce( $nonce, 'klyna_popup_config' ) ) {
			return;
		}
		if ( ! current_user_can( 'edit_post', $post_id ) ) {
			return;
		}

		$raw = isset( $_POST['klyna_config'] ) && is_array( $_POST['klyna_config'] )
			? wp_unslash( $_POST['klyna_config'] ) // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- sanitized in sanitize_config().
			: array();

		update_post_meta( $post_id, self::META_KEY, self::sanitize_config( $raw ) );
	}

	/**
	 * Add stats columns to the popup list table.
	 *
	 * @param array<string,string> $columns Existing columns.
	 * @return array<string,string>
	 */
	public function columns( array $columns ): array {
		$out = array();
		foreach ( $columns as $key => $label ) {
			$out[ $key ] = $label;
			if ( 'title' === $key ) {
				$out['klyna_trigger']     = __( 'Trigger', 'wp-popups' );
				$out['klyna_impressions'] = __( 'Impressions', 'wp-popups' );
				$out['klyna_conversions'] = __( 'Conversions', 'wp-popups' );
				$out['klyna_status']      = __( 'Status', 'wp-popups' );
			}
		}
		return $out;
	}

	/**
	 * Render custom column values.
	 *
	 * @param string $column  Column key.
	 * @param int    $post_id Post ID.
	 */
	public function column_value( string $column, int $post_id ): void {
		$config = self::config( $post_id );
		switch ( $column ) {
			case 'klyna_trigger':
				echo esc_html( ucfirst( $config['trigger'] ) );
				break;
			case 'klyna_impressions':
				echo esc_html( number_format_i18n( Entries::impressions_for( $post_id ) ) );
				break;
			case 'klyna_conversions':
				echo esc_html( number_format_i18n( Entries::conversions_for( $post_id ) ) );
				break;
			case 'klyna_status':
				$label = 'active' === $config['status'] ? __( 'Active', 'wp-popups' ) : __( 'Paused', 'wp-popups' );
				printf( '<span class="klyna-pill klyna-pill-%s">%s</span>', esc_attr( $config['status'] ), esc_html( $label ) );
				break;
		}
	}
}
