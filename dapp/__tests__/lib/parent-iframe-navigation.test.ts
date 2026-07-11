import {
  markParentIframeNavigation,
  readParentIframeNavigationEpoch,
} from '@/lib/parent-iframe-navigation';

describe('parent iframe navigation epoch', () => {
  it('stores a monotonic per-iframe epoch outside React state', () => {
    const firstIframe = document.createElement('iframe');
    const secondIframe = document.createElement('iframe');

    expect(readParentIframeNavigationEpoch(firstIframe)).toBe(0);
    expect(markParentIframeNavigation(firstIframe)).toBe(1);
    expect(markParentIframeNavigation(firstIframe)).toBe(2);
    expect(readParentIframeNavigationEpoch(firstIframe)).toBe(2);
    expect(readParentIframeNavigationEpoch(secondIframe)).toBe(0);
  });
});
