import type { ReactNode } from 'react';
import { Card } from './Card.tsx';
import { Icon } from './Icon.tsx';
import { cn, formatNumber } from '../lib/cn.ts';

interface Props {
  label: string;
  value: number | string;
  hint?: string;
  trend?: number;
  icon?: ReactNode;
  /** Render as a smaller card. */
  compact?: boolean;
}

export function StatCard({ label, value, hint, trend, icon, compact = false }: Props) {
  const trendUp = typeof trend === 'number' && trend > 0;
  const trendDown = typeof trend === 'number' && trend < 0;
  return (
    <Card gradient>
      <div className={cn('px-5', compact ? 'py-4' : 'py-5')}>
        <div className="flex items-start justify-between">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[color:var(--color-klyna-text-dim)]">
            {label}
          </div>
          {icon && (
            <div className="text-[color:var(--color-klyna-accent)] opacity-80">{icon}</div>
          )}
        </div>
        <div
          className={cn(
            'mt-3 font-semibold tracking-tight tabular-nums',
            compact ? 'text-[22px]' : 'text-[28px]',
          )}
        >
          {typeof value === 'number' ? formatNumber(value) : value}
        </div>
        {(hint || typeof trend === 'number') && (
          <div className="mt-2 flex items-center gap-2 text-[11px]">
            {typeof trend === 'number' && (
              <span
                className={cn(
                  'inline-flex items-center gap-0.5 font-medium',
                  trendUp && 'text-emerald-400',
                  trendDown && 'text-red-400',
                  !trendUp && !trendDown && 'text-[color:var(--color-klyna-text-dim)]',
                )}
              >
                <Icon
                  name={trendUp ? 'arrow_up_right' : trendDown ? 'arrow_down_right' : 'arrow_right'}
                  size={11}
                />
                {Math.abs(trend)}%
              </span>
            )}
            {hint && (
              <span className="text-[color:var(--color-klyna-text-dim)]">{hint}</span>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
