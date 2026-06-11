import { useState } from 'react';
import type { Finding } from '../api/client.ts';
import { api } from '../api/client.ts';
import { Button } from './Button.tsx';
import { Icon } from './Icon.tsx';

const SEVERITY_COLORS: Record<Finding['severity'], { dot: string; chip: string }> = {
  error: { dot: 'bg-red-400', chip: 'bg-red-500/10 text-red-300 border-red-500/30' },
  warn: { dot: 'bg-amber-400', chip: 'bg-amber-500/10 text-amber-300 border-amber-500/30' },
  info: {
    dot: 'bg-[color:var(--color-klyna-accent)]',
    chip: 'bg-[color:var(--color-klyna-accent-soft)] text-[color:var(--color-klyna-accent)] border-[color:var(--color-klyna-accent)]/30',
  },
};

interface Props {
  finding: Finding;
  editUrl: string;
  onFixed?: () => void;
  onAiAsk?: (finding: Finding) => void;
}

export function FindingRow({ finding, editUrl, onFixed, onAiAsk }: Props) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const colors = SEVERITY_COLORS[finding.severity];

  const doFix = async () => {
    if (!finding.fixable || !finding.fix_meta.action) return;
    setBusy(true);
    setResult(null);
    try {
      const r = await api.applyFix({
        action: finding.fix_meta.action,
        ...(finding.fix_meta.post_id ? { post_id: finding.fix_meta.post_id } : {}),
      });
      if (r.ok) {
        setResult(r.message ?? 'Fixed.');
        onFixed?.();
      } else if (r.redirect) {
        window.location.href = r.redirect;
      } else {
        setResult(r.message ?? 'Could not fix automatically.');
      }
    } catch (e) {
      setResult(e instanceof Error ? e.message : 'Fix failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex gap-3 py-3 px-4 rounded-lg border border-[color:var(--color-klyna-border)]/40 bg-[color:var(--color-klyna-bg)]/40">
      <div className="shrink-0 pt-1">
        <span className={`block w-2 h-2 rounded-full ${colors.dot}`} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-[13px] leading-tight">{finding.title}</span>
          <span
            className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded border ${colors.chip}`}
          >
            {finding.severity}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-[color:var(--color-klyna-text-dim)] font-medium">
            {finding.category}
          </span>
        </div>

        <p className="text-[12px] text-[color:var(--color-klyna-text-muted)] mt-1.5 leading-relaxed">
          {finding.message}
        </p>

        <div className="mt-2 flex items-start gap-2 text-[12px] text-[color:var(--color-klyna-text)]/90">
          <Icon
            name="zap"
            size={12}
            className="mt-0.5 text-[color:var(--color-klyna-accent)] shrink-0"
          />
          <div>
            <span className="text-[10px] uppercase tracking-wider text-[color:var(--color-klyna-text-dim)] font-semibold mr-1.5">
              Fix
            </span>
            {finding.fix}
          </div>
        </div>

        {result && (
          <div className="mt-2 text-[11px] text-emerald-300/90 bg-emerald-500/5 border border-emerald-500/20 rounded px-2 py-1 flex items-center gap-1.5">
            <Icon name="check" size={11} />
            {result}
          </div>
        )}
      </div>

      <div className="shrink-0 flex flex-col gap-1.5 items-end">
        {finding.fixable && (
          <Button size="sm" variant="primary" loading={busy} onClick={doFix}>
            {busy ? 'Fixing…' : 'Fix it'}
          </Button>
        )}
        {finding.ai_fixable && onAiAsk && (
          <Button
            size="sm"
            variant="secondary"
            icon={<Icon name="zap" size={11} />}
            onClick={() => onAiAsk(finding)}
          >
            Ask AI
          </Button>
        )}
        {!finding.fixable && !finding.ai_fixable && (
          <a
            href={editUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] font-medium text-[color:var(--color-klyna-text-muted)] hover:text-[color:var(--color-klyna-text)] border border-[color:var(--color-klyna-border)]/60 hover:border-[color:var(--color-klyna-accent)]/40 transition-colors"
          >
            Open in editor
            <Icon name="external" size={11} />
          </a>
        )}
      </div>
    </div>
  );
}
