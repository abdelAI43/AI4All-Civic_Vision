/* ---- Types for Barcelona Civic Vision ---- */

export interface Hotspot {
  id: string;
  name: string;
  description: string;
  lat: number;
  lng: number;
  type: 'square' | 'boulevard' | 'beach' | 'park' | 'street';
  neighborhood: string;
  area: string; // e.g. "50,000 m²"
  yearlyWeather: string;
}

export interface AgentFeedback {
  agentId: string;
  name: string;
  icon: string;
  score: number; // 1 to 5
  feedback: string;
  risks?: string[];
  recommendations?: string[];
  references?: string[];
}

export interface Proposal {
  id: string;
  hotspotId: string;
  userName: string;
  userAge: number;
  prompt: string;
  originalImage: string; // path to local image
  generatedImage: string; // path to local image
  agentFeedback: AgentFeedback[];
  createdAt: string;
}

export interface AppState {
  selectedHotspot: Hotspot | null;
  selectedProposal: Proposal | null;
  showProposalPanel: boolean;
  mapResetTrigger: number;
  isEvaluating: boolean;
  evaluationError: string | null;
  setSelectedHotspot: (hotspot: Hotspot | null) => void;
  setSelectedProposal: (proposal: Proposal | null) => void;
  setShowProposalPanel: (show: boolean) => void;
  setIsEvaluating: (loading: boolean) => void;
  setEvaluationError: (error: string | null) => void;
  clearSelection: () => void;
}
