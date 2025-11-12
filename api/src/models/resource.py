"""
Pydantic models for resources
"""
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from datetime import datetime


class ResourceCreate(BaseModel):
    """Model for creating a new resource"""
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    data: Optional[Dict[str, Any]] = None
    is_public: bool = False


class ResourceUpdate(BaseModel):
    """Model for updating a resource"""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    data: Optional[Dict[str, Any]] = None
    is_public: Optional[bool] = None


class ResourceResponse(BaseModel):
    """Model for resource response"""
    id: int
    tenant_id: int
    owner_id: int
    name: str
    description: Optional[str]
    data: Optional[Dict[str, Any]]
    is_public: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class UserProfile(BaseModel):
    """Model for user profile from token"""
    email: str
    tenant_id: int
    name: Optional[str] = None
    sub: str  # Subject (user ID from Keycloak)


class ErrorResponse(BaseModel):
    """Standard error response"""
    detail: str
