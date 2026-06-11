import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn.ts';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  loading?: boolean;
  icon?: ReactNode;
}

const STYLES: Record<string, string> = {
  primary:
    'bg-[color:var(--color-klyna-accent)] hover:bg-[color:var(--color-klyna-accent-hover)] text-white shadow-[0_4px_20px_-8px_var(--color-klyna-accent)] border border-transparent',
  secondary:
    'bg-white/5 hover:bg-white/10 text-[color:var(--color-klyna-text)] border border-[color:var(--color-klyna-border)]/60 hover:border-[color:var(--color-klyna-accent)]/40',
  ghost:
    'bg-transparent text-[color:var(--color-klyna-text-muted)] hover:text-[color:var(--color-klyna-text)] hover:bg-white/5 border border-transparent',
  danger:
    'bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/30 hover:border-red-500/50',
};

const SIZES: Record<string, string> = {
  sm: 'px-2.5 py-1.5 text-[12px] gap-1.5',
  md: 'px-3.5 py-2 text-[13px] gap-2',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon,
  children,
  className,
  disabled,
  ...rest
}: Props) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
        STYLES[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? (
        <svg
          className="animate-spin"
          width={size === 'sm' ? 12 : 14}
          height={size === 'sm' ? 12 : 14}
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
          <path
            d="M21 12a9 9 0 0 0-9-9"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        icon
      )}
      {children}
    </button>
  );
}
