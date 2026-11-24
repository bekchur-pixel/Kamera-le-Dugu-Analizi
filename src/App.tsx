import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  CameraOff,
  Download,
  FlipHorizontal2,
  ImagePlus,
  Pause,
  Play,
  ScanFace,
  Sparkles,
  SquareDashed,
  Trash2,
  Users,
} from 'lucide-react';
import { ExpressionTimelineChart } from './components/ExpressionTimelineChart';
import { GroupEmotionDistribution } from './components/GroupEmotionDistribution';
import { PersonInspectorCard } from './components/PersonInspectorCard';
import {
  DetectorMode,
  EXPRESSION_META,
  EXPRESSION_ORDER,
  ExpressionEvent,
  ExpressionKey,
  SourceMode,
  TimelinePoint,
  TrackedFace,
} from './types/expressions';
import {
  createThumbnailCropper,
  detectMultiFaces,
  drawAnalysisOverlay,
  ensureModelsLoaded,
  FaceTracker,
} from './utils/faceEngine';

const SAMPLE_GROUP_IMAGE_URL =
  '/src/assets/images/sample_group_expressions_1795549180355.jpg';

function formatClock(date: Date): string {
  return date.toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default function App() {
  const [sourceMode, setSourceMode] = useState<SourceMode>('camera');
  const [detectorMode, setDetectorMode] = useState<DetectorMode>('tiny');
  const [minConfidence, setMinConfidence] = useState<number>(0.45);
  const [mirrored, setMirrored] = useState<boolean>(true);
  const [showBoxes, setShowBoxes] = useState<boolean>(true);
  const [showLandmarks, setShowLandmarks] = useState<boolean>(true);
  const [isPaused, setIsPaused] = useState<boolean>(false);

  const [modelsReady, setModelsReady] = useState<boolean>(false);
  const [modelsLoading, setModelsLoading] = useState<boolean>(true);
  const [modelError, setModelError] = useState<string | null>(null);

  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraStarting, setCameraStarting] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');

  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [mediaAspect, setMediaAspect] = useState<number>(16 / 9);

  const [faces, setFaces] = useState<TrackedFace[]>([]);
  const [selectedPersonId, setSelectedPersonId] = useState<number | null>(null);
  const [fps, setFps] = useState<number>(0);
  const [inferenceMs, setInferenceMs] = useState<number>(0);

  const [timeline, setTimeline] = useState<TimelinePoint[]>([]);
  const [events, setEvents] = useState<ExpressionEvent[]>([]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaBoxRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackerRef = useRef<FaceTracker>(new FaceTracker());

  const lastTimelinePushRef = useRef<number>(0);
  const lastEventByPersonRef = useRef<Record<number, { expr: ExpressionKey; at: number }>>({});
  const isInferringRef = useRef<boolean>(false);
  const uploadedUrlRef = useRef<string | null>(null);

  // Load initial TinyFace + Landmark + Expression models
  useEffect(() => {
    let cancelled = false;
    setModelsLoading(true);
    setModelError(null);

    ensureModelsLoaded(detectorMode)
      .then(() => {
        if (!cancelled) {
          setModelsReady(true);
          setModelsLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('Model loading error:', err);
          setModelError(
            'Yüz analiz modelleri yüklenemedi. Sayfayı yenileyip tekrar deneyin.'
          );
          setModelsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [detectorMode]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setIsPaused(false);
    setFps(0);
    setInferenceMs(0);
  }, []);

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = list.filter((d) => d.kind === 'videoinput');
      setDevices(videoInputs);
      if (videoInputs.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(videoInputs[0].deviceId);
      }
    } catch {
      // Ignore device enumeration errors before permissions
    }
  }, [selectedDeviceId]);

  const startCamera = useCallback(
    async (overrideDeviceId?: string) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError(
          'Tarayıcınız kamera erişimini desteklemiyor veya güvenli bağlam (HTTPS) eksik.'
        );
        return;
      }

      stopCamera();
      setSourceMode('camera');
      setCameraError(null);
      setCameraStarting(true);
      trackerRef.current.reset();
      setFaces([]);
      setSelectedPersonId(null);

      const targetDevice = overrideDeviceId ?? selectedDeviceId;

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: targetDevice ? { exact: targetDevice } : undefined,
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: targetDevice ? undefined : 'user',
          },
          audio: false,
        });

        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
          if (video.videoWidth && video.videoHeight) {
            setMediaAspect(video.videoWidth / video.videoHeight);
          }
        }

        setCameraActive(true);
        setCameraStarting(false);
        await refreshDevices();
      } catch (err: unknown) {
        setCameraStarting(false);
        setCameraActive(false);
        const name = err instanceof DOMException ? err.name : '';
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          setCameraError(
            'Kamera izni reddedildi. Tarayıcı adres çubuğundan kamera izni verip yeniden deneyin.'
          );
        } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
          setCameraError(
            'Bağlı bir kamera algılanamadı. Örnek grup fotoğrafı veya görsel yükleme ile çoklu yüz analizini test edebilirsiniz.'
          );
        } else {
          setCameraError(
            'Kamera başlatılamadı. Başka bir uygulama kamerayı kullanıyor olabilir.'
          );
        }
      }
    },
    [refreshDevices, selectedDeviceId, stopCamera]
  );

  useEffect(() => {
    refreshDevices();
    return () => {
      stopCamera();
      if (uploadedUrlRef.current) {
        URL.revokeObjectURL(uploadedUrlRef.current);
      }
    };
  }, [refreshDevices, stopCamera]);

  const recordMetricsAndEvents = useCallback((tracked: TrackedFace[]) => {
    const now = Date.now();
    const clock = formatClock(new Date(now));

    if (tracked.length > 0 && now - lastTimelinePushRef.current >= 500) {
      lastTimelinePushRef.current = now;
      const averages = {} as Record<ExpressionKey, number>;
      for (const key of EXPRESSION_ORDER) {
        const sum = tracked.reduce((acc, f) => acc + (f.expressions[key] ?? 0), 0);
        averages[key] = sum / tracked.length;
      }

      setTimeline((prev) => {
        const next = [
          ...prev,
          {
            timestamp: now,
            timeLabel: clock,
            faceCount: tracked.length,
            averages,
          },
        ];
        return next.length > 60 ? next.slice(next.length - 60) : next;
      });
    }

    const newEvents: ExpressionEvent[] = [];
    for (const face of tracked) {
      if (face.dominantConfidence < 0.52) continue;
      const prev = lastEventByPersonRef.current[face.id];
      const shouldRecord =
        !prev ||
        (prev.expr !== face.dominant && now - prev.at >= 1400) ||
        (prev.expr === face.dominant && now - prev.at >= 12000 && face.dominant !== 'neutral');

      if (shouldRecord) {
        lastEventByPersonRef.current[face.id] = {
          expr: face.dominant,
          at: now,
        };
        newEvents.push({
          id: `${now}-${face.id}-${Math.random().toString(36).slice(2, 6)}`,
          timeLabel: clock,
          personId: face.id,
          expression: face.dominant,
          confidence: face.dominantConfidence,
          faceCount: tracked.length,
        });
      }
    }

    if (newEvents.length > 0) {
      setEvents((prev) => [...newEvents, ...prev].slice(0, 40));
    }
  }, []);

  // Redraw overlay immediately when visual toggles or selection change
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const isMirroredView = sourceMode === 'camera' && mirrored;
    drawAnalysisOverlay(canvas, faces, {
      mirrored: isMirroredView,
      showBoxes,
      showLandmarks,
      selectedPersonId,
    });
  }, [faces, mirrored, selectedPersonId, showBoxes, showLandmarks, sourceMode]);

  // Live video inference loop
  useEffect(() => {
    if (sourceMode !== 'camera' || !cameraActive || !modelsReady || isPaused) {
      return;
    }

    let animId = 0;
    let active = true;
    let frameTimes: number[] = [];

    const step = async () => {
      if (!active) return;

      const video = videoRef.current;
      const canvas = overlayCanvasRef.current;
      const mediaBox = mediaBoxRef.current;

      if (
        video &&
        canvas &&
        mediaBox &&
        video.readyState >= 2 &&
        video.videoWidth > 0 &&
        !isInferringRef.current
      ) {
        const displayW = mediaBox.clientWidth;
        const displayH = mediaBox.clientHeight;

        if (displayW > 10 && displayH > 10) {
          if (canvas.width !== displayW || canvas.height !== displayH) {
            canvas.width = displayW;
            canvas.height = displayH;
          }

          isInferringRef.current = true;
          const t0 = performance.now();

          try {
            const raw = await detectMultiFaces(
              video,
              detectorMode,
              minConfidence,
              displayW,
              displayH
            );

            if (!active) return;

            const cropper = createThumbnailCropper(
              video,
              video.videoWidth,
              video.videoHeight,
              displayW,
              displayH,
              mirrored
            );

            const tracked = trackerRef.current.update(
              raw,
              Date.now(),
              true,
              cropper
            );

            const elapsed = performance.now() - t0;
            setInferenceMs(Math.round(elapsed));

            const nowPerf = performance.now();
            frameTimes.push(nowPerf);
            frameTimes = frameTimes.filter((t) => nowPerf - t <= 1000);
            setFps(frameTimes.length);

            setFaces(tracked);
            recordMetricsAndEvents(tracked);
          } catch (err) {
            console.error('Inference frame error:', err);
          } finally {
            isInferringRef.current = false;
          }
        }
      }

      if (active) {
        animId = requestAnimationFrame(step);
      }
    };

    animId = requestAnimationFrame(step);

    return () => {
      active = false;
      cancelAnimationFrame(animId);
    };
  }, [
    cameraActive,
    detectorMode,
    isPaused,
    minConfidence,
    mirrored,
    modelsReady,
    recordMetricsAndEvents,
    sourceMode,
  ]);

  // Analyze static image (sample group or user-uploaded image)
  const analyzeStaticImage = useCallback(async () => {
    if (sourceMode === 'camera' || !modelsReady) return;
    const img = imageRef.current;
    const canvas = overlayCanvasRef.current;
    const mediaBox = mediaBoxRef.current;

    if (!img || !canvas || !mediaBox || !img.complete || img.naturalWidth === 0) {
      return;
    }

    const displayW = mediaBox.clientWidth;
    const displayH = mediaBox.clientHeight;
    if (displayW < 10 || displayH < 10) return;

    canvas.width = displayW;
    canvas.height = displayH;

    trackerRef.current.reset();
    const t0 = performance.now();

    try {
      const raw = await detectMultiFaces(
        img,
        detectorMode,
        minConfidence,
        displayW,
        displayH
      );
      const cropper = createThumbnailCropper(
        img,
        img.naturalWidth,
        img.naturalHeight,
        displayW,
        displayH,
        false
      );
      const tracked = trackerRef.current.update(raw, Date.now(), false, cropper);
      setInferenceMs(Math.round(performance.now() - t0));
      setFps(0);
      setFaces(tracked);
      recordMetricsAndEvents(tracked);
    } catch (err) {
      console.error('Image analysis error:', err);
    }
  }, [detectorMode, minConfidence, modelsReady, recordMetricsAndEvents, sourceMode]);

  useEffect(() => {
    if (sourceMode !== 'camera' && modelsReady) {
      const timer = window.setTimeout(() => {
        analyzeStaticImage();
      }, 60);
      return () => window.clearTimeout(timer);
    }
  }, [analyzeStaticImage, sourceMode, modelsReady, mediaAspect]);

  // Re-align canvas on window resize in static image mode
  useEffect(() => {
    if (sourceMode === 'camera') return;
    const handleResize = () => {
      analyzeStaticImage();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [analyzeStaticImage, sourceMode]);

  const handleSelectSampleGroup = () => {
    stopCamera();
    setCameraError(null);
    setSelectedPersonId(null);
    setSourceMode('sample');
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    stopCamera();
    setCameraError(null);
    setSelectedPersonId(null);

    if (uploadedUrlRef.current) {
      URL.revokeObjectURL(uploadedUrlRef.current);
    }
    const url = URL.createObjectURL(file);
    uploadedUrlRef.current = url;
    setUploadedImageUrl(url);
    setSourceMode('image');
    e.target.value = '';
  };

  const handleCameraDeviceChange = (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    if (cameraActive) {
      startCamera(deviceId);
    }
  };

  const handleTogglePause = () => {
    const video = videoRef.current;
    if (!video) return;
    if (isPaused) {
      video.play().catch(() => undefined);
      setIsPaused(false);
    } else {
      video.pause();
      setIsPaused(true);
    }
  };

  const handleCaptureSnapshot = () => {
    const mediaBox = mediaBoxRef.current;
    const overlayCanvas = overlayCanvasRef.current;
    const mediaEl = sourceMode === 'camera' ? videoRef.current : imageRef.current;
    if (!mediaBox || !overlayCanvas || !mediaEl) return;

    const w = overlayCanvas.width || mediaBox.clientWidth;
    const h = overlayCanvas.height || mediaBox.clientHeight;
    if (!w || !h) return;

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = w;
    exportCanvas.height = h;
    const ctx = exportCanvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    if (sourceMode === 'camera' && mirrored) {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(mediaEl, 0, 0, w, h);
    ctx.restore();

    ctx.drawImage(overlayCanvas, 0, 0, w, h);

    const link = document.createElement('a');
    link.download = `mimiklab-analiz-${Date.now()}.png`;
    link.href = exportCanvas.toDataURL('image/png');
    link.click();
  };

  const handleExportCsv = () => {
    if (events.length === 0) return;
    const header = 'Saat,Kisi,Baskin Ifade,Guven (%),Toplam Kisi\n';
    const rows = events
      .map(
        (ev) =>
          `${ev.timeLabel},Kişi ${ev.personId},${EXPRESSION_META[ev.expression].label},${Math.round(
            ev.confidence * 100
          )},${ev.faceCount}`
      )
      .join('\n');

    const blob = new Blob(['\uFEFF' + header + rows], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `mimiklab-kayit-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const groupSummary = useMemo(() => {
    if (faces.length === 0) {
      return {
        dominant: null as ExpressionKey | null,
        avgConfidence: 0,
      };
    }

    let bestExpr: ExpressionKey = 'neutral';
    let bestAvg = -1;
    for (const key of EXPRESSION_ORDER) {
      const avg =
        faces.reduce((acc, f) => acc + (f.expressions[key] ?? 0), 0) / faces.length;
      if (avg > bestAvg) {
        bestAvg = avg;
        bestExpr = key;
      }
    }

    return {
      dominant: bestExpr,
      avgConfidence: Math.round(bestAvg * 100),
    };
  }, [faces]);

  const activeImageSrc =
    sourceMode === 'sample' ? SAMPLE_GROUP_IMAGE_URL : uploadedImageUrl;

  return (
    <div className="min-h-screen bg-[#07090E] text-slate-100 flex flex-col">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="border-b border-slate-800/90 bg-[#07090E]/95 sticky top-0 z-30">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-8">
          {/* Zone 1: Wordmark */}
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setSourceMode('camera');
            }}
            className="text-lg font-bold tracking-tight text-slate-50 whitespace-nowrap shrink-0"
          >
            MimikLab
          </a>

          {/* Zone 2: Mode Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            <button
              type="button"
              onClick={() => setSourceMode('camera')}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                sourceMode === 'camera'
                  ? 'border-cyan-400 text-slate-50'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Canlı Kamera
            </button>
            <button
              type="button"
              onClick={handleSelectSampleGroup}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                sourceMode === 'sample'
                  ? 'border-cyan-400 text-slate-50'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Örnek Grup
            </button>
            <button
              type="button"
              onClick={handleUploadClick}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                sourceMode === 'image'
                  ? 'border-cyan-400 text-slate-50'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Görsel Yükle
            </button>
          </nav>

          {/* Zone 3: Single Primary Action */}
          <div className="flex items-center gap-3 shrink-0">
            {sourceMode === 'camera' && cameraActive ? (
              <button
                type="button"
                onClick={stopCamera}
                className="px-4 py-2 text-xs font-semibold rounded-md bg-rose-600 hover:bg-rose-500 text-white transition-colors whitespace-nowrap shrink-0 flex items-center gap-2"
              >
                <CameraOff className="w-3.5 h-3.5" />
                <span>Kamerayı Durdur</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => startCamera()}
                disabled={cameraStarting || !modelsReady}
                className="px-4 py-2 text-xs font-semibold rounded-md bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 transition-colors whitespace-nowrap shrink-0 flex items-center gap-2"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>
                  {cameraStarting
                    ? 'Kamera Açılıyor...'
                    : !modelsReady
                    ? 'Modeller Hazırlanıyor...'
                    : 'Kamerayı Başlat'}
                </span>
              </button>
            )}
          </div>
        </div>
      </header>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Main Split Console Workspace */}
      <main id="top" className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-5 space-y-5">
        {/* Mobile mode switcher */}
        <div className="flex md:hidden items-center gap-2 border-b border-slate-800 pb-3 overflow-x-auto">
          <button
            type="button"
            onClick={() => setSourceMode('camera')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
              sourceMode === 'camera'
                ? 'bg-slate-800 text-slate-50'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Canlı Kamera
          </button>
          <button
            type="button"
            onClick={handleSelectSampleGroup}
            className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
              sourceMode === 'sample'
                ? 'bg-slate-800 text-slate-50'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Örnek Grup
          </button>
          <button
            type="button"
            onClick={handleUploadClick}
            className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
              sourceMode === 'image'
                ? 'bg-slate-800 text-slate-50'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Görsel Yükle
          </button>
        </div>

        {modelError && (
          <div className="p-4 rounded-lg bg-rose-950/40 border border-rose-800/70 text-sm text-rose-200">
            {modelError}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] xl:grid-cols-[1fr_420px] gap-5 items-start">
          {/* Left Stage Column: Live Video / Image Viewport + Controls */}
          <section className="space-y-4 min-w-0">
            <div className="bg-[#0E131D] border border-slate-800 rounded-lg overflow-hidden">
              {/* Viewport Header */}
              <div className="px-4 py-2.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 text-xs">
                  {sourceMode === 'camera' && cameraActive ? (
                    <span className="font-medium text-emerald-400 flex items-center gap-1.5">
                      <span aria-hidden="true">●</span>
                      <span>{isPaused ? 'Duraklatıldı' : 'Canlı Kamera Akışı'}</span>
                    </span>
                  ) : sourceMode === 'sample' ? (
                    <span className="font-medium text-cyan-400">
                      Çoklu Kişi Örnek Sahnesi
                    </span>
                  ) : sourceMode === 'image' ? (
                    <span className="font-medium text-cyan-400">
                      Yüklenen Görsel Analizi
                    </span>
                  ) : (
                    <span className="font-medium text-slate-400">
                      Kamera Beklemede
                    </span>
                  )}

                  <span aria-hidden="true" className="text-slate-600">
                    ·
                  </span>
                  <span className="text-slate-400 font-mono tabular-nums">
                    {faces.length} kişi algılandı
                  </span>
                  {cameraActive && fps > 0 && (
                    <>
                      <span aria-hidden="true" className="text-slate-600">
                        ·
                      </span>
                      <span className="text-slate-400 font-mono tabular-nums">
                        {fps} FPS ({inferenceMs} ms)
                      </span>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {sourceMode === 'camera' && cameraActive && (
                    <button
                      type="button"
                      onClick={handleTogglePause}
                      className="px-2.5 py-1 text-xs font-medium rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
                    >
                      {isPaused ? (
                        <>
                          <Play className="w-3.5 h-3.5" />
                          <span>Devam Et</span>
                        </>
                      ) : (
                        <>
                          <Pause className="w-3.5 h-3.5" />
                          <span>Duraklat</span>
                        </>
                      )}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleCaptureSnapshot}
                    disabled={
                      (sourceMode === 'camera' && !cameraActive) ||
                      (sourceMode !== 'camera' && !activeImageSrc)
                    }
                    className="px-2.5 py-1 text-xs font-medium rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none text-slate-200 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Kareyi İndir</span>
                  </button>
                </div>
              </div>

              {/* 16:9 Stage Surface */}
              <div className="relative aspect-video w-full bg-[#05070B] flex items-center justify-center overflow-hidden">
                <div
                  ref={mediaBoxRef}
                  className="relative max-w-full max-h-full flex items-center justify-center"
                  style={{
                    aspectRatio: `${mediaAspect}`,
                    width: mediaAspect >= 16 / 9 ? '100%' : 'auto',
                    height: mediaAspect >= 16 / 9 ? 'auto' : '100%',
                  }}
                >
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    onLoadedMetadata={(e) => {
                      const v = e.currentTarget;
                      if (v.videoWidth && v.videoHeight) {
                        setMediaAspect(v.videoWidth / v.videoHeight);
                      }
                    }}
                    className={`w-full h-full block object-cover ${
                      sourceMode === 'camera' && cameraActive ? 'opacity-100' : 'opacity-0 pointer-events-none absolute inset-0'
                    } ${mirrored ? '-scale-x-100' : ''}`}
                  />

                  {sourceMode !== 'camera' && activeImageSrc && (
                    <img
                      ref={imageRef}
                      src={activeImageSrc}
                      alt="Çoklu yüz analizi görseli"
                      referrerPolicy="no-referrer"
                      onLoad={(e) => {
                        const im = e.currentTarget;
                        if (im.naturalWidth && im.naturalHeight) {
                          setMediaAspect(im.naturalWidth / im.naturalHeight);
                        }
                        analyzeStaticImage();
                      }}
                      className="w-full h-full block object-contain"
                    />
                  )}

                  <canvas
                    ref={overlayCanvasRef}
                    className="absolute inset-0 w-full h-full pointer-events-none"
                  />
                </div>

                {/* Idle / Error / Loading Overlay inside Stage */}
                {sourceMode === 'camera' && !cameraActive && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-[#07090E]/90">
                    <div className="w-12 h-12 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center mb-4">
                      <ScanFace className="w-6 h-6 text-cyan-400" />
                    </div>

                    <h1 className="text-lg font-semibold text-slate-100 max-w-md text-balance">
                      Canlı Çoklu Yüz ve İfade Analizi
                    </h1>
                    <p className="text-sm text-slate-400 mt-1.5 max-w-md">
                      Bilgisayar kameranızı açarak aynı anda birden fazla kişinin gülme, üzülme, sinir ve şaşkınlık ifadelerini anlık olarak takip edin.
                    </p>

                    {cameraError && (
                      <div className="mt-4 px-4 py-2.5 rounded-md bg-rose-950/60 border border-rose-800/80 text-xs text-rose-200 max-w-md">
                        {cameraError}
                      </div>
                    )}

                    <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                      <button
                        type="button"
                        onClick={() => startCamera()}
                        disabled={cameraStarting || !modelsReady}
                        className="px-4 py-2.5 text-sm font-semibold rounded-md bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 transition-colors flex items-center gap-2 whitespace-nowrap shrink-0"
                      >
                        <Camera className="w-4 h-4" />
                        <span>
                          {modelsLoading
                            ? 'Analiz Modelleri Yükleniyor...'
                            : cameraStarting
                            ? 'Kamera Başlatılıyor...'
                            : 'Kamerayı Başlat'}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={handleSelectSampleGroup}
                        disabled={!modelsReady}
                        className="px-4 py-2.5 text-sm font-medium rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-slate-200 transition-colors flex items-center gap-2 whitespace-nowrap shrink-0"
                      >
                        <Users className="w-4 h-4" />
                        <span>Örnek Grup ile Test Et</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleUploadClick}
                        disabled={!modelsReady}
                        className="px-4 py-2.5 text-sm font-medium rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-slate-200 transition-colors flex items-center gap-2 whitespace-nowrap shrink-0"
                      >
                        <ImagePlus className="w-4 h-4" />
                        <span>Fotoğraf Yükle</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Stage Parameter Controls Toolbar */}
              <div className="px-4 py-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-4 bg-[#0B0F17]">
                <div className="flex flex-wrap items-center gap-3">
                  {devices.length > 0 && (
                    <label className="flex items-center gap-2 text-xs text-slate-400">
                      <span className="whitespace-nowrap">Kamera:</span>
                      <select
                        value={selectedDeviceId}
                        onChange={(e) => handleCameraDeviceChange(e.target.value)}
                        className="bg-slate-900 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 max-w-[190px] truncate"
                      >
                        {devices.map((d, idx) => (
                          <option key={d.deviceId || idx} value={d.deviceId}>
                            {d.label || `Kamera ${idx + 1}`}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  <div className="flex items-center gap-1 p-0.5 bg-slate-900 border border-slate-800 rounded-md">
                    <button
                      type="button"
                      onClick={() => setDetectorMode('tiny')}
                      className={`px-2.5 py-1 text-xs font-medium rounded-sm transition-colors whitespace-nowrap shrink-0 ${
                        detectorMode === 'tiny'
                          ? 'bg-slate-800 text-cyan-300'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Hızlı Algılama
                    </button>
                    <button
                      type="button"
                      onClick={() => setDetectorMode('ssd')}
                      className={`px-2.5 py-1 text-xs font-medium rounded-sm transition-colors whitespace-nowrap shrink-0 ${
                        detectorMode === 'ssd'
                          ? 'bg-slate-800 text-cyan-300'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Yüksek Hassasiyet
                    </button>
                  </div>

                  <label className="flex items-center gap-2 text-xs text-slate-400">
                    <span className="whitespace-nowrap">Eşik:</span>
                    <input
                      type="range"
                      min={0.2}
                      max={0.8}
                      step={0.05}
                      value={minConfidence}
                      onChange={(e) => setMinConfidence(parseFloat(e.target.value))}
                      className="w-20 accent-cyan-400 cursor-pointer"
                    />
                    <span className="font-mono tabular-nums text-slate-200 w-9">
                      %{Math.round(minConfidence * 100)}
                    </span>
                  </label>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {sourceMode === 'camera' && (
                    <button
                      type="button"
                      onClick={() => setMirrored((m) => !m)}
                      className={`px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                        mirrored
                          ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-300'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <FlipHorizontal2 className="w-3.5 h-3.5" />
                      <span>Ayna</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setShowBoxes((b) => !b)}
                    className={`px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                      showBoxes
                        ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-300'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <SquareDashed className="w-3.5 h-3.5" />
                    <span>Çerçeve</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowLandmarks((l) => !l)}
                    className={`px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                      showLandmarks
                        ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-300'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Yüz Ağı</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Live Timeline Chart */}
            <ExpressionTimelineChart points={timeline} />
          </section>

          {/* Right Inspector Column: Group Summary + Per-Person Cards + Event Log */}
          <aside className="space-y-4">
            {/* Group Telemetry Strip */}
            <div className="bg-[#0E131D] border border-slate-800 rounded-lg p-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-slate-400">Algılanan Kişi</div>
                  <div className="mt-1 text-2xl font-mono font-bold tabular-nums text-slate-50">
                    {faces.length}
                    <span className="text-xs font-normal text-slate-500 ml-1.5">
                      yüz
                    </span>
                  </div>
                </div>

                <div>
                  <div className="text-xs text-slate-400">Grup Baskın İfadesi</div>
                  <div className="mt-1 flex items-baseline gap-2">
                    {groupSummary.dominant ? (
                      <>
                        <span
                          className={`text-lg font-semibold truncate ${
                            EXPRESSION_META[groupSummary.dominant].textClass
                          }`}
                        >
                          {EXPRESSION_META[groupSummary.dominant].shortLabel}
                        </span>
                        <span className="text-xs font-mono tabular-nums text-slate-400">
                          %{groupSummary.avgConfidence}
                        </span>
                      </>
                    ) : (
                      <span className="text-lg font-mono text-slate-500">—</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Live Overall Emotion Distribution Chart (Pie / Bar) */}
            <GroupEmotionDistribution faces={faces} />

            {/* Per-Person Multi-Face Inspector List */}
            <div className="bg-[#0E131D] border border-slate-800 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-100">
                  Kişi Bazlı İfade Dağılımı
                </h2>
                {selectedPersonId !== null && (
                  <button
                    type="button"
                    onClick={() => setSelectedPersonId(null)}
                    className="text-xs text-cyan-400 hover:text-cyan-300"
                  >
                    Seçimi Kaldır
                  </button>
                )}
              </div>

              {faces.length === 0 ? (
                <div className="py-10 px-4 border border-dashed border-slate-800 rounded-md text-center">
                  <p className="text-xs text-slate-400">
                    {sourceMode === 'camera' && !cameraActive
                      ? 'Analiz başlatıldığında algılanan her kişi için ayrı ifade kartı burada açılır.'
                      : 'Karede yüz algılanamadı. Işığı artırın veya kameraya dönün.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[540px] overflow-y-auto pr-1">
                  {faces.map((face) => (
                    <PersonInspectorCard
                      key={face.id}
                      face={face}
                      isSelected={selectedPersonId === face.id}
                      onSelect={(id) =>
                        setSelectedPersonId((prev) => (prev === id ? null : id))
                      }
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Expression Transition Event Log */}
            <div className="bg-[#0E131D] border border-slate-800 rounded-lg p-4">
              <div className="flex items-center justify-between gap-2 mb-3">
                <h2 className="text-sm font-semibold text-slate-100">
                  İfade Değişim Kaydı
                </h2>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleExportCsv}
                    disabled={events.length === 0}
                    className="text-xs text-slate-300 hover:text-cyan-300 disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>CSV</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEvents([]);
                      setTimeline([]);
                      lastEventByPersonRef.current = {};
                    }}
                    disabled={events.length === 0 && timeline.length === 0}
                    className="text-xs text-slate-400 hover:text-rose-400 disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Temizle</span>
                  </button>
                </div>
              </div>

              {events.length === 0 ? (
                <p className="text-xs text-slate-500 py-4 text-center border border-dashed border-slate-800 rounded-md">
                  Belirgin gülme, üzülme veya sinir değişimleri burada listelenir.
                </p>
              ) : (
                <div className="divide-y divide-slate-800/80 max-h-[220px] overflow-y-auto">
                  {events.map((ev) => {
                    const meta = EXPRESSION_META[ev.expression];
                    return (
                      <div
                        key={ev.id}
                        className="py-2 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono tabular-nums text-slate-500 shrink-0">
                            {ev.timeLabel}
                          </span>
                          <span className="text-slate-300 font-medium shrink-0">
                            Kişi {ev.personId}
                          </span>
                          <span className={`truncate font-medium ${meta.textClass}`}>
                            {meta.label}
                          </span>
                        </div>
                        <span className="font-mono tabular-nums text-slate-300 shrink-0">
                          %{Math.round(ev.confidence * 100)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
