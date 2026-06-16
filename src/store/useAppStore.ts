import { create } from 'zustand';
import type { AppState, AppMode, SuggestFlowState, Proposal, FlowStep } from '../types';

const DEFAULT_FLOW: SuggestFlowState = {
  step: 1,
  selectedSpaceId: null,
  selectedPovId: null,
  promptText: '',
  originalPromptText: '',
  participantName: '',
  participantAge: '',
  participantGender: '',
  hasChildren: null,
  hasPets: null,
  hasRestrictedMobility: null,
  consentGiven: false,
  currentProposal: null,
  promptRejectionReason: null,
};

export const useAppStore = create<AppState>((set) => ({
  // ── Mode ──────────────────────────────────────────────────────────────────
  mode: 'browse' as AppMode,
  setMode: (mode: AppMode) => set({ mode }),

  // ── Browse mode ───────────────────────────────────────────────────────────
  browseSpaceId: null,
  setBrowseSpaceId: (spaceId: string | null) => set({ browseSpaceId: spaceId }),
  browseProposal: null,
  setBrowseProposal: (proposal: Proposal | null) => set({ browseProposal: proposal }),

  // ── Suggest flow ──────────────────────────────────────────────────────────
  flow: DEFAULT_FLOW,

  setFlowStep: (step: FlowStep) =>
    set((s) => ({ flow: { ...s.flow, step } })),

  setSelectedSpace: (spaceId: string | null) =>
    set((s) => ({ flow: { ...s.flow, selectedSpaceId: spaceId, selectedPovId: null } })),

  setSelectedPov: (povId: string | null) =>
    set((s) => ({ flow: { ...s.flow, selectedPovId: povId } })),

  setPromptText: (text: string) =>
    set((s) => ({ flow: { ...s.flow, promptText: text } })),

  setOriginalPromptText: (text: string) =>
    set((s) => ({ flow: { ...s.flow, originalPromptText: text } })),

  setParticipantName: (name: string) =>
    set((s) => ({ flow: { ...s.flow, participantName: name } })),

  setParticipantAge: (age: string) =>
    set((s) => ({ flow: { ...s.flow, participantAge: age } })),

  setParticipantGender: (gender) =>
    set((s) => ({ flow: { ...s.flow, participantGender: gender } })),

  setHasChildren: (value) =>
    set((s) => ({ flow: { ...s.flow, hasChildren: value } })),

  setHasPets: (value) =>
    set((s) => ({ flow: { ...s.flow, hasPets: value } })),

  setHasRestrictedMobility: (value) =>
    set((s) => ({ flow: { ...s.flow, hasRestrictedMobility: value } })),

  setConsentGiven: (given: boolean) =>
    set((s) => ({ flow: { ...s.flow, consentGiven: given } })),

  setCurrentProposal: (proposal: Proposal | null) =>
    set((s) => ({ flow: { ...s.flow, currentProposal: proposal } })),

  setPromptRejectionReason: (reason: string | null) =>
    set((s) => ({ flow: { ...s.flow, promptRejectionReason: reason } })),

  resetFlow: () => set({ flow: DEFAULT_FLOW, mode: 'browse' as AppMode }),

  // ── Map ───────────────────────────────────────────────────────────────────
  mapResetTrigger: 0,
  triggerMapReset: () => set((s) => ({ mapResetTrigger: s.mapResetTrigger + 1 })),

  // ── Evaluation ─────────────────────────────────────────────────────────────
  isEvaluating: false,
  evaluationError: null,
  setIsEvaluating: (loading: boolean) => set({ isEvaluating: loading }),
  setEvaluationError: (error: string | null) => set({ evaluationError: error }),
}));
