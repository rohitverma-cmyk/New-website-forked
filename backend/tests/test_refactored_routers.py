"""
Test suite for refactored routers: category_router, seller_router, collection_router
This tests the extraction of routes from server.py into separate router files.
All APIs should work identically to before the refactoring.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# ==================== FIXTURES ====================

@pytest.fixture(scope="module")
def admin_token():
    """Get admin authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@locofast.com",
        "password": "admin123"
    })
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip("Admin authentication failed - skipping authenticated tests")

@pytest.fixture
def auth_headers(admin_token):
    """Headers with admin auth token"""
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


# ==================== CATEGORY ROUTER TESTS ====================

class TestCategoryRouter:
    """Tests for category_router.py - Category CRUD extracted from server.py"""
    
    def test_get_categories_returns_list(self):
        """GET /api/categories returns list of categories"""
        response = requests.get(f"{BASE_URL}/api/categories")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ GET /api/categories returned {len(data)} categories")
    
    def test_get_categories_has_required_fields(self):
        """Categories have required fields: id, name"""
        response = requests.get(f"{BASE_URL}/api/categories")
        assert response.status_code == 200
        data = response.json()
        if len(data) > 0:
            category = data[0]
            assert "id" in category, "Category should have 'id' field"
            assert "name" in category, "Category should have 'name' field"
            print(f"✓ Category has required fields: id={category['id'][:8]}..., name={category['name']}")
    
    def test_create_category_requires_auth(self):
        """POST /api/categories requires admin authentication"""
        response = requests.post(f"{BASE_URL}/api/categories", json={
            "name": "TEST_Unauthorized Category"
        })
        assert response.status_code in [401, 403], f"Expected 401/403 without auth, got {response.status_code}"
        print("✓ POST /api/categories correctly requires authentication")
    
    def test_create_update_delete_category(self, auth_headers):
        """Full CRUD cycle for category (admin auth)"""
        # CREATE
        create_response = requests.post(f"{BASE_URL}/api/categories", 
            headers=auth_headers,
            json={"name": "TEST_Refactor Category", "description": "Testing refactored router"}
        )
        assert create_response.status_code == 200, f"Create failed: {create_response.text}"
        created = create_response.json()
        assert created["name"] == "TEST_Refactor Category"
        category_id = created["id"]
        print(f"✓ Created category: {category_id[:8]}...")
        
        # GET single category
        get_response = requests.get(f"{BASE_URL}/api/categories/{category_id}")
        assert get_response.status_code == 200, f"GET single failed: {get_response.text}"
        fetched = get_response.json()
        assert fetched["id"] == category_id
        print(f"✓ GET /api/categories/{category_id[:8]}... works")
        
        # UPDATE
        update_response = requests.put(f"{BASE_URL}/api/categories/{category_id}",
            headers=auth_headers,
            json={"name": "TEST_Updated Category"}
        )
        assert update_response.status_code == 200, f"Update failed: {update_response.text}"
        updated = update_response.json()
        assert updated["name"] == "TEST_Updated Category"
        print(f"✓ Updated category name")
        
        # DELETE
        delete_response = requests.delete(f"{BASE_URL}/api/categories/{category_id}",
            headers=auth_headers
        )
        assert delete_response.status_code == 200, f"Delete failed: {delete_response.text}"
        print(f"✓ Deleted category")
        
        # Verify deletion
        verify_response = requests.get(f"{BASE_URL}/api/categories/{category_id}")
        assert verify_response.status_code == 404, "Category should be deleted"
        print("✓ Category deletion verified")


# ==================== SELLER ROUTER TESTS ====================

