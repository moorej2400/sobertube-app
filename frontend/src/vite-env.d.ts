/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_POSTGREST_URL: string
  readonly VITE_GOTRUE_URL: string
  readonly VITE_REALTIME_URL: string
  readonly VITE_STORAGE_URL: string
  readonly VITE_API_URL: string
  readonly VITE_APP_NAME: string
  readonly VITE_APP_VERSION: string
  readonly VITE_ENABLE_VIDEO_UPLOAD: string
  readonly VITE_ENABLE_REAL_TIME: string
  readonly VITE_ENABLE_ANALYTICS: string
  readonly VITE_MAX_VIDEO_SIZE: string
  readonly VITE_MAX_IMAGE_SIZE: string
  readonly VITE_ALLOWED_VIDEO_TYPES: string
  readonly VITE_ALLOWED_IMAGE_TYPES: string
  readonly VITE_DEBUG_MODE: string
  readonly VITE_SHOW_PERFORMANCE_METRICS: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}