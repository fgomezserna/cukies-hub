import { act, renderHook } from '@testing-library/react';
import {
  MOBILE_GAME_SHELL_QUERY,
  useMobileGameShell,
} from '@/hooks/use-mobile-game-shell';

describe('hooks/use-mobile-game-shell', () => {
  let mediaMatches = false;
  const listeners = new Set<() => void>();

  beforeEach(() => {
    mediaMatches = false;
    listeners.clear();

    window.matchMedia = jest.fn().mockImplementation((query: string) => ({
      get matches() {
        return mediaMatches;
      },
      media: query,
      onchange: null,
      addEventListener: jest.fn((event: string, listener: () => void) => {
        if (event === 'change') listeners.add(listener);
      }),
      removeEventListener: jest.fn((event: string, listener: () => void) => {
        if (event === 'change') listeners.delete(listener);
      }),
      addListener: jest.fn((listener: () => void) => listeners.add(listener)),
      removeListener: jest.fn((listener: () => void) => listeners.delete(listener)),
      dispatchEvent: jest.fn(),
    })) as typeof window.matchMedia;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses the game-specific compact and bounded touch query', () => {
    renderHook(() => useMobileGameShell());

    expect(window.matchMedia).toHaveBeenCalledWith(MOBILE_GAME_SHELL_QUERY);
    expect(MOBILE_GAME_SHELL_QUERY).toContain('max-width: 1023px');
    expect(MOBILE_GAME_SHELL_QUERY).toContain('max-width: 1366px');
    expect(MOBILE_GAME_SHELL_QUERY).toContain('pointer: coarse');
  });

  it('activates and reacts to changes without changing the global mobile hook', () => {
    const { result } = renderHook(() => useMobileGameShell());

    expect(result.current).toBe(false);

    act(() => {
      mediaMatches = true;
      listeners.forEach(listener => listener());
    });

    expect(result.current).toBe(true);
  });
});
