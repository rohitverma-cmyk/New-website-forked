"""
Wishlist Feature Tests - Iteration 77

Tests for the customer wishlist feature:
- CRUD operations for wishlists
- Adding/removing fabrics from wishlists
- Sharing wishlists via public tokens
- Scope enforcement (user A can't access user B's wishlists)
- Public wishlist viewing (no auth required)
"""
import pytest
import requests
import os
import uuid
import jwt
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
# Use the actual JWT_SECRET from backend/.env
JWT_SECRET = os.environ.get('JWT_SECRET', '85bd413193d76ca28a56d133d273059006069f4eeb24860f4168925cd35f6467')

# Test fabric ID (known good from seed data)
TEST_FABRIC_ID = "005c9bda-1a80-4cba-ab3a-9e6bcd1b959a"


def create_test_customer_token(email: str, customer_id: str = None) -> str:
    """Create a test customer JWT token matching backend's expected format."""
    if not customer_id:
        customer_id = str(uuid.uuid4())
    payload = {
        "email": email,
        "customer_id": customer_id,
        "sub": customer_id,  # Some endpoints may check 'sub'
        "phone": "",
        "type": "customer",
        "exp": datetime.now(timezone.utc) + timedelta(days=1)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


@pytest.fixture
def customer_a_token():
    """Token for test customer A."""
    return create_test_customer_token("test_wishlist_a@locofast.com", str(uuid.uuid4()))


@pytest.fixture
def customer_b_token():
    """Token for test customer B (different user)."""
    return create_test_customer_token("test_wishlist_b@locofast.com", str(uuid.uuid4()))


@pytest.fixture
def api_client():
    """Shared requests session."""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


class TestWishlistAuth:
    """Test authentication requirements for wishlist endpoints."""
    
    def test_create_wishlist_requires_auth(self, api_client):
        """POST /api/wishlists should return 401 without auth."""
        response = api_client.post(f"{BASE_URL}/api/wishlists", json={"name": "Test"})
        assert response.status_code == 401, f"Expected 401, got {response.status_code}: {response.text}"
        print("PASS: Create wishlist requires auth (401 without token)")
    
    def test_list_wishlists_requires_auth(self, api_client):
        """GET /api/wishlists should return 401 without auth."""
        response = api_client.get(f"{BASE_URL}/api/wishlists")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}: {response.text}"
        print("PASS: List wishlists requires auth (401 without token)")


