import '@testing-library/jest-dom/vitest'

// Node 25+ ships an experimental built-in `localStorage`/`sessionStorage` global.
// Without a `--localstorage-file` backing path it's a non-functional stub (no
// `.clear()`, etc). Vitest's jsdom environment deliberately skips re-aliasing
// globals that already exist on `globalThis` (see `populateGlobal` in
// vitest/dist/chunks), so on Node 25 plain `window.localStorage` still resolves
// to that broken Node stub, not jsdom's real Storage. Vitest exposes the
// underlying JSDOM instance as `globalThis.jsdom`; its `window` holds the
// genuine, working Storage. Bind that onto `globalThis` explicitly so tests get
// a real localStorage/sessionStorage regardless of Node version, without
// depending on CLI/env flags (which hard-fail on Node versions that don't know
// them and don't compose across shells, e.g. Windows).
const realWindow: Window =
  (globalThis as unknown as { jsdom?: { window: Window } }).jsdom?.window ?? window

Object.defineProperty(globalThis, 'localStorage', {
  value: realWindow.localStorage,
  configurable: true,
  writable: true,
})
Object.defineProperty(globalThis, 'sessionStorage', {
  value: realWindow.sessionStorage,
  configurable: true,
  writable: true,
})
