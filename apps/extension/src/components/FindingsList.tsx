import { useState } from 'react';
import type { Finding, Severity, Category } from '@klyna/core';

interface Props {
  findings: Finding[];
}

const severityColor: Record<Severity, string> = {
  error: 'var(--color-danger)',
  warn: 'var(--color-warning)',
  info: 'var(--color-text-muted)',
};

const severityLabel: Record<Severity, string> = {
  error: 'Error',
  warn: 'Warning',
  info: 'Tip',
};

const categoryLabel: Record<Category, string> = {
  meta: 'Meta',
  headings: 'Headings',
  links: 'Links',
  images: 'Images',
  schema: 'Schema',
  content: 'Content',
  social: 'Social',
  performance: 'Speed',
  geo: 'GEO',
};

export function FindingsList({ findings }: Props) {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  if (findings.length === 0) {
    return (
      <section className="px-5 py-6">
        <div className="rounded-xl border border-[color:var(--color-success)]/30 bg-[color:var(--color-success)]/5 p-4 text-center">
          <div className="text-2xl mb-1">✓</div>
          <div className="font-semibold text-sm text-[color:var(--color-success)] mb-1">
            No issues found
          </div>
          <div className="text-xs text-[color:var(--color-text-muted)]">
            This page passes every Klyna check.
          </div>
        </div>
      </section>
    );
  }

  const toggle = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Sort: errors first, then warns, then info
  const order = { error: 0, warn: 1, info: 2 };
  const sorted = [...findings].sort((a, b) => order[a.severity] - order[b.severity]);

  return (
    <section className="px-5 pb-4">
      <h2 className="text-[10px] uppercase tracking-wider text-[color:var(--color-text-dim)] font-semibold mb-2 flex items-center justify-between">
        <span>Findings · {findings.length}</span>
      </h2>
      <ul className="space-y-1.5">
        {sorted.map((f) => {
          const isOpen = openIds.has(f.id);
          return (
            <li
              key={f.id}
              className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-elevated)] overflow-hidden"
            >
              <button
                type="button"
                onClick={() => toggle(f.id)}
                className="w-full text-left p-3 hover:bg-white/5 transition-colors flex items-start gap-3"
              >
                <span
                  className="mt-1 inline-block w-2 h-2 rounded-full shrink-0"
                  style={{ background: severityColor[f.severity] }}
                  aria-label={severityLabel[f.severity]}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span
                      className="text-[9px] uppercase tracking-wider font-semibold"
                      style={{ color: severityColor[f.severity] }}
                    >
                      {severityLabel[f.severity]}
                    </span>
                    <span className="text-[9px] uppercase tracking-wider text-[color:var(--color-text-dim)]">
                      {categoryLabel[f.category]}
                    </span>
                  </div>
                  <div className="text-sm text-[color:var(--color-text)] leading-snug">
                    {f.message}
                  </div>
                </div>
                <span
                  className="text-[color:var(--color-text-dim)] text-xs mt-1 shrink-0"
                  aria-hidden="true"
                >
                  {isOpen ? '−' : '+'}
                </span>
              </button>
              {isOpen && (f.fix || f.evidence) && (
                <div className="px-3 pb-3 pl-8 text-xs space-y-2 border-t border-[color:var(--color-border)]/50 pt-2 mt-0">
                  {f.fix && (
                    <div>
                      <div className="text-[9px] uppercase tracking-wider text-[color:var(--color-accent)] font-semibold mb-1">
                        How to fix
                      </div>
                      <div className="text-[color:var(--color-text-muted)] leading-relaxed">
                        {f.fix}
                      </div>
                    </div>
                  )}
                  {f.evidence && (
                    <div>
                      <div className="text-[9px] uppercase tracking-wider text-[color:var(--color-text-dim)] font-semibold mb-1">
                        Evidence
                      </div>
                      <code className="block text-[color:var(--color-text-muted)] bg-black/30 rounded p-2 break-words font-mono text-[11px]">
                        {f.evidence}
                      </code>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
