# Frontend (React SPA)

## Overview
Single Page Application (SPA) built with React and Vite that demonstrates OAuth 2.0 Authorization Code Flow with PKCE. Includes intentional security vulnerabilities for educational purposes.

## Features
- OAuth 2.0 Authorization Code Flow implementation
- PKCE (Proof Key for Code Exchange) with S256 challenge method
- JWT token management
- Multi-tenant resource management interface
- Built-in vulnerability testing tools

## Intentional Vulnerabilities

### 1. Missing State Parameter Validation ⚠️
**Location**: `src/auth/oauth.js` - `initiateLogin()` and `handleCallback()`

**Issue**: The OAuth flow does not generate or validate a state parameter, making it vulnerable to CSRF attacks.

**Impact**: Attackers can craft malicious links that complete the OAuth flow with an attacker's authorization code.

**Example Attack**:
```
An attacker tricks a victim into clicking:
http://victim-app.com/callback?code=ATTACKER_CODE

The victim's browser exchanges the attacker's code for tokens,
logging the victim into the attacker's account.
```

**Fix**: Generate and validate state parameter:
```javascript
// In initiateLogin()
const state = generateRandomString();
sessionStorage.setItem('oauth_state', state);
authUrl.searchParams.append('state', state);

// In handleCallback()
const returnedState = urlParams.get('state');
const storedState = sessionStorage.getItem('oauth_state');
if (!returnedState || returnedState !== storedState) {
  throw new Error('State mismatch - possible CSRF attack');
}
```

### 2. Token Storage in localStorage ⚠️
**Location**: `src/auth/oauth.js` - `handleCallback()`

**Issue**: Access tokens are stored in localStorage, which is accessible to any JavaScript code (including XSS attacks).

**Better Alternative**: Use httpOnly cookies (requires backend support) or sessionStorage with additional protections.

**Note**: For this lab, localStorage is acceptable for demonstration purposes.

## Project Structure

```
frontend/
├── src/
│   ├── auth/
│   │   └── oauth.js            # OAuth PKCE implementation (VULNERABLE)
│   ├── api/
│   │   └── client.js           # API client with axios
│   ├── components/
│   │   ├── Login.jsx           # Login page
│   │   ├── Callback.jsx        # OAuth callback handler
│   │   └── Dashboard.jsx       # Main dashboard with vuln testing
│   ├── App.jsx                 # Main app component
│   ├── main.jsx                # Entry point
│   └── index.css               # Global styles
├── public/
├── index.html
├── package.json
├── vite.config.js
├── Dockerfile
└── README.md
```

## Development

### Prerequisites
- Node.js 18+ and npm

### Install Dependencies
```bash
cd frontend
npm install
```

### Environment Configuration
Create a `.env` file based on `.env.example`:
```bash
cp .env.example .env
```

Edit `.env`:
```env
VITE_API_URL=http://localhost:8000/api/v1
VITE_KEYCLOAK_URL=http://localhost:8080
VITE_KEYCLOAK_REALM=saas-platform
VITE_KEYCLOAK_CLIENT_ID=spa-client
```

### Run Development Server
```bash
npm run dev
```

Access at: http://localhost:3000

### Build for Production
```bash
npm run build
```

The built files will be in the `dist/` directory.

## OAuth Flow Implementation

### 1. Login Initiation
```javascript
// User clicks login button
initiateLogin()
  ↓
// Generate PKCE parameters
codeVerifier = generateRandomString()
codeChallenge = sha256(codeVerifier)
  ↓
// Store code verifier
localStorage.setItem('pkce_code_verifier', codeVerifier)
  ↓
// Redirect to Keycloak
window.location = keycloak/auth?
  client_id=spa-client&
  redirect_uri=http://localhost:3000/callback&
  response_type=code&
  scope=openid profile email&
  code_challenge=CHALLENGE&
  code_challenge_method=S256
```

### 2. User Authentication
```
User authenticates with Keycloak
  ↓
Keycloak redirects back with authorization code
  ↓
http://localhost:3000/callback?code=AUTH_CODE
```

### 3. Token Exchange
```javascript
handleCallback()
  ↓
// Extract code from URL
code = urlParams.get('code')
  ↓
// Retrieve code verifier
codeVerifier = localStorage.getItem('pkce_code_verifier')
  ↓
// Exchange code for tokens
POST /token
  grant_type=authorization_code
  client_id=spa-client
  code=AUTH_CODE
  redirect_uri=http://localhost:3000/callback
  code_verifier=CODE_VERIFIER
  ↓
// Store tokens
localStorage.setItem('access_token', tokens.access_token)
  ↓
// Redirect to dashboard
navigate('/dashboard')
```

