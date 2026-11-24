import * as faceapi from '@vladmandic/face-api';
import {
  DetectorMode,
  EXPRESSION_META,
  EXPRESSION_ORDER,
  ExpressionKey,
  FaceBox,
  TrackedFace,
} from '../types/expressions';

let baseModelsLoaded = false;
let ssdModelsLoaded = false;
let baseLoadPromise: Promise<void> | null = null;
let ssdLoadPromise: Promise<void> | null = null;

export async function ensureModelsLoaded(mode: DetectorMode): Promise<void> {
  if (!baseModelsLoaded) {
    if (!baseLoadPromise) {
      baseLoadPromise = (async () => {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
          faceapi.nets.faceLandmark68TinyNet.loadFromUri('/models'),
          faceapi.nets.faceExpressionNet.loadFromUri('/models'),
        ]);
        baseModelsLoaded = true;
      })();
    }
    await baseLoadPromise;
  }

  if (mode === 'ssd' && !ssdModelsLoaded) {
    if (!ssdLoadPromise) {
      ssdLoadPromise = (async () => {
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri('/models'),
          faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
        ]);
        ssdModelsLoaded = true;
      })();
    }
    await ssdLoadPromise;
  }
}

export interface RawDetectionResult {
  box: FaceBox;
  score: number;
  expressions: Record<ExpressionKey, number>;
  landmarks: Array<{ x: number; y: number }>;
}

export async function detectMultiFaces(
  input: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
  mode: DetectorMode,
  minConfidence: number,
  displayWidth: number,
  displayHeight: number
): Promise<RawDetectionResult[]> {
  await ensureModelsLoaded(mode);

  const useTinyLandmarks = mode === 'tiny';
  const options =
    mode === 'tiny'
      ? new faceapi.TinyFaceDetectorOptions({
          inputSize: 416,
          scoreThreshold: minConfidence,
        })
      : new faceapi.SsdMobilenetv1Options({
          minConfidence,
          maxResults: 20,
        });

  const detections = await faceapi
    .detectAllFaces(input, options)
    .withFaceLandmarks(useTinyLandmarks)
    .withFaceExpressions();

  const resized = faceapi.resizeResults(detections, {
    width: displayWidth,
    height: displayHeight,
  });

  return resized.map((det) => {
    const rawExpr = det.expressions;
    const expressions: Record<ExpressionKey, number> = {
      happy: rawExpr.happy ?? 0,
      sad: rawExpr.sad ?? 0,
      angry: rawExpr.angry ?? 0,
      surprised: rawExpr.surprised ?? 0,
      fearful: rawExpr.fearful ?? 0,
      disgusted: rawExpr.disgusted ?? 0,
      neutral: rawExpr.neutral ?? 0,
    };

    return {
      box: {
        x: det.detection.box.x,
        y: det.detection.box.y,
        width: det.detection.box.width,
        height: det.detection.box.height,
      },
      score: det.detection.score,
      expressions,
      landmarks: det.landmarks.positions.map((p) => ({ x: p.x, y: p.y })),
    };
  });
}

interface InternalTrack {
  id: number;
  box: FaceBox;
  expressions: Record<ExpressionKey, number>;
  lastSeen: number;
}

export class FaceTracker {
  private nextId = 1;
  private tracks: InternalTrack[] = [];
  private readonly maxAgeMs = 700;
  private readonly smoothingAlpha = 0.52;

  public reset(): void {
    this.nextId = 1;
    this.tracks = [];
  }

