"""
OAuth Lab Resource API - Main Application

This API demonstrates OAuth 2.0 + PKCE in a multi-tenant SaaS environment
with intentional security vulnerabilities for educational purposes.
"""
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from .config import settings
from .routers import resources_router
from .utils.logger import logger


# Create FastAPI application
app = FastAPI(
    title=settings.api_title,
    version=settings.api_version,
    description="Multi-tenant Resource API with OAuth 2.0 authentication (Educational Lab)",
)

# CORS middleware - permissive for lab environment
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify exact origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Global exception handler"""
    logger.log_error(exc, f"Request to {request.url.path}")
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal server error"}
    )


# Health check endpoint
@app.get("/health", tags=["health"])
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "oauth-lab-api"}


# Profile endpoint
@app.get(f"{settings.api_prefix}/profile", tags=["user"])
async def get_profile(request: Request):
    """
    Get current user profile from token

    Returns the decoded token claims
    """
    from .middleware import auth_middleware

    try:
        user_data = await auth_middleware.get_current_user(request)
        return {
            "email": user_data.get("email"),
            "name": user_data.get("name"),
            "tenant_id": user_data.get("tenant_id"),
            "sub": user_data.get("sub"),
            "roles": user_data.get("realm_access", {}).get("roles", [])
        }
    except Exception as e:
        logger.log_error(e, "get_profile")
        return JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={"detail": "Authentication required"}
        )


# Include routers
app.include_router(resources_router, prefix=settings.api_prefix)


# Startup event
@app.on_event("startup")
async def startup_event():
    """Run on application startup"""
    logger.info(f"Starting {settings.api_title} v{settings.api_version}")
    logger.info(f"Keycloak URL: {settings.keycloak_url}")
    logger.info(f"Realm: {settings.keycloak_realm}")


# Shutdown event
@app.on_event("shutdown")
async def shutdown_event():
    """Run on application shutdown"""
    logger.info("Shutting down OAuth Lab API")


# Root endpoint
@app.get("/", tags=["root"])
async def root():
    """Root endpoint with API information"""
    return {
        "service": settings.api_title,
        "version": settings.api_version,
        "docs": "/docs",
        "health": "/health"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level=settings.log_level.lower()
    )
