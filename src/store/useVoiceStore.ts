import { create } from 'zustand';

export type VoiceActivity = 'idle' | 'speaking' | 'listening' | 'thinking' | 'error';
export type VoiceMessageRole = 'assistant' | 'user' | 'system';

export interface VoiceMessage {
  id: string;
  role: VoiceMessageRole;
  text: string;
  createdAt: string;
}

interface VoiceState {
  isActive: boolean;
  activity: VoiceActivity;
  messages: VoiceMessage[];
  volumeLevel: number;
  isCollapsed: boolean;
  error: string | null;
  autoSelectedSpaceId: string | null;
  autoSelectedPovId: string | null;
  /** True when the user is actively typing in prompt/name/age inputs — voice should not overwrite */
  userIsTyping: boolean;

  setIsActive: (active: boolean) => void;
  setActivity: (activity: VoiceActivity) => void;
  setVolumeLevel: (level: number) => void;
  setError: (error: string | null) => void;
  addMessage: (role: VoiceMessageRole, text: string) => void;
  clearMessages: () => void;
  setCollapsed: (collapsed: boolean) => void;
  toggleCollapsed: () => void;
  setAutoSelectedSpaceId: (spaceId: string | null) => void;
  setAutoSelectedPovId: (povId: string | null) => void;
  setUserIsTyping: (typing: boolean) => void;
}

function createMessage(role: VoiceMessageRole, text: string): VoiceMessage {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    text,
    createdAt: new Date().toISOString(),
  };
}

export const useVoiceStore = create<VoiceState>((set) => ({
  isActive: false,
  activity: 'idle',
  messages: [],
  volumeLevel: 0,
  isCollapsed: false,
  error: null,
  autoSelectedSpaceId: null,
  autoSelectedPovId: null,
  userIsTyping: false,

  setIsActive: (active) => set({ isActive: active }),
  setActivity: (activity) => set({ activity }),
  setVolumeLevel: (level) => set({ volumeLevel: Math.max(0, Math.min(1, level)) }),
  setError: (error) => set({ error, activity: error ? 'error' : 'idle' }),
  addMessage: (role, text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    set((state) => ({ messages: [...state.messages, createMessage(role, trimmed)] }));
  },
  clearMessages: () => set({ messages: [], error: null, volumeLevel: 0 }),
  setCollapsed: (collapsed) => set({ isCollapsed: collapsed }),
  toggleCollapsed: () => set((state) => ({ isCollapsed: !state.isCollapsed })),
  setAutoSelectedSpaceId: (spaceId) => set({ autoSelectedSpaceId: spaceId }),
  setAutoSelectedPovId: (povId) => set({ autoSelectedPovId: povId }),
  setUserIsTyping: (typing) => set({ userIsTyping: typing }),
}));
