# Implementation Guide for Claude

## 🎯 Strategy: Maximize Use of Existing Components

### Pre-built Components (Use As-Is)
- ✅ **Keycloak**: Official Docker image `quay.io/keycloak/keycloak:latest`
  - Only need to provide realm configuration JSON
  - No custom code needed

- ✅ **PostgreSQL**: Official image `postgres:15-alpine`
  - Only need SQL schema and seed scripts

- ✅ **Redis**: Official image `redis:7-alpine`
  - Default configuration is sufficient

- ✅ **nginx**: Official image `nginx:alpine`
  - Only need custom nginx.conf

### Minimal Custom Code Required
- **Frontend (React)**: ~500 lines
  - OAuth PKCE helper functions
  - Simple UI components (Login, Dashboard, Resource List)
  - API client wrapper

- **API (FastAPI)**: ~400 lines
  - JWT validation middleware
  - Tenant isolation logic (intentionally flawed)
  - 4-5 simple CRUD endpoints
  - Logger with token leakage

### What NOT to Build
- ❌ Full-featured admin panels
- ❌ Complex user management
- ❌ Production-grade error handling
- ❌ Extensive test suites (only vuln verification tests)
- ❌ CI/CD pipelines
- ❌ Monitoring/observability stack
- ❌ Advanced security features beyond scope

---

## 📋 Implementation Checklist

### Batch 1: Foundation ✅
**Goal**: Project structure, orchestration, and documentation foundation

- [ ] Create directory structure
- [ ] Write `docker-compose.yml` with all 6 services
- [ ] Create `.env` file with all configuration
- [ ] Write root `README.md` with architecture diagram
- [ ] Create placeholder directories for all components
- [ ] **Checkpoint**: Can run `docker-compose config` without errors

**Key Decisions**:
- Use Docker Compose v2 syntax
- All services on same bridge network
- Named volumes for persistence

---

### Batch 2: Database & Auth Server ✅
**Goal**: Data layer and OAuth provider ready

#### Database Component
- [ ] Create `db/init/01-schema.sql` with 3 tables (tenants, users, resources)
- [ ] Create `db/init/02-seed.sql` with sample data
  - 2 tenants (TenantA, TenantB)
  - 3 users (alice, bob, charlie)
  - 5-10 resources split across tenants
- [ ] Add simple `db/scripts/reset-db.sh`
- [ ] Write `db/README.md`

#### Keycloak Configuration
- [ ] Create `auth-server/realm-config.json` (export format)
  - Realm: `saas-platform`
  - Public client: `spa-client` (VULNERABLE: PKCE not required)
  - Redirect URIs: wildcard pattern (VULNERABLE)
  - Users: alice, bob, charlie with passwords
  - Custom mapper: add `tenant_id` to access token
- [ ] Create minimal `auth-server/Dockerfile` (if needed for import)
- [ ] Write `auth-server/README.md` with login credentials
- [ ] **Checkpoint**: Keycloak starts and realm is imported

**Key Decisions**:
- Use Keycloak realm import feature
- Passwords: simple (password123) for demo
- No need for email verification

---

### Batch 3: Resource API (Backend) ✅
**Goal**: Working API with intentional vulnerabilities

#### Core API
- [ ] Create `api/requirements.txt`:
  - fastapi
  - uvicorn
  - python-jose[cryptography]
  - psycopg2-binary
  - redis
  - pydantic-settings
- [ ] Create `api/src/main.py` with FastAPI app
- [ ] Create `api/src/config.py` for environment vars
- [ ] Create `api/src/database.py` for PostgreSQL connection

#### Vulnerable Middleware
- [ ] Create `api/src/middleware/auth.py`:
  - JWT validation (verify signature, exp)
  - Extract tenant_id from token
  - **VULNERABLE**: Don't validate tenant_id against resource
- [ ] Create `api/src/utils/logger.py`:
  - **VULNERABLE**: Log full Authorization header

