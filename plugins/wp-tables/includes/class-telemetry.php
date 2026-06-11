<?php
/**
 * Opt-in install telemetry. Default: OFF.
 *
 * Sends a single anonymous install ping (slug, version, hashed host id,
 * WP/PHP version) to klyna.dev when the user explicitly opts in via the
 * settings page. Pinged at most once per 7 days. Non-blocking, 5s timeout.
 *
 * Saved in its own option `OPT_KEY` (not the main settings array) so we
 * don't have to touch each plugin's existing sanitize_settings(). The
 * opt-in form is a standalone <form> rendered as a card on the settings
 * page via Telemetry::render_form().
 *
 * @package KlynaTables
 */

namespace KlynaTables;

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

final class Telemetry {

    public const OPTION_KEY     = 'klyna_wp_tables_telemetry_enabled';
    public const LAST_PING_KEY  = 'klyna_wp_tables_telemetry_last_pinged';
    public const SETTINGS_GROUP = 'klyna_telemetry_group_wp_tables';
    public const ENDPOINT       = 'https://klyna.dev/api/track/install';
    public const SLUG           = 'wp-tables';
    public const PING_INTERVAL  = WEEK_IN_SECONDS; // 7 days

    /**
     * Wire up the hooks. Called from the plugin bootstrap on plugins_loaded.
     */
    public static function register(): void {
        add_action( 'admin_init', array( __CLASS__, 'register_setting' ) );
        // Fire on the next admin/cron tick rather than the activation hook
        // itself, so the user has a chance to toggle the opt-in first.
        add_action( 'init', array( __CLASS__, 'maybe_ping' ) );
    }

    public static function register_setting(): void {
        register_setting(
            self::SETTINGS_GROUP,
            self::OPTION_KEY,
            array(
                'type'              => 'boolean',
                'sanitize_callback' => array( __CLASS__, 'sanitize' ),
                'default'           => false,
            )
        );
    }

    /**
     * @param mixed $value
     */
    public static function sanitize( $value ): bool {
        return ! empty( $value );
    }

    public static function is_enabled(): bool {
        return (bool) get_option( self::OPTION_KEY, false );
    }

    /**
     * Fire the install ping if the user opted in and we haven't pinged in
     * the last PING_INTERVAL seconds. Any failure is silently swallowed —
     * telemetry must never break the site.
     */
    public static function maybe_ping(): void {
        if ( ! self::is_enabled() ) {
            return;
        }
        $last = (int) get_option( self::LAST_PING_KEY, 0 );
        if ( $last && ( time() - $last ) < self::PING_INTERVAL ) {
            return;
        }
        // Stamp first so concurrent requests don't double-fire.
        update_option( self::LAST_PING_KEY, time(), false );

        $body = array(
            'slug'       => self::SLUG,
            'kind'       => 'wp',
            'version'    => defined( 'KLYNA_TABLES_VERSION' ) ? KLYNA_TABLES_VERSION : '0.0.0',
            'hostHash'   => wp_hash( site_url() ),
            'wpVersion'  => get_bloginfo( 'version' ),
            'phpVersion' => PHP_VERSION,
        );

        try {
            wp_remote_post(
                self::ENDPOINT,
                array(
                    'method'   => 'POST',
                    'timeout'  => 5,
                    'blocking' => false,
                    'headers'  => array( 'Content-Type' => 'application/json' ),
                    'body'     => wp_json_encode( $body ),
                )
            );
        } catch ( \Throwable $e ) {
            // swallow
        }
    }

    /**
     * Standalone opt-in form. Drop this anywhere on the settings page.
     * Saves through the standard WP options.php endpoint using its own group.
     */
    public static function render_form(): void {
        $enabled = self::is_enabled();
        ?>
        <form method="post" action="options.php" class="card klyna-telemetry-card" style="margin-top:1rem;max-width:none;padding:1rem 1.25rem;">
            <?php settings_fields( self::SETTINGS_GROUP ); ?>
            <h2 style="margin-top:0;font-size:14px;text-transform:uppercase;letter-spacing:0.05em;color:#71717a;">
                <?php esc_html_e( 'Anonymous install stats', 'wp-tables' ); ?>
            </h2>
            <label style="display:flex;gap:0.6rem;align-items:flex-start;">
                <input type="checkbox" name="<?php echo esc_attr( self::OPTION_KEY ); ?>" value="1" <?php checked( $enabled ); ?>>
                <span>
                    <strong><?php esc_html_e( 'Share anonymous install stats (hashed site ID + version only)', 'wp-tables' ); ?></strong><br>
                    <span class="description">
                        <?php esc_html_e( 'Helps Klyna know which plugins are getting used. Default: off. No personal data — only a hashed site identifier and plugin/WP/PHP version. Pinged at most once per 7 days.', 'wp-tables' ); ?>
                    </span>
                </span>
            </label>
            <p><?php submit_button( __( 'Save telemetry preference', 'wp-tables' ), 'secondary', 'submit', false ); ?></p>
        </form>
        <?php
    }
}
