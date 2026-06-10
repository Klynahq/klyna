interface Props {
  title: string;
  body: string;
  hint?: string;
}

export function EmptyState({ title, body, hint }: Props) {
  return (
    <div className="px-5 py-10 text-center">
      <div className="font-semibold text-sm mb-1">{title}</div>
      <div className="text-xs text-[color:var(--color-text-muted)] leading-relaxed mb-2">
        {body}
      </div>
      {hint && (
        <div className="text-[10px] text-[color:var(--color-text-dim)] leading-relaxed">{hint}</div>
      )}
    </div>
  );
}
