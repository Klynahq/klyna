<?php
/**
 * Admin UI — dashboard, bookings list, availability + settings.
 *
 * Mirrors the Klyna admin pattern: a top-level menu with the brand mark, a
 * dark/violet themed surface, and the Settings API for persistence. The
 * bookings list is rendered server-side and enhanced by `admin.js`, which
 * talks to the REST routes to change status without a page reload.
 *
 * @package KlynaBooking
 */

namespace KlynaBooking;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Admin {

	private const MENU_SLUG = 'wp-booking';

	public function register(): void {
		add_action( 'admin_menu', array( $this, 'register_menu' ) );
		add_action( 'admin_init', array( $this, 'register_settings' ) );
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue_assets' ) );
		add_filter(
			'plugin_action_links_' . plugin_basename( KLYNA_BOOKING_PLUGIN_FILE ),
			array( $this, 'add_settings_link' )
		);
	}

	public function register_menu(): void {
		add_menu_page(
			__( 'Klyna Booking', 'wp-booking' ),
			__( 'Booking', 'wp-booking' ),
			'manage_options',
			self::MENU_SLUG,
			array( $this, 'render_dashboard' ),
			'data:image/svg+xml;base64,' . base64_encode(
				'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#a7aaad"><rect x="3" y="4" width="18" height="17" rx="3"/><path d="M3 9h18M8 2v4M16 2v4" stroke="#a7aaad" stroke-width="1.6" stroke-linecap="round"/><path d="M8.5 14.5l2.2 2.2 4.3-4.3" stroke="#1d2327" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>'
			),
			26
		);
		add_submenu_page(
			self::MENU_SLUG,
			__( 'Bookings', 'wp-booking' ),
			__( 'Bookings', 'wp-booking' ),
			'manage_options',
			self::MENU_SLUG,
			array( $this, 'render_dashboard' )
		);
		add_submenu_page(
			self::MENU_SLUG,
			__( 'Availability', 'wp-booking' ),
			__( 'Availability', 'wp-booking' ),
			'manage_options',
			'wp-booking-availability',
			array( $this, 'render_availability' )
		);
		add_submenu_page(
			self::MENU_SLUG,
			__( 'Settings', 'wp-booking' ),
			__( 'Settings', 'wp-booking' ),
			'manage_options',
			'wp-booking-settings',
			array( $this, 'render_settings' )
		);
	}

	public function register_settings(): void {
		register_setting(
			'wp_booking_settings_group',
			KLYNA_BOOKING_OPTION_KEY,
			array(
				'type'              => 'array',
				'sanitize_callback' => array( $this, 'sanitize_settings' ),
				'default'           => Plugin::defaults(),
			)
		);
	}