class TestSellerRouter:
    """Tests for seller_router.py - Seller CRUD extracted from server.py"""
    
    def test_get_sellers_returns_list(self):
        """GET /api/sellers returns list of sellers"""
        response = requests.get(f"{BASE_URL}/api/sellers")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ GET /api/sellers returned {len(data)} sellers")
    
    def test_get_sellers_has_category_names(self):
        """Sellers include category_names field (enriched data)"""
        response = requests.get(f"{BASE_URL}/api/sellers")
        assert response.status_code == 200
        data = response.json()
        if len(data) > 0:
            seller = data[0]
            assert "id" in seller, "Seller should have 'id' field"
            assert "name" in seller, "Seller should have 'name' field"
            assert "company_name" in seller, "Seller should have 'company_name' field"
            assert "category_names" in seller, "Seller should have 'category_names' field"
            print(f"✓ Seller has required fields including category_names: {seller.get('company_name', 'N/A')}")
    
    def test_get_seller_by_id(self):
        """GET /api/sellers/{id} returns seller detail"""
        # First get list to find a seller ID
        list_response = requests.get(f"{BASE_URL}/api/sellers")
        assert list_response.status_code == 200
        sellers = list_response.json()
        if len(sellers) == 0:
            pytest.skip("No sellers in database")
        
        seller_id = sellers[0]["id"]
        response = requests.get(f"{BASE_URL}/api/sellers/{seller_id}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        seller = response.json()
        assert seller["id"] == seller_id
        assert "category_names" in seller
        print(f"✓ GET /api/sellers/{seller_id[:8]}... returned seller detail")
    
    def test_create_seller_requires_auth(self):
        """POST /api/sellers requires admin authentication"""
        response = requests.post(f"{BASE_URL}/api/sellers", json={
            "name": "TEST_Unauthorized",
            "company_name": "Test Co",
            "contact_email": "test@test.com",
            "contact_phone": "1234567890"
        })
        assert response.status_code in [401, 403], f"Expected 401/403 without auth, got {response.status_code}"
        print("✓ POST /api/sellers correctly requires authentication")
    
    def test_create_update_seller(self, auth_headers):
        """Create and update seller (admin auth)"""
        # CREATE
        create_response = requests.post(f"{BASE_URL}/api/sellers",
            headers=auth_headers,
            json={
                "name": "TEST_Refactor Seller",
                "company_name": "TEST_Refactor Mills",
                "contact_email": "test_refactor@test.com",
                "contact_phone": "9876543210",
                "city": "Mumbai",
                "state": "Maharashtra"
            }
        )
        assert create_response.status_code == 200, f"Create failed: {create_response.text}"
        created = create_response.json()
        assert created["name"] == "TEST_Refactor Seller"
        assert created["company_name"] == "TEST_Refactor Mills"
        assert "seller_code" in created, "Seller should have auto-generated seller_code"
        seller_id = created["id"]
        print(f"✓ Created seller: {seller_id[:8]}... with code {created.get('seller_code', 'N/A')}")
        
        # UPDATE
        update_response = requests.put(f"{BASE_URL}/api/sellers/{seller_id}",
            headers=auth_headers,
            json={"city": "Delhi", "state": "Delhi"}
        )
        assert update_response.status_code == 200, f"Update failed: {update_response.text}"
        updated = update_response.json()
        assert updated["city"] == "Delhi"
        print(f"✓ Updated seller city to Delhi")
        
        # Cleanup - delete the test seller
        delete_response = requests.delete(f"{BASE_URL}/api/sellers/{seller_id}",
            headers=auth_headers
        )
        assert delete_response.status_code == 200, f"Delete failed: {delete_response.text}"
        print(f"✓ Cleaned up test seller")


class TestCollectionCRUD:
    """Additional CRUD tests for collection_router.py"""
    
    def test_create_update_delete_collection(self, auth_headers):
        """Full CRUD cycle for collection (admin auth)"""
        # CREATE
        create_response = requests.post(f"{BASE_URL}/api/collections",
            headers=auth_headers,
            json={
                "name": "TEST_Refactor Collection",
                "description": "Testing refactored router",
                "is_featured": False
            }
        )
        assert create_response.status_code == 200, f"Create failed: {create_response.text}"
        created = create_response.json()
        assert created["name"] == "TEST_Refactor Collection"
        collection_id = created["id"]
        print(f"✓ Created collection: {collection_id[:8]}...")
        
        # GET single collection
        get_response = requests.get(f"{BASE_URL}/api/collections/{collection_id}")
        assert get_response.status_code == 200, f"GET single failed: {get_response.text}"
        fetched = get_response.json()
        assert fetched["id"] == collection_id
        print(f"✓ GET /api/collections/{collection_id[:8]}... works")
        
        # UPDATE
        update_response = requests.put(f"{BASE_URL}/api/collections/{collection_id}",
            headers=auth_headers,
            json={"name": "TEST_Updated Collection", "is_featured": True}
        )
        assert update_response.status_code == 200, f"Update failed: {update_response.text}"
        updated = update_response.json()
        assert updated["name"] == "TEST_Updated Collection"
        assert updated["is_featured"] == True
        print(f"✓ Updated collection name and featured status")
        
        # DELETE
        delete_response = requests.delete(f"{BASE_URL}/api/collections/{collection_id}",
            headers=auth_headers
        )
        assert delete_response.status_code == 200, f"Delete failed: {delete_response.text}"
        print(f"✓ Deleted collection")
        
        # Verify deletion
        verify_response = requests.get(f"{BASE_URL}/api/collections/{collection_id}")
        assert verify_response.status_code == 404, "Collection should be deleted"
        print("✓ Collection deletion verified")


# ==================== COLLECTION ROUTER TESTS ====================

class TestCollectionRouter:
    """Tests for collection_router.py - Collection CRUD extracted from server.py"""
    
    def test_get_collections_returns_list(self):
        """GET /api/collections returns list of collections"""
        response = requests.get(f"{BASE_URL}/api/collections")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ GET /api/collections returned {len(data)} collections")
    
    def test_get_featured_collections(self):
        """GET /api/collections/featured returns featured collections"""
        response = requests.get(f"{BASE_URL}/api/collections/featured")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        # All returned collections should be featured
        for coll in data:
            assert coll.get("is_featured") == True, "Featured endpoint should only return featured collections"
        print(f"✓ GET /api/collections/featured returned {len(data)} featured collections")
    
    def test_get_collection_by_id(self):
        """GET /api/collections/{id} returns collection detail"""
        # First get list to find a collection ID
        list_response = requests.get(f"{BASE_URL}/api/collections")
        assert list_response.status_code == 200
        collections = list_response.json()
        if len(collections) == 0:
            pytest.skip("No collections in database")
        
        collection_id = collections[0]["id"]
        response = requests.get(f"{BASE_URL}/api/collections/{collection_id}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        collection = response.json()
        assert collection["id"] == collection_id
        assert "fabric_count" in collection
        print(f"✓ GET /api/collections/{collection_id[:8]}... returned collection detail")
    
    def test_get_collection_fabrics(self):
        """GET /api/collections/{id}/fabrics returns enriched fabrics"""
        # First get list to find a collection with fabrics
        list_response = requests.get(f"{BASE_URL}/api/collections")
        assert list_response.status_code == 200
        collections = list_response.json()
        
        # Find a collection with fabrics
        collection_with_fabrics = None
        for coll in collections:
            if coll.get("fabric_count", 0) > 0 or len(coll.get("fabric_ids", [])) > 0:
                collection_with_fabrics = coll
                break
        
        if not collection_with_fabrics:
            pytest.skip("No collections with fabrics found")
        
        collection_id = collection_with_fabrics["id"]
        response = requests.get(f"{BASE_URL}/api/collections/{collection_id}/fabrics")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        fabrics = response.json()
        assert isinstance(fabrics, list)
        
        # Check enriched fields
        if len(fabrics) > 0:
            fabric = fabrics[0]
            assert "category_name" in fabric, "Fabric should have category_name"
            assert "seller_name" in fabric, "Fabric should have seller_name"
            print(f"✓ GET /api/collections/{collection_id[:8]}../fabrics returned {len(fabrics)} enriched fabrics")
        else:
            print(f"✓ GET /api/collections/{collection_id[:8]}../fabrics returned empty list (collection has no fabrics)")
    
    def test_create_collection_requires_auth(self):
        """POST /api/collections requires admin authentication"""
        response = requests.post(f"{BASE_URL}/api/collections", json={
            "name": "TEST_Unauthorized Collection"
        })
        assert response.status_code in [401, 403], f"Expected 401/403 without auth, got {response.status_code}"
        print("✓ POST /api/collections correctly requires authentication")


# ==================== REGRESSION TESTS ====================

class TestRegressionFabrics:
    """Regression tests for fabrics (still in server.py)"""
    
    def test_get_fabrics_returns_list_with_slugs(self):
        """GET /api/fabrics returns fabrics with slug field"""
        response = requests.get(f"{BASE_URL}/api/fabrics?limit=5")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert isinstance(data, list)
        if len(data) > 0:
            fabric = data[0]
            assert "slug" in fabric, "Fabric should have slug field"
            assert "id" in fabric
            print(f"✓ GET /api/fabrics returns fabrics with slugs (sample: {fabric.get('slug', 'N/A')[:30]}...)")
    
    def test_get_fabric_by_slug(self):
        """GET /api/fabrics/{slug} works for slug-based lookup"""
        # Get a fabric to find its slug
        list_response = requests.get(f"{BASE_URL}/api/fabrics?limit=1")
        assert list_response.status_code == 200
        fabrics = list_response.json()
        if len(fabrics) == 0:
            pytest.skip("No fabrics in database")
        
        fabric_slug = fabrics[0].get("slug")
        if not fabric_slug:
            pytest.skip("Fabric has no slug")
        
        response = requests.get(f"{BASE_URL}/api/fabrics/{fabric_slug}")
        assert response.status_code == 200, f"Slug lookup failed: {response.status_code}"
        print(f"✓ GET /api/fabrics/{fabric_slug[:20]}... works")


class TestRegressionCommission:
    """Regression tests for commission system"""
    
    def test_get_commission_rules(self):
        """GET /api/commission/rules works"""
        response = requests.get(f"{BASE_URL}/api/commission/rules")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Commission rules should be a list"
        print(f"✓ GET /api/commission/rules returned {len(data)} rules")


class TestRegressionAuth:
    """Regression tests for authentication"""
    
    def test_admin_login_works(self):
        """Admin login with correct credentials works"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@locofast.com",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Admin login failed: {response.status_code} - {response.text}"
        data = response.json()
        assert "token" in data, "Login response should have token"
        assert "admin" in data, "Login response should have admin info"
        print(f"✓ Admin login works - token received")
    
    def test_agent_otp_send_endpoint(self):
        """Agent OTP send endpoint exists and returns valid response"""
        response = requests.post(f"{BASE_URL}/api/agent/send-otp", json={
            "email": "agent@locofast.com"
        })
        # Should return 200 (OTP sent) or 404 (agent not found) - both are valid responses
        assert response.status_code in [200, 404], f"Unexpected status: {response.status_code}"
        print(f"✓ Agent OTP endpoint responds correctly (status: {response.status_code})")


# ==================== ADDITIONAL REGRESSION TESTS ====================

class TestRegressionFabricCMS:
    """Regression tests for fabric-sourcing-cms specific endpoints"""
    
    def test_get_fabrics_filter_options(self):
        """GET /api/fabrics/filter-options works"""
        response = requests.get(f"{BASE_URL}/api/fabrics/filter-options")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "colors" in data
        assert "patterns" in data
        assert "widths" in data
        print(f"✓ GET /api/fabrics/filter-options works")
    
    def test_get_fabrics_count(self):
        """GET /api/fabrics/count works"""
        response = requests.get(f"{BASE_URL}/api/fabrics/count")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "count" in data
        print(f"✓ GET /api/fabrics/count returned {data['count']} fabrics")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
