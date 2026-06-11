import type { ReactNode } from 'react';
import { cn } from '../lib/cn.ts';

type Variant = 'accent' | 'success' | 'warning' | 'danger' | 'neutral';

const STYLES: Record<Variant, string> = {
  accent:
    'bg-[color:var(--color-klyna-accent-soft)] text-[color:var(--color-klyna-accent)] border-[color:var(--color-klyna-accent)]/30',
  success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  warning: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  danger: 'bg-red-500/10 text-red-400 border-red-500/30',
  neutral:
    'bg-white/5 text-[color:var(--color-klyna-text-muted)] border-[color:var(--color-klyna-border)]/60',
};

export function Badge({
  variant = 'neutral',
  children,
  className,
}: {
  variant?: Variant;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border',
        STYLES[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
