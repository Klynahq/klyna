export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-US').format(n);
}

export function formatRelative(iso: string | null): string {
  if (!iso) return 'never';
  const d = new Date(iso);
  const now = Date.now();
  const diff = (now - d.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.round(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)} hr ago`;
  if (diff < 604800) return `${Math.round(diff / 86400)} days ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function scoreColor(score: number): {
  bg: string;
  text: string;
  border: string;
  ring: string;
} {
  if (score >= 90) {
    return {
      bg: 'bg-emerald-500/10',
      text: 'text-emerald-400',
      border: 'border-emerald-500/30',
      ring: 'stroke-emerald-400',
    };
  }
  if (score >= 75) {
    return {
      bg: 'bg-[color:var(--color-klyna-accent-soft)]',
      text: 'text-[color:var(--color-klyna-accent)]',
      border: 'border-[color:var(--color-klyna-accent)]/30',
      ring: 'stroke-[color:var(--color-klyna-accent)]',
    };
  }
  if (score >= 60) {
    return {
      bg: 'bg-amber-500/10',
      text: 'text-amber-400',
      border: 'border-amber-500/30',
      ring: 'stroke-amber-400',
    };
  }
  return {
    bg: 'bg-red-500/10',
    text: 'text-red-400',
    border: 'border-red-500/30',
    ring: 'stroke-red-400',
  };
}
