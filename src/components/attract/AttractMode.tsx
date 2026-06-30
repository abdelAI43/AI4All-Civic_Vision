import { useEffect, useRef, useState } from 'react';
import i18n from '../../i18n';
import { useAppStore } from '../../store/useAppStore';
import { supabase } from '../../lib/supabase';
import { spaces } from '../../data/spaces';
import './AttractMode.css';

/** Booth attract mode: after a stretch of no interaction on the home map,
 *  fade in a slideshow of real proposal images on a floating panel, with a
 *  multilingual call-to-action, an instructions strip and a tips ticker.
 *  Any interaction dismisses it. */

const IDLE_MS = 20_000; // go idle after 20s of no interaction
const SLIDE_MS = 10_000; // each image holds 10s
const CTA_MS = 3_000; // cycle the call-to-action language every 3s
const TIP_MS = 6_000; // change the tip every 6s
const LANGS = ['en', 'ca', 'es'] as const;

// Curated space photos — used only if the DB has too few real proposal images.
const FALLBACK_IMAGES = spaces.flatMap((s) =>
  s.povImages.filter((p) => !p.isPlaceholder).map((p) => p.path),
);

// Minimal inline icons for the instructions strip (no icon-font dependency).
const ICONS = ['mic', 'volume', 'spark', 'pin', 'globe'] as const;

function InstructionIcon({ name }: { name: (typeof ICONS)[number] }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  switch (name) {
    case 'mic':
      return (
        <svg {...common}>
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
        </svg>
      );
    case 'volume':
      return (
        <svg {...common}>
          <path d="M11 5 6 9H3v6h3l5 4V5z" />
          <path d="M16 9a4 4 0 0 1 0 6" />
        </svg>
      );
    case 'spark':
      return (
        <svg {...common}>
          <path d="M12 3v18M3 12h18M6 6l12 12M18 6 6 18" />
        </svg>
      );
    case 'pin':
      return (
        <svg {...common}>
          <path d="M12 21s7-5.5 7-11a7 7 0 0 0-14 0c0 5.5 7 11 7 11z" />
          <circle cx="12" cy="10" r="2.5" />
        </svg>
      );
    case 'globe':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" />
        </svg>
      );
  }
}

function shuffle<T>(input: T[]): T[] {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function AttractMode() {
  const mode = useAppStore((s) => s.mode);
  const browseSpaceId = useAppStore((s) => s.browseSpaceId);
  const browseProposal = useAppStore((s) => s.browseProposal);
  const atHome = mode === 'browse' && !browseSpaceId && !browseProposal;

  const [idle, setIdle] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [pair, setPair] = useState({ cur: 0, prev: 0 });
  const [ctaIdx, setCtaIdx] = useState(0);
  const [tipIdx, setTipIdx] = useState(0);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // ── Idle detection ─────────────────────────────────────────────────────────
  useEffect(() => {
    const reset = () => {
      setIdle(false);
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => setIdle(true), IDLE_MS);
    };
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel', 'pointerdown'];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      events.forEach((e) => window.removeEventListener(e, reset));
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, []);

  // ── Load real proposal images once (fall back to curated photos) ─────────────
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from('proposals')
        .select('generated_image_url')
        .eq('status', 'complete')
        .eq('consent_given', true)
        .order('created_at', { ascending: false })
        .limit(40);
      if (cancelled) return;
      const urls = (data ?? [])
        .map((r) => (r as { generated_image_url?: string }).generated_image_url ?? '')
        .filter((u) => u.startsWith('http'));
      const pool = urls.length >= 3 ? urls : [...urls, ...FALLBACK_IMAGES];
      setImages(shuffle(pool));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const active = atHome && idle && images.length > 0;

  // Reshuffle for a fresh sequence each time the booth goes idle.
  useEffect(() => {
    if (active) {
      setImages((prev) => shuffle(prev));
      setPair({ cur: 0, prev: 0 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // ── Timers (only while the attract screen is showing) ────────────────────────
  useEffect(() => {
    if (!active) return;
    const id = setInterval(
      () => setPair((p) => ({ cur: (p.cur + 1) % images.length, prev: p.cur })),
      SLIDE_MS,
    );
    return () => clearInterval(id);
  }, [active, images.length]);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setCtaIdx((i) => i + 1), CTA_MS);
    return () => clearInterval(id);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTipIdx((i) => i + 1), TIP_MS);
    return () => clearInterval(id);
  }, [active]);

  if (!active) return null;

  const ctaText = i18n.getFixedT(LANGS[ctaIdx % LANGS.length])('attract.cta');

  // Tips cycle every TIP_MS; the language advances once per full pass so every
  // tip is eventually shown in EN, CA and ES.
  const baseTips = i18n.getFixedT(LANGS[0])('attract.tips', { returnObjects: true });
  const count = Array.isArray(baseTips) && baseTips.length ? baseTips.length : 1;
  const tipPass = i18n.getFixedT(LANGS[Math.floor(tipIdx / count) % LANGS.length])('attract.tips', {
    returnObjects: true,
  });
  const tipList = Array.isArray(tipPass) ? (tipPass as string[]) : [];
  const tip = tipList[tipIdx % count] ?? '';

  // Instructions follow the currently-selected UI language.
  const instructionsRaw = i18n.t('attract.instructions', { returnObjects: true });
  const instructions = Array.isArray(instructionsRaw) ? (instructionsRaw as string[]) : [];
  const instructionsTitle = i18n.t('attract.instructionsTitle');

  const next = images[(pair.cur + 1) % images.length];

  return (
    <div className="attract" role="presentation">
      <div
        className="attract-bg"
        style={{ backgroundImage: `url("${images[pair.cur]}")` }}
        aria-hidden
      />
      <div className="attract-scrim" />

      <div className="attract-wordmark" aria-hidden>
        <span className="attract-wordmark-badge">BCN</span> Civic Vision
      </div>

      <div className="attract-stage">
        <div className="attract-figure">
          <div className="attract-frame">
            <img className="attract-img" src={images[pair.prev]} alt="" aria-hidden />
            <img
              key={pair.cur}
              className="attract-img attract-img-top"
              src={images[pair.cur]}
              alt=""
              aria-hidden
            />
          </div>
          <div className="attract-cta-row">
            <span className="attract-pulse" aria-hidden />
            <p className="attract-cta">{ctaText}</p>
          </div>
        </div>

        <aside className="attract-aside">
          <p className="attract-aside-title">{instructionsTitle}</p>
          <ul className="attract-instructions">
            {instructions.map((text, i) => (
              <li key={i} className="attract-instruction">
                <span className="attract-instruction-icon">
                  <InstructionIcon name={ICONS[i] ?? 'spark'} />
                </span>
                <span className="attract-instruction-text">{text}</span>
              </li>
            ))}
          </ul>
        </aside>
      </div>

      <div className="attract-tips">
        <span className="attract-tips-label">Tip</span>
        <span key={tipIdx} className="attract-tip-text">
          {tip}
        </span>
      </div>

      {/* Preload the next image so the crossfade is smooth. */}
      <img className="attract-preload" src={next} alt="" aria-hidden />
    </div>
  );
}
