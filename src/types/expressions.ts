export type ExpressionKey =
  | 'happy'
  | 'sad'
  | 'angry'
  | 'surprised'
  | 'fearful'
  | 'disgusted'
  | 'neutral';

export type DetectorMode = 'tiny' | 'ssd';
export type SourceMode = 'camera' | 'image' | 'sample';

export interface ExpressionMeta {
  key: ExpressionKey;
  label: string;
  shortLabel: string;
  color: string;
  textClass: string;
  barClass: string;
}

export const EXPRESSION_ORDER: ExpressionKey[] = [
  'happy',
  'sad',
  'angry',
  'surprised',
  'fearful',
  'disgusted',
  'neutral',
];

export const EXPRESSION_META: Record<ExpressionKey, ExpressionMeta> = {
  happy: {
    key: 'happy',
    label: 'Gülme / Mutlu',
    shortLabel: 'Gülme',
    color: '#10B981',
    textClass: 'text-emerald-400',
    barClass: 'bg-emerald-500',
  },
  sad: {
    key: 'sad',
    label: 'Üzülme / Üzgün',
    shortLabel: 'Üzülme',
    color: '#3B82F6',
    textClass: 'text-blue-400',
    barClass: 'bg-blue-500',
  },
  angry: {
    key: 'angry',
    label: 'Sinir / Kızgın',
    shortLabel: 'Sinir',
    color: '#F43F5E',
    textClass: 'text-rose-400',
    barClass: 'bg-rose-500',
  },
  surprised: {
    key: 'surprised',
    label: 'Şaşkın',
    shortLabel: 'Şaşkın',
    color: '#F59E0B',
    textClass: 'text-amber-400',
    barClass: 'bg-amber-500',
  },
  fearful: {
    key: 'fearful',
    label: 'Korkmuş',
    shortLabel: 'Korku',
    color: '#8B5CF6',
    textClass: 'text-violet-400',
    barClass: 'bg-violet-500',
  },
  disgusted: {
    key: 'disgusted',
    label: 'Tiksinmiş',
    shortLabel: 'Tiksinme',
    color: '#84CC16',
    textClass: 'text-lime-400',
    barClass: 'bg-lime-500',
  },
  neutral: {
    key: 'neutral',
    label: 'Nötr',
    shortLabel: 'Nötr',
    color: '#94A3B8',
    textClass: 'text-slate-300',
    barClass: 'bg-slate-400',
  },
};

export interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TrackedFace {
  id: number;
  box: FaceBox;
  score: number;
  dominant: ExpressionKey;
  dominantConfidence: number;
  expressions: Record<ExpressionKey, number>;
  landmarks?: Array<{ x: number; y: number }>;
  thumbnailDataUrl?: string;
}

export interface TimelinePoint {
  timestamp: number;
  timeLabel: string;
  faceCount: number;
  averages: Record<ExpressionKey, number>;
}

export interface ExpressionEvent {
  id: string;
  timeLabel: string;
  personId: number;
  expression: ExpressionKey;
  confidence: number;
  faceCount: number;
}