#### Endpoints
- [ ] Create `api/src/routers/resources.py`:
  - `GET /api/v1/resources` - List resources (tenant filter bypassed)
  - `POST /api/v1/resources` - Create resource
  - `GET /api/v1/resources/{id}` - Get single resource (IDOR)
  - `GET /api/v1/profile` - User info from token
- [ ] Create `api/src/models/resource.py` - Pydantic models

#### Tests
- [ ] Create `api/tests/test_vulnerabilities.py`:
  - Test PKCE bypass (requires Keycloak interaction)
  - Test tenant isolation bypass
  - Test token in logs
- [ ] Create `api/Dockerfile` (multistage build)
- [ ] Write `api/README.md`
- [ ] **Checkpoint**: API starts and connects to DB

**Key Decisions**:
- Use SQLAlchemy or raw SQL? → Raw SQL for simplicity
- Sync or async? → Async for modern practices
- Model validation? → Basic Pydantic models only

---

### Batch 4: Frontend (SPA) ✅
**Goal**: React app that demonstrates OAuth flow

#### Setup
- [ ] Create React app with Vite: `npm create vite@latest frontend -- --template react`
- [ ] Install dependencies:
  - react-router-dom
  - axios
- [ ] Create `frontend/src/auth/oauth.js`:
  - `generateCodeChallenge()` - PKCE S256
  - `initiateLogin()` - Redirect to Keycloak
  - **VULNERABLE**: No state parameter generation/validation
  - `handleCallback()` - Exchange code for token
  - `getAccessToken()` - Retrieve from localStorage

#### Components
- [ ] Create `frontend/src/components/Login.jsx`:
  - Login button
  - Display current user/tenant
- [ ] Create `frontend/src/components/Dashboard.jsx`:
  - Show user profile
  - List resources
  - Button to "attempt cross-tenant access" (for testing)
- [ ] Create `frontend/src/components/ResourceList.jsx`:
  - Display resources from API
  - Create new resource form
- [ ] Create `frontend/src/api/client.js`:
  - Axios instance with auth interceptor

#### Configuration
- [ ] Create `frontend/.env.example`
- [ ] Update `frontend/vite.config.js` for proxy (optional)
- [ ] Create `frontend/Dockerfile` (nginx to serve static build)
- [ ] Write `frontend/README.md`
- [ ] **Checkpoint**: Can login and see resources

**Key Decisions**:
- Keep UI minimal (no fancy styling)
- Use React hooks (no class components)
- Store tokens in localStorage (typical SPA pattern)

---

### Batch 5: Gateway & Infrastructure ✅
**Goal**: Reverse proxy and helper scripts

#### Gateway
- [ ] Create `gateway/nginx.conf`:
  - Location `/` → frontend (SPA)
  - Location `/api/` → api service
  - Location `/auth/` → keycloak service
  - CORS headers for development
- [ ] Create `gateway/Dockerfile` (if custom needed)
- [ ] Write `gateway/README.md`

#### Helper Scripts
- [ ] Create `scripts/build-all.sh`:
  - Build all Docker images
  - Verify builds succeeded
- [ ] Create `scripts/start-lab.sh`:
  - docker-compose up
  - Wait for services to be healthy
  - Display access URLs
- [ ] Create `scripts/reset-db.sh`:
  - Drop and recreate database
  - Re-run migrations
- [ ] Create `scripts/run-exploits.sh`:
  - Automated exploit demos
  - PKCE bypass test
  - Tenant isolation test
  - Save evidence to `/evidence/` folder
- [ ] Create `scripts/verify-fixes.sh`:
  - Run pytest tests
  - Check for specific security headers
  - Verify logs are sanitized
- [ ] Make all scripts executable
- [ ] **Checkpoint**: All scripts work end-to-end

**Key Decisions**:
- Scripts should be idempotent
- Include helpful output messages
- Fail fast with clear error messages

---

### Batch 6: Documentation & Pentest Guide ✅
**Goal**: Complete educational materials

#### Security Documentation
- [ ] Create `THREAT_MODEL.md`:
  - Attack surface analysis
  - Trust boundaries
  - Data flow diagrams
  - Threat enumeration (STRIDE)

