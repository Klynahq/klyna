<?php
/**
 * Front-end banner: outputs HTML + modal via wp_footer, enqueues assets.
 *
 * @package KlynaConsent
 */

namespace KlynaConsent;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Renders the consent banner and preferences modal into wp_footer.
 * Also enqueues the banner JS + CSS and passes settings to JS via wp_localize_script.
 */
final class Banner {

	public function register(): void {
		add_action( 'wp_enqueue_scripts', array( $this, 'enqueue_assets' ) );
		add_action( 'wp_footer', array( $this, 'render_banner' ), 100 );
	}

	public function enqueue_assets(): void {
		wp_enqueue_style(
			'klyna-consent-banner',
			KLYNA_CONSENT_PLUGIN_URL . 'assets/css/banner.css',
			array(),
			KLYNA_CONSENT_VERSION
		);

		wp_enqueue_script(
			'klyna-consent-banner',
			KLYNA_CONSENT_PLUGIN_URL . 'assets/js/banner.js',
			array(),
			KLYNA_CONSENT_VERSION,
			true // Load in footer.
		);

		$settings = Plugin::settings();

		// Pass settings + geo flag to JS.
		wp_localize_script(
			'klyna-consent-banner',
			'KlynaConsentConfig',
			array(
				'position'             => sanitize_key( $settings['position'] ),
				'bgColor'              => sanitize_hex_color( $settings['bg_color'] ),
				'textColor'            => sanitize_hex_color( $settings['text_color'] ),
				'accentColor'          => sanitize_hex_color( $settings['accent_color'] ),
				'enableAnalytics'      => ! empty( $settings['enable_analytics'] ),
				'enableMarketing'      => ! empty( $settings['enable_marketing'] ),
				'enablePreferences'    => ! empty( $settings['enable_preferences'] ),
				'googleConsentMode'    => ! empty( $settings['google_consent_mode'] ),
				'cookieSettingsLink'   => ! empty( $settings['cookie_settings_link'] ),
				'showBanner'           => Plugin::should_show_for_geo(),
				'cookieName'           => 'klyna_consent',
				'cookieDays'           => 365,
			)
		);
	}

