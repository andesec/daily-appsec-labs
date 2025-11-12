# Threat Model: OAuth 2.0 + PKCE Multi-Tenant SaaS Lab

## Executive Summary

This document provides a security analysis of the OAuth 2.0 + PKCE Multi-Tenant SaaS lab environment using STRIDE methodology. It identifies threats, attack vectors, and security controls (both missing and present) in the system.

## System Overview

### Components
1. **React SPA Frontend** - Public client implementing OAuth PKCE
2. **nginx Gateway** - Reverse proxy and routing layer
3. **FastAPI Resource Server** - Multi-tenant business API
4. **Keycloak** - Authorization/authentication server
5. **PostgreSQL** - Data persistence layer
6. **Redis** - Session and cache storage

### Trust Boundaries

```
┌─────────────────────────────────────────────────────────────┐
│                    Untrusted Zone                            │
│                    (User Browser)                            │
└──────────────────────────┬──────────────────────────────────┘
                           │
      ═══════════════════════════════════════
      Trust Boundary #1: Internet → DMZ
      ═══════════════════════════════════════
                           │
┌──────────────────────────┴──────────────────────────────────┐
│                      DMZ Zone                                 │
│            (Gateway, Frontend, Auth Server)                   │
└──────────────────────────┬──────────────────────────────────┘
                           │
      ═══════════════════════════════════════
      Trust Boundary #2: DMZ → Internal
      ═══════════════════════════════════════
                           │
┌──────────────────────────┴──────────────────────────────────┐
│                   Internal Zone                               │
│              (API Server, Database, Cache)                    │
└───────────────────────────────────────────────────────────────┘
```

## STRIDE Analysis

### Spoofing (Identity)

#### Threat S1: Token Theft via Authorization Code Interception
**Severity**: HIGH
**Component**: OAuth Flow
**Description**: Attacker intercepts authorization code and exchanges it without PKCE verification
**Vulnerability**: PKCE not enforced
**Attack Vector**:
1. Attacker tricks victim to visit malicious page
2. Malicious page initiates OAuth flow with controlled redirect_uri
3. Victim authenticates
4. Authorization code sent to attacker
5. Attacker exchanges code WITHOUT code_verifier

**Mitigation (Lab)**: None - PKCE not enforced
**Mitigation (Production)**: Enforce PKCE at authorization server

#### Threat S2: Session Hijacking via Token Leakage
**Severity**: HIGH
**Component**: API Logging
**Description**: Access tokens logged in plaintext, accessible via log files
**Vulnerability**: Insecure logging practices
**Attack Vector**:
1. Attacker gains access to application logs
2. Searches for "Bearer" tokens
3. Extracts valid access tokens
4. Uses tokens to impersonate users

**Mitigation (Lab)**: None - tokens logged in full
**Mitigation (Production)**: Sanitize logs, redact sensitive data

### Tampering (Data)

#### Threat T1: OAuth State Parameter Missing
**Severity**: MEDIUM
**Component**: Frontend OAuth Implementation
**Description**: No state parameter = CSRF vulnerability in OAuth flow
**Vulnerability**: Missing CSRF protection
**Attack Vector**:
1. Attacker obtains authorization code for own account
2. Crafts link: `https://victim-app.com/callback?code=ATTACKER_CODE`
3. Victim clicks link while logged out
4. Victim logs into attacker's account, potentially exposing data

**Mitigation (Lab)**: None - state parameter not used
**Mitigation (Production)**: Generate and validate state parameter

#### Threat T2: Tenant Data Manipulation
**Severity**: CRITICAL
**Component**: API Resource Endpoints
**Description**: Inadequate tenant isolation allows cross-tenant data modification
**Vulnerability**: Missing authorization checks
**Attack Vector**:
1. User from Tenant A obtains valid token
2. Discovers resource ID from Tenant B
3. Sends PUT/DELETE request to modify/delete Tenant B resource
4. API doesn't validate tenant ownership

**Mitigation (Lab)**: None - tenant checks missing
**Mitigation (Production)**: Validate resource.tenant_id == token.tenant_id

### Repudiation (Non-repudiation)

