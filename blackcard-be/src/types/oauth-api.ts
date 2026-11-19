export interface OAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  id_token?: string;
}

export interface GoogleUserInfoResponse {
  email?: string;
}

export interface GmailUserProfileResponse {
  emailAddress?: string;
}

export interface DocuSignAccountInfo {
  account_id: string;
  is_default?: boolean;
  base_uri?: string;
}

export interface DocuSignUserInfoResponse {
  accounts?: DocuSignAccountInfo[];
}

export interface DocuSignJwtTokenResponse {
  access_token: string;
}

export interface BoldSignAccountInfo {
  account_id: string;
  is_default?: boolean;
  base_uri?: string;
}

export interface BoldSignUserInfoResponse {
  accounts?: BoldSignAccountInfo[];
}
