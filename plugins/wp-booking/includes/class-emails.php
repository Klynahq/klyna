<?php
/**
 * Confirmation emails.
 *
 * Sends a clean text/HTML email to the customer and a notification to the
 * business when a booking is created, and a follow-up when its status changes.
 * Subjects + bodies are filterable so a site can customize without forking.
 * Uses core `wp_mail` — no third-party transactional service.
 *
 * @package KlynaBooking
 */

namespace KlynaBooking;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Emails {

	public function register(): void {
		add_action( 'klyna_booking_created', array( $this, 'on_created' ), 10, 2 );
		add_action( 'klyna_booking_status_changed', array( $this, 'on_status_changed' ), 10, 2 );
	}

	/**
	 * Fired when a booking is first created.
	 */
	public function on_created( int $booking_id, string $status ): void {
		$booking = Bookings::get( $booking_id );
		if ( ! $booking ) {
			return;
		}
		$settings = Plugin::settings();

		if ( ! empty( $settings['notify_customer'] ) ) {
			$this->send_customer( $booking, 'created' );
		}
		if ( ! empty( $settings['notify_admin'] ) ) {
			$this->send_admin( $booking );
		}
	}

	/**
	 * Fired when an admin confirms or cancels a booking.
	 */
	public function on_status_changed( int $booking_id, string $status ): void {
		$booking = Bookings::get( $booking_id );
		if ( ! $booking ) {
			return;
		}
		$settings = Plugin::settings();
		if ( empty( $settings['notify_customer'] ) ) {
			return;
		}
		if ( Bookings::STATUS_CONFIRMED === $status ) {
			$this->send_customer( $booking, 'confirmed' );
		} elseif ( Bookings::STATUS_CANCELLED === $status ) {
			$this->send_customer( $booking, 'cancelled' );
		}
	}

	/* --------------------------------------------------------------------- */

	/**
	 * @param array<string,mixed> $booking
	 * @param string              $event created|confirmed|cancelled
	 */
	private function send_customer( array $booking, string $event ): void {
		$settings = Plugin::settings();
		$business = (string) $settings['business_name'];
		$when     = Availability::format_local( $booking['start'] );

		switch ( $event ) {
			case 'confirmed':
				/* translators: %s: business name. */
				$subject = sprintf( __( 'Your booking with %s is confirmed', 'wp-booking' ), $business );
				$intro   = __( 'Good news — your booking is confirmed.', 'wp-booking' );
				break;
			case 'cancelled':
				/* translators: %s: business name. */
				$subject = sprintf( __( 'Your booking with %s was cancelled', 'wp-booking' ), $business );
				$intro   = __( 'Your booking has been cancelled. If this is unexpected, please get in touch.', 'wp-booking' );
				break;
			default:
				if ( Bookings::STATUS_PENDING === $booking['status'] ) {
					/* translators: %s: business name. */
					$subject = sprintf( __( 'We received your booking request — %s', 'wp-booking' ), $business );
					$intro   = __( 'Thanks for your request. It is pending approval and we will confirm shortly.', 'wp-booking' );
				} else {
					/* translators: %s: business name. */
					$subject = sprintf( __( 'Your booking with %s is confirmed', 'wp-booking' ), $business );
					$intro   = __( 'Thanks for booking. Here are the details.', 'wp-booking' );
				}
				break;
		}

		$lines = array(
			$intro,
			'',
			sprintf( '%s: %s', __( 'Service', 'wp-booking' ), $booking['service_title'] ),
			sprintf( '%s: %s', __( 'When', 'wp-booking' ), $when ),
			sprintf( '%s: %s', __( 'Name', 'wp-booking' ), $booking['name'] ),
		);
		if ( $booking['phone'] ) {
			$lines[] = sprintf( '%s: %s', __( 'Phone', 'wp-booking' ), $booking['phone'] );
		}
		$lines[] = '';
		/* translators: %s: business name. */
		$lines[] = sprintf( __( '— %s', 'wp-booking' ), $business );

		$this->dispatch(
			$booking['email'],
			$subject,
			$lines,
			'klyna_booking_customer_email'
		);
	}

