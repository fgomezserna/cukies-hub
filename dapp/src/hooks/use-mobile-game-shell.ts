import * as React from 'react';

export const MOBILE_GAME_SHELL_QUERY =
  '(max-width: 1023px), (max-width: 1366px) and (hover: none) and (pointer: coarse)';

const subscribe = (onStoreChange: () => void) => {
  const mediaQuery = window.matchMedia(MOBILE_GAME_SHELL_QUERY);

  if (typeof mediaQuery.addEventListener === 'function') {
    mediaQuery.addEventListener('change', onStoreChange);
    return () => mediaQuery.removeEventListener('change', onStoreChange);
  }

  mediaQuery.addListener(onStoreChange);
  return () => mediaQuery.removeListener(onStoreChange);
};

const getSnapshot = () => window.matchMedia(MOBILE_GAME_SHELL_QUERY).matches;
const getServerSnapshot = () => false;

export function useMobileGameShell() {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
