"""
Configuration management for the OAuth Lab API
"""
from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """Application settings from environment variables"""

    # Database
    database_url: str = "postgresql://labuser:labpass123@db:5432/oauth_lab_db"

    # Redis
    redis_url: str = "redis://redis:6379"

    # Keycloak
    keycloak_url: str = "http://keycloak:8080"
    keycloak_realm: str = "saas-platform"
    keycloak_client_id: str = "spa-client"

    # API Settings
    api_title: str = "OAuth Lab Resource API"
    api_version: str = "1.0.0"
    api_prefix: str = "/api/v1"

    # Security (for token validation)
    algorithm: str = "RS256"

    # Logging
    log_level: str = "INFO"

    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()
