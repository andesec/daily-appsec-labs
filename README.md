# Daily AppSec Labs

## Topic 1: Design OAuth 2.0 Authorization Code Flow with PKCE for a multi-tenant SaaS (SPA+API)

This lab demonstrates a complete OAuth 2.0 Authorization Code Flow with PKCE (Proof Key for Code Exchange) implementation for a multi-tenant SaaS application. The lab includes a React SPA frontend, FastAPI backend, Keycloak as the authorization server, and PostgreSQL for data persistence.

## Architecture

The lab consists of the following components:

- **Frontend**: React SPA (Single Page Application) with OAuth 2.0 PKCE flow
- **API**: FastAPI resource server with token validation and multi-tenant support
- **Auth Server**: Keycloak for OAuth 2.0/OIDC authentication and authorization
- **Database**: PostgreSQL for storing tenant and resource data
- **Cache**: Redis for session management and token caching
- **Gateway**: Nginx reverse proxy for routing requests

## Prerequisites

Before getting started, ensure you have the following installed:

- Docker (version 20.10 or later)
- Docker Compose (version 2.0 or later)
- Git

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/andesec/daily-appsec-labs.git
cd daily-appsec-labs
```

### 2. Create Environment File

Copy the example environment file and configure your environment variables:

```bash
cp .env.example .env
```

The `.env` file contains all necessary configuration for the lab. You can use the default values for local development, or customize them as needed.

### 3. Start the Lab Environment

Launch all services using Docker Compose:

```bash
docker-compose up -d
```

This command will:
- Pull all required Docker images
- Build the frontend and API containers
- Start all services (database, cache, auth server, API, frontend, gateway)
- Initialize the database with schema and seed data
- Import the Keycloak realm configuration

### 4. Verify Services

Check that all services are running:

```bash
docker-compose ps
```

All services should show status as "Up" or "healthy".

### 5. Access the Application

Once all services are running, you can access:

- **Frontend Application**: http://localhost
- **API Documentation**: http://localhost/api/v1/docs
- **Keycloak Admin Console**: http://localhost:8080
  - Username: `admin` (default)
  - Password: `admin` (default)

### 6. Test the OAuth Flow

1. Navigate to http://localhost in your browser
2. Click "Login" to initiate the OAuth 2.0 flow
3. You'll be redirected to Keycloak login page
4. Use one of the test accounts (see "Test Users" section below)
5. After successful authentication, you'll be redirected back to the application
6. The application will exchange the authorization code for tokens using PKCE
7. You can now access protected resources based on your tenant and permissions

## Test Users

The lab comes with pre-configured test users across different tenants:

**Tenant A - Acme Corp**
- Username: `alice@acme.com`
- Password: `password123`
- Role: Admin

- Username: `bob@acme.com`
- Password: `password123`
- Role: User

**Tenant B - TechCorp**
- Username: `charlie@techcorp.com`
- Password: `password123`
- Role: Admin

## Configuration

### Environment Variables

The `.env` file contains the following configuration sections:

**Database Configuration**
- `POSTGRES_DB`: Database name
- `POSTGRES_USER`: Database user
- `POSTGRES_PASSWORD`: Database password

**Keycloak Configuration**
- `KEYCLOAK_ADMIN`: Keycloak admin username
- `KEYCLOAK_ADMIN_PASSWORD`: Keycloak admin password
- `KEYCLOAK_URL`: Keycloak server URL
- `KEYCLOAK_REALM`: OAuth realm name
- `KEYCLOAK_CLIENT_ID`: Client ID for the API

**Frontend Configuration**
- `VITE_API_URL`: API endpoint URL
- `VITE_KEYCLOAK_URL`: Keycloak URL for frontend
- `VITE_KEYCLOAK_REALM`: Keycloak realm name
- `VITE_KEYCLOAK_CLIENT_ID`: Client ID for the SPA

## Common Commands

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f api
docker-compose logs -f frontend
docker-compose logs -f keycloak
```

### Restart Services

```bash
# Restart all services
docker-compose restart

# Restart specific service
docker-compose restart api
```

### Stop the Lab

```bash
# Stop all services
docker-compose down

# Stop and remove volumes (clean slate)
docker-compose down -v
```

### Rebuild Containers

```bash
# Rebuild after code changes
docker-compose up -d --build
```

## Project Structure

```
.
├── api/                    # FastAPI resource server
│   ├── src/
│   │   ├── middleware/     # Authentication middleware
│   │   ├── models/         # Data models
│   │   ├── routers/        # API endpoints
│   │   └── utils/          # Utility functions
│   └── tests/              # API tests
├── auth-server/            # Keycloak configuration
│   └── realm-config.json   # Realm import file
├── db/                     # Database initialization
│   └── init/               # SQL scripts
├── frontend/               # React SPA
│   └── src/
│       ├── auth/           # OAuth implementation
│       ├── components/     # React components
│       └── api/            # API client
├── gateway/                # Nginx reverse proxy
│   └── nginx.conf          # Nginx configuration
└── docker-compose.yml      # Docker services definition
```

## Security Features

This lab demonstrates several security best practices:

- **PKCE (Proof Key for Code Exchange)**: Protects against authorization code interception attacks
- **Multi-tenant Isolation**: Ensures users can only access resources within their tenant
- **Token Validation**: API validates JWT tokens on every request
- **Secure Token Storage**: Tokens stored in memory (not localStorage)
- **CORS Configuration**: Properly configured cross-origin requests
- **Rate Limiting**: Protection against brute force attacks
- **SQL Injection Prevention**: Parameterized queries using SQLAlchemy ORM

## Troubleshooting

### Services Won't Start

1. Check if ports are already in use:
   ```bash
   lsof -i :80 -i :3000 -i :8000 -i :8080 -i :5432 -i :6379
   ```

2. Ensure Docker has enough resources (at least 4GB RAM)

3. Check service logs for errors:
   ```bash
   docker-compose logs
   ```

### Keycloak Not Accessible

Keycloak can take 30-60 seconds to fully start. Check its health status:

```bash
docker-compose logs keycloak
```

Wait for the message: "Keycloak started"

### Database Connection Errors

Ensure the database is fully initialized:

```bash
docker-compose logs db
```

Try restarting the API service:

```bash
docker-compose restart api
```

### Frontend Can't Connect to API

Verify the gateway is running:

```bash
docker-compose ps gateway
```

Check the Nginx configuration and logs:

```bash
docker-compose logs gateway
```

## Learning Objectives

By completing this lab, you will understand:

1. How OAuth 2.0 Authorization Code Flow works
2. The importance and implementation of PKCE
3. Multi-tenant architecture and data isolation
4. Secure token handling in SPAs
5. API security with JWT validation
6. Common OAuth vulnerabilities and mitigations

## Additional Resources

- [OAuth 2.0 RFC 6749](https://tools.ietf.org/html/rfc6749)
- [PKCE RFC 7636](https://tools.ietf.org/html/rfc7636)
- [Keycloak Documentation](https://www.keycloak.org/documentation)
- [FastAPI Security Guide](https://fastapi.tiangolo.com/tutorial/security/)

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Contributing

This is a learning lab. Feel free to experiment, break things, and learn from the experience!
