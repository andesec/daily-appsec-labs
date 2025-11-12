/**
 * OAuth 2.0 Authorization Code Flow with PKCE Implementation
 *
 * VULNERABILITIES:
 * 1. State parameter is NOT generated/validated (CSRF vulnerability)
 * 2. Code verifier is stored in localStorage (acceptable for lab, but not ideal)
 */

const KEYCLOAK_URL = import.meta.env.VITE_KEYCLOAK_URL || 'http://localhost:8080';
const REALM = import.meta.env.VITE_KEYCLOAK_REALM || 'saas-platform';
const CLIENT_ID = import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'spa-client';
const REDIRECT_URI = `${window.location.origin}/callback`;

/**
 * Generate random string for code verifier
 */
function generateRandomString(length = 43) {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let result = '';
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);

  for (let i = 0; i < length; i++) {
    result += charset[randomValues[i] % charset.length];
  }

  return result;
}

/**
 * Generate SHA256 hash and base64url encode it
 */
async function sha256(plain) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return hash;
}

/**
 * Base64URL encode
 */
function base64urlencode(buffer) {
  const bytes = new Uint8Array(buffer);
  let str = '';
  for (let i = 0; i < bytes.length; i++) {
    str += String.fromCharCode(bytes[i]);
  }
  return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Generate PKCE code challenge from verifier
 */
export async function generateCodeChallenge(codeVerifier) {
  const hashed = await sha256(codeVerifier);
  return base64urlencode(hashed);
}

/**
 * Initiate OAuth login flow
 *
 * VULNERABILITY: State parameter is NOT generated
 * This makes the flow vulnerable to CSRF attacks
 */
export async function initiateLogin() {
  // Generate PKCE parameters
  const codeVerifier = generateRandomString();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  // Store code verifier for later use
  localStorage.setItem('pkce_code_verifier', codeVerifier);

  // VULNERABILITY: No state parameter generated
  // In a secure implementation, we should:
  // const state = generateRandomString();
  // sessionStorage.setItem('oauth_state', state);

  // Build authorization URL
  const authUrl = new URL(`${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/auth`);
  authUrl.searchParams.append('client_id', CLIENT_ID);
  authUrl.searchParams.append('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.append('response_type', 'code');
  authUrl.searchParams.append('scope', 'openid profile email');
  authUrl.searchParams.append('code_challenge', codeChallenge);
  authUrl.searchParams.append('code_challenge_method', 'S256');

  // VULNERABILITY: No state parameter added
  // authUrl.searchParams.append('state', state);

  // Redirect to authorization server
  window.location.href = authUrl.toString();
}

/**
 * Handle OAuth callback
 *
 * VULNERABILITY: State parameter is NOT validated
 */
export async function handleCallback() {
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code');
  const error = urlParams.get('error');

  if (error) {
    throw new Error(`OAuth error: ${error}`);
  }

  if (!code) {
    throw new Error('No authorization code received');
  }

  // VULNERABILITY: State parameter not validated
  // const returnedState = urlParams.get('state');
  // const storedState = sessionStorage.getItem('oauth_state');
  // if (!returnedState || returnedState !== storedState) {
  //   throw new Error('State mismatch - possible CSRF attack');
  // }

  // Retrieve code verifier
  const codeVerifier = localStorage.getItem('pkce_code_verifier');
  if (!codeVerifier) {
    throw new Error('Code verifier not found');
  }

  // Exchange code for tokens
  const tokenUrl = `${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/token`;

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: CLIENT_ID,
    code: code,
    redirect_uri: REDIRECT_URI,
    code_verifier: codeVerifier,
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Token exchange failed: ${errorData.error_description || errorData.error}`);
  }

  const tokens = await response.json();

  // Store tokens
  localStorage.setItem('access_token', tokens.access_token);
  localStorage.setItem('refresh_token', tokens.refresh_token);
  localStorage.setItem('id_token', tokens.id_token);

  // Clean up
  localStorage.removeItem('pkce_code_verifier');

  return tokens;
}

/**
 * Get current access token
 */
export function getAccessToken() {
  return localStorage.getItem('access_token');
}

/**
 * Get current user info from token
 */
export function getCurrentUser() {
  const token = getAccessToken();
  if (!token) return null;

  try {
    // Decode JWT (just the payload)
    const payload = token.split('.')[1];
    const decoded = JSON.parse(atob(payload));
    return decoded;
  } catch (error) {
    console.error('Failed to decode token:', error);
    return null;
  }
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated() {
  const token = getAccessToken();
  if (!token) return false;

  try {
    const user = getCurrentUser();
    // Check if token is expired
    if (user && user.exp) {
      return Date.now() < user.exp * 1000;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Logout
 */
export function logout() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('id_token');
  localStorage.removeItem('pkce_code_verifier');

  // Redirect to Keycloak logout
  const logoutUrl = `${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/logout?redirect_uri=${encodeURIComponent(window.location.origin)}`;
  window.location.href = logoutUrl;
}
