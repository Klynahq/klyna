import type { ReactNode } from 'react';

export function Empty({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      {icon && (
        <div className="w-12 h-12 rounded-xl bg-[color:var(--color-klyna-accent-soft)] text-[color:var(--color-klyna-accent)] flex items-center justify-center mb-4">
          {icon}
        </div>
      )}
      <h3 className="text-[15px] font-semibold mb-1">{title}</h3>
      {body && (
        <p className="text-[13px] text-[color:var(--color-klyna-text-muted)] max-w-md leading-relaxed">
          {body}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
