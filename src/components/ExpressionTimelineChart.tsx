import React, { useMemo, useState } from 'react';
import {
  EXPRESSION_META,
  ExpressionKey,
  TimelinePoint,
} from '../types/expressions';

interface ExpressionTimelineChartProps {
  points: TimelinePoint[];
}

const CHART_SERIES: ExpressionKey[] = [
  'happy',
  'sad',
  'angry',
  'surprised',
  'neutral',
];

export const ExpressionTimelineChart: React.FC<ExpressionTimelineChartProps> = ({
  points,
}) => {
  const [visibleSeries, setVisibleSeries] = useState<Record<ExpressionKey, boolean>>({
    happy: true,
    sad: true,
    angry: true,
    surprised: true,
    fearful: false,
    disgusted: false,
    neutral: true,
  });
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const width = 760;
  const height = 210;
  const padLeft = 40;
  const padRight = 16;
  const padTop = 16;
  const padBottom = 26;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const toggleSeries = (key: ExpressionKey) => {
    setVisibleSeries((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const paths = useMemo(() => {
    if (points.length < 2) return {} as Record<ExpressionKey, string>;

    const result = {} as Record<ExpressionKey, string>;
    const denom = Math.max(1, points.length - 1);

    for (const key of CHART_SERIES) {
      let d = '';
      points.forEach((pt, idx) => {
        const x = padLeft + (idx / denom) * plotW;
        const val = Math.max(0, Math.min(1, pt.averages[key] ?? 0));
        const y = padTop + (1 - val) * plotH;
        d += idx === 0 ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
      });
      result[key] = d;
    }
    return result;
  }, [points, plotW, plotH]);

  const hoveredPoint =
    hoverIdx !== null && points[hoverIdx] ? points[hoverIdx] : null;
  const hoverX =
    hoverIdx !== null && points.length > 1
      ? padLeft + (hoverIdx / (points.length - 1)) * plotW
      : null;

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (points.length < 2) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * width;
    const ratio = Math.max(0, Math.min(1, (relX - padLeft) / plotW));
    const idx = Math.round(ratio * (points.length - 1));
    setHoverIdx(idx);
  };

  return (
    <div className="bg-[#0E131D] border border-slate-800 rounded-lg p-5">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">
            Canlı İfade Zaman Çizelgesi
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Algılanan yüzlerin ortalama ifade yoğunluğu (son 60 örnek)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {CHART_SERIES.map((key) => {
            const meta = EXPRESSION_META[key];
            const active = visibleSeries[key];
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggleSeries(key)}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                  active
                    ? 'bg-slate-900 border-slate-700 text-slate-200'
                    : 'bg-transparent border-slate-800/80 text-slate-500 hover:text-slate-300'
                }`}
              >
                <span
                  className="w-2 h-2 rounded-xs shrink-0"
                  style={{
                    backgroundColor: meta.color,
                    opacity: active ? 1 : 0.3,
                  }}
                />
                <span>{meta.shortLabel}</span>
              </button>
            );
          })}
        </div>
      </div>

      {points.length < 2 ? (
        <div className="h-[210px] flex items-center justify-center border border-dashed border-slate-800 rounded-md text-xs text-slate-500">
          Kamera analizi aktif olduğunda ifadelerin zamana bağlı değişimi burada çizilir.
        </div>
      ) : (
        <div className="relative">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-[210px] cursor-crosshair select-none overflow-visible"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoverIdx(null)}
          >
            {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
              const y = padTop + (1 - tick) * plotH;
              return (
                <g key={tick}>
                  <line
                    x1={padLeft}
                    y1={y}
                    x2={width - padRight}
                    y2={y}
                    stroke="#1E293B"
                    strokeWidth={1}
                    strokeDasharray={tick === 0 || tick === 1 ? undefined : '3 3'}
                  />
                  <text
                    x={padLeft - 8}
                    y={y + 3.5}
                    textAnchor="end"
                    fill="#64748B"
                    fontSize="10"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    %{Math.round(tick * 100)}
                  </text>
                </g>
              );
            })}

            {CHART_SERIES.map((key) => {
              if (!visibleSeries[key] || !paths[key]) return null;
              return (
                <path
                  key={key}
                  d={paths[key]}
                  fill="none"
                  stroke={EXPRESSION_META[key].color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              );
            })}

            {hoverX !== null && hoveredPoint && (
              <g>
                <line
                  x1={hoverX}
                  y1={padTop}
                  x2={hoverX}
                  y2={padTop + plotH}
                  stroke="#94A3B8"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                />
                {CHART_SERIES.map((key) => {
                  if (!visibleSeries[key]) return null;
                  const val = Math.max(0, Math.min(1, hoveredPoint.averages[key] ?? 0));
                  const cy = padTop + (1 - val) * plotH;
                  return (
                    <circle
                      key={key}
                      cx={hoverX}
                      cy={cy}
                      r={3.5}
                      fill={EXPRESSION_META[key].color}
                      stroke="#07090E"
                      strokeWidth={1.5}
                    />
                  );
                })}
              </g>
            )}

            <text
              x={padLeft}
              y={height - 6}
              fill="#64748B"
              fontSize="10"
              fontFamily="JetBrains Mono, monospace"
            >
              {points[0]?.timeLabel}
            </text>
            <text
              x={width - padRight}
              y={height - 6}
              textAnchor="end"
              fill="#64748B"
              fontSize="10"
              fontFamily="JetBrains Mono, monospace"
            >
              {points[points.length - 1]?.timeLabel}
            </text>
          </svg>

          {hoveredPoint && (
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono tabular-nums text-slate-300 border-t border-slate-800/80 pt-2">
              <span className="text-slate-400">
                Saat {hoveredPoint.timeLabel} · {hoveredPoint.faceCount} Kişi
              </span>
              {CHART_SERIES.filter((k) => visibleSeries[k]).map((k) => (
                <span key={k} className="flex items-center gap-1.5">
                  <span
                    className="w-2 h-2 rounded-xs"
                    style={{ backgroundColor: EXPRESSION_META[k].color }}
                  />
                  <span>
                    {EXPRESSION_META[k].shortLabel}: %
                    {Math.round((hoveredPoint.averages[k] ?? 0) * 100)}
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