	/**
	 * @param mixed $input
	 * @return array<string,mixed>
	 */
	public function sanitize_settings( $input ): array {
		$input    = is_array( $input ) ? $input : array();
		$existing = Plugin::settings();
		$out      = $existing;

		if ( isset( $input['business_name'] ) ) {
			$out['business_name'] = sanitize_text_field( (string) $input['business_name'] );
		}
		if ( isset( $input['business_email'] ) ) {
			$email                 = sanitize_email( (string) $input['business_email'] );
			$out['business_email'] = is_email( $email ) ? $email : $existing['business_email'];
		}
		if ( isset( $input['time_zone'] ) ) {
			$out['time_zone'] = $this->sanitize_timezone( (string) $input['time_zone'] );
		}

		$out['slot_interval']  = $this->clamp_int( $input['slot_interval'] ?? 30, 5, 240, 30 );
		$out['lead_time']      = $this->clamp_int( $input['lead_time'] ?? 60, 0, 10080, 60 );
		$out['booking_window'] = $this->clamp_int( $input['booking_window'] ?? 30, 1, 365, 30 );

		$out['require_approval'] = ! empty( $input['require_approval'] );
		$out['notify_admin']     = ! empty( $input['notify_admin'] );
		$out['notify_customer']  = ! empty( $input['notify_customer'] );

		if ( isset( $input['blackout_dates'] ) ) {
			$out['blackout_dates'] = $this->sanitize_blackouts( (string) $input['blackout_dates'] );
		}

		if ( isset( $input['availability'] ) && is_array( $input['availability'] ) ) {
			$out['availability'] = $this->sanitize_availability( $input['availability'] );
		}

		// AI assistant settings.
		$providers = array_merge( array( 'off' => 'off' ), array_combine(
			array_keys( Ai::provider_catalog() ),
			array_keys( Ai::provider_catalog() )
		) );
		if ( isset( $input['ai_provider'] ) ) {
			$prov                = sanitize_key( (string) $input['ai_provider'] );
			$out['ai_provider']  = array_key_exists( $prov, $providers ) ? $prov : 'off';
		}
		if ( isset( $input['ai_model'] ) ) {
			$out['ai_model'] = sanitize_text_field( (string) $input['ai_model'] );
		}
		if ( isset( $input['ai_api_key'] ) ) {
			$out['ai_api_key'] = sanitize_text_field( (string) $input['ai_api_key'] );
		}
		if ( isset( $input['ai_endpoint'] ) ) {
			$out['ai_endpoint'] = esc_url_raw( (string) $input['ai_endpoint'] );
		}
		if ( isset( $input['ai_daily_cap'] ) ) {
			$out['ai_daily_cap'] = $this->clamp_int( $input['ai_daily_cap'], 1, 100000, 100 );
		}

		return $out;
	}

	public function enqueue_assets( string $hook ): void {
		if ( strpos( $hook, 'wp-booking' ) === false ) {
			return;
		}
		wp_enqueue_style(
			'klyna-booking-admin',
			KLYNA_BOOKING_PLUGIN_URL . 'assets/admin/admin.css',
			array(),
			KLYNA_BOOKING_VERSION
		);
		wp_enqueue_script(
			'klyna-booking-admin',
			KLYNA_BOOKING_PLUGIN_URL . 'assets/admin/admin.js',
			array( 'wp-api-fetch' ),
			KLYNA_BOOKING_VERSION,
			true
		);
		wp_localize_script(
			'klyna-booking-admin',
			'KlynaBooking',
			array(
				'apiBase'  => esc_url_raw( rest_url( 'wp-booking/v1' ) ),
				'nonce'    => wp_create_nonce( 'wp_rest' ),
				'statuses' => Bookings::statuses(),
				'i18n'     => array(
					'confirm'     => __( 'Confirm', 'wp-booking' ),
					'cancel'      => __( 'Cancel', 'wp-booking' ),
					'updating'    => __( 'Updating…', 'wp-booking' ),
					'noResults'   => __( 'No bookings yet.', 'wp-booking' ),
					'error'       => __( 'Could not update that booking.', 'wp-booking' ),
					'colWhen'     => __( 'When', 'wp-booking' ),
					'colService'  => __( 'Service', 'wp-booking' ),
					'colCustomer' => __( 'Customer', 'wp-booking' ),
					'colStatus'   => __( 'Status', 'wp-booking' ),
				),
			)
		);
	}

	/* --------------------------------------------------------------------- */
	/* Pages                                                                 */
	/* --------------------------------------------------------------------- */

