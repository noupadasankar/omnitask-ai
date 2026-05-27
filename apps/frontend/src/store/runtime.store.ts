import { create } from 'zustand';

interface RuntimeState {
  connected: boolean;

  setConnected: (
    value: boolean,
  ) => void;
}

export const useRuntimeStore =
  create<RuntimeState>((set) => ({
    connected: false,

    setConnected: (
      value: boolean,
    ) =>
      set({
        connected: value,
      }),
  }));