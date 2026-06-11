import { scoreColor } from '../lib/cn.ts';

interface Props {
  score: number;
  size?: number;
  thickness?: number;
}

/**
 * Animated radial score ring. Stroke color reflects the band:
 *   90+ green · 75-89 violet (brand) · 60-74 amber · <60 red
 */
export function ScoreRing({ score, size = 96, thickness = 6 }: Props) {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.max(0, Math.min(100, score)) / 100) * circumference;
  const colors = scoreColor(score);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={thickness}
          fill="none"
          className="text-[color:var(--color-klyna-border)]/60"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={thickness}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={`transition-[stroke-dashoffset] duration-700 ease-out ${colors.ring}`}
          style={{ stroke: 'currentColor' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className={`text-[22px] font-semibold tabular-nums ${colors.text}`}>{score}</div>
        <div className="text-[10px] uppercase tracking-wider text-[color:var(--color-klyna-text-dim)]">
          Score
        </div>
      </div>
    </div>
  );
}
