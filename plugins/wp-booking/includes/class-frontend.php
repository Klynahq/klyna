<?php
/**
 * Front-end booking form — shortcode + block.
 *
 * Registers `[klyna_booking]` and a matching block (`klyna/booking-form`) that
 * both render the same markup. The form is progressively enhanced: the server
 * prints the service list and a stable container, then `booking.js` (vanilla,
 * no jQuery) drives service → date → slot → details with REST calls.
 *
 * @package KlynaBooking
 */

namespace KlynaBooking;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Frontend {

	private bool $enqueued = false;

	public function register(): void {
		add_shortcode( 'klyna_booking', array( $this, 'render_shortcode' ) );
		add_action( 'init', array( $this, 'register_block' ) );
		add_action( 'wp_enqueue_scripts', array( $this, 'register_assets' ) );
	}

	public function register_assets(): void {
		// Register only — enqueue lazily when the form actually renders so we
		// never load assets on pages without the form.
		wp_register_style(
			'klyna-booking',
			KLYNA_BOOKING_PLUGIN_URL . 'assets/css/booking.css',
			array(),
			KLYNA_BOOKING_VERSION
		);
		wp_register_script(
			'klyna-booking',
			KLYNA_BOOKING_PLUGIN_URL . 'assets/js/booking.js',
			array(),
			KLYNA_BOOKING_VERSION,
			true
		);
	}

	public function register_block(): void {
		if ( ! function_exists( 'register_block_type' ) ) {
			return;
		}
		register_block_type(
			'klyna/booking-form',
			array(
				'api_version'     => 2,
				'title'           => __( 'Klyna Booking form', 'wp-booking' ),
				'category'        => 'widgets',
				'icon'            => 'calendar-alt',
				'render_callback' => array( $this, 'render_block' ),
				'attributes'      => array(
					'service' => array(
						'type'    => 'integer',
						'default' => 0,
					),
				),
			)
		);
	}

	/**
	 * @param array<string,mixed> $atts
	 */
	public function render_shortcode( $atts ): string {
		$atts = shortcode_atts(
			array( 'service' => 0 ),
			is_array( $atts ) ? $atts : array(),
			'klyna_booking'
		);
		return $this->render( (int) $atts['service'] );
	}

	/**
	 * @param array<string,mixed> $attributes
	 */
	public function render_block( array $attributes ): string {
		return $this->render( (int) ( $attributes['service'] ?? 0 ) );
	}