	public function render_dashboard(): void {
		$counts = $this->status_counts();
		?>
		<div class="wrap klyna-wrap">
			<h1 class="klyna-head">
				<span class="klyna-logo" aria-hidden="true"><?php echo $this->logo_svg(); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped — static trusted SVG. ?></span>
				<?php esc_html_e( 'Klyna Booking', 'wp-booking' ); ?>
			</h1>
			<p class="klyna-tagline"><?php esc_html_e( 'Tools that help your work get found.', 'wp-booking' ); ?></p>

			<div class="klyna-stats">
				<div class="klyna-stat">
					<span class="klyna-stat__num"><?php echo esc_html( (string) $counts['kb_pending'] ); ?></span>
					<span class="klyna-stat__label"><?php esc_html_e( 'Pending', 'wp-booking' ); ?></span>
				</div>
				<div class="klyna-stat">
					<span class="klyna-stat__num"><?php echo esc_html( (string) $counts['kb_confirmed'] ); ?></span>
					<span class="klyna-stat__label"><?php esc_html_e( 'Confirmed', 'wp-booking' ); ?></span>
				</div>
				<div class="klyna-stat">
					<span class="klyna-stat__num"><?php echo esc_html( (string) count( Services::all() ) ); ?></span>
					<span class="klyna-stat__label"><?php esc_html_e( 'Services', 'wp-booking' ); ?></span>
				</div>
			</div>

			<div class="klyna-card">
				<div class="klyna-card__head">
					<h2><?php esc_html_e( 'Bookings', 'wp-booking' ); ?></h2>
					<div class="klyna-filters" data-filters>
						<button type="button" class="klyna-chip is-active" data-status=""><?php esc_html_e( 'All', 'wp-booking' ); ?></button>
						<?php foreach ( Bookings::statuses() as $slug => $label ) : ?>
							<button type="button" class="klyna-chip" data-status="<?php echo esc_attr( $slug ); ?>"><?php echo esc_html( $label ); ?></button>
						<?php endforeach; ?>
					</div>
				</div>
				<div class="klyna-bookings" data-bookings-root>
					<p class="klyna-muted"><?php esc_html_e( 'Loading…', 'wp-booking' ); ?></p>
				</div>
				<div class="klyna-pager" data-pager hidden>
					<button type="button" class="button" data-prev><?php esc_html_e( 'Previous', 'wp-booking' ); ?></button>
					<span class="klyna-pager__info" data-pager-info></span>
					<button type="button" class="button" data-next><?php esc_html_e( 'Next', 'wp-booking' ); ?></button>
				</div>
			</div>

			<p class="klyna-hint">
				<?php
				printf(
					/* translators: %s: shortcode. */
					esc_html__( 'Add the booking form to any page with the %s shortcode or the "Klyna Booking form" block.', 'wp-booking' ),
					'<code>[klyna_booking]</code>'
				);
				?>
			</p>
		</div>
		<?php
	}

	public function render_availability(): void {
		$hours    = Availability::weekly_hours();
		$settings = Plugin::settings();
		?>
		<div class="wrap klyna-wrap">
			<h1 class="klyna-head"><?php esc_html_e( 'Availability', 'wp-booking' ); ?></h1>
			<p class="klyna-tagline"><?php esc_html_e( 'Set your weekly opening hours and any days you are closed.', 'wp-booking' ); ?></p>
			<form method="post" action="options.php" class="klyna-form">
				<?php settings_fields( 'wp_booking_settings_group' ); ?>
				<div class="klyna-card">
					<h2><?php esc_html_e( 'Weekly hours', 'wp-booking' ); ?></h2>
					<table class="klyna-hours">
						<tbody>
							<?php foreach ( Availability::day_labels() as $key => $label ) : ?>
								<?php $row = $hours[ $key ]; ?>
								<tr>
									<th scope="row">
										<label>
											<input type="checkbox" name="<?php echo esc_attr( KLYNA_BOOKING_OPTION_KEY ); ?>[availability][<?php echo esc_attr( $key ); ?>][enabled]" value="1" <?php checked( $row['enabled'] ); ?>>
											<?php echo esc_html( $label ); ?>
										</label>
									</th>
									<td>
										<input type="time" name="<?php echo esc_attr( KLYNA_BOOKING_OPTION_KEY ); ?>[availability][<?php echo esc_attr( $key ); ?>][start]" value="<?php echo esc_attr( $row['start'] ); ?>">
										<span class="klyna-to"><?php esc_html_e( 'to', 'wp-booking' ); ?></span>
										<input type="time" name="<?php echo esc_attr( KLYNA_BOOKING_OPTION_KEY ); ?>[availability][<?php echo esc_attr( $key ); ?>][end]" value="<?php echo esc_attr( $row['end'] ); ?>">
									</td>
								</tr>
							<?php endforeach; ?>
						</tbody>
					</table>
				</div>

				<div class="klyna-card">
					<h2><?php esc_html_e( 'Blackout dates', 'wp-booking' ); ?></h2>
					<p class="klyna-muted"><?php esc_html_e( 'One date per line (YYYY-MM-DD). No bookings can be made on these days.', 'wp-booking' ); ?></p>
					<textarea
						name="<?php echo esc_attr( KLYNA_BOOKING_OPTION_KEY ); ?>[blackout_dates]"
						rows="5"
						class="large-text code"
						placeholder="2026-12-25&#10;2027-01-01"
					><?php echo esc_textarea( (string) $settings['blackout_dates'] ); ?></textarea>
				</div>
				<?php submit_button( __( 'Save availability', 'wp-booking' ) ); ?>
			</form>
		</div>
		<?php
	}

