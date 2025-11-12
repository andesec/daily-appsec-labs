"""
Resources API endpoints

VULNERABILITY: Tenant isolation is NOT properly enforced
Users can access resources from other tenants by guessing/enumerating resource IDs
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import List, Dict, Any
import json
from ..models import ResourceCreate, ResourceUpdate, ResourceResponse, UserProfile
from ..middleware import auth_middleware
from ..database import db
from ..utils.logger import logger


router = APIRouter(prefix="/resources", tags=["resources"])


async def get_current_user_data(request) -> Dict[str, Any]:
    """Dependency to get current authenticated user"""
    return await auth_middleware.get_current_user(request)


@router.get("", response_model=List[ResourceResponse])
async def list_resources(
    tenant_id: int = Query(None, description="Filter by tenant ID"),
    user_data: Dict[str, Any] = Depends(get_current_user_data)
):
    """
    List resources

    VULNERABILITY: If tenant_id query parameter is provided, it's used directly
    without validating against the user's actual tenant_id from the token.
    This allows users to query resources from other tenants.
    """
    # Extract user's tenant from token
    user_tenant_id = user_data.get("tenant_id")

    logger.info(f"User tenant_id from token: {user_tenant_id}")

    # VULNERABILITY: If tenant_id is provided in query, use it without validation
    if tenant_id is not None:
        logger.warning(f"Using tenant_id from query parameter: {tenant_id} (user's tenant: {user_tenant_id})")
        query_tenant_id = tenant_id
    else:
        query_tenant_id = user_tenant_id

    # Query resources (VULNERABLE: might query wrong tenant)
    query = """
        SELECT r.id, r.tenant_id, r.owner_id, r.name, r.description,
               r.data, r.is_public, r.created_at, r.updated_at
        FROM resources r
        WHERE r.tenant_id = %s
        ORDER BY r.created_at DESC
    """

    try:
        resources = db.execute_query(query, (query_tenant_id,))
        return resources
    except Exception as e:
        logger.log_error(e, "list_resources")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch resources"
        )


@router.get("/{resource_id}", response_model=ResourceResponse)
async def get_resource(
    resource_id: int,
    user_data: Dict[str, Any] = Depends(get_current_user_data)
):
    """
    Get a specific resource by ID

    VULNERABILITY: Does NOT validate that the resource belongs to the user's tenant
    This is an Insecure Direct Object Reference (IDOR) vulnerability
    """
    user_tenant_id = user_data.get("tenant_id")

    # VULNERABLE: Query resource without tenant check
    query = """
        SELECT r.id, r.tenant_id, r.owner_id, r.name, r.description,
               r.data, r.is_public, r.created_at, r.updated_at
        FROM resources r
        WHERE r.id = %s
    """

    try:
        resources = db.execute_query(query, (resource_id,))

        if not resources:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Resource not found"
            )

        resource = resources[0]

        # VULNERABILITY: We fetch the resource but don't check if it belongs to user's tenant
        # This allows cross-tenant access
        logger.warning(
            f"User from tenant {user_tenant_id} accessing resource from tenant {resource['tenant_id']}"
        )

        return resource

    except HTTPException:
        raise
    except Exception as e:
        logger.log_error(e, "get_resource")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch resource"
        )


@router.post("", response_model=ResourceResponse, status_code=status.HTTP_201_CREATED)
async def create_resource(
    resource: ResourceCreate,
    user_data: Dict[str, Any] = Depends(get_current_user_data)
):
    """
    Create a new resource

    This endpoint properly assigns the resource to the user's tenant
    """
    user_tenant_id = user_data.get("tenant_id")
    user_email = user_data.get("email")

    # Get user ID from database
    user_query = "SELECT id FROM users WHERE email = %s"
    users = db.execute_query(user_query, (user_email,))

    if not users:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found in database"
        )

    user_id = users[0]["id"]

    # Insert resource with proper tenant association
    insert_query = """
        INSERT INTO resources (tenant_id, owner_id, name, description, data, is_public)
        VALUES (%s, %s, %s, %s, %s, %s)
        RETURNING id, tenant_id, owner_id, name, description, data, is_public, created_at, updated_at
    """

    try:
        # Convert data dict to JSON string for storage
        data_json = json.dumps(resource.data) if resource.data else None

        result = db.execute_query(
            insert_query,
            (
                user_tenant_id,
                user_id,
                resource.name,
                resource.description,
                data_json,
                resource.is_public
            )
        )

        if result:
            logger.info(f"Created resource {result[0]['id']} for tenant {user_tenant_id}")
            return result[0]
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create resource"
            )

    except Exception as e:
        logger.log_error(e, "create_resource")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create resource: {str(e)}"
        )


@router.put("/{resource_id}", response_model=ResourceResponse)
async def update_resource(
    resource_id: int,
    resource: ResourceUpdate,
    user_data: Dict[str, Any] = Depends(get_current_user_data)
):
    """
    Update a resource

    VULNERABILITY: Doesn't validate tenant ownership before update
    """
    user_tenant_id = user_data.get("tenant_id")

    # Build update query dynamically based on provided fields
    update_fields = []
    params = []

    if resource.name is not None:
        update_fields.append("name = %s")
        params.append(resource.name)

    if resource.description is not None:
        update_fields.append("description = %s")
        params.append(resource.description)

    if resource.data is not None:
        update_fields.append("data = %s")
        params.append(json.dumps(resource.data))

    if resource.is_public is not None:
        update_fields.append("is_public = %s")
        params.append(resource.is_public)

    if not update_fields:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update"
        )

    params.append(resource_id)

    # VULNERABLE: Update without checking tenant ownership
    update_query = f"""
        UPDATE resources
        SET {', '.join(update_fields)}, updated_at = CURRENT_TIMESTAMP
        WHERE id = %s
        RETURNING id, tenant_id, owner_id, name, description, data, is_public, created_at, updated_at
    """

    try:
        result = db.execute_query(update_query, tuple(params))

        if not result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Resource not found"
            )

        logger.warning(
            f"User from tenant {user_tenant_id} updated resource from tenant {result[0]['tenant_id']}"
        )

        return result[0]

    except HTTPException:
        raise
    except Exception as e:
        logger.log_error(e, "update_resource")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update resource"
        )


@router.delete("/{resource_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_resource(
    resource_id: int,
    user_data: Dict[str, Any] = Depends(get_current_user_data)
):
    """
    Delete a resource

    VULNERABILITY: Doesn't validate tenant ownership before deletion
    """
    user_tenant_id = user_data.get("tenant_id")

    # VULNERABLE: Delete without checking tenant ownership
    delete_query = "DELETE FROM resources WHERE id = %s"

    try:
        affected_rows = db.execute_update(delete_query, (resource_id,))

        if affected_rows == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Resource not found"
            )

        logger.warning(
            f"User from tenant {user_tenant_id} deleted resource {resource_id}"
        )

        return None

    except HTTPException:
        raise
    except Exception as e:
        logger.log_error(e, "delete_resource")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete resource"
        )
