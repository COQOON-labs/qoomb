/// <reference types="vite/client" />

/** App version injected at build time from root package.json (managed by Release Please) */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
