/// <reference types="vite/client" />
declare module '*.css' {
  const content: Record<string, string>;
  export default content;
}

interface ImportMetaEnv {
  readonly MODE: string;
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly VITE_APP_ENV?: string;
  readonly VITE_ENABLE_DEMO?: string;
  readonly VITE_ALLOW_MANUAL_AUTH?: string;
  readonly VITE_LOGTO_ENDPOINT?: string;
  readonly VITE_LOGTO_APP_ID?: string;
  readonly VITE_LOGTO_API_RESOURCE?: string;
  readonly VITE_LOGTO_SCOPES?: string;
  readonly VITE_LOGTO_REDIRECT_URI?: string;
  readonly VITE_LOGTO_POST_LOGOUT_REDIRECT_URI?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
