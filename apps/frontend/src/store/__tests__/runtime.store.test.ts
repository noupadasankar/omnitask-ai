import { describe, it, expect, beforeEach } from 'vitest';
import { useRuntimeStore } from '../runtime.store';

// Reset store state between each test by calling setState directly on the store
beforeEach(() => {
  useRuntimeStore.setState({ connected: false, sidebarOpen: false });
});

describe('useRuntimeStore — initial state', () => {
  it('starts disconnected', () => {
    expect(useRuntimeStore.getState().connected).toBe(false);
  });

  it('starts with sidebar closed', () => {
    expect(useRuntimeStore.getState().sidebarOpen).toBe(false);
  });
});

describe('useRuntimeStore — setConnected', () => {
  it('sets connected to true', () => {
    useRuntimeStore.getState().setConnected(true);
    expect(useRuntimeStore.getState().connected).toBe(true);
  });

  it('sets connected to false', () => {
    useRuntimeStore.setState({ connected: true });
    useRuntimeStore.getState().setConnected(false);
    expect(useRuntimeStore.getState().connected).toBe(false);
  });
});

describe('useRuntimeStore — toggleSidebar', () => {
  it('toggles from closed to open', () => {
    useRuntimeStore.getState().toggleSidebar();
    expect(useRuntimeStore.getState().sidebarOpen).toBe(true);
  });

  it('toggles from open to closed', () => {
    useRuntimeStore.setState({ sidebarOpen: true });
    useRuntimeStore.getState().toggleSidebar();
    expect(useRuntimeStore.getState().sidebarOpen).toBe(false);
  });

  it('toggles back and forth correctly', () => {
    useRuntimeStore.getState().toggleSidebar();
    useRuntimeStore.getState().toggleSidebar();
    useRuntimeStore.getState().toggleSidebar();
    expect(useRuntimeStore.getState().sidebarOpen).toBe(true);
  });
});

describe('useRuntimeStore — setSidebarOpen', () => {
  it('sets sidebar open to true directly', () => {
    useRuntimeStore.getState().setSidebarOpen(true);
    expect(useRuntimeStore.getState().sidebarOpen).toBe(true);
  });

  it('sets sidebar open to false directly', () => {
    useRuntimeStore.setState({ sidebarOpen: true });
    useRuntimeStore.getState().setSidebarOpen(false);
    expect(useRuntimeStore.getState().sidebarOpen).toBe(false);
  });
});
