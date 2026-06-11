import { useEffect, useState } from 'react';
import { api, type SettingsResponse } from '../api/client.ts';
import { TopBar } from '../components/TopBar.tsx';
import { Card, CardBody, CardHeader } from '../components/Card.tsx';
import { Toggle } from '../components/Toggle.tsx';
import { Badge } from '../components/Badge.tsx';
import { Icon } from '../components/Icon.tsx';

const SCHEMA_TYPES = [
  {
    key: 'enable_organization' as const,
    name: 'Organization',
    detail: 'Sitewide brand identity — shown to Google Knowledge Graph and cited by LLMs.',
    impact: 'Brand visibility · GEO citations',
  },
  {
    key: 'enable_schema' as const,
    name: 'Article / BlogPosting',
    detail: 'Every blog post is marked up with author, dates, headline, and image.',
    impact: 'Rich SERP results · GEO citations',
  },
  {
    key: 'enable_breadcrumbs' as const,
    name: 'BreadcrumbList',
    detail: 'Adds navigation breadcrumbs to every page for Google site links.',
    impact: 'CTR · Sitelinks',
  },
  {
    key: 'enable_faq_schema' as const,
    name: 'FAQPage',
    detail: 'Auto-detects Q/A sections in your posts and emits FAQPage schema.',
    impact: 'Massive GEO boost · Featured snippets',
  },
  {
    key: 'enable_open_graph' as const,
    name: 'Open Graph + Twitter Card',
    detail: 'Per-post OG image, title, description for social previews.',
    impact: 'Social CTR',
  },
];

export function SchemaPage() {
  const [settings, setSettings] = useState<SettingsResponse | null>(null);

  useEffect(() => {
    void api.settings().then(setSettings);
  }, []);

  const toggle = async (key: keyof SettingsResponse) => {
    if (!settings) return;
    const next = { ...settings, [key]: !settings[key] } as SettingsResponse;
    setSettings(next);
    await api.saveSettings({ [key]: next[key] } as Partial<SettingsResponse>);
  };

  if (!settings) {
    return (
      <div className="flex-1">
        <TopBar title="Schema" subtitle="Loading…" />
      </div>
    );
  }

  return (
    <div className="flex-1 klyna-fade-in">
      <TopBar
        title="Schema"
        subtitle="JSON-LD structured data — what you ship to Google and what LLMs cite"
      />

      <div className="px-8 py-8 max-w-[1280px] space-y-6">
        <Card gradient>
          <div className="p-6 flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-[color:var(--color-klyna-accent-soft)] text-[color:var(--color-klyna-accent)] flex items-center justify-center">
              <Icon name="schema" />
            </div>
            <div>
              <h2 className="text-[16px] font-semibold">
                Klyna auto-injects every important schema type — no per-post setup
              </h2>
              <p className="text-[13px] text-[color:var(--color-klyna-text-muted)] mt-1 max-w-2xl leading-relaxed">
                Toggle a type off if you want to handle it elsewhere (Yoast, RankMath, etc).
                Otherwise leave them all on — they compound nicely for both classic SEO and
                Generative Engine Optimization.
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Schema types" subtitle="Auto-injected on every matching page" />
          <CardBody className="!p-0">
            <ul className="divide-y divide-[color:var(--color-klyna-border)]/40">
              {SCHEMA_TYPES.map((t) => {
                const enabled = Boolean(settings[t.key]);
                return (
                  <li key={t.key} className="flex items-center gap-4 px-5 py-4">
                    <div
                      className={`shrink-0 w-9 h-9 rounded-md flex items-center justify-center transition-colors ${
                        enabled
                          ? 'bg-[color:var(--color-klyna-accent-soft)] text-[color:var(--color-klyna-accent)]'
                          : 'bg-white/5 text-[color:var(--color-klyna-text-dim)]'
                      }`}
                    >
                      <Icon name="schema" size={16} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-[14px]">{t.name}</span>
                        {enabled ? (
                          <Badge variant="success">Active</Badge>
                        ) : (
                          <Badge variant="neutral">Off</Badge>
                        )}
                      </div>
                      <div className="text-[12px] text-[color:var(--color-klyna-text-muted)] mt-1 leading-relaxed">
                        {t.detail}
                      </div>
                      <div className="text-[11px] text-[color:var(--color-klyna-accent)] mt-1.5 font-medium">
                        {t.impact}
                      </div>
                    </div>
                    <Toggle checked={enabled} onChange={() => void toggle(t.key)} />
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
