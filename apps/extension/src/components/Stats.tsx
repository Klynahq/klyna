import type { AuditResult } from '@klyna/core';

interface Props {
  result: AuditResult;
}

export function Stats({ result }: Props) {
  const { stats, meta } = result;
  const cells: Array<{ label: string; value: string; sub?: string }> = [
    {
      label: 'Word count',
      value: stats.word_count.toLocaleString(),
      sub: `${stats.reading_time_minutes} min`,
    },
    {
      label: 'Headings',
      value: `${stats.headings.h1}/${stats.headings.h2}/${stats.headings.h3}`,
      sub: 'H1/H2/H3',
    },
    {
      label: 'Links',
      value: String(stats.links.total),
      sub: `${stats.links.internal} internal`,
    },
    {
      label: 'Images',
      value: String(stats.images.total),
      sub:
        stats.images.missingAlt > 0
          ? `${stats.images.missingAlt} no alt`
          : 'all w/ alt',
    },
    {
      label: 'Schema',
      value: String(stats.schema.count),
      sub: stats.schema.types[0] ?? 'none',
    },
    {
      label: 'Language',
      value: meta.lang ?? '—',
      sub: meta.canonical ? 'canonical ✓' : 'no canonical',
    },
  ];
  return (
    <section className="px-5 pb-3">
      <h2 className="text-[10px] uppercase tracking-wider text-[color:var(--color-text-dim)] font-semibold mb-2">
        Stats
      </h2>
      <div className="grid grid-cols-3 gap-1.5">
        {cells.map((c) => (
          <div
            key={c.label}
            className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-elevated)] p-2"
          >
            <div className="text-[9px] uppercase tracking-wider text-[color:var(--color-text-dim)] mb-0.5">
              {c.label}
            </div>
            <div className="font-semibold text-sm leading-tight">{c.value}</div>
            {c.sub && (
              <div className="text-[10px] text-[color:var(--color-text-muted)] mt-0.5 truncate">
                {c.sub}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
