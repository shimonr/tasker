import '@testing-library/jest-dom'

// jsdom does not implement scrolling.
Element.prototype.scrollIntoView = vi.fn()

// Newer Node versions define their own (empty) localStorage global, which hides jsdom's.
if (!globalThis.localStorage) {
  Object.defineProperty(globalThis, 'localStorage', { value: (globalThis as unknown as { jsdom: { window: Window } }).jsdom.window.localStorage })
}
