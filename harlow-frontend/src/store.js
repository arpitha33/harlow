import { create } from 'zustand'

export const useGame = create((set) => ({
  sessionId: 'demo',
  gameState: null,
  messages: [],          // chat log for the open character
  setGameState: (s) => set({ gameState: s }),
  addMessage: (m) => set((st) => ({ messages: [...st.messages, m] })),
}))