## Using the Application

### Login
1. Navigate to http://localhost:3000
2. Click "Login with OAuth"
3. Enter credentials:
   - **Tenant 1**: alice / password123 or bob / password123
   - **Tenant 2**: charlie / password123

### View Resources
- After login, you'll see your resources
- Resources are filtered by your tenant (supposedly)

### Test Vulnerabilities

#### Test Tenant Isolation Bypass
1. Note your current tenant ID (shown in header)
2. Click "Show Testing Tools"
3. Enter a different tenant ID (1 or 2)
4. Click "Test Tenant Isolation"
5. If successful, you'll see resources from the other tenant ✅ Vulnerability confirmed!

#### Test IDOR
1. Click "Show Testing Tools"
2. Enter a resource ID from another tenant:
   - Resources 1-5: Tenant 1
   - Resources 6-10: Tenant 2
3. Click "Test IDOR"
4. If successful, you'll see the unauthorized resource ✅ Vulnerability confirmed!

### Create Resources
1. Click "Create New"
2. Fill in the form
3. Data must be valid JSON, e.g., `{"key": "value"}`
4. Click "Create Resource"

## API Integration

The frontend uses axios to communicate with the backend:

```javascript
// Example: List resources
const response = await apiClient.get('/resources');

// Example: Get specific resource (IDOR test)
const response = await apiClient.get(`/resources/${id}`);

// Example: Create resource
const response = await apiClient.post('/resources', data);
```

All requests automatically include the Bearer token via axios interceptor.

## Testing PKCE

### Manual PKCE Flow Testing

1. **Check Code Challenge Generation**:
```javascript
const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const challenge = await generateCodeChallenge(verifier);
console.log(challenge); // Should produce consistent SHA256 hash
```

2. **Inspect Authorization Request**:
Open browser DevTools Network tab and watch the redirect to Keycloak:
```
GET /auth?code_challenge=CHALLENGE&code_challenge_method=S256...
```

3. **Inspect Token Exchange**:
In Network tab, watch the POST to `/token`:
```
POST /token
Body: grant_type=authorization_code&code=...&code_verifier=...
```

### Testing Without PKCE (Vulnerability)

If the authorization server doesn't require PKCE, you can test:

1. Intercept the authorization code from the callback URL
2. Use curl to exchange it WITHOUT code_verifier:
```bash
curl -X POST http://localhost:8080/realms/saas-platform/protocol/openid-connect/token \
  -d "grant_type=authorization_code" \
  -d "client_id=spa-client" \
  -d "code=AUTHORIZATION_CODE" \
  -d "redirect_uri=http://localhost:3000/callback"
```

If this succeeds, PKCE is not enforced! ⚠️

## Docker Usage

### Build Image
```bash
docker build -t oauth-lab-frontend \
  --build-arg VITE_API_URL=http://localhost/api/v1 \
  --build-arg VITE_KEYCLOAK_URL=http://localhost:8080 \
  --build-arg VITE_KEYCLOAK_REALM=saas-platform \
  --build-arg VITE_KEYCLOAK_CLIENT_ID=spa-client \
  .
```

### Run Container
```bash
docker run -p 3000:80 oauth-lab-frontend
```

## Troubleshooting

### OAuth Flow Issues

**Problem**: "No authorization code received"
- Check Keycloak is running: `docker ps | grep keycloak`
- Verify redirect URI matches exactly
- Check browser console for errors

**Problem**: "Token exchange failed"
- Verify code_verifier is being stored
- Check that code hasn't expired (60 seconds)
- Ensure Keycloak client configuration is correct

**Problem**: "CORS errors"
- Ensure Keycloak client has correct Web Origins configured
- Check API CORS middleware is configured

### Development Issues

**Problem**: "Module not found"
```bash
rm -rf node_modules package-lock.json
npm install
```

**Problem**: Environment variables not working
- Ensure variables start with `VITE_`
- Restart dev server after changing .env
- Check `import.meta.env.VITE_*` syntax

## Security Notes

⚠️ **This application is INTENTIONALLY VULNERABLE for educational purposes.**

The missing state parameter validation and other issues are deliberate teaching points. Do NOT use this code in production without implementing the fixes documented in `FIXES_AND_VERIFICATION.md`.

## Further Learning

- [OAuth 2.0 RFC 6749](https://tools.ietf.org/html/rfc6749)
- [PKCE RFC 7636](https://tools.ietf.org/html/rfc7636)
- [OAuth 2.0 Security Best Practices](https://tools.ietf.org/html/draft-ietf-oauth-security-topics)
- [OWASP OAuth Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/OAuth2_Cheat_Sheet.html)
