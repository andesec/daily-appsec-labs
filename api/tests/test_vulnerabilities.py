"""
Tests to verify vulnerabilities and their fixes

These tests demonstrate the security issues in the lab
"""
import pytest
from fastapi.testclient import TestClient
import sys
import os

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from src.main import app


client = TestClient(app)


def test_health_endpoint():
    """Test that the API is running"""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


def test_unauthenticated_access_denied():
    """Test that unauthenticated requests are rejected"""
    response = client.get("/api/v1/resources")
    assert response.status_code == 401  # Unauthorized


# Note: The following tests require actual JWT tokens from Keycloak
# In a real pentest, you would obtain valid tokens and test tenant isolation

def test_tenant_isolation_bypass_with_query_param():
    """
    VULNERABILITY TEST: Tenant isolation bypass using query parameter

    This test demonstrates that users can access other tenants' data
    by manipulating the tenant_id query parameter

    To run this test:
    1. Start the lab environment
    2. Obtain a valid JWT token for a user in Tenant 1
    3. Replace 'VALID_TOKEN_TENANT_1' below with the actual token
    4. Run: pytest tests/test_vulnerabilities.py -v
    """
    # TODO: Replace with actual token from Keycloak
    token_tenant_1 = "VALID_TOKEN_TENANT_1"

    # Try to access Tenant 2's resources using Tenant 1's token
    headers = {"Authorization": f"Bearer {token_tenant_1}"}
    response = client.get("/api/v1/resources?tenant_id=2", headers=headers)

    # VULNERABLE: This should fail but currently succeeds
    # After fix: assert response.status_code == 403
    # Before fix: assert response.status_code == 200

    print(f"Tenant isolation test: Status {response.status_code}")
    print("If status is 200, tenant isolation is BYPASSED (vulnerable)")
    print("If status is 403, tenant isolation is ENFORCED (fixed)")


def test_idor_vulnerability():
    """
    VULNERABILITY TEST: Insecure Direct Object Reference (IDOR)

    Users can access resources from other tenants by guessing resource IDs

    To run this test:
    1. Obtain a valid token for Tenant 1
    2. Try to access a resource ID that belongs to Tenant 2
    """
    # TODO: Replace with actual token
    token_tenant_1 = "VALID_TOKEN_TENANT_1"

    # Try to access resource ID from Tenant 2
    tenant_2_resource_id = 6  # First resource of Tenant 2

    headers = {"Authorization": f"Bearer {token_tenant_1}"}
    response = client.get(f"/api/v1/resources/{tenant_2_resource_id}", headers=headers)

    # VULNERABLE: This should fail but currently succeeds
    print(f"IDOR test: Status {response.status_code}")
    print("If status is 200, IDOR vulnerability EXISTS (vulnerable)")
    print("If status is 403, IDOR vulnerability is FIXED (secure)")


def test_token_logging_vulnerability():
    """
    VULNERABILITY TEST: Token leakage in logs

    This test verifies that tokens are being logged (which they shouldn't be)

    To test manually:
    1. Make authenticated requests to the API
    2. Check the container logs: docker logs oauth-lab-api
    3. Search for "Bearer" in the logs
    4. If you see full tokens, the vulnerability exists
    """
    # This is more of a manual test - check the logs after making requests
    pass


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
