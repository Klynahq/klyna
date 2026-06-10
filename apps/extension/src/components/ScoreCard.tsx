interface Props {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  url: string;
}

const gradeColor: Record<Props['grade'], string> = {
  A: 'var(--color-success)',
  B: 'var(--color-success)',
  C: 'var(--color-warning)',
  D: 'var(--color-warning)',
  F: 'var(--color-danger)',
};

const gradeLabel: Record<Props['grade'], string> = {
  A: 'Excellent',
  B: 'Good',
  C: 'Fair',
  D: 'Needs work',
  F: 'Critical issues',
};

export function ScoreCard({ score, grade, url }: Props) {
  const color = gradeColor[grade];
  const ringDeg = score * 3.6;
  const host = (() => {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  })();
  return (
    <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-bg-elevated)] p-4">
      <div className="flex items-center gap-4">
        <div
          className="relative w-20 h-20 rounded-full grid place-items-center shrink-0"
          style={{
            background: `conic-gradient(${color} ${ringDeg}deg, rgba(255,255,255,0.06) ${ringDeg}deg)`,
          }}
        >
          <div className="absolute inset-1.5 rounded-full bg-[color:var(--color-bg-elevated)] grid place-items-center">
            <div className="text-2xl font-bold leading-none" style={{ color }}>
              {score}
            </div>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-wider text-[color:var(--color-text-dim)] mb-0.5">
            Score · grade {grade}
          </div>
          <div className="font-semibold text-sm mb-1" style={{ color }}>
            {gradeLabel[grade]}
          </div>
          <div className="text-xs text-[color:var(--color-text-muted)] truncate" title={url}>
            {host}
          </div>
        </div>
      </div>
    </div>
  );
}
