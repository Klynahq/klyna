import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, TableHTMLAttributes } from 'react';

type DivProps = { children?: ReactNode; className?: string };

export function Card({ children, className = '' }: DivProps) {
  return (
    <div
      className={`rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 ${className}`}
    >
      {children}
    </div>
  );
}

export function CardTitle({ children, className = '' }: DivProps) {
  return (
    <h3 className={`text-sm font-medium tracking-wide text-[var(--color-muted)] uppercase ${className}`}>
      {children}
    </h3>
  );
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <Card>
      <CardTitle>{label}</CardTitle>
      <div className="mt-2 text-3xl font-semibold text-[var(--color-text)]">{value}</div>
      {hint ? <div className="mt-1 text-xs text-[var(--color-dim)]">{hint}</div> : null}
    </Card>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'danger';
};

export function Button({ variant = 'primary', className = '', ...rest }: ButtonProps) {
  const base =
    'inline-flex items-center justify-center rounded-[8px] px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
  const styles = {
    primary:
      'bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)]',
    ghost:
      'bg-transparent text-[var(--color-text)] border border-[var(--color-border)] hover:bg-[var(--color-bg-elevated)]',
    danger: 'bg-[var(--color-danger)] text-black hover:opacity-90',
  }[variant];
  return <button className={`${base} ${styles} ${className}`} {...rest} />;
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className = '', ...rest } = props;
  return (
    <input
      className={`w-full rounded-[8px] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 py-2 text-sm text-[var(--color-text)] placeholder-[var(--color-dim)] outline-none focus:border-[var(--color-accent)] ${className}`}
      {...rest}
    />
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className = '', ...rest } = props;
  return (
    <textarea
      className={`w-full rounded-[8px] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 py-2 text-sm text-[var(--color-text)] placeholder-[var(--color-dim)] outline-none focus:border-[var(--color-accent)] ${className}`}
      {...rest}
    />
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = '', children, ...rest } = props;
  return (
    <select
      className={`rounded-[8px] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)] ${className}`}
      {...rest}
    >
      {children}
    </select>
  );
}

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="block text-xs font-medium text-[var(--color-muted)] mb-1">
      {children}
    </label>
  );
}

export function Table({ children, ...rest }: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-hidden rounded-[12px] border border-[var(--color-border)]">
      <table className="w-full text-sm" {...rest}>
        {children}
      </table>
    </div>
  );
}

export function Th({ children }: { children: ReactNode }) {
  return (
    <th className="bg-[var(--color-bg-elevated)] px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-[var(--color-muted)] border-b border-[var(--color-border)]">
      {children}
    </th>
  );
}

export function Td({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return (
    <td
      className={`px-4 py-2 text-[var(--color-text)] border-b border-[var(--color-border)] ${className}`}
    >
      {children}
    </td>
  );
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
}) {
  const toneCls = {
    neutral:
      'bg-[var(--color-bg-elevated)] text-[var(--color-muted)] border-[var(--color-border)]',
    accent: 'bg-[rgba(124,92,255,0.12)] text-[var(--color-accent)] border-[rgba(124,92,255,0.35)]',
    success: 'bg-[rgba(52,211,153,0.1)] text-[var(--color-success)] border-[rgba(52,211,153,0.3)]',
    warning: 'bg-[rgba(251,191,36,0.1)] text-[var(--color-warning)] border-[rgba(251,191,36,0.3)]',
    danger: 'bg-[rgba(248,113,113,0.1)] text-[var(--color-danger)] border-[rgba(248,113,113,0.3)]',
  }[tone];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${toneCls}`}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <Card className="text-center">
      <h3 className="text-lg font-semibold text-[var(--color-text)]">{title}</h3>
      {description ? (
        <p className="mt-2 text-sm text-[var(--color-muted)]">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </Card>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--color-text)]">{title}</h1>
        {description ? (
          <p className="mt-1 text-sm text-[var(--color-muted)]">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex gap-2">{actions}</div> : null}
    </div>
  );
}
