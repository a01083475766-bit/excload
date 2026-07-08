/** 정규화된 Shopify shop hostname — `{slug}.myshopify.com` */
export type ShopifyShopDomain = `${string}.myshopify.com`;

export type ShopifyOAuthStatePayload = {
  userId: string;
  accountId: string;
  shopDomain: string;
  nonce: string;
  ts: number;
};

export type ShopifyOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  /** 기본값: `read_orders` */
  scopes?: string;
  apiVersion?: string;
};

/** POST /admin/oauth/access_token 응답 (token exchange 구현 시 사용) */
export type ShopifyTokenResponse = {
  access_token: string;
  scope: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
};
