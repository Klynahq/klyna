import { useEffect, useState } from 'react';
import { api, type Finding } from '../api/client.ts';
import { Button } from './Button.tsx';
import { Icon } from './Icon.tsx';

interface Props {
  open: boolean;
  postId: number;
  postTitle: string;
  finding: Finding;
  onClose: () => void;
  onApplied: () => void;
}

export function AiSuggestModal({ open, postId, postTitle, finding, onClose, onApplied }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState<string>('');
  const [mode, setMode] = useState<string>('preview');
  const [cached, setCached] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!open) return;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const run = async () => {
    setLoading(true);
    setError(null);
    setText('');
    setPicked(null);
    try {
      const res = await api.aiSuggest(postId, finding.id);
      if (!res.ok) {
        setError(
          res.message ??
            (res.reason === 'missing_api_key'
              ? 'Add an AI provider API key in Settings → AI to enable suggestions.'
              : res.reason === 'daily_cap_reached'
                ? 'You hit your daily AI cap. Raise it in Settings or wait until 00:00 UTC.'
                : 'AI suggestion failed.'),
        );
        return;
      }
      setText(res.text ?? '');
      setMode(res.mode ?? 'preview');
      setCached(!!res.cached);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed.');
    } finally {
      setLoading(false);
    }
  };

  const lines = text.split('\n').map((s) => s.trim()).filter(Boolean);
  const isMultiChoice = mode === 'choose' && lines.length > 1;
  const selectedText = isMultiChoice ? lines[picked ?? -1] ?? '' : text;

  const apply = async () => {
    if (!selectedText && !text) return;
    setApplying(true);
    setError(null);
    try {
      const applyMode = isMultiChoice
        ? finding.id.startsWith('meta.title')
          ? 'replace_title'
          : finding.id.startsWith('meta.excerpt')
            ? 'replace_excerpt'
            : 'append'
        : mode === 'choose'
          ? 'append'
          : mode;
      const res = await api.aiApply({
        post_id: postId,
        mode: applyMode,
        text: selectedText || text,
      });
      if (!res.ok) {
        setError(res.message ?? res.reason ?? 'Apply failed.');
        return;
      }
      onApplied();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Apply failed.');
    } finally {
      setApplying(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm klyna-fade-in"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-2xl rounded-2xl border border-[color:var(--color-klyna-border)] bg-[color:var(--color-klyna-bg-elevated)] shadow-[0_20px_80px_-20px_rgba(0,0,0,0.8)] overflow-hidden">
        <header className="flex items-start justify-between p-5 border-b border-[color:var(--color-klyna-border)]/40">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[color:var(--color-klyna-accent)] to-[#5b3df0] flex items-center justify-center shrink-0">
              <Icon name="zap" size={16} className="text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold leading-tight">{finding.title}</h2>
              <p className="text-[12px] text-[color:var(--color-klyna-text-muted)] mt-0.5 truncate">
                {postTitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[color:var(--color-klyna-text-dim)] hover:text-[color:var(--color-klyna-text)] -mt-1 -mr-1 p-1 rounded"
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        <div className="px-5 py-4 max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center gap-2 text-[13px] text-[color:var(--color-klyna-text-muted)] py-12 justify-center">
              <svg className="animate-spin" width={14} height={14} viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
                <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
              Asking the AI…
            </div>
          ) : error ? (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2.5 text-[12px] text-amber-300 flex items-start gap-2">
              <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
              <div>{error}</div>
            </div>
          ) : isMultiChoice ? (
            <div className="space-y-2">
              <div className="text-[11px] uppercase tracking-wider text-[color:var(--color-klyna-text-dim)] font-semibold mb-1">
                Pick one
              </div>
              {lines.map((line, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setPicked(idx)}
                  className={`block w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
                    picked === idx
                      ? 'border-[color:var(--color-klyna-accent)] bg-[color:var(--color-klyna-accent-soft)]'
                      : 'border-[color:var(--color-klyna-border)]/60 hover:border-[color:var(--color-klyna-accent)]/50 bg-white/2'
                  }`}
                >
                  <div className="text-[13px] text-[color:var(--color-klyna-text)] leading-snug">
                    {line}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <pre className="text-[13px] leading-relaxed text-[color:var(--color-klyna-text)] whitespace-pre-wrap font-sans bg-[color:var(--color-klyna-bg)] border border-[color:var(--color-klyna-border)]/40 rounded-lg p-4 max-h-[40vh] overflow-y-auto">
              {text}
            </pre>
          )}
          {cached && (
            <div className="text-[10px] uppercase tracking-wider text-[color:var(--color-klyna-text-dim)] mt-3">
              served from cache · saved a call
            </div>
          )}
        </div>

        <footer className="px-5 py-3.5 border-t border-[color:var(--color-klyna-border)]/40 flex items-center justify-between bg-[color:var(--color-klyna-bg)]/40">
          <Button
            variant="ghost"
            size="sm"
            icon={<Icon name="refresh" size={11} />}
            onClick={run}
            disabled={loading || applying}
          >
            Regenerate
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onClose}>
              Discard
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={applying}
              disabled={loading || !!error || (isMultiChoice && picked === null) || !text}
              icon={!applying && <Icon name="check" size={12} />}
              onClick={apply}
            >
              Apply to post
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
