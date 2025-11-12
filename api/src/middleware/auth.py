"""
Authentication middleware for JWT token validation

VULNERABILITY: Tenant isolation is NOT enforced at the middleware level
The middleware validates the token but doesn't check if the user has access
to the requested tenant's resources.
"""
import httpx
from fastapi import Request, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from typing import Optional, Dict, Any
import json
from ..config import settings
from ..utils.logger import logger


# HTTP Bearer token scheme
security = HTTPBearer()


class AuthMiddleware:
    """
    JWT token validation middleware

    SECURITY ISSUE: Only validates token signature and expiration,
    does NOT validate tenant access permissions
    """

    def __init__(self):
        self.public_key_cache: Optional[str] = None
        self.issuer = f"{settings.keycloak_url}/realms/{settings.keycloak_realm}"

    async def get_public_key(self) -> str:
        """Fetch Keycloak's public key for JWT verification"""
        if self.public_key_cache:
            return self.public_key_cache

        try:
            certs_url = f"{self.issuer}/protocol/openid-connect/certs"
            async with httpx.AsyncClient() as client:
                response = await client.get(certs_url)
                response.raise_for_status()
                jwks = response.json()

                # Get the first key (simplified - production should handle key rotation)
                if jwks.get("keys"):
                    key_data = jwks["keys"][0]
                    # Convert JWKS to PEM format (simplified)
                    self.public_key_cache = key_data
                    return key_data
                else:
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail="No keys found in JWKS"
                    )
        except Exception as e:
            logger.error(f"Failed to fetch public key: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to fetch authentication keys"
            )

    async def verify_token(self, token: str) -> Dict[str, Any]:
        """
        Verify and decode JWT token

        VULNERABILITY: Only checks token validity, not tenant permissions
        """
        try:
            # For this lab, we'll use a simplified validation approach
            # In production, you should verify with the actual public key

            # Decode without verification first (for lab purposes)
            # SECURITY NOTE: This is intentionally simplified
            unverified_payload = jwt.get_unverified_claims(token)

            # Basic validation checks
            if "exp" in unverified_payload:
                # Token expiration is checked by jose library
                pass

            if "iss" in unverified_payload:
                if not unverified_payload["iss"].startswith(settings.keycloak_url):
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Invalid token issuer"
                    )

            # VULNERABILITY: We extract tenant_id but don't enforce it
            # The endpoint handlers are responsible for enforcement (and they don't do it properly)
            return unverified_payload

        except JWTError as e:
            logger.error(f"JWT validation error: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication token"
            )

    async def get_current_user(self, request: Request) -> Dict[str, Any]:
        """
        Extract and validate user from request

        VULNERABILITY: Logs the full authorization header with token
        """
        auth_header = request.headers.get("authorization")

        if not auth_header:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Missing authorization header"
            )

        # VULNERABLE: Log the full authorization header including token
        logger.log_request(
            method=request.method,
            path=str(request.url.path),
            headers={"authorization": auth_header}
        )

        # Extract token
        if not auth_header.startswith("Bearer "):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authorization header format"
            )

        token = auth_header.split(" ")[1]

        # Verify token
        user_data = await self.verify_token(token)

        # VULNERABLE: Log authentication with token
        logger.log_auth_attempt(
            email=user_data.get("email", "unknown"),
            tenant_id=user_data.get("tenant_id", 0),
            success=True,
            token=token
        )

        return user_data


# Global auth middleware instance
auth_middleware = AuthMiddleware()
