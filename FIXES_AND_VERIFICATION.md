# Fixes and Verification Guide

This document provides complete fixes for all 5 vulnerabilities in the lab, along with verification steps to confirm the fixes work correctly.

## Table of Contents

- [Fix #1: Enforce PKCE](#fix-1-enforce-pkce)
- [Fix #2: Validate Tenant Access](#fix-2-validate-tenant-access)
- [Fix #3: Add State Parameter Validation](#fix-3-add-state-parameter-validation)
- [Fix #4: Strict Redirect URI Validation](#fix-4-strict-redirect-uri-validation)
- [Fix #5: Sanitize Tokens in Logs](#fix-5-sanitize-tokens-in-logs)
- [Applying All Fixes](#applying-all-fixes)
- [Testing Fixed Application](#testing-fixed-application)

---

## Fix #1: Enforce PKCE

### Vulnerability Summary
Authorization server accepts token exchanges without validating the PKCE code_verifier, allowing authorization code interception attacks.

### Root Cause
Keycloak client configuration has `oauth2.pkce.required` set to `"false"`.

### The Fix

**File**: `auth-server/realm-config.json`

**Line**: ~50 (in spa-client attributes)

**Change**:
```json
{
  "attributes": {
    "pkce.code.challenge.method": "S256",
    "oauth2.pkce.required": "false"
  }
}
```

**To**:
```json
{
  "attributes": {
    "pkce.code.challenge.method": "S256",
    "oauth2.pkce.required": "true"
  }
}
```

### Complete Fixed Configuration

Replace the `attributes` section in the `spa-client` configuration:

```json
"attributes": {
  "pkce.code.challenge.method": "S256",
  "oauth2.pkce.required": "true",
  "backchannel.logout.session.required": "true",
  "display.on.consent.screen": "false"
}
```

### Why This Works
When `oauth2.pkce.required` is `true`, Keycloak will reject any token exchange request that doesn't include a valid `code_verifier` matching the original `code_challenge`. This prevents authorization code interception attacks.

### Verification Steps

#### Step 1: Rebuild and Restart
```bash
docker-compose down
docker-compose build keycloak
docker-compose up -d
```

Wait for Keycloak to fully start (60-90 seconds).

#### Step 2: Test Valid PKCE Flow (Should Work)
```bash
# This test requires completing the full OAuth flow with PKCE
# Use the frontend application - it should still work normally
```

1. Open http://localhost:3000
2. Click "Login with OAuth"
3. Login as alice / password123
4. Should successfully reach dashboard ✅

#### Step 3: Test WITHOUT PKCE (Should Fail)
```bash
# Get an authorization code through normal flow
# Then try to exchange WITHOUT code_verifier

# 1. Get authorization URL and login
# 2. Copy the authorization code from callback
CODE="paste-authorization-code-here"

# 3. Try to exchange without code_verifier
curl -X POST http://localhost:8080/realms/saas-platform/protocol/openid-connect/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code" \
  -d "client_id=spa-client" \
  -d "code=$CODE" \
  -d "redirect_uri=http://localhost:3000/callback"
```

**Expected Result** (✅ Fixed):
```json
{
  "error": "invalid_request",
  "error_description": "PKCE code verifier not specified"
}
```

**OR**:
```json
{
  "error": "invalid_grant",
  "error_description": "PKCE verification failed"
}
```

#### Step 4: Verify in Keycloak Admin

1. Open http://localhost:8080
2. Login as admin / admin123
3. Clients → spa-client → Advanced Settings
4. Verify "Proof Key for Code Exchange Code Challenge Method" is set to "S256"
5. Look for PKCE Required setting (should be enabled)

### Alternative Fix (More Secure)

For even better security, also set minimum and maximum PKCE lengths:

```json
"attributes": {
  "pkce.code.challenge.method": "S256",
  "oauth2.pkce.required": "true",
  "pkce.code.verifier.min.length": "43",
  "pkce.code.verifier.max.length": "128"
}
```

---

## Fix #2: Validate Tenant Access

### Vulnerability Summary
API endpoints accept `tenant_id` query parameter without validating it against the authenticated user's tenant, allowing cross-tenant data access.

### Root Cause
The `list_resources()` function trusts the client-provided `tenant_id` parameter without comparing it to the user's actual tenant ID from the JWT token.

### The Fix

**File**: `api/src/routers/resources.py`

**Function**: `list_resources()`

**Line**: ~35

**Before** (Vulnerable):
```python
@router.get("", response_model=List[ResourceResponse])
async def list_resources(
    tenant_id: int = Query(None, description="Filter by tenant ID"),
    user_data: Dict[str, Any] = Depends(get_current_user_data)
):
    user_tenant_id = user_data.get("tenant_id")
    logger.info(f"User tenant_id from token: {user_tenant_id}")

    # VULNERABILITY: If tenant_id is provided in query, use it without validation
    if tenant_id is not None:
        logger.warning(f"Using tenant_id from query parameter: {tenant_id} (user's tenant: {user_tenant_id})")
        query_tenant_id = tenant_id
    else:
        query_tenant_id = user_tenant_id

    # Query resources (VULNERABLE: might query wrong tenant)
    query = """..."""
    resources = db.execute_query(query, (query_tenant_id,))
    return resources
```

**After** (Fixed):
```python
@router.get("", response_model=List[ResourceResponse])
async def list_resources(
    tenant_id: int = Query(None, description="Filter by tenant ID"),
    user_data: Dict[str, Any] = Depends(get_current_user_data)
):
    user_tenant_id = user_data.get("tenant_id")
    logger.info(f"User tenant_id from token: {user_tenant_id}")

    # FIX: Validate tenant_id against user's token
    if tenant_id is not None and tenant_id != user_tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Cannot access other tenant's resources"
        )

    # Use user's tenant ID from token (ignore query parameter)
    query_tenant_id = user_tenant_id

    # Query resources
    query = """..."""
    resources = db.execute_query(query, (query_tenant_id,))
    return resources
```

### Additional Fixes Required

**File**: `api/src/routers/resources.py`

**Function**: `get_resource()`

**Before** (Vulnerable):
```python
@router.get("/{resource_id}", response_model=ResourceResponse)
async def get_resource(
    resource_id: int,
    user_data: Dict[str, Any] = Depends(get_current_user_data)
):
    user_tenant_id = user_data.get("tenant_id")

    # VULNERABLE: Query resource without tenant check
    query = """
        SELECT r.id, r.tenant_id, r.owner_id, r.name, r.description,
               r.data, r.is_public, r.created_at, r.updated_at
        FROM resources r
        WHERE r.id = %s
    """
    resources = db.execute_query(query, (resource_id,))

    if not resources:
        raise HTTPException(status_code=404, detail="Resource not found")

    return resources[0]
```

**After** (Fixed):
```python
@router.get("/{resource_id}", response_model=ResourceResponse)
async def get_resource(
    resource_id: int,
    user_data: Dict[str, Any] = Depends(get_current_user_data)
):
    user_tenant_id = user_data.get("tenant_id")

    # FIX: Add tenant check to query
    query = """
        SELECT r.id, r.tenant_id, r.owner_id, r.name, r.description,
               r.data, r.is_public, r.created_at, r.updated_at
        FROM resources r
        WHERE r.id = %s AND r.tenant_id = %s
    """
    resources = db.execute_query(query, (resource_id, user_tenant_id))

    if not resources:
        raise HTTPException(
            status_code=404,
            detail="Resource not found or access denied"
        )

    return resources[0]
```

### Why This Works
By validating the `tenant_id` parameter against the JWT token's `tenant_id` claim, we ensure users can only access resources from their own tenant. The token is cryptographically signed by Keycloak, so it can't be tampered with.

### Verification Steps

#### Step 1: Apply Fixes and Rebuild
```bash
# Edit api/src/routers/resources.py with the fixes above
docker-compose down
docker-compose build api
docker-compose up -d
```

#### Step 2: Test Normal Access (Should Work)
```bash
# Login and get token
TOKEN="your-token-here"

# Query your own tenant's resources
curl http://localhost:8000/api/v1/resources \
  -H "Authorization: Bearer $TOKEN"

# Should return resources successfully ✅
```

#### Step 3: Test Cross-Tenant Access (Should Fail)
```bash
# Login as Tenant 1 user (alice)
# Try to access Tenant 2 resources

curl http://localhost:8000/api/v1/resources?tenant_id=2 \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Result** (✅ Fixed):
```json
{
  "detail": "Access denied: Cannot access other tenant's resources"
}
```
**Status Code**: 403 Forbidden

#### Step 4: Test IDOR (Should Fail)
```bash
# Try to access specific resource from another tenant
# Resources 6-10 belong to Tenant 2

curl http://localhost:8000/api/v1/resources/6 \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Result** (✅ Fixed):
```json
{
  "detail": "Resource not found or access denied"
}
```
**Status Code**: 404 Not Found

#### Step 5: Test Frontend
1. Login as alice
2. Click "Show Testing Tools"
3. Enter tenant_id: 2
4. Click "Test Tenant Isolation"
5. Should see error message ❌
6. Try accessing resource ID 6
7. Should fail ❌

---

## Fix #3: Add State Parameter Validation

### Vulnerability Summary
OAuth flow doesn't generate or validate `state` parameter, allowing CSRF attacks on the OAuth flow.

### Root Cause
Frontend OAuth implementation omits the state parameter generation and validation steps.

### The Fix

**File**: `frontend/src/auth/oauth.js`

**Function**: `initiateLogin()`

**Before** (Vulnerable):
```javascript
export async function initiateLogin() {
  const codeVerifier = generateRandomString();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  localStorage.setItem('pkce_code_verifier', codeVerifier);

  // VULNERABILITY: No state parameter generated

  const authUrl = new URL(`${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/auth`);
  authUrl.searchParams.append('client_id', CLIENT_ID);
  authUrl.searchParams.append('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.append('response_type', 'code');
  authUrl.searchParams.append('scope', 'openid profile email');
  authUrl.searchParams.append('code_challenge', codeChallenge);
  authUrl.searchParams.append('code_challenge_method', 'S256');
  // VULNERABILITY: No state parameter added

  window.location.href = authUrl.toString();
}
```

**After** (Fixed):
```javascript
export async function initiateLogin() {
  const codeVerifier = generateRandomString();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  // FIX: Generate state parameter
  const state = generateRandomString();

  localStorage.setItem('pkce_code_verifier', codeVerifier);
  // FIX: Store state for validation
  sessionStorage.setItem('oauth_state', state);

  const authUrl = new URL(`${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/auth`);
  authUrl.searchParams.append('client_id', CLIENT_ID);
  authUrl.searchParams.append('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.append('response_type', 'code');
  authUrl.searchParams.append('scope', 'openid profile email');
  authUrl.searchParams.append('code_challenge', codeChallenge);
  authUrl.searchParams.append('code_challenge_method', 'S256');
  // FIX: Add state parameter
  authUrl.searchParams.append('state', state);

  window.location.href = authUrl.toString();
}
```

**Function**: `handleCallback()`

**Before** (Vulnerable):
```javascript
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

  const codeVerifier = localStorage.getItem('pkce_code_verifier');
  // ... rest of code
}
```

**After** (Fixed):
```javascript
export async function handleCallback() {
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code');
  const error = urlParams.get('error');

  // FIX: Get state from URL
  const returnedState = urlParams.get('state');

  if (error) {
    throw new Error(`OAuth error: ${error}`);
  }

  if (!code) {
    throw new Error('No authorization code received');
  }

  // FIX: Validate state parameter
  const storedState = sessionStorage.getItem('oauth_state');
  if (!returnedState || !storedState || returnedState !== storedState) {
    sessionStorage.removeItem('oauth_state');
    throw new Error('State mismatch - possible CSRF attack detected');
  }

  // FIX: Clean up state after validation
  sessionStorage.removeItem('oauth_state');

  const codeVerifier = localStorage.getItem('pkce_code_verifier');
  // ... rest of code
}
```

### Why This Works
The state parameter acts as a CSRF token for the OAuth flow:
1. Generated uniquely for each authorization request
2. Stored client-side in sessionStorage (not sent to server)
3. Sent to authorization server and returned unchanged
4. Validated on callback to ensure the redirect came from a legitimate authorization request

This prevents attackers from injecting their own authorization codes into a victim's session.

### Verification Steps

#### Step 1: Apply Fixes and Rebuild
```bash
# Edit frontend/src/auth/oauth.js
docker-compose down
docker-compose build frontend
docker-compose up -d
```

#### Step 2: Test Normal Flow (Should Work)
1. Clear browser storage (DevTools → Application → Clear site data)
2. Navigate to http://localhost:3000
3. Open DevTools → Network tab
4. Click "Login with OAuth"
5. Inspect the redirect URL

**Should see**:
```
http://localhost:8080/realms/saas-platform/protocol/openid-connect/auth?
...
&state=SOME_RANDOM_STRING  ← Should be present ✅
```

6. Complete login
7. Should reach dashboard successfully ✅

#### Step 3: Test CSRF Attack (Should Fail)

1. **Get an authorization code**:
   - Login normally
   - Copy the callback URL with code

2. **Clear browser session**:
   - Logout or clear storage

3. **Try to reuse the code**:
   - Paste the callback URL directly: `http://localhost:3000/callback?code=OLD_CODE&state=OLD_STATE`

**Expected Result** (✅ Fixed):
- Error message: "State mismatch - possible CSRF attack detected"
- Does NOT login

4. **Try without state**:
   - `http://localhost:3000/callback?code=SOME_CODE`

**Expected Result** (✅ Fixed):
- Error: "State mismatch - possible CSRF attack detected"

---

## Fix #4: Strict Redirect URI Validation

### Vulnerability Summary
OAuth client configuration allows wildcard redirect URIs (`http://*`), enabling authorization code theft by redirecting to attacker-controlled domains.

### Root Cause
Keycloak client has overly permissive redirect URI patterns.

### The Fix

**File**: `auth-server/realm-config.json`

**In**: `clients[0]` (spa-client)

**Before** (Vulnerable):
```json
{
  "clientId": "spa-client",
  ...
  "redirectUris": [
    "http://localhost:3000/*",
    "http://localhost/*",
    "http://*"
  ],
  "webOrigins": [
    "http://localhost:3000",
    "http://localhost",
    "*"
  ]
}
```

**After** (Fixed):
```json
{
  "clientId": "spa-client",
  ...
  "redirectUris": [
    "http://localhost:3000/callback"
  ],
  "webOrigins": [
    "http://localhost:3000"
  ]
}
```

### Why This Works
By specifying exact redirect URIs (no wildcards), Keycloak will only send authorization codes to the legitimate application callback URL. Any attempt to use a different `redirect_uri` will be rejected.

### Verification Steps

#### Step 1: Apply Fix and Rebuild
```bash
# Edit auth-server/realm-config.json
docker-compose down
docker-compose build keycloak
docker-compose up -d
```

Wait for Keycloak to import the new realm configuration.

#### Step 2: Test Normal Callback (Should Work)
```bash
# Use the legitimate redirect URI
curl "http://localhost:8080/realms/saas-platform/protocol/openid-connect/auth?client_id=spa-client&redirect_uri=http://localhost:3000/callback&response_type=code&scope=openid"

# Should redirect to Keycloak login page ✅
```

#### Step 3: Test Malicious Redirect (Should Fail)
```bash
# Try to use attacker domain
curl -v "http://localhost:8080/realms/saas-platform/protocol/openid-connect/auth?client_id=spa-client&redirect_uri=http://attacker.com/steal&response_type=code&scope=openid"
```

**Expected Result** (✅ Fixed):
```
HTTP/1.1 400 Bad Request
...
Invalid parameter: redirect_uri
```

#### Step 4: Test Wildcard Bypass Attempt (Should Fail)
```bash
# Try different ports
curl -v "http://localhost:8080/realms/saas-platform/protocol/openid-connect/auth?client_id=spa-client&redirect_uri=http://localhost:9999/callback&response_type=code&scope=openid"
```

**Expected Result** (✅ Fixed):
- Error: Invalid redirect_uri

#### Step 5: Verify in Keycloak Admin
1. Open http://localhost:8080
2. Admin login
3. Clients → spa-client → Settings
4. Check "Valid Redirect URIs"
5. Should ONLY show: `http://localhost:3000/callback` ✅

---

## Fix #5: Sanitize Tokens in Logs

### Vulnerability Summary
API logs full `Authorization` headers including Bearer tokens in plaintext, exposing session tokens in log files.

### Root Cause
The logger utility logs request headers without sanitization.

### The Fix

**File**: `api/src/utils/logger.py`

**Add this function at the top**:
```python
import re

def sanitize_auth_header(header_value: str) -> str:
    """
    Sanitize authorization header by redacting the token

    Before: "Bearer eyJhbGciOiJSUzI1NiIsInR5cC..."
    After:  "Bearer [REDACTED]"
    """
    if not header_value:
        return header_value

    # Redact Bearer tokens
    return re.sub(
        r'(Bearer\s+)[A-Za-z0-9\-\._~\+\/]+=*',
        r'\1[REDACTED]',
        header_value
    )
```

**Update the `log_request` method**:

**Before** (Vulnerable):
```python
def log_request(self, method: str, path: str, headers: dict, **kwargs):
    """
    Log incoming API request

    VULNERABILITY: Logs the full Authorization header with token
    """
    auth_header = headers.get("authorization", "None")

    # VULNERABLE: Logging the full authorization header including token
    log_msg = f"Request: {method} {path} | Authorization: {auth_header}"

    if kwargs:
        log_msg += f" | Extra: {kwargs}"

    self.logger.info(log_msg)
```

**After** (Fixed):
```python
def log_request(self, method: str, path: str, headers: dict, **kwargs):
    """
    Log incoming API request with sanitized auth header
    """
    auth_header = headers.get("authorization", "None")

    # FIX: Sanitize the authorization header before logging
    sanitized_auth = sanitize_auth_header(auth_header)
    log_msg = f"Request: {method} {path} | Authorization: {sanitized_auth}"

    if kwargs:
        log_msg += f" | Extra: {kwargs}"

    self.logger.info(log_msg)
```

**Update the `log_auth_attempt` method**:

**Before** (Vulnerable):
```python
def log_auth_attempt(self, email: str, tenant_id: int, success: bool, token: str = None):
    """
    VULNERABILITY: Logs tokens in authentication logs
    """
    status = "SUCCESS" if success else "FAILED"

    if token:
        log_msg = f"Auth {status}: {email} (tenant {tenant_id}) | Token: {token[:50]}..."
    else:
        log_msg = f"Auth {status}: {email} (tenant {tenant_id})"

    self.logger.info(log_msg)
```

**After** (Fixed):
```python
def log_auth_attempt(self, email: str, tenant_id: int, success: bool, token: str = None):
    """
    Log authentication attempts without exposing tokens
    """
    status = "SUCCESS" if success else "FAILED"

    # FIX: Don't log tokens at all
    log_msg = f"Auth {status}: {email} (tenant {tenant_id})"

    self.logger.info(log_msg)
```

### Why This Works
By redacting the token value before logging, we maintain useful debugging information (that a request was authenticated) without exposing the sensitive session token. Attackers who gain log access cannot steal tokens.

### Verification Steps

#### Step 1: Apply Fix and Rebuild
```bash
# Edit api/src/utils/logger.py
docker-compose down
docker-compose build api
docker-compose up -d
```

#### Step 2: Generate Authenticated Requests
```bash
# Login and make API calls
TOKEN="your-token-here"

curl http://localhost:8000/api/v1/profile \
  -H "Authorization: Bearer $TOKEN"

curl http://localhost:8000/api/v1/resources \
  -H "Authorization: Bearer $TOKEN"
```

#### Step 3: Check Logs (Should Be Sanitized)
```bash
docker logs oauth-lab-api | grep "Authorization"
```

**Expected Result** (✅ Fixed):
```
2024-01-15 10:30:15 - oauth-lab-api - INFO - Request: GET /api/v1/profile | Authorization: Bearer [REDACTED]
2024-01-15 10:30:16 - oauth-lab-api - INFO - Request: GET /api/v1/resources | Authorization: Bearer [REDACTED]
```

**Should NOT see**:
```
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cC...  ❌
```

#### Step 4: Verify Token Cannot Be Extracted
```bash
# Try to extract tokens from logs (should fail)
docker logs oauth-lab-api | grep -o "Bearer [A-Za-z0-9\-\._~\+\/]+=*" | grep -v "REDACTED"

# Should return nothing ✅
```

---

## Applying All Fixes

### Quick Command Reference

```bash
# 1. Stop the lab
docker-compose down

# 2. Make all the edits above to these files:
# - auth-server/realm-config.json
# - api/src/routers/resources.py
# - api/src/utils/logger.py
# - frontend/src/auth/oauth.js

# 3. Rebuild all containers
docker-compose build

# 4. Start with clean state
docker-compose up -d

# 5. Wait for services to be ready (60-90 seconds)
watch -n 5 'docker-compose ps'

# 6. Run verification tests
docker-compose exec api pytest tests/test_vulnerabilities.py -v
```

---

## Testing Fixed Application

### Comprehensive Test Suite

Create a test script to verify all fixes:

```bash
#!/bin/bash
# test-fixes.sh

echo "=== Testing Security Fixes ==="

TOKEN="paste-your-token-here"

echo ""
echo "Test 1: PKCE Enforcement"
echo "Expected: Should require code_verifier"
# Manual test - try token exchange without code_verifier

echo ""
echo "Test 2: Tenant Isolation"
curl -s http://localhost:8000/api/v1/resources?tenant_id=2 \
  -H "Authorization: Bearer $TOKEN" | jq

echo "Expected: 403 Forbidden"

echo ""
echo "Test 3: State Parameter"
echo "Check browser DevTools Network tab during login"
echo "Expected: State parameter present in OAuth URL"

echo ""
echo "Test 4: Redirect URI Validation"
echo "Try authorization with wrong redirect_uri"
echo "Expected: Error: Invalid parameter: redirect_uri"

echo ""
echo "Test 5: Log Sanitization"
docker logs oauth-lab-api --tail 10 | grep "Authorization"
echo "Expected: Tokens should show as [REDACTED]"

echo ""
echo "=== All Tests Complete ==="
```

### Automated Testing

Run the pytest suite:

```bash
docker-compose exec api pytest tests/test_vulnerabilities.py -v --tb=short
```

Expected output with all fixes applied:
```
test_tenant_isolation_bypass ... PASSED (returns 403)
test_idor_vulnerability ... PASSED (returns 404)
test_token_logging_vulnerability ... PASSED (tokens redacted)
```

---

## Verification Checklist

Use this checklist to confirm all fixes are properly applied:

- [ ] **PKCE**: Token exchange fails without code_verifier
- [ ] **PKCE**: Frontend OAuth flow still works normally
- [ ] **Tenant Isolation**: Cannot query other tenants via query parameter
- [ ] **Tenant Isolation**: Returns 403 Forbidden on cross-tenant access
- [ ] **IDOR**: Cannot access resources by ID from other tenants
- [ ] **IDOR**: Returns 404 on unauthorized resource access
- [ ] **State**: State parameter present in authorization URL
- [ ] **State**: Callback validates state parameter
- [ ] **State**: Fails with state mismatch error when attacked
- [ ] **Redirect URI**: Only exact match accepted
- [ ] **Redirect URI**: Rejects attacker domains
- [ ] **Redirect URI**: Rejects different ports
- [ ] **Logs**: Authorization headers show [REDACTED]
- [ ] **Logs**: Cannot extract tokens from logs
- [ ] **Logs**: Auth attempts don't include token values

---

## Additional Security Hardening

Beyond fixing the 5 vulnerabilities, consider these additional improvements:

### 1. Add Rate Limiting
```python
# api/src/main.py
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

@app.get("/api/v1/resources")
@limiter.limit("10/minute")
async def list_resources(...):
    ...
```

### 2. Use UUIDs Instead of Sequential IDs
```sql
-- db/init/01-schema.sql
CREATE TABLE resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ...
);
```

### 3. Implement RBAC
```python
# Check user roles from token
def require_role(required_role: str):
    def decorator(func):
        async def wrapper(*args, user_data, **kwargs):
            roles = user_data.get("realm_access", {}).get("roles", [])
            if required_role not in roles:
                raise HTTPException(403, "Insufficient permissions")
            return await func(*args, user_data=user_data, **kwargs)
        return wrapper
    return decorator

@router.delete("/{resource_id}")
@require_role("admin")
async def delete_resource(...):
    ...
```

### 4. Enable HTTPS (Production)
```yaml
# docker-compose.yml
gateway:
  ...
  volumes:
    - ./ssl/cert.pem:/etc/ssl/certs/cert.pem
    - ./ssl/key.pem:/etc/ssl/private/key.pem
  ports:
    - "443:443"
```

---

## Conclusion

After applying all fixes:
- ✅ Authorization codes require PKCE
- ✅ Tenant isolation enforced
- ✅ OAuth CSRF protection active
- ✅ Redirect URI strictly validated
- ✅ Tokens sanitized in logs

The application is now significantly more secure, though still a lab environment. For production use, additional hardening would be required (HTTPS, rate limiting, monitoring, etc.).

**Next Steps**:
1. Complete all fixes
2. Run verification tests
3. Review OWASP best practices
4. Apply learnings to real projects
