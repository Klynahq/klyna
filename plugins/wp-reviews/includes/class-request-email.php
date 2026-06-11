<?php
/**
 * Optional review-request emails.
 *
 * When enabled, the admin can queue a request email to a customer (e.g. after
 * a purchase or a support resolution). The message is plain `wp_mail` — no
 * third-party ESP, no API key. Templated with {name}, {site}, and {link}
 * placeholders. A token in the link pre-targets the review form.
 *
 * Requests can be sent immediately (from the admin) or scheduled and flushed by
 * a daily cron event, so a busy site never blocks an admin request on SMTP.
 *
 * @package KlynaReviews
 */

namespace KlynaReviews;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class RequestEmail {

	private const QUEUE_OPTION = 'klyna_reviews_request_queue';
	private const CRON_HOOK    = 'klyna_reviews_send_requests';

	public function register(): void {
		add_action( self::CRON_HOOK, array( $this, 'flush_queue' ) );
		add_action( 'init', array( $this, 'maybe_schedule_cron' ) );
	}

	/**
	 * Ensure the daily flush is scheduled while the feature is on.
	 */
	public function maybe_schedule_cron(): void {
		$enabled = ! empty( Plugin::setting( 'request_email_enabled' ) );
		$next    = wp_next_scheduled( self::CRON_HOOK );

		if ( $enabled && ! $next ) {
			wp_schedule_event( time() + HOUR_IN_SECONDS, 'daily', self::CRON_HOOK );
		} elseif ( ! $enabled && $next ) {
			wp_unschedule_event( $next, self::CRON_HOOK );
		}
	}

	/**
	 * Send a review-request email immediately.
	 *
	 * @param string $email     Recipient.
	 * @param string $name      Recipient display name.
	 * @param string $target    Review target the link should pre-select.
	 * @param string $review_url Page that hosts the review form.
	 * @return bool True on a successful handoff to wp_mail.
	 */
	public function send( string $email, string $name, string $target = 'site', string $review_url = '' ): bool {
		$email = sanitize_email( $email );
		if ( ! is_email( $email ) ) {
			return false;
		}

		$settings = Plugin::settings();
		$subject  = (string) ( $settings['request_email_subject'] ?? __( 'How was your experience?', 'wp-reviews' ) );
		$template = (string) ( $settings['request_email_body'] ?? '' );

		$link = $this->build_link( $review_url, $target );
		$body = $this->render( $template, $name, $link );

		$headers = array( 'Content-Type: text/plain; charset=UTF-8' );

		/**
		 * Filter the review-request email arguments before send.
		 *
		 * @param array $args { subject, body, headers, target, email }
		 */
		$args = apply_filters(
			'klyna_reviews_request_email',
			array(
				'subject' => $subject,
				'body'    => $body,
				'headers' => $headers,
				'target'  => $target,
				'email'   => $email,
			)
		);

		return wp_mail( $email, $args['subject'], $args['body'], $args['headers'] );
	}

	/**
	 * Queue a request for the next daily flush.
	 *
	 * @param string $email      Recipient.
	 * @param string $name       Recipient name.
	 * @param string $target     Review target.
	 * @param string $review_url Hosting page.
	 */
	public function queue( string $email, string $name, string $target = 'site', string $review_url = '' ): void {
		$email = sanitize_email( $email );
		if ( ! is_email( $email ) ) {
			return;
		}
		$queue   = $this->get_queue();
		$queue[] = array(
			'email'      => $email,
			'name'       => sanitize_text_field( $name ),
			'target'     => sanitize_text_field( $target ),
			'review_url' => esc_url_raw( $review_url ),
			'queued_at'  => time(),
		);
		update_option( self::QUEUE_OPTION, $queue, false );
	}

	/**
	 * Cron callback: send everything in the queue, then clear it.
	 */
	public function flush_queue(): void {
		$queue = $this->get_queue();
		if ( empty( $queue ) ) {
			return;
		}
		foreach ( $queue as $item ) {
			$this->send(
				(string) $item['email'],
				(string) ( $item['name'] ?? '' ),
				(string) ( $item['target'] ?? 'site' ),
				(string) ( $item['review_url'] ?? '' )
			);
		}
		delete_option( self::QUEUE_OPTION );
	}

	/**
	 * @return array<int, array<string,mixed>>
	 */
	private function get_queue(): array {
		$queue = get_option( self::QUEUE_OPTION, array() );
		return is_array( $queue ) ? $queue : array();
	}

	/**
	 * Replace template placeholders.
	 *
	 * @param string $template Template body.
	 * @param string $name     Recipient name.
	 * @param string $link     Review URL.
	 */
	private function render( string $template, string $name, string $link ): string {
		$site = wp_specialchars_decode( get_bloginfo( 'name' ), ENT_QUOTES );
		return strtr(
			$template,
			array(
				'{name}' => $name !== '' ? $name : __( 'there', 'wp-reviews' ),
				'{site}' => $site,
				'{link}' => $link,
			)
		);
	}

	/**
	 * Build the review link, defaulting to the home page when none supplied.
	 *
	 * @param string $review_url Hosting page.
	 * @param string $target     Review target token.
	 */
	private function build_link( string $review_url, string $target ): string {
		$base = '' !== $review_url ? $review_url : home_url( '/' );
		return esc_url_raw( add_query_arg( 'klyna_review_target', rawurlencode( $target ), $base ) );
	}
}
