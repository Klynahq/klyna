import { useEffect, useState } from 'react';
import { api, type PostSummary, type StatsResponse } from '../api/client.ts';
import { TopBar } from '../components/TopBar.tsx';
import { StatCard } from '../components/StatCard.tsx';
import { Card, CardBody, CardHeader } from '../components/Card.tsx';
import { ScoreRing } from '../components/ScoreRing.tsx';
import { Sparkline } from '../components/Sparkline.tsx';
import { Badge } from '../components/Badge.tsx';
import { Button } from '../components/Button.tsx';
import { Icon } from '../components/Icon.tsx';
import { formatRelative, scoreColor } from '../lib/cn.ts';

export function Dashboard() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    setRefreshing(true);
    try {
      const [s, p] = await Promise.all([api.stats(), api.posts()]);
      setStats(s);
      setPosts(p);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  if (!stats) {
    return (
      <div className="flex-1">
        <TopBar title="Dashboard" subtitle="Loading…" />
        <div className="px-8 py-12 text-[13px] text-[color:var(--color-klyna-text-muted)]">
          Fetching latest stats…
        </div>
      </div>
    );
  }

  const sortedPosts = [...posts].sort((a, b) => a.score - b.score).slice(0, 5);

  return (
    <div className="flex-1 klyna-fade-in">
      <TopBar
        title="Dashboard"
        subtitle={`Last audit ${formatRelative(stats.last_audit)} · ${stats.posts_published} posts tracked`}
        actions={
          <Button
            variant="secondary"
            size="sm"
            loading={refreshing}
            icon={!refreshing && <Icon name="refresh" size={12} />}
            onClick={load}
          >
            Refresh
          </Button>
        }
      />

      <div className="px-8 py-8 space-y-8 max-w-[1280px]">
        {/* Hero — overall score + trend */}
        <Card gradient>
          <div className="grid md:grid-cols-[auto_1fr_auto] items-center gap-6 p-6">
            <ScoreRing score={stats.avg_score} size={120} thickness={8} />
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[color:var(--color-klyna-text-dim)]">
                Average score across all posts
              </div>
              <h2 className="text-[28px] font-semibold tracking-tight mt-1">
                {stats.avg_score >= 90
                  ? 'Excellent — keep shipping.'
                  : stats.avg_score >= 75
                    ? 'Good shape, a few wins left on the table.'
                    : stats.avg_score >= 60
                      ? 'Decent — clear room to improve.'
                      : 'A lot of low-hanging fruit available.'}
              </h2>
              <p className="text-[13px] text-[color:var(--color-klyna-text-muted)] mt-1 max-w-lg">
                Auto-injected schema covers <strong className="text-[color:var(--color-klyna-text)]">{stats.schema_coverage}%</strong> of your content. {stats.orphan_pages} orphan{stats.orphan_pages === 1 ? '' : 's'} found · {stats.posts_with_faq} post{stats.posts_with_faq === 1 ? '' : 's'} have FAQ schema.
              </p>
            </div>
            <div className="hidden md:block">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--color-klyna-text-dim)] mb-1.5">
                Last 14 days
              </div>
              <Sparkline
                values={stats.score_trend.map((t) => t.score)}
                width={220}
                height={56}
              />
            </div>
          </div>
        </Card>

        {/* Stat grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Posts"
            value={stats.posts_published}
            hint={`${stats.pages_published} pages`}
            icon={<Icon name="file" size={16} />}
          />
          <StatCard
            label="Schema coverage"
            value={`${stats.schema_coverage}%`}
            trend={stats.schema_coverage >= 90 ? 4 : -2}
            icon={<Icon name="schema" size={16} />}
          />
          <StatCard
            label="Internal links"
            value={stats.internal_links_total}
            hint={`${stats.orphan_pages} orphans`}
            icon={<Icon name="links" size={16} />}
          />
          <StatCard
            label="FAQ posts"
            value={stats.posts_with_faq}
            hint="Schema attached"
            icon={<Icon name="zap" size={16} />}
          />
        </div>

        {/* Two-column: posts needing attention + activity */}
        <div className="grid lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader
              title="Posts that need attention"
              subtitle="Sorted by lowest score first"
              action={
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Icon name="arrow_right" size={12} />}
                >
                  See all
                </Button>
              }
            />
            <CardBody className="!p-0">
              <ul className="divide-y divide-[color:var(--color-klyna-border)]/40">
                {sortedPosts.map((p) => {
                  const c = scoreColor(p.score);
                  return (
                    <li
                      key={p.id}
                      className="flex items-center gap-4 px-5 py-4 hover:bg-white/[0.03] transition-colors"
                    >
                      <div
                        className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center font-semibold tabular-nums text-[13px] border ${c.bg} ${c.text} ${c.border}`}
                      >
                        {p.score}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-[14px] truncate">{p.title}</div>
                        <div className="text-[12px] text-[color:var(--color-klyna-text-muted)] flex items-center gap-2 mt-0.5">
                          <span>{p.word_count} words</span>
                          <span>·</span>
                          <span>
                            {p.internal_links_in} in / {p.internal_links_out} out
                          </span>
                          {p.has_schema && (
                            <>
                              <span>·</span>
                              <span className="text-emerald-400/80 flex items-center gap-1">
                                <Icon name="check" size={11} /> Schema
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      {p.issues > 0 && (
                        <Badge variant={p.issues >= 3 ? 'danger' : 'warning'}>
                          {p.issues} issue{p.issues === 1 ? '' : 's'}
                        </Badge>
                      )}
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[color:var(--color-klyna-text-dim)] hover:text-[color:var(--color-klyna-accent)] transition-colors"
                        title="Open post"
                      >
                        <Icon name="external" size={14} />
                      </a>
                    </li>
                  );
                })}
              </ul>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Quick wins" subtitle="Highest-impact fixes" />
            <CardBody>
              <ul className="space-y-3">
                <Win
                  icon={<Icon name="links" size={14} />}
                  title={`Add internal links to ${stats.orphan_pages} orphan${stats.orphan_pages === 1 ? '' : 's'}`}
                  body="Orphan pages rarely get indexed. One click adds the strongest matches."
                />
                <Win
                  icon={<Icon name="zap" size={14} />}
                  title="Turn FAQ sections into FAQPage schema"
                  body="Massive GEO citation boost — LLMs pull from FAQPage."
                />
                <Win
                  icon={<Icon name="schema" size={14} />}
                  title="Add Organization schema sitewide"
                  body="One toggle in Settings. Improves brand SERP and LLM citations."
                />
              </ul>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Win({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <li className="flex gap-3 group">
      <div className="shrink-0 w-7 h-7 rounded-md bg-[color:var(--color-klyna-accent-soft)] text-[color:var(--color-klyna-accent)] flex items-center justify-center">
        {icon}
      </div>
      <div>
        <div className="text-[13px] font-medium leading-snug">{title}</div>
        <div className="text-[12px] text-[color:var(--color-klyna-text-muted)] mt-1 leading-relaxed">
          {body}
        </div>
      </div>
    </li>
  );
}
