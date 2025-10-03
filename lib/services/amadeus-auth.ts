// Amadeus API Authentication and Configuration

export const AMADEUS_CONFIG = {
  baseUrl: process.env.AMADEUS_BASE_URL || 'https://test.api.amadeus.com',
  apiKey: process.env.AMADEUS_API_KEY!,
  apiSecret: process.env.AMADEUS_API_SECRET!,
};

interface AmadeusTokenResponse {
  type: string;
  username: string;
  application_name: string;
  client_id: string;
  token_type: string;
  access_token: string;
  expires_in: number;
  state: string;
  scope: string;
}

// In-memory token cache with expiration
let tokenCache: {
  token: string;
  expiresAt: number;
} | null = null;

export async function getAccessToken(): Promise<string> {
  const now = Date.now();
  
  // Return cached token if still valid (with 5-minute buffer)
  if (tokenCache && tokenCache.expiresAt > now + 300000) {
    return tokenCache.token;
  }

  // Request new token
  try {
    const response = await fetch(`${AMADEUS_CONFIG.baseUrl}/v1/security/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: AMADEUS_CONFIG.apiKey,
        client_secret: AMADEUS_CONFIG.apiSecret,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Amadeus auth failed: ${response.status} ${errorText}`);
    }

    const data: AmadeusTokenResponse = await response.json();
    
    // Cache token with expiration time
    tokenCache = {
      token: data.access_token,
      expiresAt: now + (data.expires_in * 1000), // Convert seconds to milliseconds
    };

    return data.access_token;
  } catch (error) {
    console.error('Failed to get Amadeus access token:', error);
    throw error;
  }
}