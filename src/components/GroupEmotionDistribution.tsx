import React, { useMemo, useState } from 'react';
import {
  EXPRESSION_META,
  EXPRESSION_ORDER,
  ExpressionKey,
  TrackedFace,
} from '../types/expressions';

interface GroupEmotionDistributionProps {
  faces: TrackedFace[];
}

type ChartViewMode = 'pie' | 'bar';

interface SliceItem {
  key: ExpressionKey;
  ratio: number;
  percent: number;
  startAngle: number;
  endAngle: number;
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function describeDonutArc(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  startAngle: number,
  endAngle: number
): string {
  const outerStart = polarToCartesian(cx, cy, outerR, startAngle);
  const outerEnd = polarToCartesian(cx, cy, outerR, endAngle);
  const innerEnd = polarToCartesian(cx, cy, innerR, endAngle);
  const innerStart = polarToCartesian(cx, cy, innerR, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

  return [
    `M ${outerStart.x.toFixed(2)} ${outerStart.y.toFixed(2)}`,
    `A ${outerR} ${outerR} 0 ${largeArcFlag} 1 ${outerEnd.x.toFixed(2)} ${outerEnd.y.toFixed(2)}`,
    `L ${innerEnd.x.toFixed(2)} ${innerEnd.y.toFixed(2)}`,
    `A ${innerR} ${innerR} 0 ${largeArcFlag} 0 ${innerStart.x.toFixed(2)} ${innerStart.y.toFixed(2)}`,
    'Z',
  ].join(' ');
}

export const GroupEmotionDistribution: React.FC<GroupEmotionDistributionProps> = ({
  faces,
}) => {
  const [viewMode, setViewMode] = useState<ChartViewMode>('pie');
  const [hoveredExpr, setHoveredExpr] = useState<ExpressionKey | null>(null);

  const distribution = useMemo(() => {
    if (faces.length === 0) {
      return {
        items: [] as SliceItem[],
        dominant: null as ExpressionKey | null,
      };
    }

    const rawAverages = {} as Record<ExpressionKey, number>;
    let total = 0;

    for (const key of EXPRESSION_ORDER) {
      const avg =
        faces.reduce((acc, f) => acc + (f.expressions[key] ?? 0), 0) / faces.length;
      rawAverages[key] = avg;
      total += avg;
    }

    const safeTotal = total > 0 ? total : 1;
    let currentAngle = 0;
    let dominant: ExpressionKey = 'neutral';
    let bestRatio = -1;

    const items: SliceItem[] = EXPRESSION_ORDER.map((key) => {
      const ratio = rawAverages[key] / safeTotal;
      if (ratio > bestRatio) {
        bestRatio = ratio;
        dominant = key;
      }
      const sweep = ratio * 360;
      const startAngle = currentAngle;
      const endAngle = currentAngle + sweep;
      currentAngle = endAngle;

      return {
        key,
        ratio,
        percent: Math.round(ratio * 100),
        startAngle,
        endAngle,
      };
    });

    return { items, dominant };
  }, [faces]);

  const activeFocusKey = hoveredExpr ?? distribution.dominant;
  const activeFocusItem =
    distribution.items.find((item) => item.key === activeFocusKey) ?? null;

  return (
    <div className="bg-[#0E131D] border border-slate-800 rounded-lg p-4">
      <div className="flex items-center justify-between gap-3 mb-3.5">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">
            Genel Duygu Dağılımı
          </h2>
          <p className="text-xs text-slate-400 mt-0.5 font-mono tabular-nums">
            {faces.length > 0
              ? `${faces.length} yüzün anlık ortalaması`
              : 'Tüm yüzlerin anlık ortalaması'}
          </p>
        </div>

        <div className="flex items-center gap-0.5 p-0.5 bg-slate-900 border border-slate-800 rounded-md shrink-0">
          <button
            type="button"
            onClick={() => setViewMode('pie')}
            className={`px-2.5 py-1 text-xs font-medium rounded-sm transition-colors whitespace-nowrap shrink-0 ${
              viewMode === 'pie'
                ? 'bg-slate-800 text-cyan-300'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Dairesel
          </button>
          <button
            type="button"
            onClick={() => setViewMode('bar')}
            className={`px-2.5 py-1 text-xs font-medium rounded-sm transition-colors whitespace-nowrap shrink-0 ${
              viewMode === 'bar'
                ? 'bg-slate-800 text-cyan-300'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Çubuk
          </button>
        </div>
      </div>

      {faces.length === 0 ? (
        <div className="py-6 px-4 border border-dashed border-slate-800 rounded-md flex items-center gap-4">
          <svg viewBox="0 0 80 80" className="w-16 h-16 shrink-0">
            <circle
              cx="40"
              cy="40"
              r="28"
              fill="none"
              stroke="#1E293B"
              strokeWidth="12"
            />
          </svg>
          <p className="text-xs text-slate-400 leading-relaxed">
            Karede yüz algılandığında tüm kişilerin anlık gülme, üzülme ve sinir oranları burada grafik olarak gösterilir.
          </p>
        </div>
      ) : viewMode === 'pie' ? (
        <div className="flex items-center gap-4">
          {/* Circular Donut Chart */}
          <div className="relative w-[136px] h-[136px] shrink-0">
            <svg viewBox="0 0 136 136" className="w-full h-full">
              {distribution.items.map((item) => {
                if (item.ratio <= 0.003) return null;
                const meta = EXPRESSION_META[item.key];
                const isHovered = hoveredExpr === item.key;
                const dimmed = hoveredExpr !== null && !isHovered;

                if (item.ratio >= 0.996) {
                  return (
                    <circle
                      key={item.key}
                      cx="68"
                      cy="68"
                      r="46"
                      fill="none"
                      stroke={meta.color}
                      strokeWidth="22"
                      opacity={dimmed ? 0.35 : 1}
                      onMouseEnter={() => setHoveredExpr(item.key)}
                      onMouseLeave={() => setHoveredExpr(null)}
                      className="cursor-pointer transition-opacity duration-150"
                    />
                  );
                }

                return (
                  <path
                    key={item.key}
                    d={describeDonutArc(
                      68,
                      68,
                      isHovered ? 60 : 57,
                      35,
                      item.startAngle,
                      item.endAngle
                    )}
                    fill={meta.color}
                    stroke="#0E131D"
                    strokeWidth="1.5"
                    opacity={dimmed ? 0.35 : 1}
                    onMouseEnter={() => setHoveredExpr(item.key)}
                    onMouseLeave={() => setHoveredExpr(null)}
                    className="cursor-pointer transition-opacity duration-150"
                  />
                );
              })}
            </svg>

            {/* Center Telemetry Readout */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-2 text-center">
              {activeFocusItem && (
                <>
                  <span className="text-lg font-mono font-bold tabular-nums text-slate-50 leading-none">
                    %{activeFocusItem.percent}
                  </span>
                  <span
                    className={`text-[11px] font-medium mt-1 truncate max-w-[66px] ${
                      EXPRESSION_META[activeFocusItem.key].textClass
                    }`}
                  >
                    {EXPRESSION_META[activeFocusItem.key].shortLabel}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Synchronized Compact Breakdown List */}
          <div className="flex-1 min-w-0 space-y-1.5">
            {distribution.items.map((item) => {
              const meta = EXPRESSION_META[item.key];
              const isFocused = activeFocusKey === item.key;

              return (
                <div
                  key={item.key}
                  onMouseEnter={() => setHoveredExpr(item.key)}
                  onMouseLeave={() => setHoveredExpr(null)}
                  className={`flex items-center justify-between gap-2 text-xs px-1.5 py-0.5 rounded-sm transition-colors cursor-default ${
                    isFocused ? 'bg-slate-800/70' : ''
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2 h-2 rounded-xs shrink-0"
                      style={{ backgroundColor: meta.color }}
                    />
                    <span
                      className={`truncate ${
                        isFocused ? 'text-slate-100 font-medium' : 'text-slate-400'
                      }`}
                    >
                      {meta.shortLabel}
                    </span>
                  </div>
                  <span
                    className={`font-mono tabular-nums shrink-0 ${
                      isFocused ? 'text-slate-100 font-semibold' : 'text-slate-300'
                    }`}
                  >
                    %{item.percent}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Horizontal Bar Chart Mode */
        <div className="space-y-2.5">
          {distribution.items.map((item) => {
            const meta = EXPRESSION_META[item.key];
            const isDom = distribution.dominant === item.key;

            return (
              <div
                key={item.key}
                className="grid grid-cols-[100px_1fr_40px] items-center gap-2.5"
              >
                <span
                  className={`text-xs truncate ${
                    isDom ? 'text-slate-100 font-medium' : 'text-slate-400'
                  }`}
                >
                  {meta.label}
                </span>
                <div className="h-2 bg-slate-800/90 rounded-xs overflow-hidden">
                  <div
                    className={`h-full transition-[width] duration-150 ease-out ${meta.barClass}`}
                    style={{
                      width: `${item.percent}%`,
                      opacity: isDom ? 1 : 0.78,
                    }}
                  />
                </div>
                <span
                  className={`text-right text-xs font-mono tabular-nums ${
                    isDom ? 'text-slate-100 font-semibold' : 'text-slate-300'
                  }`}
                >
                  %{item.percent}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
