# Authorization Server (Keycloak)

## Overview
Keycloak is used as the OAuth 2.0 / OpenID Connect authorization server for this lab. It's configured with intentional security vulnerabilities for educational purposes.

## Configuration

### Realm
- **Name**: `saas-platform`
- **Display Name**: SaaS Platform OAuth Lab

### Client Configuration

#### SPA Client (`spa-client`)
- **Type**: Public client (no client secret)
- **Protocol**: OpenID Connect
- **Flows**: Authorization Code Flow enabled
- **PKCE**: S256 method available but **NOT REQUIRED** ⚠️ (VULNERABLE)
- **Redirect URIs**: Overly permissive wildcards ⚠️ (VULNERABLE)
  - `http://localhost:3000/*`
  - `http://localhost/*`
  - `http://*` (DANGEROUS!)
- **Web Origins**: Wildcard `*` allowed ⚠️ (VULNERABLE)

### Users and Credentials

| Username | Email | Password | Tenant ID | Tenant Name |
|----------|-------|----------|-----------|-------------|
| alice | alice@acme.example.com | password123 | 1 | Acme Corporation |
| bob | bob@acme.example.com | password123 | 1 | Acme Corporation |
| charlie | charlie@beta.example.com | password123 | 2 | Beta Industries |

### Custom Claims

The access tokens include a custom `tenant_id` claim that identifies which tenant the user belongs to. This is used by the API for tenant isolation (or lack thereof in the vulnerable version).

## Intentional Vulnerabilities

### 1. PKCE Not Enforced ⚠️
**Configuration**: `"oauth2.pkce.required": "false"`

**Impact**: Authorization codes can be exchanged without providing a valid `code_verifier`, making the flow vulnerable to authorization code interception attacks.

**Exploitation**: Intercept the authorization code from the callback URL and exchange it directly without PKCE parameters.

### 2. Overly Permissive Redirect URIs ⚠️
**Configuration**: Includes `"http://*"` as a valid redirect URI

**Impact**: Attackers can redirect authorization codes to any HTTP domain they control, enabling authorization code theft.

**Exploitation**: Modify the `redirect_uri` parameter during authorization to point to an attacker-controlled domain.

### 3. Wildcard CORS Origins ⚠️
**Configuration**: `"webOrigins": ["*"]`

**Impact**: Any website can make authenticated requests to the token endpoint from a browser context.

**Exploitation**: Cross-site attacks can retrieve tokens if combined with other vulnerabilities.

## Accessing Keycloak Admin Console

1. Navigate to: `http://localhost:8080`
2. Click "Administration Console"
3. Login with:
   - **Username**: `admin`
   - **Password**: `admin123`

## Testing OAuth Endpoints

### Discovery Endpoint
```bash
curl http://localhost:8080/realms/saas-platform/.well-known/openid-configuration
```

### Authorization Endpoint
```
http://localhost:8080/realms/saas-platform/protocol/openid-connect/auth
```

### Token Endpoint
```
http://localhost:8080/realms/saas-platform/protocol/openid-connect/token
```

### Userinfo Endpoint
```
http://localhost:8080/realms/saas-platform/protocol/openid-connect/userinfo
```

## Manual Testing

### Get Authorization Code
```bash
# Open in browser (replace code_challenge with actual value)
http://localhost:8080/realms/saas-platform/protocol/openid-connect/auth?client_id=spa-client&redirect_uri=http://localhost:3000/callback&response_type=code&scope=openid%20profile%20email&code_challenge=CODE_CHALLENGE&code_challenge_method=S256
```

### Exchange Code for Token (WITH PKCE - Secure)
```bash
curl -X POST http://localhost:8080/realms/saas-platform/protocol/openid-connect/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code" \
  -d "client_id=spa-client" \
  -d "code=AUTHORIZATION_CODE" \
  -d "redirect_uri=http://localhost:3000/callback" \
  -d "code_verifier=CODE_VERIFIER"
```

### Exchange Code WITHOUT PKCE (VULNERABLE) ⚠️
```bash
curl -X POST http://localhost:8080/realms/saas-platform/protocol/openid-connect/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code" \
  -d "client_id=spa-client" \
  -d "code=AUTHORIZATION_CODE" \
  -d "redirect_uri=http://localhost:3000/callback"
```

**Note**: This should fail in a secure implementation but succeeds here due to PKCE not being required.

## Realm Import Process

The realm configuration is automatically imported when Keycloak starts:
1. Docker Compose mounts `realm-config.json` to `/opt/keycloak/data/import/`
2. Keycloak starts with `--import-realm` flag
3. Realm, clients, and users are created automatically

## Troubleshooting

### Realm Not Imported
```bash
# Check Keycloak logs
docker logs oauth-lab-keycloak

# Manually import realm
docker exec -it oauth-lab-keycloak /opt/keycloak/bin/kc.sh import --file /opt/keycloak/data/import/realm-config.json
```

### Reset Realm
```bash
# Delete realm via Admin Console or API
curl -X DELETE http://localhost:8080/admin/realms/saas-platform \
  -H "Authorization: Bearer ADMIN_TOKEN"

# Restart Keycloak to re-import
docker-compose restart keycloak
```

## Security Note

⚠️ **This configuration is INTENTIONALLY INSECURE for educational purposes only.**

Do NOT use this configuration in production environments. The vulnerabilities included are meant to demonstrate common OAuth 2.0 implementation mistakes.