	/**
	 * Renders the banner HTML + preferences modal.
	 * Text is server-side so it's translatable and accessible without JS.
	 */
	public function render_banner(): void {
		$settings = Plugin::settings();

		$banner_text   = wp_kses_post( $settings['banner_text'] );
		$accept_label  = esc_html( $settings['accept_label'] );
		$reject_label  = esc_html( $settings['reject_label'] );
		$manage_label  = esc_html( $settings['manage_label'] );
		$position      = sanitize_key( $settings['position'] );

		$show_analytics   = ! empty( $settings['enable_analytics'] );
		$show_marketing   = ! empty( $settings['enable_marketing'] );
		$show_preferences = ! empty( $settings['enable_preferences'] );
		$show_link        = ! empty( $settings['cookie_settings_link'] );
		?>

<div
	id="klyna-consent-banner"
	class="klyna-consent-banner klyna-consent-banner--<?php echo esc_attr( $position ); ?>"
	role="dialog"
	aria-modal="false"
	aria-label="<?php esc_attr_e( 'Cookie consent', 'wp-consent' ); ?>"
	aria-live="polite"
	hidden
>
	<div class="klyna-consent-banner__inner">
		<div class="klyna-consent-banner__text">
			<?php echo $banner_text; // Already escaped with wp_kses_post. ?>
		</div>
		<div class="klyna-consent-banner__actions" role="group" aria-label="<?php esc_attr_e( 'Consent options', 'wp-consent' ); ?>">
			<button
				id="klyna-consent-accept"
				class="klyna-btn klyna-btn--primary"
				type="button"
				data-action="accept-all"
			><?php echo $accept_label; ?></button>

			<button
				id="klyna-consent-reject"
				class="klyna-btn klyna-btn--secondary"
				type="button"
				data-action="reject-all"
			><?php echo $reject_label; ?></button>

			<button
				id="klyna-consent-manage"
				class="klyna-btn klyna-btn--ghost"
				type="button"
				data-action="open-modal"
				aria-haspopup="dialog"
			><?php echo $manage_label; ?></button>
		</div>
	</div>
</div>

<!-- Preferences modal -->
<div
	id="klyna-consent-modal"
	class="klyna-consent-modal"
	role="dialog"
	aria-modal="true"
	aria-labelledby="klyna-modal-title"
	hidden
>
	<div class="klyna-consent-modal__backdrop" aria-hidden="true"></div>
	<div class="klyna-consent-modal__box" tabindex="-1">
		<button
			id="klyna-modal-close"
			class="klyna-consent-modal__close"
			type="button"
			aria-label="<?php esc_attr_e( 'Close preferences', 'wp-consent' ); ?>"
		>
			<svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
				<path d="M4 4l10 10M14 4L4 14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
			</svg>
		</button>

		<h2 id="klyna-modal-title" class="klyna-consent-modal__title">
			<?php esc_html_e( 'Cookie Preferences', 'wp-consent' ); ?>
		</h2>
		<p class="klyna-consent-modal__description">
			<?php esc_html_e( 'Choose which cookie categories you allow. Necessary cookies cannot be disabled — they are required for the website to function properly.', 'wp-consent' ); ?>
		</p>

		<ul class="klyna-consent-modal__categories" role="list">
			<!-- Necessary: always on, cannot be toggled -->
			<li class="klyna-consent-category">
				<div class="klyna-consent-category__info">
					<strong class="klyna-consent-category__name">
						<?php esc_html_e( 'Necessary', 'wp-consent' ); ?>
					</strong>
					<p class="klyna-consent-category__desc">
						<?php esc_html_e( 'Essential for the website to function. Cannot be disabled.', 'wp-consent' ); ?>
					</p>
				</div>
				<div class="klyna-consent-category__toggle">
					<span class="klyna-toggle klyna-toggle--locked" aria-label="<?php esc_attr_e( 'Always enabled', 'wp-consent' ); ?>">
						<span class="klyna-toggle__track" aria-hidden="true">
							<span class="klyna-toggle__thumb"></span>
						</span>
						<span class="klyna-toggle__label"><?php esc_html_e( 'Always on', 'wp-consent' ); ?></span>
					</span>
				</div>
			</li>

			<?php if ( $show_analytics ) : ?>
			<li class="klyna-consent-category">
				<div class="klyna-consent-category__info">
					<strong class="klyna-consent-category__name">
						<?php esc_html_e( 'Analytics', 'wp-consent' ); ?>
					</strong>
					<p class="klyna-consent-category__desc">
						<?php esc_html_e( 'Help us understand how visitors use this site (e.g. Google Analytics, Plausible).', 'wp-consent' ); ?>
					</p>
				</div>
				<div class="klyna-consent-category__toggle">
					<label class="klyna-toggle" for="klyna-toggle-analytics">
						<input
							type="checkbox"
							id="klyna-toggle-analytics"
							class="klyna-toggle__input"
							data-category="analytics"
							value="analytics"
						>
						<span class="klyna-toggle__track" aria-hidden="true">
							<span class="klyna-toggle__thumb"></span>
						</span>
						<span class="klyna-toggle__label sr-only"><?php esc_html_e( 'Analytics cookies', 'wp-consent' ); ?></span>
					</label>
				</div>
			</li>
			<?php endif; ?>

			<?php if ( $show_marketing ) : ?>
			<li class="klyna-consent-category">
				<div class="klyna-consent-category__info">
					<strong class="klyna-consent-category__name">
						<?php esc_html_e( 'Marketing', 'wp-consent' ); ?>
					</strong>
					<p class="klyna-consent-category__desc">
						<?php esc_html_e( 'Used to show relevant ads and measure campaign effectiveness.', 'wp-consent' ); ?>
					</p>
				</div>
				<div class="klyna-consent-category__toggle">
					<label class="klyna-toggle" for="klyna-toggle-marketing">
						<input
							type="checkbox"
							id="klyna-toggle-marketing"
							class="klyna-toggle__input"
							data-category="marketing"
							value="marketing"
						>
						<span class="klyna-toggle__track" aria-hidden="true">
							<span class="klyna-toggle__thumb"></span>
						</span>
						<span class="klyna-toggle__label sr-only"><?php esc_html_e( 'Marketing cookies', 'wp-consent' ); ?></span>
					</label>
				</div>
			</li>
			<?php endif; ?>

			<?php if ( $show_preferences ) : ?>
			<li class="klyna-consent-category">
				<div class="klyna-consent-category__info">
					<strong class="klyna-consent-category__name">
						<?php esc_html_e( 'Preferences', 'wp-consent' ); ?>
					</strong>
					<p class="klyna-consent-category__desc">
						<?php esc_html_e( 'Remember your settings and personalisation choices (e.g. language, region).', 'wp-consent' ); ?>
					</p>
				</div>
				<div class="klyna-consent-category__toggle">
					<label class="klyna-toggle" for="klyna-toggle-preferences">
						<input
							type="checkbox"
							id="klyna-toggle-preferences"
							class="klyna-toggle__input"
							data-category="preferences"
							value="preferences"
						>
						<span class="klyna-toggle__track" aria-hidden="true">
							<span class="klyna-toggle__thumb"></span>
						</span>
						<span class="klyna-toggle__label sr-only"><?php esc_html_e( 'Preferences cookies', 'wp-consent' ); ?></span>
					</label>
				</div>
			</li>
			<?php endif; ?>
		</ul>

		<div class="klyna-consent-modal__actions">
			<button
				id="klyna-modal-save"
				class="klyna-btn klyna-btn--primary"
				type="button"
				data-action="save-preferences"
			><?php esc_html_e( 'Save Preferences', 'wp-consent' ); ?></button>
			<button
				id="klyna-modal-accept-all"
				class="klyna-btn klyna-btn--secondary"
				type="button"
				data-action="accept-all-modal"
			><?php esc_html_e( 'Accept All', 'wp-consent' ); ?></button>
		</div>
	</div>
</div>

<?php if ( $show_link ) : ?>
<!-- Floating "Cookie settings" re-open link -->
<button
	id="klyna-consent-reopen"
	class="klyna-consent-reopen"
	type="button"
	aria-label="<?php esc_attr_e( 'Open cookie settings', 'wp-consent' ); ?>"
	hidden
>
	<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
		<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
		<circle cx="12" cy="7" r="1.5" fill="currentColor"/>
		<path d="M12 10v7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
	</svg>
	<?php esc_html_e( 'Cookie settings', 'wp-consent' ); ?>
</button>
<?php endif; ?>
		<?php
	}
}
