<?php
/**
 * Killer feature - AI-personalized booking confirmations.
 *
 * On `klyna_booking_created`, if the service has the AI confirmation
 * toggle on and the AI assistant is configured, generates an 80-word
 * personalized message mentioning the service + customer + what to
 * prepare. The email is persisted to the klyna_booking_emails table
 * and (when the per-site customer-notify toggle is on) sent.
 *
 * @package KlynaBooking
 */

namespace KlynaBooking;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Ai_Confirmations {

	public function register(): void {
		add_action( 'klyna_booking_created', array( $this, 'on_booking_created' ), 10, 2 );
	}

	/**
	 * Handle the booking_created action.
	 */
	public function on_booking_created( int $booking_id, string $status ): void {
		if ( ! Ai::is_enabled() ) {
			return;
		}
		$booking = Bookings::get( $booking_id );
		if ( ! $booking ) {
			return;
		}
		$service = Services::get( (int) $booking['service_id'] );
		if ( ! $service || empty( $service['ai_confirm'] ) ) {
			return;
		}

		$generated = self::generate( $booking, $service );
		if ( ! $generated['ok'] ) {
			return;
		}

		$settings = Plugin::settings();
		$subject  = sprintf(
			/* translators: 1: business name, 2: service title. */
			__( '[%1$s] Your %2$s is confirmed', 'wp-booking' ),
			(string) $settings['business_name'],
			(string) $service['title']
		);

		Booking_Emails::insert(
			array(
				'booking_id' => $booking_id,
				'service_id' => (int) $service['id'],
				'subject'    => $subject,
				'body'       => $generated['text'],
				'provider'   => (string) ( $settings['ai_provider'] ?? '' ),
				'model'      => (string) ( $settings['ai_model'] ?? '' ),
			)
		);

		// Send the email if customer notifications are on. We let the core
		// Emails subsystem stay the canonical sender for plain confirmations;
		// this AI email is an additional personal touch.
		if ( ! empty( $settings['notify_customer'] ) && is_email( $booking['email'] ) ) {
			wp_mail(
				$booking['email'],
				$subject,
				$generated['text'],
				array( 'Content-Type: text/plain; charset=UTF-8' )
			);
		}
	}

	/**
	 * Build the prompt and run it through the Ai client.
	 *
	 * @param array<string,mixed> $booking
	 * @param array<string,mixed> $service
	 * @return array{ok:bool,text:string,reason?:string}
	 */
	public static function generate( array $booking, array $service ): array {
		$settings = Plugin::settings();
		$business = (string) $settings['business_name'];
		$when     = Availability::format_local( (string) $booking['start'] );
		$prep     = trim( (string) ( $service['ai_prep'] ?? '' ) );

		$prompt  = "Write a warm, personalized 80-word booking confirmation email body in plain text. ";
		$prompt .= "Do not include a subject line, headers, or markdown. ";
		$prompt .= "Mention the customer by first name, the specific service, the appointment time, and one or two concrete things to prepare for THIS service. ";
		$prompt .= "Keep it under 80 words. Sign off as the business.\n\n";
		$prompt .= "Business: {$business}\n";
		$prompt .= "Customer name: " . (string) $booking['name'] . "\n";
		$prompt .= "Service: " . (string) $service['title'] . "\n";
		$prompt .= "Duration: " . (int) $service['duration'] . " minutes\n";
		$prompt .= "Appointment: {$when}\n";
		if ( '' !== $prep ) {
			$prompt .= "Hints from the provider on what to prepare: {$prep}\n";
		}
		$customer_notes = trim( (string) ( $booking['notes'] ?? '' ) );
		if ( '' !== $customer_notes ) {
			$prompt .= "Customer's own notes: {$customer_notes}\n";
		}

		$ai = new Ai();
		return $ai->complete( $prompt, array( 'max_tokens' => 220, 'temperature' => 0.6 ) );
	}
}
