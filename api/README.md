# Resource API (FastAPI)

## Overview
Multi-tenant Resource API built with FastAPI. Implements OAuth 2.0 JWT validation with intentional security vulnerabilities for educational purposes.

## Architecture

### Components
- **FastAPI**: Modern Python web framework
- **JWT Validation**: Validates tokens from Keycloak
- **PostgreSQL**: Database for tenant and resource data
- **Pydantic**: Data validation and serialization

### Project Structure
```
api/
├── src/
│   ├── main.py              # FastAPI application entry point
│   ├── config.py            # Configuration management
│   ├── database.py          # Database connection utilities
│   ├── middleware/
│   │   └── auth.py          # JWT validation (VULNERABLE)
│   ├── routers/
│   │   └── resources.py     # Resource endpoints (VULNERABLE)
│   ├── models/
│   │   └── resource.py      # Pydantic models
│   └── utils/
│       └── logger.py        # Logging utility (VULNERABLE)
├── tests/
│   └── test_vulnerabilities.py
├── requirements.txt
├── Dockerfile
└── README.md
```

## Endpoints

### Public Endpoints
- `GET /` - API information
- `GET /health` - Health check

### Authenticated Endpoints
- `GET /api/v1/profile` - Get current user profile
- `GET /api/v1/resources` - List resources (VULNERABLE)
- `GET /api/v1/resources/{id}` - Get specific resource (VULNERABLE)
- `POST /api/v1/resources` - Create new resource
- `PUT /api/v1/resources/{id}` - Update resource (VULNERABLE)
- `DELETE /api/v1/resources/{id}` - Delete resource (VULNERABLE)

## Intentional Vulnerabilities

### 1. Tenant Isolation Bypass (Query Parameter Manipulation) ⚠️
**Location**: `src/routers/resources.py` - `list_resources()` endpoint

**Issue**: The `tenant_id` query parameter is not validated against the user's token. Users can specify any tenant_id to access other tenants' resources.

**Example**:
```bash
# User from Tenant 1 can access Tenant 2's resources
curl -H "Authorization: Bearer TOKEN_FROM_TENANT_1" \
  "http://localhost:8000/api/v1/resources?tenant_id=2"
```

### 2. Insecure Direct Object Reference (IDOR) ⚠️
**Location**: `src/routers/resources.py` - `get_resource()` endpoint

**Issue**: Resource IDs can be accessed without validating tenant ownership.

**Example**:
```bash
# User from Tenant 1 accessing Tenant 2's resource
curl -H "Authorization: Bearer TOKEN_FROM_TENANT_1" \
  "http://localhost:8000/api/v1/resources/6"
```

### 3. Token Leakage in Logs ⚠️
**Location**: `src/utils/logger.py` and `src/middleware/auth.py`

**Issue**: Full Authorization headers (including tokens) are logged in plaintext.

**Check**:
```bash
docker logs oauth-lab-api | grep "Bearer"
```

## Authentication

### JWT Token Structure
The API expects JWT tokens from Keycloak with the following claims:
```json
{
  "sub": "user-id",
  "email": "user@example.com",
  "tenant_id": 1,
  "name": "User Name",
  "exp": 1234567890
}
```

### Making Authenticated Requests
```bash
# Get token from Keycloak first (via OAuth flow)
TOKEN="your-jwt-token"

# Make authenticated request
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/v1/resources
```

## Running Locally

### With Docker Compose (Recommended)
```bash
cd /home/user/daily-appsec-labs
docker-compose up -d api
```

### Standalone (for development)
```bash
cd api

# Install dependencies
pip install -r requirements.txt

# Set environment variables
export DATABASE_URL="postgresql://labuser:labpass123@localhost:5432/oauth_lab_db"
export REDIS_URL="redis://localhost:6379"
export KEYCLOAK_URL="http://localhost:8080"
export KEYCLOAK_REALM="saas-platform"
export KEYCLOAK_CLIENT_ID="spa-client"

# Run the API
uvicorn src.main:app --reload --host 0.0.0.0 --port 8000
```

## API Documentation

Once running, access interactive API docs:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## Testing

### Run vulnerability tests
```bash
cd api
pytest tests/test_vulnerabilities.py -v
```

### Manual testing with curl

#### Get user profile
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:8000/api/v1/profile
```

#### List resources
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:8000/api/v1/resources
```

#### Test tenant isolation bypass
```bash
# If you're user in tenant 1, try accessing tenant 2's data
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:8000/api/v1/resources?tenant_id=2"
```

#### Test IDOR vulnerability
```bash
# Try accessing a resource ID from another tenant
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:8000/api/v1/resources/6
```

## Database Queries

The API uses raw SQL queries for simplicity:

```python
# Example: Vulnerable query without tenant check
query = "SELECT * FROM resources WHERE id = %s"  # Missing tenant validation!

# Secure version would be:
query = "SELECT * FROM resources WHERE id = %s AND tenant_id = %s"
```

## Security Fixes

### Fix 1: Enforce Tenant Isolation
**File**: `src/routers/resources.py`

```python
# Add tenant validation
if tenant_id is not None and tenant_id != user_tenant_id:
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Access denied: Cannot access other tenant's resources"
    )
```

### Fix 2: Validate Resource Ownership (IDOR)
**File**: `src/routers/resources.py`

```python
# Add tenant check to query
query = """
    SELECT * FROM resources
    WHERE id = %s AND tenant_id = %s
"""
result = db.execute_query(query, (resource_id, user_tenant_id))
```

### Fix 3: Sanitize Logs
**File**: `src/utils/logger.py`

```python
import re

def sanitize_token(message: str) -> str:
    # Redact tokens from log messages
    return re.sub(
        r'Bearer [A-Za-z0-9\-\._~\+\/]+=*',
        'Bearer [REDACTED]',
        message
    )
```

## Troubleshooting

### API won't start
```bash
# Check logs
docker logs oauth-lab-api

# Common issues:
# 1. Database not ready - wait 30s for db initialization
# 2. Keycloak not ready - wait 60s for keycloak startup
```

### Can't validate tokens
```bash
# Verify Keycloak is accessible from API container
docker exec oauth-lab-api curl http://keycloak:8080/realms/saas-platform

# Check token structure
echo "YOUR_TOKEN" | cut -d'.' -f2 | base64 -d | jq
```

### Database connection errors
```bash
# Test database connection
docker exec oauth-lab-api python -c "
from src.database import db
result = db.execute_query('SELECT COUNT(*) FROM resources')
print(result)
"
```

## Development Tips

- Use FastAPI's automatic docs at `/docs` for testing endpoints
- Enable debug mode by setting `LOG_LEVEL=DEBUG`
- Use `docker-compose logs -f api` to watch logs in real-time
- The API auto-reloads when code changes (in dev mode)

## Security Notes

⚠️ **This API is INTENTIONALLY VULNERABLE for educational purposes.**

Do NOT use this code in production. The vulnerabilities demonstrated are common real-world security mistakes that developers should avoid.