	public function render_settings(): void {
		$settings = Plugin::settings();
		?>
		<div class="wrap klyna-wrap">
			<h1 class="klyna-head"><?php esc_html_e( 'Settings', 'wp-booking' ); ?></h1>
			<form method="post" action="options.php" class="klyna-form">
				<?php settings_fields( 'wp_booking_settings_group' ); ?>

				<div class="klyna-card">
					<h2><?php esc_html_e( 'Business', 'wp-booking' ); ?></h2>
					<table class="form-table" role="presentation">
						<tbody>
							<tr>
								<th scope="row"><label for="kb-business-name"><?php esc_html_e( 'Business name', 'wp-booking' ); ?></label></th>
								<td><input type="text" id="kb-business-name" class="regular-text" name="<?php echo esc_attr( KLYNA_BOOKING_OPTION_KEY ); ?>[business_name]" value="<?php echo esc_attr( (string) $settings['business_name'] ); ?>"></td>
							</tr>
							<tr>
								<th scope="row"><label for="kb-business-email"><?php esc_html_e( 'Notification email', 'wp-booking' ); ?></label></th>
								<td>
									<input type="email" id="kb-business-email" class="regular-text" name="<?php echo esc_attr( KLYNA_BOOKING_OPTION_KEY ); ?>[business_email]" value="<?php echo esc_attr( (string) $settings['business_email'] ); ?>">
									<p class="description"><?php esc_html_e( 'New bookings are sent here.', 'wp-booking' ); ?></p>
								</td>
							</tr>
							<tr>
								<th scope="row"><label for="kb-timezone"><?php esc_html_e( 'Time zone', 'wp-booking' ); ?></label></th>
								<td>
									<select id="kb-timezone" name="<?php echo esc_attr( KLYNA_BOOKING_OPTION_KEY ); ?>[time_zone]">
										<?php echo wp_timezone_choice( (string) $settings['time_zone'] ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped — core helper returns escaped <option> markup. ?>
									</select>
								</td>
							</tr>
						</tbody>
					</table>
				</div>

				<div class="klyna-card">
					<h2><?php esc_html_e( 'Scheduling', 'wp-booking' ); ?></h2>
					<table class="form-table" role="presentation">
						<tbody>
							<tr>
								<th scope="row"><label for="kb-interval"><?php esc_html_e( 'Slot interval (minutes)', 'wp-booking' ); ?></label></th>
								<td><input type="number" id="kb-interval" min="5" step="5" name="<?php echo esc_attr( KLYNA_BOOKING_OPTION_KEY ); ?>[slot_interval]" value="<?php echo esc_attr( (string) $settings['slot_interval'] ); ?>"></td>
							</tr>
							<tr>
								<th scope="row"><label for="kb-lead"><?php esc_html_e( 'Minimum lead time (minutes)', 'wp-booking' ); ?></label></th>
								<td>
									<input type="number" id="kb-lead" min="0" step="15" name="<?php echo esc_attr( KLYNA_BOOKING_OPTION_KEY ); ?>[lead_time]" value="<?php echo esc_attr( (string) $settings['lead_time'] ); ?>">
									<p class="description"><?php esc_html_e( 'How far ahead a customer must book.', 'wp-booking' ); ?></p>
								</td>
							</tr>
							<tr>
								<th scope="row"><label for="kb-window"><?php esc_html_e( 'Booking window (days)', 'wp-booking' ); ?></label></th>
								<td>
									<input type="number" id="kb-window" min="1" max="365" step="1" name="<?php echo esc_attr( KLYNA_BOOKING_OPTION_KEY ); ?>[booking_window]" value="<?php echo esc_attr( (string) $settings['booking_window'] ); ?>">
									<p class="description"><?php esc_html_e( 'How far into the future customers may book.', 'wp-booking' ); ?></p>
								</td>
							</tr>
						</tbody>
					</table>
				</div>

				<div class="klyna-card">
					<h2><?php esc_html_e( 'Confirmations', 'wp-booking' ); ?></h2>
					<?php
					$toggles = array(
						'require_approval' => __( 'Require manual approval before a booking is confirmed', 'wp-booking' ),
						'notify_admin'     => __( 'Email me when a new booking comes in', 'wp-booking' ),
						'notify_customer'  => __( 'Send confirmation emails to the customer', 'wp-booking' ),
					);
					foreach ( $toggles as $key => $label ) {
						printf(
							'<label class="klyna-toggle"><input type="checkbox" name="%1$s[%2$s]" value="1" %3$s> %4$s</label>',
							esc_attr( KLYNA_BOOKING_OPTION_KEY ),
							esc_attr( $key ),
							checked( ! empty( $settings[ $key ] ), true, false ),
							esc_html( $label )
						);
					}
					?>
				</div>

				<div class="klyna-card">
					<h2><?php esc_html_e( 'AI assistant', 'wp-booking' ); ?></h2>
					<p class="klyna-muted">
						<?php esc_html_e( 'Optional. When on, services can generate personalized 80-word confirmation emails. Bring your own free-tier key. The plugin works without AI.', 'wp-booking' ); ?>
					</p>
					<?php
					$ai_provider = (string) ( $settings['ai_provider'] ?? 'off' );
					$ai_model    = (string) ( $settings['ai_model'] ?? '' );
					$ai_key      = (string) ( $settings['ai_api_key'] ?? '' );
					$ai_endpoint = (string) ( $settings['ai_endpoint'] ?? '' );
					$ai_cap      = (int) ( $settings['ai_daily_cap'] ?? 100 );
					$catalog     = Ai::provider_catalog();
					?>
					<table class="form-table" role="presentation">
						<tbody>
							<tr>
								<th scope="row"><label for="kb-ai-provider"><?php esc_html_e( 'Provider', 'wp-booking' ); ?></label></th>
								<td>
									<select id="kb-ai-provider" name="<?php echo esc_attr( KLYNA_BOOKING_OPTION_KEY ); ?>[ai_provider]">
										<option value="off" <?php selected( 'off', $ai_provider ); ?>><?php esc_html_e( 'Off', 'wp-booking' ); ?></option>
										<?php foreach ( $catalog as $slug => $meta ) : ?>
											<option value="<?php echo esc_attr( $slug ); ?>" <?php selected( $slug, $ai_provider ); ?>><?php echo esc_html( $meta['label'] ); ?></option>
										<?php endforeach; ?>
									</select>
									<p class="description"><?php esc_html_e( 'All five providers are free-tier friendly.', 'wp-booking' ); ?></p>
								</td>
							</tr>
							<tr>
								<th scope="row"><label for="kb-ai-api-key"><?php esc_html_e( 'API key', 'wp-booking' ); ?></label></th>
								<td>
									<input type="password" id="kb-ai-api-key" class="regular-text" name="<?php echo esc_attr( KLYNA_BOOKING_OPTION_KEY ); ?>[ai_api_key]" value="<?php echo esc_attr( $ai_key ); ?>" autocomplete="off">
									<p class="description"><?php esc_html_e( 'Stored in your site options; never sent anywhere except the provider.', 'wp-booking' ); ?></p>
								</td>
							</tr>
							<tr>
								<th scope="row"><label for="kb-ai-model"><?php esc_html_e( 'Model', 'wp-booking' ); ?></label></th>
								<td>
									<input type="text" id="kb-ai-model" class="regular-text" name="<?php echo esc_attr( KLYNA_BOOKING_OPTION_KEY ); ?>[ai_model]" value="<?php echo esc_attr( $ai_model ); ?>">
									<p class="description"><?php esc_html_e( 'Optional. Leave blank to use the provider default (e.g. Llama 3.3 70B free on OpenRouter, gemini-2.0-flash on Gemini).', 'wp-booking' ); ?></p>
								</td>
							</tr>
							<tr>
								<th scope="row"><label for="kb-ai-endpoint"><?php esc_html_e( 'Endpoint / Account ID', 'wp-booking' ); ?></label></th>
								<td>
									<input type="text" id="kb-ai-endpoint" class="regular-text" name="<?php echo esc_attr( KLYNA_BOOKING_OPTION_KEY ); ?>[ai_endpoint]" value="<?php echo esc_attr( $ai_endpoint ); ?>">
									<p class="description"><?php esc_html_e( 'Only for Cloudflare (Account ID) or Ollama (URL like http://localhost:11434).', 'wp-booking' ); ?></p>
								</td>
							</tr>
							<tr>
								<th scope="row"><label for="kb-ai-cap"><?php esc_html_e( 'Daily call cap', 'wp-booking' ); ?></label></th>
								<td>
									<input type="number" id="kb-ai-cap" min="1" step="1" name="<?php echo esc_attr( KLYNA_BOOKING_OPTION_KEY ); ?>[ai_daily_cap]" value="<?php echo esc_attr( (string) $ai_cap ); ?>">
									<p class="description"><?php esc_html_e( 'Hard cap on AI calls per day to protect your free-tier quota.', 'wp-booking' ); ?></p>
								</td>
							</tr>
							<tr>
								<th scope="row"><?php esc_html_e( 'Test connection', 'wp-booking' ); ?></th>
								<td>
									<button type="button" class="button" id="kb-ai-test" data-nonce="<?php echo esc_attr( wp_create_nonce( 'wp_rest' ) ); ?>" data-endpoint="<?php echo esc_url( rest_url( 'wp-booking/v1/ai/test' ) ); ?>"><?php esc_html_e( 'Send test prompt', 'wp-booking' ); ?></button>
									<span id="kb-ai-test-result" class="klyna-muted" style="margin-left:8px"></span>
									<p class="description"><?php esc_html_e( 'Save your settings first, then test.', 'wp-booking' ); ?></p>
								</td>
							</tr>
						</tbody>
					</table>
				</div>

				<?php submit_button( __( 'Save settings', 'wp-booking' ) ); ?>
			</form>
			<?php \KlynaBooking\Telemetry::render_form(); ?>

			<script>
			(function(){
				var btn = document.getElementById('kb-ai-test');
				if (!btn) return;
				btn.addEventListener('click', function(){
					var out = document.getElementById('kb-ai-test-result');
					out.textContent = '<?php echo esc_js( __( 'Testing...', 'wp-booking' ) ); ?>';
					fetch(btn.dataset.endpoint, {
						method: 'POST',
						headers: { 'X-WP-Nonce': btn.dataset.nonce, 'Content-Type': 'application/json' },
						body: '{}'
					}).then(function(r){ return r.json(); }).then(function(j){
						if (j && j.ok) {
							out.textContent = '<?php echo esc_js( __( 'OK: ', 'wp-booking' ) ); ?>' + (j.text || '').slice(0, 80);
						} else {
							out.textContent = '<?php echo esc_js( __( 'Failed: ', 'wp-booking' ) ); ?>' + ((j && (j.text || j.message)) || '<?php echo esc_js( __( 'unknown error', 'wp-booking' ) ); ?>');
						}
					}).catch(function(e){ out.textContent = '<?php echo esc_js( __( 'Failed: ', 'wp-booking' ) ); ?>' + e.message; });
				});
			})();
			</script>
		</div>
		<?php
	}

	/* --------------------------------------------------------------------- */
	/* Helpers                                                               */
	/* --------------------------------------------------------------------- */

	/**
	 * @param string[] $links
	 * @return string[]
	 */
	public function add_settings_link( array $links ): array {
		$url   = admin_url( 'admin.php?page=wp-booking-settings' );
		$first = sprintf( '<a href="%s">%s</a>', esc_url( $url ), esc_html__( 'Settings', 'wp-booking' ) );
		array_unshift( $links, $first );
		return $links;
	}

	/**
	 * @return array<string,int>
	 */
	private function status_counts(): array {
		$counts = wp_count_posts( Bookings::POST_TYPE );
		return array(
			Bookings::STATUS_PENDING   => (int) ( $counts->{Bookings::STATUS_PENDING} ?? 0 ),
			Bookings::STATUS_CONFIRMED => (int) ( $counts->{Bookings::STATUS_CONFIRMED} ?? 0 ),
			Bookings::STATUS_CANCELLED => (int) ( $counts->{Bookings::STATUS_CANCELLED} ?? 0 ),
		);
	}

	/**
	 * @param mixed $value
	 */
	private function clamp_int( $value, int $min, int $max, int $fallback ): int {
		$n = (int) $value;
		if ( $n < $min || $n > $max ) {
			return $fallback;
		}
		return $n;
	}

	private function sanitize_timezone( string $tz ): string {
		$valid = in_array( $tz, timezone_identifiers_list(), true );
		if ( $valid ) {
			return $tz;
		}
		// Allow UTC offset strings like "UTC+1" that core accepts.
		if ( preg_match( '/^UTC[+-]?\d+(\.\d+)?$/', $tz ) ) {
			return $tz;
		}
		return wp_timezone_string();
	}

	private function sanitize_blackouts( string $raw ): string {
		$parts = preg_split( '/[\r\n,]+/', $raw );
		$out   = array();
		if ( is_array( $parts ) ) {
			foreach ( $parts as $part ) {
				$part = trim( $part );
				if ( preg_match( '/^\d{4}-\d{2}-\d{2}$/', $part ) ) {
					$out[] = $part;
				}
			}
		}
		return implode( "\n", array_values( array_unique( $out ) ) );
	}

	/**
	 * @param array<string,mixed> $input
	 * @return array<string, array{enabled:bool,start:string,end:string}>
	 */
	private function sanitize_availability( array $input ): array {
		$out = array();
		foreach ( Availability::DAYS as $day ) {
			$row         = is_array( $input[ $day ] ?? null ) ? $input[ $day ] : array();
			$out[ $day ] = array(
				'enabled' => ! empty( $row['enabled'] ),
				'start'   => $this->sanitize_time( (string) ( $row['start'] ?? '09:00' ), '09:00' ),
				'end'     => $this->sanitize_time( (string) ( $row['end'] ?? '17:00' ), '17:00' ),
			);
		}
		return $out;
	}

	private function sanitize_time( string $time, string $fallback ): string {
		if ( preg_match( '/^([01]?\d|2[0-3]):([0-5]\d)$/', trim( $time ), $m ) ) {
			return sprintf( '%02d:%02d', (int) $m[1], (int) $m[2] );
		}
		return $fallback;
	}

	private function logo_svg(): string {
		return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="28" height="28" role="img" aria-hidden="true"><defs><linearGradient id="kb-logo-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#9277ff"/><stop offset="100%" stop-color="#5b3df0"/></linearGradient></defs><rect x="2" y="2" width="28" height="28" rx="7" fill="url(#kb-logo-g)"/><path d="M9 12h14M11 9v2M21 9v2" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/><rect x="9" y="12" width="14" height="11" rx="2" stroke="#fff" stroke-width="2.2" fill="none"/><path d="M13 17.5l2.2 2.2 4-4.2" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>';
	}
}
