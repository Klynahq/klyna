import { useEffect, useState } from 'react';
import { api, type LinkSuggestion } from '../api/client.ts';
import { TopBar } from '../components/TopBar.tsx';
import { Card, CardBody, CardHeader } from '../components/Card.tsx';
import { Button } from '../components/Button.tsx';
import { Badge } from '../components/Badge.tsx';
import { Empty } from '../components/Empty.tsx';
import { Icon } from '../components/Icon.tsx';
import { StatCard } from '../components/StatCard.tsx';

export function InternalLinks() {
  const [suggestions, setSuggestions] = useState<LinkSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState<string | null>(null);
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .linkSuggestions()
      .then((s) => !cancelled && setSuggestions(s))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = suggestions.filter((s) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      s.from_title.toLowerCase().includes(q) ||
      s.to_title.toLowerCase().includes(q) ||
      s.anchor.toLowerCase().includes(q)
    );
  });

  const apply = async (s: LinkSuggestion) => {
    const key = `${s.from_id}-${s.to_id}`;
    setApplying(key);
    try {
      await api.applyLink(s);
      setApplied((prev) => new Set(prev).add(key));
    } finally {
      setApplying(null);
    }
  };

  return (
    <div className="flex-1 klyna-fade-in">
      <TopBar
        title="Internal Links"
        subtitle={`${suggestions.length} suggested link${suggestions.length === 1 ? '' : 's'} based on semantic similarity`}
        actions={
          <Button variant="primary" size="sm" icon={<Icon name="zap" size={12} />}>
            Apply all top picks
          </Button>
        }
      />

      <div className="px-8 py-8 space-y-6 max-w-[1280px]">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Suggested"
            value={suggestions.length}
            hint="Total candidates"
            compact
            icon={<Icon name="links" size={14} />}
          />
          <StatCard
            label="Strong matches"
            value={suggestions.filter((s) => s.similarity >= 0.35).length}
            hint=">= 0.35 similarity"
            compact
            icon={<Icon name="trending" size={14} />}
          />
          <StatCard
            label="Applied"
            value={applied.size}
            hint="This session"
            compact
            icon={<Icon name="check" size={14} />}
          />
          <StatCard
            label="Avg similarity"
            value={
              suggestions.length
                ? Math.round(
                    (suggestions.reduce((a, s) => a + s.similarity, 0) / suggestions.length) *
                      100,
                  ) / 100
                : 0
            }
            hint="Higher is better"
            compact
            icon={<Icon name="zap" size={14} />}
          />
        </div>

        <Card>
          <CardHeader
            title="Suggestions"
            subtitle="Anchor text is auto-picked from terms most relevant to both pages"
            action={
              <div className="relative">
                <Icon
                  name="search"
                  size={12}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[color:var(--color-klyna-text-dim)]"
                />
                <input
                  type="search"
                  placeholder="Filter…"
                  value={query}
                  onChange={(e) => setQuery(e.currentTarget.value)}
                  className="bg-[color:var(--color-klyna-bg)] border border-[color:var(--color-klyna-border)]/60 rounded-md pl-7 pr-3 py-1.5 text-[12px] text-[color:var(--color-klyna-text)] placeholder:text-[color:var(--color-klyna-text-dim)] focus:outline-none focus:border-[color:var(--color-klyna-accent)] w-44"
                />
              </div>
            }
          />
          <CardBody className="!p-0">
            {loading ? (
              <div className="px-5 py-10 text-center text-[13px] text-[color:var(--color-klyna-text-muted)]">
                Computing semantic links…
              </div>
            ) : filtered.length === 0 ? (
              <Empty
                icon={<Icon name="links" size={20} />}
                title="No suggestions"
                body={
                  query
                    ? 'Nothing matches that filter.'
                    : 'No internal-link opportunities found. The site is already well linked.'
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px] border-collapse">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-[color:var(--color-klyna-text-dim)] border-b border-[color:var(--color-klyna-border)]/40">
                      <th className="px-5 py-3 text-left font-semibold">From</th>
                      <th className="px-5 py-3 text-left font-semibold">Anchor</th>
                      <th className="px-5 py-3 text-left font-semibold">To</th>
                      <th className="px-5 py-3 text-left font-semibold">Match</th>
                      <th className="px-5 py-3 text-right font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((s) => {
                      const key = `${s.from_id}-${s.to_id}`;
                      const isApplied = applied.has(key);
                      const matchBadge =
                        s.similarity >= 0.4
                          ? 'success'
                          : s.similarity >= 0.25
                            ? 'accent'
                            : 'neutral';
                      return (
                        <tr
                          key={key}
                          className="border-b border-[color:var(--color-klyna-border)]/30 hover:bg-white/[0.02] transition-colors"
                        >
                          <td className="px-5 py-3.5">
                            <div className="font-medium truncate max-w-[240px]">
                              {s.from_title}
                            </div>
                          </td>
                          <td className="px-5 py-3.5">
                            <code className="font-mono text-[12px] bg-[color:var(--color-klyna-accent-soft)] text-[color:var(--color-klyna-accent)] px-2 py-0.5 rounded">
                              {s.anchor}
                            </code>
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="font-medium truncate max-w-[240px]">
                              {s.to_title}
                            </div>
                          </td>
                          <td className="px-5 py-3.5">
                            <Badge variant={matchBadge}>{s.similarity.toFixed(2)}</Badge>
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            {isApplied ? (
                              <span className="inline-flex items-center gap-1 text-emerald-400 text-[12px]">
                                <Icon name="check" size={12} />
                                Applied
                              </span>
                            ) : (
                              <Button
                                size="sm"
                                variant="secondary"
                                loading={applying === key}
                                onClick={() => apply(s)}
                              >
                                Apply
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
