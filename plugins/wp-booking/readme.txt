=== Klyna Booking ===
Contributors: klyna
Tags: booking, appointments, scheduling, calendar, reservations
Requires at least: 6.4
Tested up to: 6.7
Requires PHP: 8.0
Stable tag: 0.1.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Appointments and bookings for WordPress — services, weekly availability, real-time slot calculation, and confirmation emails. Open, self-hosted, no paid APIs.

== Description ==

**Klyna Booking** turns any WordPress site into a booking system. Define your services, set your weekly hours, drop a form on a page, and start taking appointments — all from one open plugin that runs entirely on your own server.

Built by [Klyna](https://klyna.dev), an indie studio. *Tools that help your work get found.*

= What it does =

* **Services** — create bookable offerings as a custom post type, each with a duration, price, and per-slot capacity.
* **Weekly availability** — set opening hours for each day of the week, plus blackout dates for holidays and closures.
* **Real-time slots** — the front-end form computes open time slots from your hours, the service duration, your minimum lead time, and the bookings already on the books. Time zone and DST safe.
* **Front-end form** — add it anywhere with the `[klyna_booking]` shortcode or the **Klyna Booking form** block. A clean, multi-step flow: pick a service, pick a time, enter details, done.
* **Bookings dashboard** — every reservation lands in an admin list you can filter by status and confirm or cancel in one click.
* **Confirmation emails** — branded emails to the customer and a notification to you on every new booking, plus follow-ups when you confirm or cancel.
* **No paid APIs** — everything is computed in PHP on your server. No external services, no API keys, no data leaving your site.

= Built to stay out of the way =

The booking form is progressively enhanced vanilla JavaScript — no jQuery, no megabyte of framework. Slots are recalculated server-side before every booking is saved, so a stale form can never double-book a slot.

= Optional manual approval =

Prefer to vet requests first? Turn on **Require manual approval** and new bookings arrive as *Pending* until you confirm them — the customer is only emailed a confirmation once you do.

== Installation ==

1. Upload the `wp-booking` folder to `/wp-content/plugins/`.
2. Activate the plugin from **Plugins** in the WordPress admin.
3. Go to **Booking → Services** and add at least one service (set its duration and price).
4. Go to **Booking → Availability** and set your weekly opening hours.
5. Go to **Booking → Settings** to set your business name, notification email, and time zone.
6. Add the booking form to any page with the `[klyna_booking]` shortcode or the **Klyna Booking form** block.

== Frequently Asked Questions ==

= Does it call any external services? =

No. Slot calculation, availability, and email all run on your own server using core WordPress APIs. There are no API keys to enter and no third-party SaaS.

= How are time zones handled? =

All bookings are stored in UTC and displayed in your site's time zone (overridable in **Booking → Settings**). Slot maths is computed against the site time zone, so opening hours stay correct across daylight-saving changes.

= Can one slot take more than one booking? =

Yes. Each service has a **capacity per slot** — set it above 1 for classes or group sessions, and the form keeps offering a slot until it is full.

= Can I require approval before a booking is confirmed? =

Yes. Enable **Require manual approval** in Settings. New bookings arrive as *Pending*; the customer receives a confirmation email only when you confirm them from the dashboard.

= Will the form work without jQuery? =

Yes. The front-end form is dependency-free vanilla JavaScript and talks to the REST API directly.

= Where is my data stored? =

Only in your WordPress database. Services and bookings are custom post types; settings are a single option. Nothing is sent anywhere.

== Screenshots ==

1. The bookings dashboard — filter by status, confirm or cancel in one click.
2. The front-end booking form — service, then time, then details.
3. Weekly availability and blackout dates.
4. Plugin settings — business details, scheduling rules, and confirmation toggles.

== Changelog ==

= 0.1.0 =
* Initial release.
* Services custom post type with duration, price, and capacity.
* Weekly availability model with per-day hours and blackout dates.
* Real-time, time-zone-aware slot calculation with lead time and booking window.
* Front-end booking form via `[klyna_booking]` shortcode and block.
* Bookings stored as a private custom post type with pending / confirmed / cancelled statuses.
* Customer and admin confirmation emails, plus status-change follow-ups.
* Admin bookings dashboard with status filtering and one-click confirm/cancel.
* REST API under `wp-booking/v1` with nonce auth and per-IP rate limiting.

== Upgrade Notice ==

= 0.1.0 =
First public release.
