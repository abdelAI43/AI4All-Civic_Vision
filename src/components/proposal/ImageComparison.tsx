import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import './ImageComparison.css';

interface Props {
  originalImage: string;
  generatedImage: string;
  locationName: string;
}

// Auto-sweep tuning. The divider drifts left↔right continuously until the user
// grabs it; 4s after they let go it resumes on its own.
const AUTO_SPEED = 10;      // percent of width per second
const AUTO_MIN = 12;        // sweep bounds (keep a sliver of both images visible)
const AUTO_MAX = 88;
const RESUME_DELAY_MS = 4000;

/**
 * Before/After image comparison slider.
 * The divider position lives in a CSS custom property (`--slider-pos`) driven by
 * a rAF loop, so the constant animation costs zero React re-renders. User drags
 * pause the sweep and it resumes 4s after the last interaction.
 */
export function ImageComparison({ originalImage, generatedImage, locationName }: Props) {
  const { t } = useTranslation();
  const [imgError, setImgError] = useState({ original: false, generated: false });
  const containerRef = useRef<HTMLDivElement>(null);
  const posRef = useRef(50);
  const dirRef = useRef(1);
  const pausedRef = useRef(false);
  const draggingRef = useRef(false);
  const resumeTimerRef = useRef<number | null>(null);

  const applyPos = useCallback((pct: number) => {
    const clamped = Math.max(0, Math.min(100, pct));
    posRef.current = clamped;
    containerRef.current?.style.setProperty('--slider-pos', `${clamped}%`);
  }, []);

  // Pause the auto-sweep and schedule it to resume 4s after the last interaction.
  const pauseAuto = useCallback(() => {
    pausedRef.current = true;
    if (resumeTimerRef.current !== null) window.clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = window.setTimeout(() => { pausedRef.current = false; }, RESUME_DELAY_MS);
  }, []);

  const moveTo = useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    applyPos(((clientX - rect.left) / rect.width) * 100);
  }, [applyPos]);

  // rAF auto-sweep + global drag listeners (so dragging works outside the box).
  useEffect(() => {
    let last = performance.now();
    let raf = requestAnimationFrame(function tick(now) {
      const dt = (now - last) / 1000;
      last = now;
      if (!pausedRef.current && !draggingRef.current) {
        let next = posRef.current + dirRef.current * AUTO_SPEED * dt;
        if (next >= AUTO_MAX) { next = AUTO_MAX; dirRef.current = -1; }
        else if (next <= AUTO_MIN) { next = AUTO_MIN; dirRef.current = 1; }
        applyPos(next);
      }
      raf = requestAnimationFrame(tick);
    });

    const onMove = (e: MouseEvent) => { if (draggingRef.current) moveTo(e.clientX); };
    const onUp = () => { if (draggingRef.current) { draggingRef.current = false; pauseAuto(); } };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (resumeTimerRef.current !== null) window.clearTimeout(resumeTimerRef.current);
    };
  }, [applyPos, moveTo, pauseAuto]);

  const handleMouseDown = (e: React.MouseEvent) => {
    draggingRef.current = true;
    pauseAuto();
    moveTo(e.clientX);
  };
  const handleTouchStart = (e: React.TouchEvent) => {
    draggingRef.current = true;
    pauseAuto();
    moveTo(e.touches[0].clientX);
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    pauseAuto();
    moveTo(e.touches[0].clientX);
  };
  const handleTouchEnd = () => {
    draggingRef.current = false;
    pauseAuto();
  };

  // Placeholder backgrounds for missing images
  const placeholderOriginal = `linear-gradient(135deg, #C5BEB5 0%, #A99F93 50%, #8E857A 100%)`;
  const placeholderGenerated = `linear-gradient(135deg, #D4A574 0%, #C4943A 50%, #D4763C 100%)`;

  return (
    <div className="image-comparison">
      <div className="comparison-labels">
        <span className="label-original">{t('proposal.beforeLabel')}</span>
        <span className="label-generated">{t('proposal.afterLabel')}</span>
      </div>
      <div
        ref={containerRef}
        className="comparison-container"
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Generated (background – full width) */}
        <div className="comparison-image comparison-generated">
          {!imgError.generated ? (
            <img
              src={generatedImage}
              alt={`${locationName} — AI generated proposal`}
              onError={() => setImgError((prev) => ({ ...prev, generated: true }))}
            />
          ) : (
            <div className="placeholder-image" style={{ background: placeholderGenerated }}>
              <span>{t('proposal.afterLabel')}</span>
              <span className="placeholder-hint">{t('proposal.placeholderText')}</span>
            </div>
          )}
        </div>

        {/* Original (foreground – clipped via --slider-pos) */}
        <div className="comparison-image comparison-original">
          {!imgError.original ? (
            <img
              src={originalImage}
              alt={`${locationName} — original street view`}
              onError={() => setImgError((prev) => ({ ...prev, original: true }))}
            />
          ) : (
            <div className="placeholder-image" style={{ background: placeholderOriginal }}>
              <span>{t('proposal.beforeLabel')}</span>
              <span className="placeholder-hint">{t('proposal.placeholderText')}</span>
            </div>
          )}
        </div>

        {/* Slider handle (positioned via --slider-pos) */}
        <div className="comparison-slider">
          <div className="slider-line" />
          <div className="slider-handle">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M5 3L1 8L5 13" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M11 3L15 8L11 13" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
