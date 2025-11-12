# LAB PLAN: OAuth 2.0 Authorization Code Flow with PKCE (Multi-Tenant SaaS)

## 🎯 Learning Objectives

Students will understand:
- How OAuth 2.0 Authorization Code Flow with PKCE works in SPAs
- Multi-tenant isolation patterns in SaaS applications
- Common OAuth implementation vulnerabilities
- How to exploit and fix these vulnerabilities

---

## 🏗️ Architecture & Components

```
┌─────────────────────────────────────────────────────────────┐
│                         Browser (SPA)                        │
│                      React Frontend                          │
│              (Tenant A & Tenant B users)                     │
└────────────┬────────────────────────────────────────────────┘
             │
             ↓
┌────────────────────────────────────────────────────────────┐
│                     API Gateway (nginx)                     │
│                   Route: /api → API                         │
│                   Route: /auth → Keycloak                   │
└────────────┬──────────────────────────┬────────────────────┘
             │                          │
             ↓                          ↓
┌─────────────────────────┐   ┌──────────────────────────────┐
│   Authorization Server  │   │      Resource API Server      │
│      (Keycloak)         │   │    (Python FastAPI)           │
│  - OAuth 2.0 + OIDC     │   │  - Multi-tenant endpoints     │
│  - User management      │   │  - Token validation           │
│  - Client registration  │   │  - Business logic             │
└───────────┬─────────────┘   └──────────────┬───────────────┘
            │                                 │
            ↓                                 ↓
┌───────────────────────┐       ┌────────────────────────────┐
│  PostgreSQL Database  │       │      Redis Cache           │
│  - Users              │       │  - Sessions                │
│  - Tenants            │       │  - Token metadata          │
│  - Tenant data        │       │                            │
└───────────────────────┘       └────────────────────────────┘
```

---

## 📦 Component Breakdown

### 1. Frontend (SPA) - `/frontend`
- **Tech**: React + Vite
- **Purpose**: Demonstrates OAuth PKCE flow from a public client (SPA)
- **Features**:
  - Login button → initiates OAuth flow
  - PKCE code_challenge generation
  - Token exchange after callback
  - API calls with access tokens
  - Tenant switcher UI (for demo)
  - Display user's tenant-specific resources

### 2. API Gateway - `/gateway`
- **Tech**: nginx
- **Purpose**: Reverse proxy for routing and basic security
- **Routes**:
  - `/auth/*` → Keycloak
  - `/api/*` → Resource API
  - `/` → Frontend static files

### 3. Authorization Server - `/auth-server`
- **Tech**: Keycloak (preconfigured)
- **Purpose**: OAuth 2.0/OIDC provider
- **Configuration**:
  - Realm: `saas-platform`
  - Clients: `spa-client` (public), `api-client` (confidential)
  - Users:
    - `alice@tenantA.com` (Tenant A)
    - `bob@tenantA.com` (Tenant A)
    - `charlie@tenantB.com` (Tenant B)
  - Custom tenant claim in tokens

### 4. Resource API - `/api`
- **Tech**: Python FastAPI
- **Purpose**: Multi-tenant business API
- **Endpoints**:
  - `GET /api/v1/resources` - List tenant resources
  - `POST /api/v1/resources` - Create resource
  - `GET /api/v1/resources/{id}` - Get specific resource
  - `GET /api/v1/profile` - Get user profile
- **Security**: JWT validation, tenant isolation checks

### 5. Database - `/db`
- **Tech**: PostgreSQL
- **Schema**:
  - `tenants` table (id, name, domain)
  - `users` table (id, email, tenant_id)
  - `resources` table (id, name, data, tenant_id, owner_id)
- **Seed data**: Pre-populated tenants and resources

### 6. Cache - (using Redis image)
- **Tech**: Redis
- **Purpose**: Token metadata, rate limiting, session storage

---

## 🔓 Intentional Vulnerabilities

### Vulnerability 1: Missing PKCE Validation ⚠️
- **Where**: Authorization server configuration (Keycloak client settings)
- **Issue**: PKCE code_verifier not enforced or validated
- **Impact**: Attacker can steal authorization code and exchange it without code_verifier
- **Exploit**: Intercept authorization code, exchange without proper code_verifier

