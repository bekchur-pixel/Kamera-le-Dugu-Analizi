import React from 'react';
import { User } from 'lucide-react';
import {
  EXPRESSION_META,
  EXPRESSION_ORDER,
  TrackedFace,
} from '../types/expressions';

interface PersonInspectorCardProps {
  face: TrackedFace;
  isSelected: boolean;
  onSelect: (personId: number) => void;
}

export const PersonInspectorCard: React.FC<PersonInspectorCardProps> = ({
  face,
  isSelected,
  onSelect,
}) => {
  const dominantMeta = EXPRESSION_META[face.dominant];
  const dominantPct = Math.round(face.dominantConfidence * 100);

  return (
    <button
      type="button"
      onClick={() => onSelect(face.id)}
      className={`w-full text-left p-4 rounded-lg border transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 ${
        isSelected
          ? 'bg-[#121A28] border-cyan-500/70'
          : 'bg-[#0E131D] border-slate-800 hover:border-slate-700'
      }`}
    >
      <div className="flex items-center gap-3.5 mb-3.5">
        <div className="w-12 h-12 rounded-md overflow-hidden bg-slate-900 border border-slate-700/80 shrink-0 flex items-center justify-center">
          {face.thumbnailDataUrl ? (
            <img
              src={face.thumbnailDataUrl}
              alt={`Kişi ${face.id} yüz kesiti`}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          ) : (
            <User className="w-5 h-5 text-slate-500" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-semibold text-slate-100 truncate">
              Kişi {face.id}
            </span>
            <span
              className={`text-sm font-mono font-semibold tabular-nums ${dominantMeta.textClass}`}
            >
              %{dominantPct}
            </span>
          </div>

          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400">
            <span className={`font-medium ${dominantMeta.textClass}`}>
              {dominantMeta.label}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums text-slate-500">
              Güven {Math.round(face.score * 100)}%
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {EXPRESSION_ORDER.map((exprKey) => {
          const meta = EXPRESSION_META[exprKey];
          const val = Math.max(0, Math.min(1, face.expressions[exprKey] ?? 0));
          const pct = Math.round(val * 100);
          const isDom = exprKey === face.dominant;

          return (
            <div key={exprKey} className="grid grid-cols-[106px_1fr_38px] items-center gap-2.5">
              <span
                className={`text-xs truncate ${
                  isDom ? 'text-slate-100 font-medium' : 'text-slate-400'
                }`}
              >
                {meta.label}
              </span>
              <div className="h-1.5 bg-slate-800/90 rounded-xs overflow-hidden">
                <div
                  className={`h-full transition-[width] duration-150 ease-out ${meta.barClass}`}
                  style={{ width: `${pct}%`, opacity: isDom ? 1 : 0.72 }}
                />
              </div>
              <span
                className={`text-right text-xs font-mono tabular-nums ${
                  isDom ? 'text-slate-100 font-semibold' : 'text-slate-400'
                }`}
              >
                %{pct}
              </span>
            </div>
          );
        })}
      </div>
    </button>
  );
};