	/**
	 * @param array<string,mixed> $booking
	 */
	private function send_admin( array $booking ): void {
		$settings = Plugin::settings();
		$to       = is_email( (string) $settings['business_email'] )
			? (string) $settings['business_email']
			: (string) get_option( 'admin_email' );
		$when     = Availability::format_local( $booking['start'] );

		/* translators: 1: service title, 2: date/time. */
		$subject = sprintf( __( 'New booking: %1$s — %2$s', 'wp-booking' ), $booking['service_title'], $when );

		$lines = array(
			__( 'A new booking just came in.', 'wp-booking' ),
			'',
			sprintf( '%s: %s', __( 'Service', 'wp-booking' ), $booking['service_title'] ),
			sprintf( '%s: %s', __( 'When', 'wp-booking' ), $when ),
			sprintf( '%s: %s', __( 'Name', 'wp-booking' ), $booking['name'] ),
			sprintf( '%s: %s', __( 'Email', 'wp-booking' ), $booking['email'] ),
		);
		if ( $booking['phone'] ) {
			$lines[] = sprintf( '%s: %s', __( 'Phone', 'wp-booking' ), $booking['phone'] );
		}
		if ( $booking['notes'] ) {
			$lines[] = sprintf( '%s: %s', __( 'Notes', 'wp-booking' ), $booking['notes'] );
		}
		$lines[] = '';
		$lines[] = sprintf(
			'%s %s',
			__( 'Manage:', 'wp-booking' ),
			admin_url( 'admin.php?page=wp-booking' )
		);

		$this->dispatch( $to, $subject, $lines, 'klyna_booking_admin_email' );
	}

	/**
	 * Build an HTML email from plain lines and send it.
	 *
	 * @param string   $to
	 * @param string   $subject
	 * @param string[] $lines
	 * @param string   $filter Filter tag applied to the {subject,body} pair.
	 */
	private function dispatch( string $to, string $subject, array $lines, string $filter ): void {
		if ( ! is_email( $to ) ) {
			return;
		}

		$body = $this->html_body( $lines );

		/**
		 * Filter the outgoing booking email.
		 *
		 * @param array{subject:string,body:string} $email
		 */
		$email = apply_filters(
			$filter,
			array(
				'subject' => $subject,
				'body'    => $body,
			)
		);

		$headers = array( 'Content-Type: text/html; charset=UTF-8' );
		wp_mail( $to, $email['subject'], $email['body'], $headers );
	}

	/**
	 * Minimal, inline-styled HTML shell so the message renders cleanly in
	 * every client without an external stylesheet.
	 *
	 * @param string[] $lines
	 */
	private function html_body( array $lines ): string {
		$html = '';
		foreach ( $lines as $line ) {
			if ( '' === $line ) {
				$html .= '<div style="height:12px;"></div>';
				continue;
			}
			$html .= '<p style="margin:0 0 6px;color:#1a1a23;font-size:15px;line-height:1.5;">' . esc_html( $line ) . '</p>';
		}

		$wrapper  = '<div style="background:#f4f4f5;padding:32px 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">';
		$wrapper .= '<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">';
		$wrapper .= '<div style="background:linear-gradient(135deg,#9277ff,#5b3df0);padding:20px 28px;">';
		$wrapper .= '<span style="color:#ffffff;font-weight:600;font-size:16px;letter-spacing:.2px;">' . esc_html( (string) Plugin::settings()['business_name'] ) . '</span>';
		$wrapper .= '</div>';
		$wrapper .= '<div style="padding:28px;">' . $html . '</div>';
		$wrapper .= '</div></div>';

		return $wrapper;
	}
}
