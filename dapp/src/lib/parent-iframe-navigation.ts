const PARENT_IFRAME_NAVIGATION_EPOCH = Symbol.for(
  'cukies-hub.parent-iframe-navigation-epoch',
);

function iframeMetadata(iframe: HTMLIFrameElement) {
  return iframe as unknown as Record<PropertyKey, unknown>;
}

export function readParentIframeNavigationEpoch(iframe: HTMLIFrameElement): number {
  const value = iframeMetadata(iframe)[PARENT_IFRAME_NAVIGATION_EPOCH];
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : 0;
}

export function markParentIframeNavigation(iframe: HTMLIFrameElement): number {
  const nextEpoch = readParentIframeNavigationEpoch(iframe) + 1;
  iframeMetadata(iframe)[PARENT_IFRAME_NAVIGATION_EPOCH] = nextEpoch;
  return nextEpoch;
}
