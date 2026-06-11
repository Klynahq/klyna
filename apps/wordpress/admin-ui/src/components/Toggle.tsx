import { cn } from '../lib/cn.ts';

interface Props {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  hint?: string;
  disabled?: boolean;
}

export function Toggle({ checked, onChange, label, hint, disabled }: Props) {
  return (
    <label
      className={cn(
        'flex items-start gap-3 cursor-pointer select-none',
        disabled && 'opacity-50 cursor-not-allowed',
      )}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        className={cn(
          'relative shrink-0 w-9 h-5 rounded-full transition-colors',
          checked
            ? 'bg-[color:var(--color-klyna-accent)]'
            : 'bg-[color:var(--color-klyna-border)]',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform',
            checked && 'translate-x-4',
          )}
        />
      </button>
      {(label || hint) && (
        <div className="-mt-0.5">
          {label && (
            <div className="text-[13px] font-medium text-[color:var(--color-klyna-text)]">
              {label}
            </div>
          )}
          {hint && (
            <div className="text-[12px] text-[color:var(--color-klyna-text-muted)] mt-0.5 leading-relaxed">
              {hint}
            </div>
          )}
        </div>
      )}
    </label>
  );
}
