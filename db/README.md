# Database Component

## Overview
PostgreSQL database for the OAuth 2.0 + PKCE Multi-Tenant SaaS Lab.

## Schema

### Tables

1. **tenants**
   - Stores tenant/organization information
   - Fields: id, name, domain, timestamps

2. **users**
   - Links to Keycloak users via email
   - Each user belongs to one tenant
   - Fields: id, email, tenant_id, full_name, is_active, timestamps

3. **resources**
   - Tenant-specific business data
   - Each resource belongs to one tenant and one owner
   - Fields: id, tenant_id, owner_id, name, description, data (JSONB), is_public, timestamps

## Seed Data

### Tenants
- **Tenant 1**: Acme Corporation (acme.example.com)
- **Tenant 2**: Beta Industries (beta.example.com)

### Users
- **alice@acme.example.com** - Tenant 1 (Acme)
- **bob@acme.example.com** - Tenant 1 (Acme)
- **charlie@beta.example.com** - Tenant 2 (Beta)

### Resources
- 5 resources for Acme Corporation (including sensitive data)
- 5 resources for Beta Industries (including confidential documents)

## Initialization

The database is automatically initialized when the container starts:
1. `01-schema.sql` creates tables and indexes
2. `02-seed.sql` populates sample data

## Manual Reset

To manually reset the database:

```bash
# Connect to the database container
docker exec -it oauth-lab-db psql -U labuser -d oauth_lab_db

# Drop and recreate (WARNING: destroys all data)
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO labuser;
GRANT ALL ON SCHEMA public TO public;

# Then restart the container to re-run init scripts
docker-compose restart db
```

## Connection Information

- **Host**: localhost
- **Port**: 5432
- **Database**: oauth_lab_db
- **Username**: labuser
- **Password**: labpass123

## Querying Data

```sql
-- View all tenants
SELECT * FROM tenants;

-- View all users
SELECT u.*, t.name as tenant_name
FROM users u
JOIN tenants t ON u.tenant_id = t.id;

-- View all resources by tenant
SELECT r.*, t.name as tenant_name, u.full_name as owner_name
FROM resources r
JOIN tenants t ON r.tenant_id = t.id
JOIN users u ON r.owner_id = u.id
ORDER BY t.id, r.id;

-- Check tenant isolation
SELECT tenant_id, COUNT(*) as resource_count
FROM resources
GROUP BY tenant_id;
```
