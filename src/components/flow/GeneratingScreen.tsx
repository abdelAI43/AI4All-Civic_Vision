import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { spaces } from '../../data/spaces';
import { useAppStore } from '../../store/useAppStore';
import { supabase } from '../../lib/supabase';
import type { Proposal, FlowStep } from '../../types';

const PROGRESS_STEPS = [
  { key: 'flow.step5.progress1', duration: 3000 },
  { key: 'flow.step5.progress2', duration: 5000 },
  { key: 'flow.step5.progress3', duration: 3000 },
] as const;

/** Slim carousel item — we only need image + label + optional score */
interface CarouselItem {
  id: string;
  imgSrc: string;
  label: string;
  score?: number;
  /** 'proposal' = real submission (blue border); 'pov' = fallback POV image (orange border) */
  type: 'proposal' | 'pov';
}

/**
 * Step 5 — Generating screen.
 *
 * - Fires POST /api/proposals/create immediately on mount.
 * - Runs a 3-step progress animation (11 s) in parallel.
 * - After the animation completes it waits for the API if not yet done.
 * - On success → setCurrentProposal + advance to step 6.
 * - On error → shows a retry button.
 * - Carousel pulls the last 8 real submissions for this space from Supabase
 *   (falls back to the other 3 POV images when empty).
 */
