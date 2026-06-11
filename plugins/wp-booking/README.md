# Klyna Booking

> Appointments & bookings for WordPress — services, availability, and confirmations.
> Part of the [Klyna](https://klyna.dev) toolkit. *Tools that help your work get found.*

Klyna Booking turns any WordPress site into a self-hosted booking system. Define
services, set weekly hours, drop a form on a page, and take appointments — with
real-time slot calculation and confirmation emails, all computed on your own
server. No paid APIs, no third-party SaaS, no jQuery.

---

## Features

- **Services CPT** — bookable offerings with duration (minutes), price, and
  per-slot capacity, managed like any other post type.
- **Weekly availability** — per-day opening hours plus a blackout-date list for
  holidays and closures.
- **Real-time slot calculation** — open slots are derived from your hours, the
  service duration, the slot interval, your minimum lead time, the booking
  window, and the bookings already taken. Stored in UTC, displayed in the site
  time zone, DST-safe.
- **Front-end form** — `[klyna_booking]` shortcode and a `klyna/booking-form`
  block render the same progressively-enhanced, no-jQuery multi-step flow
  (service → time → details → confirmation).
- **Bookings** — stored as a private custom post type with three custom
  statuses: pending, confirmed, cancelled.
- **Confirmation emails** — branded HTML emails to the customer and a
  notification to the business on every booking, with status-change follow-ups.
- **Admin dashboard** — branded dark/violet bookings list with status filters
  and one-click confirm/cancel via REST.
- **Optional manual approval** — hold bookings as *Pending* until you confirm.

## How it fits together

```
wp-booking.php                 Plugin header, constants, autoloader, bootstrap
includes/
  class-plugin.php             Orchestrator — boots every subsystem
  class-services.php           Services CPT + meta (duration/price/capacity)
  class-bookings.php           Bookings CPT + custom statuses + queries
  class-availability.php       Weekly hours, blackout dates, slot calculation
  class-rest.php               REST routes (public + admin) under wp-booking/v1
  class-frontend.php           Shortcode + block + asset enqueue
  class-emails.php             Customer + admin confirmation emails
  class-admin.php              Dashboard, availability, settings pages
assets/
  admin/admin.css, admin.js    Branded admin dashboard + bookings list
  css/booking.css              Front-end form styles
  js/booking.js                Front-end booking flow (vanilla JS)
  logo.svg                     Product logo (calendar + check glyph)
languages/wp-booking.pot       Translation template
uninstall.php                  Removes options, posts, and transients
```

### Conventions (matches the Klyna SEO Suite reference)

- **PHP namespace:** `KlynaBooking\*`, autoloaded by name from
  `includes/class-*.php`.
- **Constants:** `KLYNA_BOOKING_*` (version, dirs, URL, option key).
- **Settings option:** `wp_booking_settings` — a single assoc array; defaults
  applied on every read via `Plugin::settings()`.
- **REST namespace:** `wp-booking/v1`. Public routes are nonce-protected and
  rate-limited; admin routes require `manage_options`.
- **Text domain / slug:** `wp-booking`.

These prefixes are deliberately distinct from the SEO Suite's `Klyna\` /
`KLYNA_*` so the two plugins coexist without collision.

## REST API

| Method | Route | Auth | Purpose |
| ------ | ----- | ---- | ------- |
| GET  | `/services` | public | List bookable services + bookable dates |
| GET  | `/slots?service=&date=` | public | Open slots for a service on a date |
| POST | `/bookings` | nonce + rate limit | Create a booking |
| GET  | `/admin/bookings` | `manage_options` | Paginated bookings list |
| POST | `/admin/bookings/{id}/status` | `manage_options` | Confirm / cancel |

Every write sanitizes its input, re-validates the slot server-side before
persisting, and escapes all output.

## Install (development)

This plugin is self-contained — no Composer, no build step.

```bash
# From a WordPress install:
cp -r wp-booking /path/to/wp-content/plugins/
wp plugin activate wp-booking
```

Then:

1. **Booking → Services** — add a service, set its duration and price.
2. **Booking → Availability** — set weekly hours and any blackout dates.
3. **Booking → Settings** — business name, notification email, time zone,
   slot interval, lead time, booking window, and confirmation toggles.
4. Put `[klyna_booking]` on a page (or insert the **Klyna Booking form** block).

To restrict the form to a single service, pass its ID:
`[klyna_booking service="42"]`.

## Filters

- `klyna_booking_customer_email` — `{subject, body}` for the customer email.
- `klyna_booking_admin_email` — `{subject, body}` for the admin notification.

## Actions

- `klyna_booking_created` — `($booking_id, $status)` after a booking is saved.
- `klyna_booking_status_changed` — `($booking_id, $status)` on confirm/cancel.

## STATUS — honest assessment

**Working and complete (v0.1.0):**

- ✅ Services CPT with duration / price / capacity meta (classic meta box +
  REST-registered meta for Gutenberg).
- ✅ Weekly availability model, blackout dates, booking window.
- ✅ Time-zone-aware, DST-safe slot calculation with lead time, slot interval,
  and capacity-aware overlap checks against existing bookings.
- ✅ Front-end form (shortcode + block), vanilla JS, no jQuery.
- ✅ Bookings CPT with pending/confirmed/cancelled statuses.
- ✅ Customer + admin confirmation emails via `wp_mail`, with status follow-ups.
- ✅ Admin dashboard with status filtering and one-click confirm/cancel.
- ✅ REST API with nonce auth, capability checks, and per-IP rate limiting.
- ✅ Clean uninstall (option, posts, transients).
- ✅ Full i18n with a generated `.pot`.

**Known limitations / not yet built:**

- ⚠️ **No payments.** Price is informational only; there is no checkout or
  payment gateway. A booking is a reservation, not a paid order.
- ⚠️ **Single resource model.** Capacity is per-slot, but there is no concept
  of multiple staff/rooms each with their own calendar. One service = one
  shared availability window.
- ⚠️ **No customer-side cancellation/reschedule.** Status changes are
  admin-only. There is no tokenized "manage your booking" link yet.
- ⚠️ **No calendar (`.ics`) attachment or Google/Outlook sync.**
- ⚠️ **No reminder emails.** Only confirmation + status-change emails are sent;
  there is no scheduled reminder before the appointment.
- ⚠️ **Concurrency.** Slot re-validation closes the common double-book window,
  but there is no DB-level lock; two simultaneous requests for the last seat of
  a high-capacity slot could in theory both succeed. Fine for typical traffic.
- ⚠️ **Email delivery** depends on the site's `wp_mail` transport. For reliable
  delivery, pair with an SMTP plugin.

These are deliberate scope cuts for a first release, not stubs — every shipped
path is a real implementation.

## License

GPL-2.0-or-later. © Klyna.
