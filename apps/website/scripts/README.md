# Blog automation scripts

Scripts that power the Klyna blog publishing pipeline.

## `new-post.mjs`

Generates a draft `.mdx` file under `src/content/blog/` from a title or a JSON payload.

### Manual use

```bash
node scripts/new-post.mjs \
  --title "Schema markup for Shopify stores" \
  --category SEO \
  --tags shopify,schema,structured-data \
  --description "How to add product, FAQ, and review schema to a Shopify store without a paid app."
```

Outputs the path of the generated file. By default the post is created with `draft: true` (so it does not publish accidentally) unless you provide a `--body` directly.

### Programmatic use (CI / LLM pipelines)

Pipe a JSON payload via `--stdin`:

```bash
echo '{
  "title": "How to do GEO for a SaaS landing page",
  "description": "A step-by-step GEO playbook for SaaS founders, with citation-ready content patterns.",
  "category": "GEO",
  "tags": ["geo", "saas", "landing-page"],
  "body": "# How to do GEO...\\n\\nFull markdown body here.",
  "featured": false
}' | node scripts/new-post.mjs --stdin
```

The JSON keys mirror the content collection schema in `src/content.config.ts`.

## Daily automation

The repo includes a GitHub Action (`.github/workflows/daily-post.yml`) that runs every day at 13:00 UTC. Today it:

1. Checks out the repo.
2. Runs `node apps/website/scripts/new-post.mjs --stdin` with a JSON payload.

By default the workflow does **not** call any paid LLM API — the payload is sourced from `apps/website/scripts/daily-prompt.json` in the repo. Replace the `Generate body` step with whatever your content pipeline is:

- **Free option** — run a local model via Ollama on a self-hosted runner.
- **BYO key option** — call OpenAI / Anthropic / Gemini / Groq with your own API key stored as a GitHub Actions secret.
- **Hybrid** — keep the action lightweight and use it only to scaffold the file; you (or another job) fill in the body and the action commits when it sees a non-empty body.

The shape is intentionally open so the studio can swap the content engine without changing the rest of the pipeline.