	/**
	 * Render the form shell + boot data.
	 */
	private function render( int $preselect ): string {
		$this->enqueue();

		$services = Services::all();
		if ( ! $services ) {
			return '<div class="klyna-booking klyna-booking--empty"><p>' .
				esc_html__( 'No services are available to book right now.', 'wp-booking' ) .
				'</p></div>';
		}

		ob_start();
		?>
		<div class="klyna-booking" data-klyna-booking data-preselect="<?php echo esc_attr( (string) $preselect ); ?>">
			<div class="klyna-booking__steps">
				<ol class="klyna-booking__progress" aria-hidden="true">
					<li class="is-active" data-step="service"><?php esc_html_e( 'Service', 'wp-booking' ); ?></li>
					<li data-step="time"><?php esc_html_e( 'Time', 'wp-booking' ); ?></li>
					<li data-step="details"><?php esc_html_e( 'Details', 'wp-booking' ); ?></li>
				</ol>

				<section class="klyna-booking__panel" data-panel="service">
					<h3 class="klyna-booking__title"><?php esc_html_e( 'Choose a service', 'wp-booking' ); ?></h3>
					<div class="klyna-booking__services" role="list">
						<?php foreach ( $services as $service ) : ?>
							<button
								type="button"
								class="klyna-booking__service"
								role="listitem"
								data-service="<?php echo esc_attr( (string) $service['id'] ); ?>"
								data-duration="<?php echo esc_attr( (string) $service['duration'] ); ?>"
							>
								<span class="klyna-booking__service-name"><?php echo esc_html( $service['title'] ); ?></span>
								<span class="klyna-booking__service-meta">
									<?php
									/* translators: %d: minutes. */
									echo esc_html( sprintf( __( '%d min', 'wp-booking' ), $service['duration'] ) );
									?>
									· <?php echo esc_html( Services::format_price( $service['price'] ) ); ?>
								</span>
							</button>
						<?php endforeach; ?>
					</div>
				</section>

				<section class="klyna-booking__panel" data-panel="time" hidden>
					<button type="button" class="klyna-booking__back" data-back="service">&larr; <?php esc_html_e( 'Back', 'wp-booking' ); ?></button>
					<h3 class="klyna-booking__title"><?php esc_html_e( 'Pick a time', 'wp-booking' ); ?></h3>
					<div class="klyna-booking__dates" data-dates></div>
					<div class="klyna-booking__slots" data-slots aria-live="polite"></div>
				</section>

				<section class="klyna-booking__panel" data-panel="details" hidden>
					<button type="button" class="klyna-booking__back" data-back="time">&larr; <?php esc_html_e( 'Back', 'wp-booking' ); ?></button>
					<h3 class="klyna-booking__title"><?php esc_html_e( 'Your details', 'wp-booking' ); ?></h3>
					<p class="klyna-booking__summary" data-summary></p>
					<form class="klyna-booking__form" data-form novalidate>
						<label class="klyna-booking__field">
							<span><?php esc_html_e( 'Name', 'wp-booking' ); ?> <span class="klyna-booking__req">*</span></span>
							<input type="text" name="name" autocomplete="name" required>
						</label>
						<label class="klyna-booking__field">
							<span><?php esc_html_e( 'Email', 'wp-booking' ); ?> <span class="klyna-booking__req">*</span></span>
							<input type="email" name="email" autocomplete="email" required>
						</label>
						<label class="klyna-booking__field">
							<span><?php esc_html_e( 'Phone', 'wp-booking' ); ?></span>
							<input type="tel" name="phone" autocomplete="tel">
						</label>
						<label class="klyna-booking__field">
							<span><?php esc_html_e( 'Notes', 'wp-booking' ); ?></span>
							<textarea name="notes" rows="3"></textarea>
						</label>
						<div class="klyna-booking__error" data-error role="alert" hidden></div>
						<button type="submit" class="klyna-booking__submit">
							<?php esc_html_e( 'Confirm booking', 'wp-booking' ); ?>
						</button>
					</form>
				</section>

				<section class="klyna-booking__panel klyna-booking__done" data-panel="done" hidden>
					<div class="klyna-booking__check" aria-hidden="true">
						<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
					</div>
					<h3 class="klyna-booking__title" data-done-title></h3>
					<p data-done-message></p>
				</section>
			</div>
		</div>
		<?php
		return (string) ob_get_clean();
	}

	private function enqueue(): void {
		if ( $this->enqueued ) {
			return;
		}
		$this->enqueued = true;

		wp_enqueue_style( 'klyna-booking' );
		wp_enqueue_script( 'klyna-booking' );

		wp_localize_script(
			'klyna-booking',
			'klynaBookingBoot',
			array(
				'apiBase'  => esc_url_raw( rest_url( 'wp-booking/v1' ) ),
				'nonce'    => wp_create_nonce( 'wp_rest' ),
				'dayNames' => array_values( Availability::day_labels() ),
				'i18n'     => array(
					'noSlots'    => __( 'No times available on this day.', 'wp-booking' ),
					'loading'    => __( 'Loading…', 'wp-booking' ),
					'pickDate'   => __( 'Select a date to see available times.', 'wp-booking' ),
					'submitting' => __( 'Booking…', 'wp-booking' ),
					'genericErr' => __( 'Something went wrong. Please try again.', 'wp-booking' ),
				),
			)
		);
	}
}
