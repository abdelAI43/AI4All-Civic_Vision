import { useEffect, useRef, useState } from 'react';
import i18n from '../../i18n';
import { useAppStore } from '../../store/useAppStore';
import { supabase } from '../../lib/supabase';
import { spaces } from '../../data/spaces';
import './AttractMode.css';

/** Booth attract mode: after a stretch of no interaction on the home map,
 *  fade in a full-screen slideshow of real proposal images with a multilingual
 *  call-to-action and a rotating tips ticker. Any interaction dismisses it. */

const IDLE_MS = 20_000; // go idle after 20s of no interaction
const SLIDE_MS = 5_000; // each image holds 5s
const CTA_MS = 3_000; // cycle the call-to-action language every 3s
const TIP_MS = 6_000; // change the tip every 6s
const LANGS = ['en', 'ca', 'es'] as const;

// Curated space photos — used only if the DB has too few real proposal images.
const FALLBACK_IMAGES = spaces.flatMap((s) =>
  s.povImages.filter((p) => !p.isPlaceholder).map((p) => p.path),
);

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

  // Cycle the tip text every TIP_MS; cycle the *language* once per full pass so
  // every tip is eventually shown in EN, CA and ES.
  const tipLang = LANGS[0];
  const allTips = i18n.getFixedT(tipLang)('attract.tips', { returnObjects: true });
  const tips = Array.isArray(allTips) ? (allTips as string[]) : [];
  const count = tips.length || 1;
  const tipText = i18n.getFixedT(LANGS[Math.floor(tipIdx / count) % LANGS.length])(
    'attract.tips',
    { returnObjects: true },
  );
  const tipList = Array.isArray(tipText) ? (tipText as string[]) : [];
  const tip = tipList[tipIdx % count] ?? '';

  const next = images[(pair.cur + 1) % images.length];

  return (
    <div className="attract" role="presentation">
      <img className="attract-img" src={images[pair.prev]} alt="" aria-hidden />
      <img key={pair.cur} className="attract-img attract-img-top" src={images[pair.cur]} alt="" aria-hidden />
      <div className="attract-scrim" />

      <div className="attract-content">
        <span className="attract-pulse" aria-hidden />
        <p className="attract-cta">{ctaText}</p>
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
