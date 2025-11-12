# API Gateway (nginx)

## Overview
nginx reverse proxy that routes traffic to the appropriate backend services. Acts as the single entry point for the entire lab environment.

## Architecture

```
Client Browser
      ↓
   Gateway (nginx:80)
      ↓
      ├─→ /               → Frontend (SPA)
      ├─→ /api/*          → API Server
      ├─→ /auth/*         → Keycloak
      └─→ /realms/*       → Keycloak
```

## Routing Configuration

### Frontend Routes
- **Path**: `/`
- **Target**: `frontend:80`
- **Purpose**: Serve the React SPA
- **Special Handling**: SPA routing fallback to `index.html`

### API Routes
- **Path**: `/api/*`
- **Target**: `api:8000/api/*`
- **Purpose**: Proxy to FastAPI resource server
- **CORS**: Enabled (permissive for lab)

### Keycloak Routes
- **Path**: `/auth/*` - Keycloak admin console
- **Path**: `/realms/*` - OAuth/OIDC endpoints
- **Path**: `/resources/*` - Keycloak static resources
- **Target**: `keycloak:8080`
- **Purpose**: OAuth provider and user authentication

### Health Check
- **Path**: `/health`
- **Response**: `200 OK` with "healthy"
- **Purpose**: Container health monitoring

## Configuration Details

### Upstream Definitions
```nginx
upstream frontend {
    server frontend:80;
}

upstream api {
    server api:8000;
}

upstream keycloak {
    server keycloak:8080;
}
```

### CORS Configuration
The gateway adds permissive CORS headers for the lab environment:
```nginx
add_header Access-Control-Allow-Origin * always;
add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS" always;
add_header Access-Control-Allow-Headers "Authorization, Content-Type" always;
```

⚠️ **Note**: In production, replace `*` with specific origins.

### Proxy Headers
All proxied requests include standard headers:
- `Host`: Original host
- `X-Real-IP`: Client IP address
- `X-Forwarded-For`: Proxy chain
- `X-Forwarded-Proto`: Protocol (http/https)
- `X-Forwarded-Host`: Original host header

## Usage

### With Docker Compose (Recommended)
```bash
docker-compose up -d gateway
```

The gateway will be available at: http://localhost

### Standalone (for testing)
```bash
docker run -d \
  --name oauth-lab-gateway \
  -p 80:80 \
  -v $(pwd)/gateway/nginx.conf:/etc/nginx/nginx.conf:ro \
  --network oauth-lab-network \
  nginx:alpine
```

## Testing Routing

### Test Frontend
```bash
curl http://localhost/
# Should return HTML from React app
```

### Test API
```bash
curl http://localhost/api/v1/health
# Should return API health status
```

### Test Keycloak Discovery
```bash
curl http://localhost/realms/saas-platform/.well-known/openid-configuration
# Should return Keycloak OIDC discovery document
```

### Test Health Check
```bash
curl http://localhost/health
# Should return: healthy
```

## Logs

### View nginx Logs
```bash
# Access logs
docker logs oauth-lab-gateway

# Follow logs in real-time
docker logs -f oauth-lab-gateway
```

### Log Files Inside Container
```bash
# Access log
docker exec oauth-lab-gateway tail -f /var/log/nginx/access.log

# Error log
docker exec oauth-lab-gateway tail -f /var/log/nginx/error.log
```

## Troubleshooting

### Gateway Not Starting
```bash
# Check configuration syntax
docker run --rm -v $(pwd)/gateway/nginx.conf:/etc/nginx/nginx.conf:ro nginx:alpine nginx -t

# Check logs
docker logs oauth-lab-gateway
```

### 502 Bad Gateway Errors
This means the upstream service is not available.

**Check upstream services**:
```bash
# Verify all services are running
docker-compose ps

# Check if services are healthy
docker ps --format "table {{.Names}}\t{{.Status}}"

# Test upstream directly
docker exec oauth-lab-gateway wget -O- http://api:8000/health
docker exec oauth-lab-gateway wget -O- http://frontend:80
docker exec oauth-lab-gateway wget -O- http://keycloak:8080
```

### 504 Gateway Timeout
The upstream service is too slow to respond.

**Solutions**:
- Increase timeout values in nginx.conf
- Check upstream service performance
- Verify database connections

### CORS Issues
If you see CORS errors in browser console:

1. **Verify CORS headers are being added**:
```bash
curl -I http://localhost/api/v1/resources \
  -H "Origin: http://localhost:3000"
```

2. **Check preflight responses**:
```bash
curl -X OPTIONS http://localhost/api/v1/resources \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: Authorization" \
  -v
```

### Routing Not Working
**Test each route**:
```bash
# Frontend
curl -I http://localhost/

# API
curl -I http://localhost/api/v1/profile

# Keycloak
curl -I http://localhost/realms/saas-platform
```

If a route returns 404, check the nginx.conf location blocks.

## Performance Tuning

For better performance in production (not needed for lab):

```nginx
# Enable gzip compression
gzip on;
gzip_types text/plain text/css application/json application/javascript;

# Enable caching for static assets
location ~* \.(jpg|jpeg|png|gif|ico|css|js)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}

# Connection pooling to upstreams
upstream api {
    server api:8000 max_fails=3 fail_timeout=30s;
    keepalive 32;
}
```

## Security Considerations

### For Production (not implemented in lab):

1. **Enable HTTPS**:
```nginx
server {
    listen 443 ssl http2;
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
}
```

2. **Restrict CORS**:
```nginx
# Replace * with specific origin
add_header Access-Control-Allow-Origin https://app.example.com always;
```

3. **Add security headers**:
```nginx
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Strict-Transport-Security "max-age=31536000" always;
```

4. **Rate limiting**:
```nginx
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;

location /api/ {
    limit_req zone=api burst=20;
    proxy_pass http://api;
}
```

## Reload Configuration

After modifying nginx.conf:

```bash
# Test configuration
docker exec oauth-lab-gateway nginx -t

# Reload (graceful)
docker exec oauth-lab-gateway nginx -s reload

# Or restart container
docker-compose restart gateway
```

## Alternative: No Gateway

For development, you can run services on different ports without the gateway:
- Frontend: http://localhost:3000
- API: http://localhost:8000
- Keycloak: http://localhost:8080

However, you'll need to update CORS settings and environment variables accordingly.

## Resources

- [nginx Documentation](https://nginx.org/en/docs/)
- [nginx Reverse Proxy Guide](https://docs.nginx.com/nginx/admin-guide/web-server/reverse-proxy/)
- [nginx Load Balancing](https://docs.nginx.com/nginx/admin-guide/load-balancer/http-load-balancer/)