  public update(
    detections: RawDetectionResult[],
    now: number,
    smooth: boolean,
    thumbnailExtractor?: (box: FaceBox) => string | undefined
  ): TrackedFace[] {
    const usedTrackIds = new Set<number>();
    const sorted = [...detections].sort((a, b) => a.box.x - b.box.x);
    const results: TrackedFace[] = [];

    for (const det of sorted) {
      const cx = det.box.x + det.box.width / 2;
      const cy = det.box.y + det.box.height / 2;
      const maxDist = Math.max(det.box.width, det.box.height) * 0.85;

      let bestTrack: InternalTrack | null = null;
      let bestDist = Infinity;

      for (const track of this.tracks) {
        if (usedTrackIds.has(track.id)) continue;
        const tx = track.box.x + track.box.width / 2;
        const ty = track.box.y + track.box.height / 2;
        const dist = Math.hypot(cx - tx, cy - ty);
        if (dist < maxDist && dist < bestDist) {
          bestDist = dist;
          bestTrack = track;
        }
      }

      let id: number;
      let mergedExpressions: Record<ExpressionKey, number>;

      if (bestTrack) {
        usedTrackIds.add(bestTrack.id);
        id = bestTrack.id;
        bestTrack.box = det.box;
        bestTrack.lastSeen = now;

        if (smooth) {
          mergedExpressions = { ...det.expressions };
          for (const key of EXPRESSION_ORDER) {
            mergedExpressions[key] =
              this.smoothingAlpha * det.expressions[key] +
              (1 - this.smoothingAlpha) * bestTrack.expressions[key];
          }
        } else {
          mergedExpressions = { ...det.expressions };
        }
        bestTrack.expressions = mergedExpressions;
      } else {
        id = this.nextId++;
        mergedExpressions = { ...det.expressions };
        const newTrack: InternalTrack = {
          id,
          box: det.box,
          expressions: mergedExpressions,
          lastSeen: now,
        };
        this.tracks.push(newTrack);
        usedTrackIds.add(id);
      }

      let dominant: ExpressionKey = 'neutral';
      let dominantConfidence = -1;
      for (const key of EXPRESSION_ORDER) {
        if (mergedExpressions[key] > dominantConfidence) {
          dominantConfidence = mergedExpressions[key];
          dominant = key;
        }
      }

      results.push({
        id,
        box: det.box,
        score: det.score,
        dominant,
        dominantConfidence,
        expressions: mergedExpressions,
        landmarks: det.landmarks,
        thumbnailDataUrl: thumbnailExtractor ? thumbnailExtractor(det.box) : undefined,
      });
    }

    this.tracks = this.tracks.filter((t) => now - t.lastSeen <= this.maxAgeMs);

    if (this.tracks.length === 0 && results.length === 0 && this.nextId > 50) {
      this.nextId = 1;
    }

    return results.sort((a, b) => a.id - b.id);
  }
}

