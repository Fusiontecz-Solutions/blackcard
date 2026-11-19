/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_COMPANY_NAME?: string;
  readonly VITE_APP_COMPANY_LEGAL_NAME?: string;
  readonly VITE_APP_COMPANY_CRM_NAME?: string;
  readonly VITE_APP_LOGO_URL?: string;
  readonly VITE_APP_LOGO_DARK_URL?: string;
  readonly VITE_DOCUSIGN_EMAIL_LENDER_NAME?: string;
  readonly VITE_DOCUSIGN_TEMPLATE_ID?: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_SOCKET_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
