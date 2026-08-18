/// <reference types="vite/client" />

// no client-exposed env vars — the Twelve Data key is server-side only (see api/candles.ts).
// Intentionally empty; re-add a member here ONLY for a value safe to ship in the client bundle.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface ImportMetaEnv {}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