export function GeneratingScreen() {
  const { t, i18n } = useTranslation();
  const { flow, setFlowStep, setCurrentProposal, setPromptRejectionReason } = useAppStore();

  const space = spaces.find((s) => s.id === flow.selectedSpaceId);
  const pov = space?.povImages.find((p) => p.id === flow.selectedPovId);

  // ── Progress animation state ──────────────────────────────────────────────
  const [activeStep, setActiveStep] = useState(0);
  // 'animating' → 'waiting' (API not yet done) → 'done' | 'error'
  const [phase, setPhase] = useState<'animating' | 'waiting' | 'done' | 'error'>('animating');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Refs so closures always see the latest value without re-running effects
  const proposalRef = useRef<Proposal | null>(null);
  const animationDoneRef = useRef(false);
  const mountedRef = useRef(true);
  const errorRef = useRef(false);   // prevents animation from overwriting error state
  const hasFiredRef = useRef(false); // prevents double API call in React Strict Mode (dev only)

  // ── Carousel ──────────────────────────────────────────────────────────────
  const [carousel, setCarousel] = useState<CarouselItem[]>([]);

  useEffect(() => {
    const spaceId = flow.selectedSpaceId;
    if (!spaceId) return;

    supabase
      .from('proposals')
      .select('id, generated_image_url, base_image_path, prompt_text, participant_name, participant_age, avg_agent_score')
      .eq('space_id', spaceId)
      .order('created_at', { ascending: false })
      .limit(8)
      .then(({ data }) => {
        if (!mountedRef.current) return;
        if (data && data.length > 0) {
          setCarousel(
            data.map((row) => ({
              id: row.id as string,
              imgSrc: (row.generated_image_url as string) || (row.base_image_path as string),
              label: row.participant_name
                ? `${row.participant_name as string}${row.participant_age ? `, ${row.participant_age as number}` : ''}`
                : t('proposal.anonymous'),
              score: row.avg_agent_score as number | undefined,
              type: 'proposal' as const,
            }))
          );
        } else {
          // Fallback: other POV images of this space
          const otherPovs = space?.povImages.filter((p) => p.id !== flow.selectedPovId) ?? [];
          setCarousel(
            otherPovs.map((p) => ({ id: p.id, imgSrc: p.path, label: p.label, type: 'pov' as const }))
          );
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── API call ──────────────────────────────────────────────────────────────
  const runPipeline = async () => {
    setPromptRejectionReason(null); // clear any previous rejection
    const lang = i18n.language.split('-')[0];
    const effectiveLang = (['en', 'ca', 'es'].includes(lang) ? lang : 'en') as 'en' | 'ca' | 'es';
    const isAnonymous = !flow.participantName.trim() && !flow.participantAge.trim();

    try {
      const resp = await fetch('/api/proposals/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spaceId: flow.selectedSpaceId,
          spaceName: space?.name ?? '',
          povId: flow.selectedPovId,
          povLabel: pov?.label ?? '',
          baseImagePath: pov?.path ?? '',
          promptText: flow.promptText,
          language: effectiveLang,
          consentGiven: isAnonymous ? true : flow.consentGiven,
          participantName: flow.participantName.trim() || undefined,
          participantAge: flow.participantAge.trim() || undefined,
        }),
      });

      const json = await resp.json() as {
        success: boolean;
        data?: Proposal;
        error?: string;
        reason?: string;
      };

      if (!mountedRef.current) return;

      // 422 = prompt rejected by AI validator → send user back to edit their prompt
      if (resp.status === 422) {
        setPromptRejectionReason(
          json.reason ?? 'Your proposal could not be approved for this space. Please revise it.'
        );
        setFlowStep(3 as FlowStep);
        return;
      }

      if (!resp.ok || !json.success) {
        throw new Error(json.error ?? 'Generation failed');
      }

      proposalRef.current = json.data ?? null;

      // If animation already finished, advance immediately
      if (animationDoneRef.current) {
        finalize();
      }
      // Otherwise just store the result and wait for the animation to complete
    } catch (err) {
      if (!mountedRef.current) return;
      errorRef.current = true; // tell animation closure not to overwrite this
      setPhase('error');
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  };

  const finalize = () => {
    if (proposalRef.current) {
      setCurrentProposal(proposalRef.current);
      setFlowStep(6 as FlowStep);
    }
  };

  // ── Animation + pipeline kickoff ──────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;

    // Guard: only fire the API call once — React Strict Mode mounts effects twice in dev
    if (!hasFiredRef.current) {
      hasFiredRef.current = true;
      runPipeline();
    }

    let idx = 0;
    const advance = () => {
      if (!mountedRef.current) return;
      idx += 1;
      if (idx < PROGRESS_STEPS.length) {
        setActiveStep(idx);
        timer = window.setTimeout(advance, PROGRESS_STEPS[idx].duration);
      } else {
        // Animation complete
        animationDoneRef.current = true;
        if (proposalRef.current) {
          finalize();
        } else if (!errorRef.current) {
          setPhase('waiting');
        }
      }
    };

    let timer = window.setTimeout(advance, PROGRESS_STEPS[0].duration);

    return () => {
      mountedRef.current = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────
  const allDone = phase === 'waiting';

  return (
    <div className="generating-screen">
      {/* Blurred base image background */}
      {pov && (
        <div className="generating-bg">
          <img
            className="generating-bg-img"
            src={pov.path}
            alt=""
            aria-hidden="true"
          />
        </div>
      )}

      {/* Centre content */}
      <div className="generating-content">
        {phase === 'error' ? (
          <>
            <h2 className="generating-title">{t('flow.step5.errorTitle', { defaultValue: 'Something went wrong' })}</h2>
            <p className="generating-error-msg">{errorMsg}</p>
            <button
              className="btn-primary"
              onClick={() => {
                errorRef.current = false;
                proposalRef.current = null;
                animationDoneRef.current = true; // skip animation on retry, go straight to waiting
                setActiveStep(PROGRESS_STEPS.length - 1);
                setErrorMsg(null);
                setPhase('waiting');
                runPipeline();
              }}
            >
              {t('flow.step5.retry', { defaultValue: 'Try again' })}
            </button>
          </>
        ) : (
          <>
            <h2 className="generating-title">
              {allDone
                ? t('flow.step5.finalizing', { defaultValue: 'Finalizing your proposal…' })
                : t('flow.step5.title')}
            </h2>

            <ol className="generating-progress-list">
              {PROGRESS_STEPS.map((ps, i) => {
                const isDone = allDone || i < activeStep;
                const isActive = !allDone && i === activeStep;
                const state = isDone ? 'done' : isActive ? 'active' : '';
                return (
                  <li key={ps.key} className={`generating-progress-item ${state}`}>
                    <span className={`generating-step-icon ${state}`}>
                      {isDone ? '✓' : i + 1}
                    </span>
                    <span>{t(ps.key)}</span>
                    {isActive && (
                      <span className="generating-dots" aria-hidden="true">
                        <span className="generating-dot" />
                        <span className="generating-dot" />
                        <span className="generating-dot" />
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>

            <p className="generating-estimated">
              {allDone
                ? t('flow.step5.almostReady', { defaultValue: 'Almost ready…' })
                : t('flow.step5.estimated')}
            </p>
          </>
        )}
      </div>

      {/* Bottom carousel */}
      {carousel.length > 0 && phase !== 'error' && (
        <div className="generating-carousel">
          <p className="generating-carousel-title">
            {carousel[0].score !== undefined
              ? t('flow.step5.carouselTitle')
              : t('flow.step5.carouselFallbackTitle')}
          </p>
          {/* Duplicate items so the animation loops seamlessly (item1…itemN item1…itemN) */}
          <div className="generating-carousel-track">
            {[...carousel, ...carousel].map((item, idx) => (
              <div
                key={`${item.id}-${idx}`}
                className={`generating-carousel-card generating-carousel-card--${item.type}`}
              >
                <img
                  className="generating-carousel-img"
                  src={item.imgSrc}
                  alt={item.label}
                  onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.3'; }}
                />
                <div className="generating-carousel-meta">
                  <span className="generating-carousel-who">{item.label}</span>
                  {item.score !== undefined && (
                    <span className="generating-score-badge">
                      {item.score.toFixed(1)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
