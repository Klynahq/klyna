import { useEffect, useState } from 'react';
import { api, type Finding, type PostSummary } from '../api/client.ts';
import { TopBar } from '../components/TopBar.tsx';
import { Card, CardBody, CardHeader } from '../components/Card.tsx';
import { Badge } from '../components/Badge.tsx';
import { Button } from '../components/Button.tsx';
import { Icon } from '../components/Icon.tsx';
import { Empty } from '../components/Empty.tsx';
import { FindingRow } from '../components/FindingRow.tsx';
import { AiSuggestModal } from '../components/AiSuggestModal.tsx';
import { formatRelative, scoreColor } from '../lib/cn.ts';

interface FixToast {
  kind: 'success' | 'error';
  text: string;
}

type SortKey = 'score' | 'modified' | 'word_count';

export function Audit() {
  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('score');
  const [filterStatus, setFilterStatus] = useState<'all' | 'needs' | 'great'>('all');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [postBusy, setPostBusy] = useState<number | null>(null);
  const [toast, setToast] = useState<FixToast | null>(null);
  const [aiModal, setAiModal] = useState<{ post: PostSummary; finding: Finding } | null>(null);

  const showToast = (t: FixToast) => {
    setToast(t);
    setTimeout(() => setToast(null), 4000);
  };

  const fixOnePost = async (post: PostSummary) => {
    if (post.findings.filter((f) => f.fixable).length === 0) return;
    setPostBusy(post.id);
    try {
      const res = await api.fixPost(post.id);
      showToast({
        kind: res.applied.length ? 'success' : 'error',
        text: res.applied.length
          ? `Fixed ${res.applied.length} of ${post.findings.filter((f) => f.fixable).length} fixable issues on "${post.title}".`
          : `Nothing automatic to fix on this post — open in editor for the rest.`,
      });
      await load();
    } finally {
      setPostBusy(null);
    }
  };

  const fixAll = async () => {
    const totalFixable = posts.reduce((a, p) => a + p.findings.filter((f) => f.fixable).length, 0);
    if (
      totalFixable === 0 ||
      !window.confirm(
        `Apply ${totalFixable} auto-fixes across ${posts.length} posts? Settings changes happen instantly; orphan auto-links may be inserted into other posts (each is reversible by editing the post).`,
      )
    ) {
      return;
    }
    setBulkBusy(true);
    try {
      const res = await api.fixAll();
      showToast({
        kind: 'success',
        text: `Applied ${res.total_applied} fix${res.total_applied === 1 ? '' : 'es'} across ${res.posts.length} post${res.posts.length === 1 ? '' : 's'}.`,
      });
      await load();
    } finally {
      setBulkBusy(false);
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      setPosts(await api.posts());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = posts
    .filter((p) => {
      if (filterStatus === 'needs' && p.score >= 80) return false;
      if (filterStatus === 'great' && p.score < 80) return false;
      if (!query) return true;
      return p.title.toLowerCase().includes(query.toLowerCase());
    })
    .sort((a, b) => {
      if (sort === 'score') return a.score - b.score;
      if (sort === 'word_count') return b.word_count - a.word_count;
      return new Date(b.modified).getTime() - new Date(a.modified).getTime();
    });

  const toggle = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="flex-1 klyna-fade-in">
      <TopBar
        title="Audit"
        subtitle="Every post and page, scored against the Klyna SEO + GEO rubric. Click any row to see what's wrong and how to fix it."
        actions={
          <>
            <Button
              variant="primary"
              size="sm"
              icon={<Icon name="zap" size={12} />}
              loading={bulkBusy}
              onClick={fixAll}
              disabled={posts.reduce((a, p) => a + p.findings.filter((f) => f.fixable).length, 0) === 0}
            >
              Fix everything I can
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<Icon name="refresh" size={12} />}
              onClick={load}
            >
              Re-audit
            </Button>
          </>
        }
      />

      <div className="px-8 py-8 space-y-6 max-w-[1280px]">
        <Card>
          <CardHeader
            title="Content audit"
            subtitle={`${posts.length} item${posts.length === 1 ? '' : 's'} tracked · ${posts.reduce((a, p) => a + p.issues, 0)} total issues`}
            action={
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Icon
                    name="search"
                    size={12}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[color:var(--color-klyna-text-dim)]"
                  />
                  <input
                    type="search"
                    placeholder="Search posts…"
                    value={query}
                    onChange={(e) => setQuery(e.currentTarget.value)}
                    className="bg-[color:var(--color-klyna-bg)] border border-[color:var(--color-klyna-border)]/60 rounded-md pl-7 pr-3 py-1.5 text-[12px] text-[color:var(--color-klyna-text)] placeholder:text-[color:var(--color-klyna-text-dim)] focus:outline-none focus:border-[color:var(--color-klyna-accent)] w-52"
                  />
                </div>
                <SegmentedControl
                  value={filterStatus}
                  onChange={setFilterStatus}
                  options={[
                    { value: 'all', label: 'All' },
                    { value: 'needs', label: 'Needs work' },
                    { value: 'great', label: 'Great' },
                  ]}
                />
                <SegmentedControl
                  value={sort}
                  onChange={setSort}
                  options={[
                    { value: 'score', label: 'Score' },
                    { value: 'modified', label: 'Modified' },
                    { value: 'word_count', label: 'Length' },
                  ]}
                />
              </div>
            }
          />
          <CardBody className="!p-0">
            {loading ? (
              <div className="px-5 py-10 text-center text-[13px] text-[color:var(--color-klyna-text-muted)]">
                Loading content…
              </div>
            ) : filtered.length === 0 ? (
              <Empty
                icon={<Icon name="file" size={20} />}
                title="No results"
                body="Try clearing your filter or searching for a different keyword."
              />
            ) : (
              <ul className="divide-y divide-[color:var(--color-klyna-border)]/40">
                {filtered.map((p) => {
                  const c = scoreColor(p.score);
                  const isOpen = expanded.has(p.id);
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => p.issues > 0 && toggle(p.id)}
                        className={`w-full flex items-center gap-4 px-5 py-4 text-left transition-colors ${
                          p.issues > 0
                            ? 'hover:bg-white/[0.03] cursor-pointer'
                            : 'cursor-default'
                        }`}
                      >
                        <div
                          className={`shrink-0 w-12 h-12 rounded-lg flex flex-col items-center justify-center font-semibold tabular-nums border ${c.bg} ${c.text} ${c.border}`}
                        >
                          <span className="text-[15px] leading-none">{p.score}</span>
                          <span className="text-[9px] leading-none mt-0.5 opacity-60">
                            {p.grade}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-[14px] truncate">{p.title}</div>
                          <div className="text-[12px] text-[color:var(--color-klyna-text-muted)] flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1">
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
                            <span>·</span>
                            <span>updated {formatRelative(p.modified)}</span>
                          </div>
                        </div>
                        {p.issues > 0 ? (
                          <>
                            <Badge variant={p.issues >= 3 ? 'danger' : 'warning'}>
                              {p.issues} issue{p.issues === 1 ? '' : 's'}
                            </Badge>
                            <Icon
                              name="arrow_right"
                              size={14}
                              className={`text-[color:var(--color-klyna-text-dim)] transition-transform ${
                                isOpen ? 'rotate-90' : ''
                              }`}
                            />
                          </>
                        ) : (
                          <Badge variant="success">
                            <Icon name="check" size={10} />
                            Clean
                          </Badge>
                        )}
                        <a
                          href={p.url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="p-1.5 rounded text-[color:var(--color-klyna-text-dim)] hover:text-[color:var(--color-klyna-accent)] transition-colors"
                          title="View post"
                        >
                          <Icon name="external" size={14} />
                        </a>
                      </button>

                      {isOpen && p.findings.length > 0 && (
                        <div className="px-5 pb-5 pl-[6.25rem] space-y-2 klyna-fade-in">
                          {p.findings.filter((f) => f.fixable).length > 0 && (
                            <div className="flex items-center justify-between px-1 pb-1">
                              <div className="text-[11px] text-[color:var(--color-klyna-text-dim)] uppercase tracking-wider font-semibold">
                                {p.findings.filter((f) => f.fixable).length} auto-fixable ·{' '}
                                {p.findings.filter((f) => !f.fixable).length} need manual edit
                              </div>
                              <Button
                                size="sm"
                                variant="primary"
                                loading={postBusy === p.id}
                                icon={!postBusy && <Icon name="zap" size={12} />}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void fixOnePost(p);
                                }}
                              >
                                Fix all on this post
                              </Button>
                            </div>
                          )}
                          {p.findings.map((f) => (
                            <FindingRow
                              key={f.id}
                              finding={f}
                              editUrl={p.edit_url}
                              onFixed={load}
                              onAiAsk={(finding) => setAiModal({ post: p, finding })}
                            />
                          ))}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      {toast && (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2.5 rounded-md text-[13px] flex items-center gap-2 shadow-lg border klyna-fade-in z-50 ${
            toast.kind === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
          }`}
        >
          <Icon name={toast.kind === 'success' ? 'check' : 'alert'} size={14} />
          {toast.text}
        </div>
      )}

      {aiModal && (
        <AiSuggestModal
          open
          postId={aiModal.post.id}
          postTitle={aiModal.post.title}
          finding={aiModal.finding}
          onClose={() => setAiModal(null)}
          onApplied={() => {
            showToast({ kind: 'success', text: `AI applied a suggestion to "${aiModal.post.title}".` });
            void load();
          }}
        />
      )}
    </div>
  );
}

function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
}) {
  return (
    <div className="inline-flex bg-[color:var(--color-klyna-bg)] border border-[color:var(--color-klyna-border)]/60 rounded-md p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${
            value === o.value
              ? 'bg-[color:var(--color-klyna-accent-soft)] text-[color:var(--color-klyna-accent)]'
              : 'text-[color:var(--color-klyna-text-muted)] hover:text-[color:var(--color-klyna-text)]'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
