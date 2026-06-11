import { useEffect, useState } from 'react';
import { api, type SettingsResponse } from '../api/client.ts';
import { TopBar } from '../components/TopBar.tsx';
import { Card, CardBody, CardHeader } from '../components/Card.tsx';
import { Toggle } from '../components/Toggle.tsx';
import { Button } from '../components/Button.tsx';
import { Icon } from '../components/Icon.tsx';

const AI_PROVIDERS = [
  {
    value: 'openrouter',
    label: 'OpenRouter (free models)',
    docs: 'https://openrouter.ai/keys',
    defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
    models: [
      { value: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B (free)' },
      { value: 'deepseek/deepseek-r1:free', label: 'DeepSeek R1 (free)' },
      { value: 'google/gemini-2.0-flash-exp:free', label: 'Gemini 2.0 Flash (free)' },
      { value: 'meta-llama/llama-3.1-405b-instruct:free', label: 'Llama 3.1 405B (free)' },
      { value: 'mistralai/mistral-small-3.1-24b-instruct:free', label: 'Mistral Small 3.1 (free)' },
    ],
    needsEndpoint: false,
    endpointLabel: '',
  },
  {
    value: 'groq',
    label: 'Groq (fast & free)',
    docs: 'https://console.groq.com/keys',
    defaultModel: 'llama-3.3-70b-versatile',
    models: [
      { value: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B Versatile' },
      { value: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant' },
      { value: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B' },
    ],
    needsEndpoint: false,
    endpointLabel: '',
  },
  {
    value: 'gemini',
    label: 'Google Gemini (1500/day free)',
    docs: 'https://aistudio.google.com/apikey',
    defaultModel: 'gemini-2.0-flash',
    models: [
      { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
      { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
      { value: 'gemini-1.5-flash-8b', label: 'Gemini 1.5 Flash 8B' },
    ],
    needsEndpoint: false,
    endpointLabel: '',
  },
  {
    value: 'cloudflare',
    label: 'Cloudflare Workers AI (10K/day free)',
    docs: 'https://dash.cloudflare.com/profile/api-tokens',
    defaultModel: '@cf/meta/llama-3.1-8b-instruct',
    models: [
      { value: '@cf/meta/llama-3.1-8b-instruct', label: 'Llama 3.1 8B' },
      { value: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', label: 'Llama 3.3 70B Fast' },
      { value: '@cf/mistral/mistral-7b-instruct-v0.1', label: 'Mistral 7B' },
    ],
    needsEndpoint: true,
    endpointLabel: 'Cloudflare Account ID',
  },
  {
    value: 'ollama',
    label: 'Ollama (self-hosted, unlimited)',
    docs: 'https://ollama.com',
    defaultModel: 'llama3.2',
    models: [
      { value: 'llama3.2', label: 'Llama 3.2' },
      { value: 'llama3.1', label: 'Llama 3.1' },
      { value: 'qwen2.5', label: 'Qwen 2.5' },
      { value: 'mistral', label: 'Mistral' },
      { value: 'phi3', label: 'Phi-3' },
    ],
    needsEndpoint: true,
    endpointLabel: 'Ollama URL (e.g. http://localhost:11434)',
  },
] as const;

export function Settings() {
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const runAiTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.aiTest();
      setTestResult(
        res.ok
          ? `✓ Connected. Response: "${(res.text ?? '').slice(0, 80)}"`
          : `✗ ${res.reason ?? 'failed'} — ${res.message ?? res.text ?? ''}`,
      );
    } catch (e) {
      setTestResult('✗ ' + (e instanceof Error ? e.message : 'unknown error'));
    } finally {
      setTesting(false);
    }
  };

  useEffect(() => {
    void api.settings().then(setSettings);
  }, []);

  const patch = <K extends keyof SettingsResponse>(key: K, value: SettingsResponse[K]) => {
    if (!settings) return;
    setSettings({ ...settings, [key]: value });
    setDirty(true);
  };

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      await api.saveSettings(settings);
      setDirty(false);
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 2400);
    } finally {
      setSaving(false);
    }
  };

  if (!settings) {
    return (
      <div className="flex-1">
        <TopBar title="Settings" subtitle="Loading…" />
      </div>
    );
  }

  return (
    <div className="flex-1 klyna-fade-in">
      <TopBar
        title="Settings"
        subtitle="Tune the Klyna engine to your site"
        actions={
          <Button
            variant={dirty ? 'primary' : 'secondary'}
            size="sm"
            onClick={save}
            loading={saving}
            disabled={!dirty}
            icon={!saving && dirty && <Icon name="check" size={12} />}
          >
            {dirty ? 'Save changes' : 'Saved'}
          </Button>
        }
      />

      <div className="px-8 py-8 max-w-[1280px] space-y-6">
        <Card>
          <CardHeader
            title="Brand identity"
            subtitle="Used in Organization schema, Open Graph, and the FAQ generator"
          />
          <CardBody className="space-y-5">
            <Field
              label="Organization name"
              hint="Shown in JSON-LD Organization and Article author."
            >
              <input
                type="text"
                value={settings.organization_name}
                onChange={(e) => patch('organization_name', e.currentTarget.value)}
                className="w-full bg-[color:var(--color-klyna-bg)] border border-[color:var(--color-klyna-border)]/60 rounded-md px-3 py-2 text-[13px] focus:outline-none focus:border-[color:var(--color-klyna-accent)]"
              />
            </Field>
            <Field
              label="Organization logo URL"
              hint="A 512×512 PNG works best. Leave blank to use the site icon."
            >
              <input
                type="url"
                value={settings.organization_logo}
                onChange={(e) => patch('organization_logo', e.currentTarget.value)}
                placeholder="https://example.com/logo.png"
                className="w-full bg-[color:var(--color-klyna-bg)] border border-[color:var(--color-klyna-border)]/60 rounded-md px-3 py-2 text-[13px] focus:outline-none focus:border-[color:var(--color-klyna-accent)]"
              />
            </Field>
            <Field label="Twitter / X handle" hint="With or without the @ — Twitter Card meta.">
              <input
                type="text"
                value={settings.twitter_handle}
                onChange={(e) => patch('twitter_handle', e.currentTarget.value)}
                placeholder="@klynahq"
                className="w-full bg-[color:var(--color-klyna-bg)] border border-[color:var(--color-klyna-border)]/60 rounded-md px-3 py-2 text-[13px] focus:outline-none focus:border-[color:var(--color-klyna-accent)]"
              />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Modules"
            subtitle="Each module is independent — keep what you use, turn off the rest"
          />
          <CardBody className="space-y-5">
            <Toggle
              checked={settings.enable_schema}
              onChange={(v) => patch('enable_schema', v)}
              label="JSON-LD schema injection"
              hint="Organization, WebSite, Article — auto-rendered in <head>."
            />
            <Toggle
              checked={settings.enable_internal_links}
              onChange={(v) => patch('enable_internal_links', v)}
              label="Internal-link suggestions"
              hint="Compute semantic suggestions across all posts on schedule."
            />
            <Toggle
              checked={settings.enable_faq_schema}
              onChange={(v) => patch('enable_faq_schema', v)}
              label="FAQ detection + FAQPage schema"
              hint="Find Q/A patterns in post content and emit FAQPage JSON-LD. Big GEO win."
            />
            <Toggle
              checked={settings.enable_breadcrumbs}
              onChange={(v) => patch('enable_breadcrumbs', v)}
              label="BreadcrumbList schema"
              hint="Auto-build a Breadcrumb graph from your taxonomy."
            />
            <Toggle
              checked={settings.enable_open_graph}
              onChange={(v) => patch('enable_open_graph', v)}
              label="Open Graph + Twitter Card"
              hint="Per-post social meta — replaces Yoast/RankMath if you only need this."
            />
          </CardBody>
        </Card>

        <AiSection />

        <Card>
          <CardHeader
            title="Internal-link engine"
            subtitle="Tune how aggressively Klyna suggests links"
          />
          <CardBody className="space-y-5">
            <Field
              label={`Max suggestions per post — ${settings.internal_links_per_post}`}
              hint="Higher = more candidates but more noise."
            >
              <input
                type="range"
                min={1}
                max={15}
                value={settings.internal_links_per_post}
                onChange={(e) =>
                  patch('internal_links_per_post', Number(e.currentTarget.value))
                }
                className="w-full accent-[color:var(--color-klyna-accent)]"
              />
            </Field>
            <Field
              label={`Minimum similarity — ${settings.internal_links_min_similarity.toFixed(2)}`}
              hint="Lower = more matches surface. Default 0.15."
            >
              <input
                type="range"
                min={5}
                max={80}
                value={Math.round(settings.internal_links_min_similarity * 100)}
                onChange={(e) =>
                  patch('internal_links_min_similarity', Number(e.currentTarget.value) / 100)
                }
                className="w-full accent-[color:var(--color-klyna-accent)]"
              />
            </Field>
          </CardBody>
        </Card>
      </div>

      {savedToast && (
        <div className="fixed bottom-6 right-6 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 px-4 py-2 rounded-md text-[13px] flex items-center gap-2 shadow-lg klyna-fade-in">
          <Icon name="check" size={14} />
          Settings saved
        </div>
      )}
    </div>
  );

  function AiSection() {
    if (!settings) return null;
    const provider = AI_PROVIDERS.find((p) => p.value === settings.ai_provider) ?? AI_PROVIDERS[0]!;
    return (
      <Card>
        <CardHeader
          title="AI assistant"
          subtitle="Free text-AI for content rewrites. Bring-your-own-key — all the supported providers have a generous free tier."
          action={
            <Button
              size="sm"
              variant="secondary"
              icon={<Icon name="zap" size={12} />}
              onClick={runAiTest}
              loading={testing}
            >
              Test connection
            </Button>
          }
        />
        <CardBody className="space-y-5">
          <Field label="Provider" hint="All options are free-tier compatible. Switch anytime.">
            <select
              value={settings.ai_provider}
              onChange={(e) => {
                const v = e.currentTarget.value;
                const p = AI_PROVIDERS.find((x) => x.value === v) ?? AI_PROVIDERS[0]!;
                patch('ai_provider', v as SettingsResponse['ai_provider']);
                patch('ai_model', p.defaultModel);
              }}
              className="w-full bg-[color:var(--color-klyna-bg)] border border-[color:var(--color-klyna-border)]/60 rounded-md px-3 py-2 text-[13px] focus:outline-none focus:border-[color:var(--color-klyna-accent)]"
            >
              {AI_PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            <a
              href={provider.docs}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-[color:var(--color-klyna-accent)] hover:underline mt-1 inline-flex items-center gap-1"
            >
              Get your free {provider.value === 'ollama' ? 'install' : 'key'} here
              <Icon name="external" size={10} />
            </a>
          </Field>

          <Field label="Model">
            <select
              value={settings.ai_model}
              onChange={(e) => patch('ai_model', e.currentTarget.value)}
              className="w-full bg-[color:var(--color-klyna-bg)] border border-[color:var(--color-klyna-border)]/60 rounded-md px-3 py-2 text-[13px] focus:outline-none focus:border-[color:var(--color-klyna-accent)]"
            >
              {provider.models.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </Field>

          {provider.value !== 'ollama' && (
            <Field
              label="API key"
              hint="Stored only in your WordPress database. Never sent anywhere except your chosen provider."
            >
              <input
                type="password"
                value={settings.ai_api_key}
                onChange={(e) => patch('ai_api_key', e.currentTarget.value)}
                placeholder={
                  provider.value === 'openrouter'
                    ? 'sk-or-v1-…'
                    : provider.value === 'groq'
                      ? 'gsk_…'
                      : provider.value === 'gemini'
                        ? 'AIza…'
                        : 'cf-…'
                }
                className="w-full bg-[color:var(--color-klyna-bg)] border border-[color:var(--color-klyna-border)]/60 rounded-md px-3 py-2 text-[13px] font-mono focus:outline-none focus:border-[color:var(--color-klyna-accent)]"
              />
            </Field>
          )}

          {provider.needsEndpoint && (
            <Field label={provider.endpointLabel}>
              <input
                type="text"
                value={settings.ai_endpoint}
                onChange={(e) => patch('ai_endpoint', e.currentTarget.value)}
                placeholder={
                  provider.value === 'ollama'
                    ? 'http://localhost:11434'
                    : 'your-cloudflare-account-id'
                }
                className="w-full bg-[color:var(--color-klyna-bg)] border border-[color:var(--color-klyna-border)]/60 rounded-md px-3 py-2 text-[13px] font-mono focus:outline-none focus:border-[color:var(--color-klyna-accent)]"
              />
            </Field>
          )}

          <Field
            label={`Daily call cap — ${settings.ai_daily_cap}`}
            hint="Hard limit. Once hit, AI calls return ‟daily_cap_reached” until 00:00 UTC. Use this to protect quotas."
          >
            <input
              type="range"
              min={10}
              max={1000}
              step={10}
              value={settings.ai_daily_cap}
              onChange={(e) => patch('ai_daily_cap', Number(e.currentTarget.value))}
              className="w-full accent-[color:var(--color-klyna-accent)]"
            />
          </Field>

          {testResult && (
            <div
              className={`text-[12px] px-3 py-2 rounded-md border ${
                testResult.startsWith('✓')
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
              }`}
            >
              {testResult}
            </div>
          )}
        </CardBody>
      </Card>
    );
  }
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="text-[12px] font-medium text-[color:var(--color-klyna-text)] mb-1.5">
        {label}
      </div>
      {children}
      {hint && (
        <div className="text-[11px] text-[color:var(--color-klyna-text-muted)] mt-1.5">{hint}</div>
      )}
    </label>
  );
}
