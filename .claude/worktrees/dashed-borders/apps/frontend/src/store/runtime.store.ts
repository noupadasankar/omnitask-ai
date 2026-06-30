import { create } from 'zustand';

interface RuntimeState {
  connected: boolean;
  sidebarOpen: boolean;

  setConnected: (value: boolean) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (value: boolean) => void;
}

export const useRuntimeStore = create<RuntimeState>((set) => ({
  connected: false,
  sidebarOpen: false,

  setConnected: (value: boolean) => set({ connected: value }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (value: boolean) => set({ sidebarOpen: value }),
}));
