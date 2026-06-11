#!/usr/bin/env bash
#
# One-shot scripted install of WordPress for testing the Klyna SEO Suite plugin.
# Assumes docker-compose is already running (`docker compose up -d`).
#
# Usage:
#   ./dev-setup.sh
#
# After it finishes:
#   - Admin: http://localhost:8080/wp-admin (user: admin / pass: admin)
#   - Site:  http://localhost:8080
#   - Klyna plugin is pre-activated.

set -euo pipefail

cd "$(dirname "$0")"

echo "==> Waiting for WordPress to respond..."
for i in {1..60}; do
  if curl -fs -o /dev/null -w "%{http_code}" http://localhost:8080 | grep -qE "200|302"; then
    echo "    ready (took ${i}s)"
    break
  fi
  sleep 1
done

# Helper: run a wp-cli command in the sidecar
wp() {
  docker compose run --rm -T wpcli "$@"
}

echo
echo "==> Installing WordPress core (if not already installed)..."
if ! wp core is-installed --allow-root 2>/dev/null; then
  wp core install \
    --url=http://localhost:8080 \
    --title="Klyna SEO Suite — Test Site" \
    --admin_user=admin \
    --admin_password=admin \
    --admin_email=admin@klyna.test \
    --skip-email \
    --allow-root
  echo "    installed"
else
  echo "    already installed"
fi

echo
echo "==> Activating Klyna SEO Suite plugin..."
wp plugin activate klyna-seo-suite --allow-root

echo
echo "==> Seeding a few demo posts so the plugin has content to analyze..."
wp post create --post_status=publish --post_title="What is GEO and why does it matter?" --post_content="<p>GEO (Generative Engine Optimization) is the practice of optimizing content so it gets cited inside LLM-generated answers. Unlike SEO which targets blue-link search results, GEO targets citation share inside ChatGPT, Claude, Perplexity, and Google AI Overviews.</p><h2>The key difference</h2><p>SEO optimizes for rankings. GEO optimizes for citations.</p>" --allow-root 2>/dev/null || true
wp post create --post_status=publish --post_title="Internal linking is the most underused SEO lever" --post_content="<p>Internal linking is the highest-ROI on-page SEO change most sites have left on the table. This post walks through the why and how.</p><h2>Why it works</h2><p>Search engines crawl the link graph. Authority flows through links. Topical relevance compounds across linked pages.</p>" --allow-root 2>/dev/null || true
wp post create --post_status=publish --post_title="Schema markup explained for non-developers" --post_content="<p>Schema.org structured data is how you tell Google what your page is about in machine-readable terms.</p>" --allow-root 2>/dev/null || true

echo
echo "==> Setting pretty permalinks..."
wp rewrite structure '/%postname%/' --hard --allow-root

echo
echo "════════════════════════════════════════════════════════"
echo "  Klyna SEO Suite test site is ready."
echo "════════════════════════════════════════════════════════"
echo
echo "  🌐 Site:    http://localhost:8080"
echo "  🔐 Admin:   http://localhost:8080/wp-admin"
echo "         user: admin"
echo "         pass: admin"
echo
echo "  🔌 Plugin admin: http://localhost:8080/wp-admin/admin.php?page=klyna-seo-suite"
echo
echo "  📄 View any post — the JSON-LD schema is now auto-injected in <head>."
echo "  🔗 Visit Klyna SEO Suite → Internal Links to see suggestions."
echo
