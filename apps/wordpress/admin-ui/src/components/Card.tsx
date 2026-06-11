import type { ReactNode } from 'react';
import { cn } from '../lib/cn.ts';

export function Card({
  children,
  className,
  hover = false,
  gradient = false,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  gradient?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-[color:var(--color-klyna-border)]/60 bg-[color:var(--color-klyna-bg-elevated)] overflow-hidden',
        gradient &&
          'bg-gradient-to-br from-[color:var(--color-klyna-bg-elevated)] via-[color:var(--color-klyna-bg-elevated)] to-[color:var(--color-klyna-surface)]',
        hover &&
          'transition-colors hover:border-[color:var(--color-klyna-accent)]/40 hover:bg-[color:var(--color-klyna-surface)]',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-[color:var(--color-klyna-border)]/40">
      <div>
        <h3 className="text-[14px] font-semibold tracking-tight">{title}</h3>
        {subtitle && (
          <p className="text-[12px] text-[color:var(--color-klyna-text-muted)] mt-0.5">
            {subtitle}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

export function CardBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn('px-5 py-5', className)}>{children}</div>;
}