class TestWishlistCRUD:
    """Test CRUD operations for wishlists."""
    
    def test_create_wishlist_success(self, api_client, customer_a_token):
        """POST /api/wishlists creates a new wishlist with correct shape."""
        response = api_client.post(
            f"{BASE_URL}/api/wishlists",
            json={"name": "My Test Wishlist"},
            headers={"Authorization": f"Bearer {customer_a_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Verify response shape
        assert "id" in data, "Response should have 'id'"
        assert data["name"] == "My Test Wishlist", f"Name mismatch: {data.get('name')}"
        assert data["fabric_ids"] == [], "fabric_ids should be empty list"
        assert data["fabric_count"] == 0, "fabric_count should be 0"
        assert data["is_public"] == False, "is_public should be False"
        assert data["share_token"] == "", "share_token should be empty string"
        assert "created_at" in data, "Response should have 'created_at'"
        assert "updated_at" in data, "Response should have 'updated_at'"
        
        print(f"PASS: Created wishlist with id={data['id']}, correct shape verified")
        return data["id"]
    
    def test_list_wishlists(self, api_client, customer_a_token):
        """GET /api/wishlists returns list of user's wishlists."""
        # First create a wishlist
        create_resp = api_client.post(
            f"{BASE_URL}/api/wishlists",
            json={"name": "List Test Wishlist"},
            headers={"Authorization": f"Bearer {customer_a_token}"}
        )
        assert create_resp.status_code == 200
        
        # Then list
        response = api_client.get(
            f"{BASE_URL}/api/wishlists",
            headers={"Authorization": f"Bearer {customer_a_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        assert len(data) >= 1, "Should have at least 1 wishlist"
        
        # Verify list item shape
        wl = data[0]
        assert "id" in wl
        assert "name" in wl
        assert "fabric_count" in wl
        assert "is_public" in wl
        
        print(f"PASS: Listed {len(data)} wishlist(s)")
    
    def test_get_wishlist_detail(self, api_client, customer_a_token):
        """GET /api/wishlists/{id} returns full detail with items array."""
        # Create wishlist
        create_resp = api_client.post(
            f"{BASE_URL}/api/wishlists",
            json={"name": "Detail Test"},
            headers={"Authorization": f"Bearer {customer_a_token}"}
        )
        wl_id = create_resp.json()["id"]
        
        # Get detail
        response = api_client.get(
            f"{BASE_URL}/api/wishlists/{wl_id}",
            headers={"Authorization": f"Bearer {customer_a_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["id"] == wl_id
        assert "items" in data, "Detail response should include 'items' array"
        assert isinstance(data["items"], list)
        
        print(f"PASS: Got wishlist detail with items array")
    
    def test_update_wishlist_rename(self, api_client, customer_a_token):
        """PATCH /api/wishlists/{id} can rename a wishlist."""
        # Create
        create_resp = api_client.post(
            f"{BASE_URL}/api/wishlists",
            json={"name": "Original Name"},
            headers={"Authorization": f"Bearer {customer_a_token}"}
        )
        wl_id = create_resp.json()["id"]
        
        # Rename
        response = api_client.patch(
            f"{BASE_URL}/api/wishlists/{wl_id}",
            json={"name": "New Name"},
            headers={"Authorization": f"Bearer {customer_a_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["name"] == "New Name", f"Name not updated: {data.get('name')}"
        
        print("PASS: Renamed wishlist successfully")
    
    def test_delete_wishlist(self, api_client, customer_a_token):
        """DELETE /api/wishlists/{id} removes the wishlist."""
        # Create
        create_resp = api_client.post(
            f"{BASE_URL}/api/wishlists",
            json={"name": "To Delete"},
            headers={"Authorization": f"Bearer {customer_a_token}"}
        )
        wl_id = create_resp.json()["id"]
        
        # Delete
        response = api_client.delete(
            f"{BASE_URL}/api/wishlists/{wl_id}",
            headers={"Authorization": f"Bearer {customer_a_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") == True
        
        # Verify it's gone
        get_resp = api_client.get(
            f"{BASE_URL}/api/wishlists/{wl_id}",
            headers={"Authorization": f"Bearer {customer_a_token}"}
        )
        assert get_resp.status_code == 404, "Deleted wishlist should return 404"
        
        print("PASS: Deleted wishlist and verified 404 on re-fetch")


class TestWishlistItems:
    """Test adding/removing fabrics from wishlists."""
    
    def test_add_fabric_to_wishlist(self, api_client, customer_a_token):
        """POST /api/wishlists/{id}/items adds a fabric."""
        # Create wishlist
        create_resp = api_client.post(
            f"{BASE_URL}/api/wishlists",
            json={"name": "Items Test"},
            headers={"Authorization": f"Bearer {customer_a_token}"}
        )
        wl_id = create_resp.json()["id"]
        
        # First, get a valid fabric ID from the database
        fabrics_resp = api_client.get(f"{BASE_URL}/api/fabrics?limit=1")
        if fabrics_resp.status_code == 200 and fabrics_resp.json():
            fabric_id = fabrics_resp.json()[0]["id"]
        else:
            fabric_id = TEST_FABRIC_ID
        
        # Add fabric
        response = api_client.post(
            f"{BASE_URL}/api/wishlists/{wl_id}/items",
            json={"fabric_id": fabric_id},
            headers={"Authorization": f"Bearer {customer_a_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert fabric_id in data["fabric_ids"], "Fabric should be in fabric_ids"
        assert data["fabric_count"] == 1, f"fabric_count should be 1, got {data['fabric_count']}"
        
        print(f"PASS: Added fabric {fabric_id} to wishlist")
        return wl_id, fabric_id
    
    def test_add_fabric_idempotent(self, api_client, customer_a_token):
        """Adding same fabric twice should be idempotent (no duplicate)."""
        # Create and add fabric
        create_resp = api_client.post(
            f"{BASE_URL}/api/wishlists",
            json={"name": "Idempotent Test"},
            headers={"Authorization": f"Bearer {customer_a_token}"}
        )
        wl_id = create_resp.json()["id"]
        
        # Get a fabric
        fabrics_resp = api_client.get(f"{BASE_URL}/api/fabrics?limit=1")
        fabric_id = fabrics_resp.json()[0]["id"] if fabrics_resp.status_code == 200 and fabrics_resp.json() else TEST_FABRIC_ID
        
        # Add twice
        api_client.post(
            f"{BASE_URL}/api/wishlists/{wl_id}/items",
            json={"fabric_id": fabric_id},
            headers={"Authorization": f"Bearer {customer_a_token}"}
        )
        response = api_client.post(
            f"{BASE_URL}/api/wishlists/{wl_id}/items",
            json={"fabric_id": fabric_id},
            headers={"Authorization": f"Bearer {customer_a_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["fabric_count"] == 1, "Should still be 1 (idempotent)"
        
        print("PASS: Adding same fabric twice is idempotent")
    
    def test_add_nonexistent_fabric_404(self, api_client, customer_a_token):
        """Adding a non-existent fabric should return 404."""
        create_resp = api_client.post(
            f"{BASE_URL}/api/wishlists",
            json={"name": "404 Fabric Test"},
            headers={"Authorization": f"Bearer {customer_a_token}"}
        )
        wl_id = create_resp.json()["id"]
        
        response = api_client.post(
            f"{BASE_URL}/api/wishlists/{wl_id}/items",
            json={"fabric_id": "nonexistent-fabric-id-12345"},
            headers={"Authorization": f"Bearer {customer_a_token}"}
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        
        print("PASS: Adding non-existent fabric returns 404")
    
    def test_remove_fabric_from_wishlist(self, api_client, customer_a_token):
        """DELETE /api/wishlists/{id}/items/{fabric_id} removes a fabric."""
        # Create and add
        create_resp = api_client.post(
            f"{BASE_URL}/api/wishlists",
            json={"name": "Remove Test"},
            headers={"Authorization": f"Bearer {customer_a_token}"}
        )
        wl_id = create_resp.json()["id"]
        
        fabrics_resp = api_client.get(f"{BASE_URL}/api/fabrics?limit=1")
        fabric_id = fabrics_resp.json()[0]["id"] if fabrics_resp.status_code == 200 and fabrics_resp.json() else TEST_FABRIC_ID
        
        api_client.post(
            f"{BASE_URL}/api/wishlists/{wl_id}/items",
            json={"fabric_id": fabric_id},
            headers={"Authorization": f"Bearer {customer_a_token}"}
        )
        
        # Remove
        response = api_client.delete(
            f"{BASE_URL}/api/wishlists/{wl_id}/items/{fabric_id}",
            headers={"Authorization": f"Bearer {customer_a_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert fabric_id not in data["fabric_ids"], "Fabric should be removed"
        assert data["fabric_count"] == 0
        
        print("PASS: Removed fabric from wishlist")


class TestWishlistSharing:
    """Test wishlist sharing functionality."""
    
    def test_share_wishlist_generates_token(self, api_client, customer_a_token):
        """POST /api/wishlists/{id}/share generates a share token."""
        # Create wishlist with a fabric
        create_resp = api_client.post(
            f"{BASE_URL}/api/wishlists",
            json={"name": "Share Test"},
            headers={"Authorization": f"Bearer {customer_a_token}"}
        )
        wl_id = create_resp.json()["id"]
        
        # Share
        response = api_client.post(
            f"{BASE_URL}/api/wishlists/{wl_id}/share",
            json={},
            headers={"Authorization": f"Bearer {customer_a_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["is_public"] == True, "is_public should be True after sharing"
        assert data["share_token"], "share_token should be non-empty"
        assert len(data["share_token"]) > 10, "share_token should be reasonably long"
        
        print(f"PASS: Generated share token: {data['share_token'][:8]}...")
        return wl_id, data["share_token"]
    
    def test_regenerate_share_token(self, api_client, customer_a_token):
        """POST /api/wishlists/{id}/share with regenerate=true rotates token."""
        # Create and share
        create_resp = api_client.post(
            f"{BASE_URL}/api/wishlists",
            json={"name": "Regenerate Test"},
            headers={"Authorization": f"Bearer {customer_a_token}"}
        )
        wl_id = create_resp.json()["id"]
        
        share_resp = api_client.post(
            f"{BASE_URL}/api/wishlists/{wl_id}/share",
            json={},
            headers={"Authorization": f"Bearer {customer_a_token}"}
        )
        old_token = share_resp.json()["share_token"]
        
        # Regenerate
        response = api_client.post(
            f"{BASE_URL}/api/wishlists/{wl_id}/share",
            json={"regenerate": True},
            headers={"Authorization": f"Bearer {customer_a_token}"}
        )
        assert response.status_code == 200
        
        new_token = response.json()["share_token"]
        assert new_token != old_token, "Token should be different after regenerate"
        
        print("PASS: Regenerated share token (old token invalidated)")
    
    def test_revoke_share(self, api_client, customer_a_token):
        """PATCH /api/wishlists/{id} with is_public=false revokes share."""
        # Create and share
        create_resp = api_client.post(
            f"{BASE_URL}/api/wishlists",
            json={"name": "Revoke Test"},
            headers={"Authorization": f"Bearer {customer_a_token}"}
        )
        wl_id = create_resp.json()["id"]
        
        share_resp = api_client.post(
            f"{BASE_URL}/api/wishlists/{wl_id}/share",
            json={},
            headers={"Authorization": f"Bearer {customer_a_token}"}
        )
        share_token = share_resp.json()["share_token"]
        
        # Revoke
        response = api_client.patch(
            f"{BASE_URL}/api/wishlists/{wl_id}",
            json={"is_public": False},
            headers={"Authorization": f"Bearer {customer_a_token}"}
        )
        assert response.status_code == 200
        assert response.json()["is_public"] == False
        
        # Verify public endpoint now returns 404
        public_resp = api_client.get(f"{BASE_URL}/api/wishlists/share/{share_token}")
        assert public_resp.status_code == 404, "Revoked share should return 404"
        
        print("PASS: Revoked share, public endpoint returns 404")


class TestPublicWishlistView:
    """Test public wishlist viewing (no auth required)."""
    
    def test_public_view_no_auth_required(self, api_client, customer_a_token):
        """GET /api/wishlists/share/{token} works without auth."""
        # Create, add fabric, and share
        create_resp = api_client.post(
            f"{BASE_URL}/api/wishlists",
            json={"name": "Public View Test"},
            headers={"Authorization": f"Bearer {customer_a_token}"}
        )
        wl_id = create_resp.json()["id"]
        
        # Add a fabric
        fabrics_resp = api_client.get(f"{BASE_URL}/api/fabrics?limit=1")
        if fabrics_resp.status_code == 200 and fabrics_resp.json():
            fabric_id = fabrics_resp.json()[0]["id"]
            api_client.post(
                f"{BASE_URL}/api/wishlists/{wl_id}/items",
                json={"fabric_id": fabric_id},
                headers={"Authorization": f"Bearer {customer_a_token}"}
            )
        
        # Share
        share_resp = api_client.post(
            f"{BASE_URL}/api/wishlists/{wl_id}/share",
            json={},
            headers={"Authorization": f"Bearer {customer_a_token}"}
        )
        share_token = share_resp.json()["share_token"]
        
        # Access WITHOUT auth
        response = api_client.get(f"{BASE_URL}/api/wishlists/share/{share_token}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "name" in data, "Public view should have name"
        assert "fabric_count" in data, "Public view should have fabric_count"
        assert "items" in data, "Public view should have items array"
        assert "owner_display" in data, "Public view should have owner_display"
        # Should NOT expose email
        assert "user_email" not in data, "Public view should NOT expose user_email"
        
        print(f"PASS: Public view works without auth, owner_display={data.get('owner_display')}")
    
    def test_public_view_invalid_token_404(self, api_client):
        """GET /api/wishlists/share/{invalid_token} returns 404."""
        response = api_client.get(f"{BASE_URL}/api/wishlists/share/invalid-token-12345")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        
        print("PASS: Invalid share token returns 404")


class TestWishlistScopeEnforcement:
    """Test that users can only access their own wishlists."""
    
    def test_user_b_cannot_get_user_a_wishlist(self, api_client, customer_a_token, customer_b_token):
        """User B should get 404 when trying to access User A's wishlist."""
        # User A creates wishlist
        create_resp = api_client.post(
            f"{BASE_URL}/api/wishlists",
            json={"name": "User A's Private List"},
            headers={"Authorization": f"Bearer {customer_a_token}"}
        )
        wl_id = create_resp.json()["id"]
        
        # User B tries to access
        response = api_client.get(
            f"{BASE_URL}/api/wishlists/{wl_id}",
            headers={"Authorization": f"Bearer {customer_b_token}"}
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        
        print("PASS: User B cannot access User A's wishlist (404)")
    
    def test_user_b_cannot_update_user_a_wishlist(self, api_client, customer_a_token, customer_b_token):
        """User B should get 404 when trying to update User A's wishlist."""
        # User A creates
        create_resp = api_client.post(
            f"{BASE_URL}/api/wishlists",
            json={"name": "User A's List"},
            headers={"Authorization": f"Bearer {customer_a_token}"}
        )
        wl_id = create_resp.json()["id"]
        
        # User B tries to update
        response = api_client.patch(
            f"{BASE_URL}/api/wishlists/{wl_id}",
            json={"name": "Hacked Name"},
            headers={"Authorization": f"Bearer {customer_b_token}"}
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        
        print("PASS: User B cannot update User A's wishlist (404)")
    
    def test_user_b_cannot_delete_user_a_wishlist(self, api_client, customer_a_token, customer_b_token):
        """User B should get 404 when trying to delete User A's wishlist."""
        # User A creates
        create_resp = api_client.post(
            f"{BASE_URL}/api/wishlists",
            json={"name": "User A's Protected List"},
            headers={"Authorization": f"Bearer {customer_a_token}"}
        )
        wl_id = create_resp.json()["id"]
        
        # User B tries to delete
        response = api_client.delete(
            f"{BASE_URL}/api/wishlists/{wl_id}",
            headers={"Authorization": f"Bearer {customer_b_token}"}
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        
        # Verify it still exists for User A
        get_resp = api_client.get(
            f"{BASE_URL}/api/wishlists/{wl_id}",
            headers={"Authorization": f"Bearer {customer_a_token}"}
        )
        assert get_resp.status_code == 200, "Wishlist should still exist for owner"
        
        print("PASS: User B cannot delete User A's wishlist (404)")
    
    def test_user_b_cannot_add_items_to_user_a_wishlist(self, api_client, customer_a_token, customer_b_token):
        """User B should get 404 when trying to add items to User A's wishlist."""
        # User A creates
        create_resp = api_client.post(
            f"{BASE_URL}/api/wishlists",
            json={"name": "User A's Items List"},
            headers={"Authorization": f"Bearer {customer_a_token}"}
        )
        wl_id = create_resp.json()["id"]
        
        # Get a fabric
        fabrics_resp = api_client.get(f"{BASE_URL}/api/fabrics?limit=1")
        fabric_id = fabrics_resp.json()[0]["id"] if fabrics_resp.status_code == 200 and fabrics_resp.json() else TEST_FABRIC_ID
        
        # User B tries to add item
        response = api_client.post(
            f"{BASE_URL}/api/wishlists/{wl_id}/items",
            json={"fabric_id": fabric_id},
            headers={"Authorization": f"Bearer {customer_b_token}"}
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        
        print("PASS: User B cannot add items to User A's wishlist (404)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