#### Threat R1: Insufficient Audit Logging
**Severity**: LOW
**Component**: API Logging
**Description**: While the API logs requests, no structured audit trail exists for security events
**Vulnerability**: Lack of tamper-proof audit logs
**Impact**: Difficult to trace malicious activity or prove who did what

**Mitigation (Production)**:
- Implement structured audit logging
- Log all authz failures
- Use immutable log storage

### Information Disclosure (Confidentiality)

#### Threat I1: Cross-Tenant Data Leakage
**Severity**: CRITICAL
**Component**: API List/Get Endpoints
**Description**: Users can query resources from other tenants
**Vulnerability**: Broken access control (IDOR + tenant bypass)
**Attack Vector**:
1. User from Tenant 1 (tenant_id=1) logs in
2. Sends GET /api/v1/resources?tenant_id=2
3. API returns Tenant 2's resources
4. Alternative: GET /api/v1/resources/6 (Tenant 2 resource ID)

**Data at Risk**:
- Customer information
- Financial data
- Trade secrets
- API keys and credentials

**Mitigation (Lab)**: None - queries not validated
**Mitigation (Production)**: Force tenant_id from JWT token, validate resource ownership

#### Threat I2: Token Exposure in Browser Storage
**Severity**: MEDIUM
**Component**: Frontend Token Storage
**Description**: Access tokens stored in localStorage, vulnerable to XSS
**Vulnerability**: Client-side token storage
**Attack Vector**:
1. XSS vulnerability exists in application
2. Attacker injects malicious JavaScript
3. Script reads localStorage['access_token']
4. Sends token to attacker

**Mitigation (Lab)**: None - localStorage used for simplicity
**Mitigation (Production)**: Use httpOnly cookies or refresh token rotation

#### Threat I3: Weak Redirect URI Validation
**Severity**: HIGH
**Component**: Keycloak Client Configuration
**Description**: Wildcard redirect URIs allow code interception
**Vulnerability**: `http://*` accepted as valid redirect
**Attack Vector**:
1. Attacker crafts OAuth URL with malicious redirect_uri
2. `redirect_uri=http://attacker.com/callback`
3. Victim authenticates
4. Authorization code sent to attacker domain

**Mitigation (Lab)**: Wildcard URIs configured
**Mitigation (Production)**: Exact-match redirect_uri validation

### Denial of Service (Availability)

#### Threat D1: Resource Enumeration
**Severity**: LOW
**Component**: API Endpoints
**Description**: No rate limiting on resource queries
**Attack Vector**:
1. Attacker enumerates resource IDs (1,2,3...)
2. Makes thousands of requests
3. Maps out entire database structure

**Mitigation (Production)**: Implement rate limiting, use UUIDs instead of sequential IDs

#### Threat D2: Token Revocation Not Implemented
**Severity**: MEDIUM
**Component**: Token Management
**Description**: No way to revoke compromised tokens before expiration
**Attack Vector**:
1. Token leaked via logs
2. Admin discovers breach
3. No mechanism to invalidate token
4. Must wait for token expiration

**Mitigation (Production)**: Implement token blacklisting or short-lived tokens with refresh rotation

### Elevation of Privilege (Authorization)

#### Threat E1: Privilege Escalation via Tenant ID Manipulation
**Severity**: CRITICAL
**Component**: API Authorization Logic
**Description**: User can elevate privileges by accessing admin resources from other tenants
**Vulnerability**: No role-based access control, only tenant checks (and those are broken)
**Attack Vector**:
1. Regular user from Tenant A
2. Guesses admin resource ID from Tenant B
3. Accesses sensitive configuration or user data
4. Effectively gains admin privileges

**Mitigation (Lab)**: Not implemented
**Mitigation (Production)**: Implement RBAC, validate roles from token

#### Threat E2: Horizontal Privilege Escalation (IDOR)
**Severity**: CRITICAL
**Component**: Resource GET/PUT/DELETE Endpoints
**Description**: Users within same tenant can access each other's resources
**Vulnerability**: Only checks authentication, not ownership
**Attack Vector**:
1. Alice (Tenant 1) creates resource ID 10
2. Bob (Tenant 1) discovers ID via enumeration
3. Bob sends GET /api/v1/resources/10
4. Bob reads Alice's private resource

