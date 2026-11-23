/// <reference types="vite/client" />
interface ImportMetaEnv {
  /** DEV ONLY: set to "false" to hide the Test users panel in `vite dev` (never in production builds). */
  readonly VITE_DEV_TEST_USERS?: string;
  readonly VITE_KIOREX_URL?: string;
}
