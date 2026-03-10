import { create } from 'zustand';
import type { AppState } from '../types';

export const useAppStore = create<AppState>((set) => ({
  selectedHotspot: null,
  selectedProposal: null,
  showProposalPanel: false,
  mapResetTrigger: 0,
  isEvaluating: false,
  evaluationError: null,

  setSelectedHotspot: (hotspot) => set({ selectedHotspot: hotspot }),
  setSelectedProposal: (proposal) => set({ selectedProposal: proposal }),
  setShowProposalPanel: (show) => set({ showProposalPanel: show }),
  setIsEvaluating: (loading) => set({ isEvaluating: loading }),
  setEvaluationError: (error) => set({ evaluationError: error }),

  clearSelection: () =>
    set((state) => ({
      selectedHotspot: null,
      selectedProposal: null,
      showProposalPanel: false,
      mapResetTrigger: state.mapResetTrigger + 1,
    })),
}));