**Mitigation (Lab)**: Not implemented
**Mitigation (Production)**: Validate resource.owner_id == token.sub OR resource.is_public == true

## Attack Surface

### External Attack Surface
- **Frontend (Port 3000)**: XSS, CSRF on OAuth flow
- **Gateway (Port 80)**: Path traversal, SSRF
- **Keycloak (Port 8080)**: OAuth misconfig, credential stuffing

### Internal Attack Surface
- **API (Port 8000)**: IDOR, tenant isolation bypass, injection
- **Database (Port 5432)**: SQL injection (if present)
- **Redis (Port 6379)**: Unprotected cache access

## Data Flow Diagram

### OAuth Authorization Flow (Vulnerable)

```
User → Frontend: Click Login
Frontend → Browser: Redirect to Keycloak (NO STATE ⚠️)
Browser → Keycloak: GET /auth?code_challenge=X
Keycloak → User: Login page
User → Keycloak: Credentials
Keycloak → Browser: Redirect with code
Browser → Frontend: GET /callback?code=AUTH_CODE (NO STATE CHECK ⚠️)
Frontend → Keycloak: POST /token (with code_verifier)
Keycloak → Frontend: Access + Refresh tokens
Frontend → localStorage: Store tokens ⚠️
```

### API Resource Access (Vulnerable)

```
User → Frontend: Request resources
Frontend → API: GET /api/v1/resources?tenant_id=2 ⚠️
API → Middleware: Validate JWT ✓
Middleware → API: Return user data (tenant_id=1)
API → Database: SELECT * FROM resources WHERE tenant_id = 2 ⚠️
Database → API: Return Tenant 2 data
API → Frontend: Return unauthorized data ⚠️
```

## Security Control Summary

| Control | Status | Notes |
|---------|--------|-------|
| **Authentication** | ✅ Implemented | Keycloak OAuth 2.0 + OIDC |
| **PKCE** | ⚠️ Optional | Not enforced (VULNERABLE) |
| **State Parameter** | ❌ Missing | CSRF vulnerability |
| **Token Validation** | ✅ Implemented | JWT signature and expiration checked |
| **Authorization** | ❌ Broken | Tenant checks missing |
| **RBAC** | ❌ Missing | No role-based access control |
| **Audit Logging** | ⚠️ Partial | Logs exist but expose tokens |
| **Rate Limiting** | ❌ Missing | DoS risk |
| **Input Validation** | ⚠️ Partial | Basic Pydantic validation only |
| **HTTPS/TLS** | ❌ Disabled | HTTP only (lab environment) |
| **CORS** | ⚠️ Permissive | Wildcards allowed (lab only) |

## Risk Assessment

### Critical Risks (CVSS 9.0+)
1. **Tenant Isolation Bypass** - Complete multi-tenant security failure
2. **Horizontal Privilege Escalation (IDOR)** - Users access others' data

### High Risks (CVSS 7.0-8.9)
3. **PKCE Not Enforced** - Authorization code interception
4. **Token Leakage in Logs** - Session hijacking
5. **Weak Redirect URI Validation** - Code theft

### Medium Risks (CVSS 4.0-6.9)
6. **Missing State Parameter** - OAuth CSRF
7. **Token Storage in localStorage** - XSS exposure

### Low Risks (CVSS 0.1-3.9)
8. **Resource Enumeration** - Information disclosure
9. **No Rate Limiting** - DoS potential

## Remediation Priority

1. **Immediate (Critical)**:
   - Fix tenant isolation bypass
   - Implement IDOR protection
   - Sanitize logs

2. **Short Term (High)**:
   - Enforce PKCE
   - Fix redirect_uri validation
   - Add state parameter

3. **Medium Term (Medium)**:
   - Consider httpOnly cookies
   - Implement rate limiting
   - Add RBAC

## References

- OWASP Top 10 API Security Risks
- OWASP OAuth Cheat Sheet
- RFC 6749 (OAuth 2.0)
- RFC 7636 (PKCE)
- CWE-639: Authorization Bypass Through User-Controlled Key
- CWE-352: Cross-Site Request Forgery (CSRF)
