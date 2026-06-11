import { env } from './env.server';

export async function createGithubIssue(opts: {
  title: string;
  body: string;
  labels?: string[];
}): Promise<{ url: string } | null> {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) return null;
  try {
    const res = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/issues`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: opts.title, body: opts.body, labels: opts.labels }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { html_url?: string };
    return json.html_url ? { url: json.html_url } : null;
  } catch {
    return null;
  }
}