export function createThumbnailCropper(
  source: HTMLVideoElement | HTMLImageElement,
  sourceWidth: number,
  sourceHeight: number,
  displayWidth: number,
  displayHeight: number,
  mirrored: boolean
): (box: FaceBox) => string | undefined {
  if (!sourceWidth || !sourceHeight || !displayWidth || !displayHeight) {
    return () => undefined;
  }

  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = 88;
  cropCanvas.height = 88;
  const ctx = cropCanvas.getContext('2d');
  if (!ctx) return () => undefined;

  const scaleX = sourceWidth / displayWidth;
  const scaleY = sourceHeight / displayHeight;

  return (box: FaceBox) => {
    try {
      const padX = box.width * 0.18;
      const padY = box.height * 0.18;
      const sx = Math.max(0, (box.x - padX) * scaleX);
      const sy = Math.max(0, (box.y - padY) * scaleY);
      const sw = Math.min(sourceWidth - sx, (box.width + padX * 2) * scaleX);
      const sh = Math.min(sourceHeight - sy, (box.height + padY * 2) * scaleY);

      if (sw <= 4 || sh <= 4) return undefined;

      ctx.save();
      ctx.clearRect(0, 0, 88, 88);
      if (mirrored) {
        ctx.translate(88, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(source, sx, sy, sw, sh, 0, 0, 88, 88);
      ctx.restore();
      return cropCanvas.toDataURL('image/jpeg', 0.72);
    } catch {
      return undefined;
    }
  };
}

const LANDMARK_CHAINS: Array<{ indices: number[]; close?: boolean }> = [
  { indices: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16] }, // Jaw
  { indices: [17, 18, 19, 20, 21] }, // Left brow
  { indices: [22, 23, 24, 25, 26] }, // Right brow
  { indices: [27, 28, 29, 30] }, // Nose bridge
  { indices: [31, 32, 33, 34, 35] }, // Nose bottom
  { indices: [36, 37, 38, 39, 40, 41], close: true }, // Left eye
  { indices: [42, 43, 44, 45, 46, 47], close: true }, // Right eye
  { indices: [48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59], close: true }, // Outer lips
  { indices: [60, 61, 62, 63, 64, 65, 66, 67], close: true }, // Inner lips
];

export interface OverlayRenderOptions {
  mirrored: boolean;
  showBoxes: boolean;
  showLandmarks: boolean;
  selectedPersonId: number | null;
}

export function drawAnalysisOverlay(
  canvas: HTMLCanvasElement,
  faces: TrackedFace[],
  options: OverlayRenderOptions
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);

  if (faces.length === 0) return;

  for (const face of faces) {
    const meta = EXPRESSION_META[face.dominant];
    const isSelected = options.selectedPersonId === face.id;
    const x = options.mirrored ? width - face.box.x - face.box.width : face.box.x;
    const y = face.box.y;
    const w = face.box.width;
    const h = face.box.height;

    if (options.showLandmarks && face.landmarks && face.landmarks.length >= 68) {
      ctx.save();
      ctx.strokeStyle = isSelected ? '#22D3EE' : `${meta.color}AA`;
      ctx.lineWidth = isSelected ? 1.5 : 1.1;

      for (const chain of LANDMARK_CHAINS) {
        ctx.beginPath();
        chain.indices.forEach((ptIdx, idx) => {
          const pt = face.landmarks![ptIdx];
          const px = options.mirrored ? width - pt.x : pt.x;
          const py = pt.y;
          if (idx === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        if (chain.close) ctx.closePath();
        ctx.stroke();
      }

      ctx.fillStyle = isSelected ? '#67E8F9' : meta.color;
      for (const pt of face.landmarks) {
        const px = options.mirrored ? width - pt.x : pt.x;
        ctx.beginPath();
        ctx.arc(px, pt.y, 1.35, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    if (options.showBoxes) {
      ctx.save();
      const cornerLen = Math.max(12, Math.min(26, w * 0.2));

      // Subtle hairline full box
      ctx.strokeStyle = isSelected ? '#22D3EE' : `${meta.color}55`;
      ctx.lineWidth = isSelected ? 1.5 : 1;
      ctx.strokeRect(x, y, w, h);

      // Precision corner brackets
      ctx.strokeStyle = isSelected ? '#22D3EE' : meta.color;
      ctx.lineWidth = isSelected ? 3 : 2.25;
      ctx.beginPath();
      // Top-left
      ctx.moveTo(x, y + cornerLen);
      ctx.lineTo(x, y);
      ctx.lineTo(x + cornerLen, y);
      // Top-right
      ctx.moveTo(x + w - cornerLen, y);
      ctx.lineTo(x + w, y);
      ctx.lineTo(x + w, y + cornerLen);
      // Bottom-right
      ctx.moveTo(x + w, y + h - cornerLen);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x + w - cornerLen, y + h);
      // Bottom-left
      ctx.moveTo(x + cornerLen, y + h);
      ctx.lineTo(x, y + h);
      ctx.lineTo(x, y + h - cornerLen);
      ctx.stroke();

      // Header telemetry label
      const pct = Math.round(face.dominantConfidence * 100);
      const labelText = `Kişi ${face.id} · ${meta.shortLabel} %${pct}`;
      ctx.font = '600 12px "Plus Jakarta Sans", sans-serif';
      const textWidth = ctx.measureText(labelText).width;
      const tagW = textWidth + 16;
      const tagH = 24;
      const tagX = Math.max(4, Math.min(width - tagW - 4, x));
      const tagY = y >= tagH + 6 ? y - tagH - 4 : y + 4;

      ctx.fillStyle = 'rgba(7, 9, 14, 0.88)';
      ctx.fillRect(tagX, tagY, tagW, tagH);
      ctx.strokeStyle = isSelected ? '#22D3EE' : meta.color;
      ctx.lineWidth = 1;
      ctx.strokeRect(tagX, tagY, tagW, tagH);

      ctx.fillStyle = '#F8FAFC';
      ctx.textBaseline = 'middle';
      ctx.fillText(labelText, tagX + 8, tagY + tagH / 2 + 0.5);

      // Secondary expression hint bar inside bottom of box if > 18%
      const secondExpr = EXPRESSION_ORDER.filter((k) => k !== face.dominant).sort(
        (a, b) => face.expressions[b] - face.expressions[a]
      )[0];
      if (secondExpr && face.expressions[secondExpr] >= 0.15) {
        const secMeta = EXPRESSION_META[secondExpr];
        const secPct = Math.round(face.expressions[secondExpr] * 100);
        const secText = `${secMeta.shortLabel} %${secPct}`;
        ctx.font = '500 10.5px "JetBrains Mono", monospace';
        const secW = ctx.measureText(secText).width + 12;
        const secX = Math.max(4, Math.min(width - secW - 4, x));
        const secY = y + h + 4 <= height - 20 ? y + h + 4 : y + h - 22;

        ctx.fillStyle = 'rgba(7, 9, 14, 0.82)';
        ctx.fillRect(secX, secY, secW, 18);
        ctx.fillStyle = secMeta.color;
        ctx.fillText(secText, secX + 6, secY + 9.5);
      }

      ctx.restore();
    }
  }
}
