interface ImportMetaEnv {
  readonly VITE_TIKTOK_WS_URL?: string
  readonly DEV?: boolean
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