### Vulnerability 2: Tenant Isolation Bypass ⚠️
- **Where**: Resource API (`/api/src/middleware/auth.py`)
- **Issue**: Token validation succeeds but tenant claim not checked against resource tenant_id
- **Impact**: User from Tenant A can access Tenant B's resources
- **Exploit**: Use valid token to request resources with different tenant_id in path/query

### Vulnerability 3: Missing State Parameter Validation ⚠️
- **Where**: Frontend OAuth flow (`/frontend/src/auth/oauth.js`)
- **Issue**: State parameter not generated/validated (CSRF protection missing)
- **Impact**: CSRF attacks on OAuth flow
- **Exploit**: Craft malicious link that completes OAuth flow with attacker's code

### Vulnerability 4: Weak Redirect URI Validation ⚠️
- **Where**: Keycloak client configuration
- **Issue**: Overly permissive redirect_uri (wildcard or regex misconfiguration)
- **Impact**: Authorization code can be sent to attacker-controlled domain
- **Exploit**: Modify redirect_uri parameter to attacker domain

### Vulnerability 5: Token Leakage in Logs ⚠️
- **Where**: API server logging (`/api/src/utils/logger.py`)
- **Issue**: Access tokens logged in plaintext
- **Impact**: Tokens exposed in application logs
- **Exploit**: Access logs to retrieve valid tokens

---

## 🎯 Pentest Playbook Outline

### Phase 1: Reconnaissance
- Discover OAuth endpoints (`/.well-known/openid-configuration`)
- Identify client configuration
- Map application endpoints
- Enumerate users/tenants (if possible)

### Phase 2: Exploit Vulnerabilities
1. **Test PKCE Bypass**
   - Initiate OAuth flow
   - Intercept authorization code
   - Exchange code WITHOUT code_verifier
   - Document success/failure

2. **Test Tenant Isolation**
   - Authenticate as Tenant A user
   - Attempt to access Tenant B resources
   - Modify tenant_id in requests
   - Check API response

3. **Test State Parameter CSRF**
   - Initiate OAuth flow without state
   - Craft CSRF attack
   - Verify if attack succeeds

4. **Test Redirect URI Manipulation**
   - Modify redirect_uri parameter
   - Try variations (subdomain, path traversal)
   - Check if code sent to malicious URI

5. **Test Token Leakage**
   - Trigger errors with tokens
   - Check application logs
   - Search for token patterns

### Phase 3: Evidence Collection
- HTTP requests/responses (Burp Suite exports)
- Log excerpts showing exploitation
- Screenshots of unauthorized access
- Token dumps

---

## 🔧 Fixes & Verification

### Fix 1: Enable PKCE Enforcement
- **Patch**: Update Keycloak client settings to require PKCE
- **File**: `/auth-server/realm-config.json` or UI configuration
- **Verification**: Attempt code exchange without code_verifier → should fail with error

### Fix 2: Implement Tenant Isolation Middleware
- **Patch**: Add tenant validation in API middleware
- **File**: `/api/src/middleware/tenant_isolation.py`
- **Code**:
```python
def validate_tenant_access(token_tenant: str, resource_tenant_id: int):
    if token_tenant != resource_tenant_id:
        raise HTTPException(403, "Tenant isolation violation")
```
- **Verification**: Cross-tenant API call → 403 Forbidden

### Fix 3: Add State Parameter Validation
- **Patch**: Generate and validate state parameter in frontend
- **File**: `/frontend/src/auth/oauth.js`
- **Code**:
```javascript
const state = generateRandomString();
sessionStorage.setItem('oauth_state', state);
// Later: validate state matches
```
- **Verification**: CSRF attack attempt → fails due to state mismatch

### Fix 4: Strict Redirect URI Validation
- **Patch**: Configure exact redirect_uri in Keycloak (no wildcards)
- **File**: `/auth-server/realm-config.json`
- **Verification**: Modified redirect_uri → error from authorization server

