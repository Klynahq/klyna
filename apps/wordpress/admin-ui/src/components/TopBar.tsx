import type { ReactNode } from 'react';
import { Icon } from './Icon.tsx';
import { boot, isDevMock } from '../api/client.ts';

interface Props {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function TopBar({ title, subtitle, actions }: Props) {
  const b = boot();
  return (
    <div className="sticky top-0 z-30 bg-[color:var(--color-klyna-bg)]/80 backdrop-blur border-b border-[color:var(--color-klyna-border)]/40">
      <div className="flex items-center justify-between px-8 py-5">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight">{title}</h1>
          {subtitle && (
            <p className="text-[13px] text-[color:var(--color-klyna-text-muted)] mt-1">
              {subtitle}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {actions}
          {isDevMock() && (
            <span className="text-[10px] uppercase tracking-wider font-semibold text-amber-400 bg-amber-400/10 border border-amber-400/30 px-2.5 py-1 rounded-full">
              Dev mock
            </span>
          )}
          <a
            href={b.siteUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] text-[color:var(--color-klyna-text-muted)] hover:text-[color:var(--color-klyna-text)] border border-[color:var(--color-klyna-border)]/60 hover:border-[color:var(--color-klyna-accent)]/40 transition-colors"
          >
            <Icon name="external" size={12} />
            View site
          </a>
        </div>
      </div>
    </div>
  );
}
