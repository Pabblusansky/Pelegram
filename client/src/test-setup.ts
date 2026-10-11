// Unit tests run in jsdom, which lacks a few browser APIs the components use
// at construction time. Karma ran in real Chrome and had them; these minimal
// stand-ins let the components be created in tests. Each is installed only
// when jsdom does not already provide it.

if (!window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  });
}

if (!('ResizeObserver' in window)) {
  class ResizeObserverStub {
    observe(): void { /* no layout in jsdom */ }
    unobserve(): void { /* no layout in jsdom */ }
    disconnect(): void { /* no layout in jsdom */ }
  }
  Object.defineProperty(window, 'ResizeObserver', { value: ResizeObserverStub, writable: true });
}

if (!('AudioContext' in window)) {
  class AudioContextStub {
    state = 'running';
    close(): Promise<void> { return Promise.resolve(); }
    resume(): Promise<void> { return Promise.resolve(); }
    decodeAudioData(): Promise<never> {
      return Promise.reject(new Error('Audio decoding is not available in unit tests'));
    }
  }
  Object.defineProperty(window, 'AudioContext', { value: AudioContextStub, writable: true });
}