### Fix 5: Sanitize Logs
- **Patch**: Redact tokens from logs
- **File**: `/api/src/utils/logger.py`
- **Code**:
```python
def sanitize_token(msg):
    return re.sub(r'Bearer [A-Za-z0-9\-\._~\+\/]+=*', 'Bearer [REDACTED]', msg)
```
- **Verification**: Check logs → tokens redacted

---

## 📚 Deliverables Structure

```
oauth2-pkce-multitenant-lab/
├── README.md                          # Main setup & architecture guide
├── docker-compose.yml                 # Orchestrator for all services
├── .env                               # Environment variables
├── THREAT_MODEL.md                    # Security analysis
├── PENTEST_PLAYBOOK.md               # Step-by-step exploitation guide
├── FIXES_AND_VERIFICATION.md         # Patch guide with test commands
│
├── frontend/                          # React SPA
│   ├── Dockerfile
│   ├── README.md
│   ├── package.json
│   ├── src/
│   │   ├── auth/                     # OAuth PKCE implementation
│   │   ├── components/               # UI components
│   │   └── api/                      # API client
│   └── .env.example
│
├── gateway/                           # nginx reverse proxy
│   ├── Dockerfile
│   ├── README.md
│   └── nginx.conf
│
├── auth-server/                       # Keycloak configuration
│   ├── Dockerfile
│   ├── README.md
│   ├── realm-config.json             # Keycloak realm export
│   └── scripts/
│       └── import-realm.sh
│
├── api/                               # FastAPI resource server
│   ├── Dockerfile
│   ├── README.md
│   ├── requirements.txt
│   ├── src/
│   │   ├── main.py
│   │   ├── middleware/
│   │   │   ├── auth.py              # Token validation
│   │   │   └── tenant_isolation.py  # Tenant checks
│   │   ├── routers/
│   │   │   └── resources.py
│   │   ├── models/
│   │   └── utils/
│   │       └── logger.py            # Logging utilities
│   └── tests/
│       └── test_vulnerabilities.py   # Automated vuln tests
│
├── db/                                # Database scripts
│   ├── Dockerfile
│   ├── README.md
│   ├── init/
│   │   ├── 01-schema.sql
│   │   └── 02-seed.sql
│   └── scripts/
│       └── reset-db.sh
│
└── scripts/                           # Helper scripts
    ├── build-all.sh
    ├── start-lab.sh
    ├── run-exploits.sh
    └── verify-fixes.sh
```

---

## ✅ Final Checklist Commands

```bash
# 1. Build all containers
./scripts/build-all.sh

# 2. Start all services
docker-compose up -d

# 3. Verify services are running
docker-compose ps

# 4. Seed database
./scripts/seed-db.sh

# 5. Access the lab
# Frontend: http://localhost:3000
# Keycloak: http://localhost:8080 (admin/admin)
# API Docs: http://localhost:8000/docs

# 6. Run exploits (before fixes)
./scripts/run-exploits.sh

# 7. Apply fixes
# (Manual: follow FIXES_AND_VERIFICATION.md)

# 8. Verify fixes with automated tests
docker-compose exec api pytest tests/test_vulnerabilities.py

# 9. Cleanup
docker-compose down -v
```

---

## 🔄 Implementation Batches

### Batch 1: Foundation
- Root README.md
- docker-compose.yml
- .env file
- Project structure

### Batch 2: Database & Auth Server
- PostgreSQL schema & seed data
- Keycloak configuration with intentional misconfigurations
- Redis setup

### Batch 3: Resource API (Backend)
- FastAPI application with vulnerable middleware
- Tenant isolation bypass vulnerability
- Token logging vulnerability
- API endpoints

### Batch 4: Frontend (SPA)
- React application
- OAuth PKCE flow (with missing state validation)
- Token management
- UI for testing multi-tenancy

### Batch 5: Gateway & Infrastructure
- nginx configuration
- Helper scripts (build, start, reset)
- Automated tests

### Batch 6: Documentation & Pentest Guide
- THREAT_MODEL.md
- PENTEST_PLAYBOOK.md (detailed exploitation steps)
- FIXES_AND_VERIFICATION.md
- Component READMEs
- Final zip packaging
