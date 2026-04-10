import type { SparklineData } from '../services/duckdb';

const WIDTH = 60;
const HEIGHT = 20;
const GAP = 1;

export function Sparkline({ data, color = '#818cf8' }: { data: SparklineData; color?: string }) {
  if (!data.length) return null;

  const maxVal = Math.max(...data.map(d => d.value), 1);
  const barWidth = (WIDTH - GAP * (data.length - 1)) / data.length;

  return (
    <svg
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="flex-shrink-0"
    >
      {data.map((d, i) => {
        const barHeight = (d.value / maxVal) * HEIGHT;
        const x = i * (barWidth + GAP);
        const y = HEIGHT - barHeight;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={barWidth}
            height={Math.max(barHeight, 0.5)}
            rx={0.5}
            fill={color}
            className="sparkline-bar"
            opacity={0.7}
          >
            <title>{d.label}: {d.value.toLocaleString()}</title>
          </rect>
        );
      })}
    </svg>
  );
}