- [ ] Create `PENTEST_PLAYBOOK.md`:
  - **Section 1**: Lab Setup
  - **Section 2**: Reconnaissance
    - Discover OAuth endpoints
    - Map API surface
  - **Section 3**: Exploitation (5 vulnerabilities)
    - For each: Context, Steps, Expected Result, Evidence
    - Actual curl/Burp commands
  - **Section 4**: Post-Exploitation
  - **Section 5**: Reporting Template

- [ ] Create `FIXES_AND_VERIFICATION.md`:
  - For each vulnerability:
    - Root cause explanation
    - Fix diff (before/after)
    - Verification command
    - Why fix works

#### Component Documentation
- [ ] Update `README.md` with:
  - Final architecture diagram
  - Quick start (3-command setup)
  - Learning path
  - Troubleshooting section
  - References to OAuth 2.0 RFCs

- [ ] Ensure each component has `README.md`:
  - Purpose
  - Configuration options
  - Development notes

#### Final Packaging
- [ ] Create `.gitignore` (node_modules, __pycache__, .env)
- [ ] Create `LICENSE` file (MIT or similar)
- [ ] Create `CONTRIBUTING.md` (optional)
- [ ] Run full test: clean slate → working lab (< 5 minutes)
- [ ] Create zip file: `oauth2-pkce-lab.zip`
- [ ] **Checkpoint**: Unzip and run on fresh system

---

## 🔍 Quality Checks

Before marking each batch complete:

### Functionality
- [ ] All containers build without errors
- [ ] All services start and are reachable
- [ ] Can complete full OAuth flow
- [ ] Can successfully exploit vulnerabilities
- [ ] Fixes actually prevent exploits

### Documentation
- [ ] No broken links in README files
- [ ] All commands have been tested
- [ ] Code snippets are accurate
- [ ] Screenshots/diagrams are clear

### Educational Value
- [ ] Vulnerabilities are realistic
- [ ] Exploits are repeatable
- [ ] Fixes are minimal and focused
- [ ] Learning progression is logical

---

## 🚨 Confirmation Points

**Ask user for approval before proceeding if**:
1. Keycloak configuration gets too complex
2. API needs more than 5 endpoints
3. Frontend needs advanced features (multi-step forms, etc.)
4. Need to add additional services
5. Documentation exceeds 2000 words per file

---

## 📦 Final Deliverable Checklist

- [ ] All 6 batches completed
- [ ] Zip file created: `oauth2-pkce-lab.zip`
- [ ] Zip contains complete project structure
- [ ] README.md has "Quick Start" section
- [ ] All scripts are executable and tested
- [ ] Can go from zero to running lab in < 5 commands
- [ ] Can demonstrate all 5 vulnerabilities
- [ ] Can apply all 5 fixes
- [ ] Automated tests verify fixes

---

## 🎯 Success Criteria

The lab is complete when a student can:
1. ✅ Run `docker-compose up -d` and access the app
2. ✅ Login through OAuth flow
3. ✅ Follow PENTEST_PLAYBOOK.md to exploit vulnerabilities
4. ✅ Collect evidence of successful exploits
5. ✅ Apply fixes from FIXES_AND_VERIFICATION.md
6. ✅ Run tests that prove vulnerabilities are fixed
7. ✅ Understand OAuth 2.0 + PKCE security principles

---

## 📝 Notes for Implementation

- **Minimize dependencies**: Fewer npm/pip packages = faster builds
- **Hardcode where appropriate**: This is a lab, not production
- **Comments over complexity**: Simple code with good comments
- **Fail loudly**: Better to crash than silently fail
- **Visual feedback**: Console logs showing what's happening

---

## Next Steps

1. ✅ User approves plan (PLAN.md)
2. ✅ User approves this guide (CLAUDE.md)
3. 🔄 Begin Batch 1: Foundation
4. 🔄 Get user approval after each batch
5. 🔄 Continue until Batch 6 complete
6. 🔄 Create final zip file
7. ✅ Lab ready for distribution

**Current Status**: Awaiting user approval to begin Batch 1
