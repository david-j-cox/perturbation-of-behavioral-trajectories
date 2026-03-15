/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_EXPERIMENT_ID: string;
  readonly VITE_APP_VERSION: string;
  readonly VITE_DEBUG_LOCAL_ONLY: string;
  readonly VITE_DEFAULT_SEED: string;
  readonly VITE_POINTS_PER_REINFORCER: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
