=== Klyna SEO Suite ===
Contributors: klyna
Tags: seo, schema, internal-linking, faq, geo, ai-overviews
Requires at least: 6.4
Tested up to: 6.7
Requires PHP: 8.0
Stable tag: 0.1.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Autopilot SEO for WordPress. Schema markup, internal linking, FAQ auto-detection, and content freshness — all from one open plugin. No paid APIs.

== Description ==

**Klyna SEO Suite** is the WordPress half of the Klyna toolkit — an indie SEO + GEO (Generative Engine Optimization) plugin that automates the work that actually moves rankings, without charging for a dashboard.

Built by [Klyna](https://klyna.dev), an indie studio.

= What it does =

* Auto-injects schema.org **Organization** and **WebSite** markup sitewide.
* Adds **BlogPosting** + **BreadcrumbList** to every single post.
* Detects FAQ-shaped content and emits **FAQPage** schema (a huge boost for Google rich results and LLM citations).
* Runs a local **TF-IDF internal-link analysis** across your entire post corpus and surfaces the strongest missing internal links.
* All processing runs on **your server**. No third-party APIs, no API keys, no data leaves your site.

= Designed for GEO =

GEO is the new layer on top of SEO — getting cited inside ChatGPT, Claude, Perplexity, Gemini, and Google AI Overviews answers. Klyna emits the structured data, factual sentences, and FAQ markup that LLM crawlers cite most.

= Why we built it =

Most SEO plugins are dashboards. We wanted a plugin that does the work — auto-injects what should be auto-injected, surfaces what needs human review, and stays out of the way.

== Installation ==

1. Upload the `klyna-seo-suite` folder to `/wp-content/plugins/`.
2. Activate the plugin from **Plugins** in the WordPress admin.
3. Visit **Klyna SEO → Settings** to enter your organization name and social URLs.
4. Visit **Klyna SEO → Internal links** to run your first internal-linking scan.

== Frequently Asked Questions ==

= Does it call any external services? =

No. Every check, every analysis, every generated schema block is computed on your own server using pure PHP. No third-party API keys required.

= Does it conflict with Yoast / RankMath / All-in-One SEO? =

Klyna only emits schema your other plugin does not. If you already have Article schema from another plugin, the Klyna block is additive and either both render (multiple JSON-LD blocks are valid per spec) or you can disable specific blocks under Settings.

= Will it slow down my site? =

No. Schema injection runs on `wp_head` with minimal overhead. The TF-IDF link analyzer runs on demand from the admin (not on every page request).

= Where is my data stored? =

Only in your WordPress database (plugin settings only). We never collect anything.

== Screenshots ==

1. The dashboard with one-click access to the schema, FAQ, and internal-linking modules.
2. The internal link suggestion tool — TF-IDF similarity, ranked.
3. The settings page.

== Changelog ==

= 0.1.0 =
* Initial release.
* Organization + WebSite + BlogPosting + BreadcrumbList schema injection.
* FAQPage schema auto-detection from `<details>` blocks and Q-shaped headings.
* TF-IDF internal-link suggestion engine with REST endpoint.
* Admin dashboard, settings page, and internal-link tool.

== Upgrade Notice ==

= 0.1.0 =
First public release.
