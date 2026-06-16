import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import './ImageComparison.css';

interface Props {
  originalImage: string;
  generatedImage: string;
  locationName: string;
}

/**
 * Before/After image comparison slider.
 * Uses placeholder gradients when actual images are not available.
 */
export function ImageComparison({ originalImage, generatedImage, locationName }: Props) {
  const { t } = useTranslation();
  const [sliderPos, setSliderPos] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const [imgError, setImgError] = useState({ original: false, generated: false });
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMove = (clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPos(percentage);
  };

  const handleMouseDown = () => setIsDragging(true);
  const handleMouseUp = () => setIsDragging(false);

  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (isDragging) handleMove(e.clientX);
    };
    const handleGlobalMouseUp = () => setIsDragging(false);

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isDragging]);

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
        onMouseUp={handleMouseUp}
        onTouchStart={(e) => handleMove(e.touches[0].clientX)}
        onTouchMove={(e) => handleMove(e.touches[0].clientX)}
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

        {/* Original (foreground – clipped) */}
        <div
          className="comparison-image comparison-original"
          style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
        >
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

        {/* Slider handle */}
        <div className="comparison-slider" style={{ left: `${sliderPos}%` }}>
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
