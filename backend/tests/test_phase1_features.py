"""
B2B Fabric Sourcing Platform - Phase 1 Backend Tests
Tests for:
- Seller CRUD with is_active toggle and seller_code generation
- Article CRUD with article_code generation
- Fabrics with inventory fields (quantity_available, rate_per_meter, dispatch_timeline, is_bookable)
- Fabrics with denim fields (weft_shrinkage, stretch_percentage)
- Fabrics with article_id linking and seller_sku
- Stats endpoint with new fields (articles, active_sellers, bookable_fabrics)
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
ADMIN_EMAIL = "admin@locofast.com"
ADMIN_PASSWORD = "admin123"


@pytest.fixture(scope="module")
def auth_token():
    """Get auth token once for all tests"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    return response.json()["token"]


@pytest.fixture(scope="module")
def category_id():
    """Get a category ID for fabric tests"""
    response = requests.get(f"{BASE_URL}/api/categories")
    categories = response.json()
    return categories[0]["id"] if categories else None


class TestSellerPhase1Features:
    """Test Seller CRUD with new Phase 1 fields: is_active, seller_code"""

    def test_create_seller_generates_seller_code(self, auth_token):
        """Test that creating a seller auto-generates seller_code like LS-XXXXX"""
        seller_data = {
            "name": "TEST_Phase1 Seller",
            "company_name": "TEST_Phase1 Company",
            "is_active": True
        }
        
        response = requests.post(f"{BASE_URL}/api/sellers",
            json=seller_data,
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200, f"Create seller failed: {response.text}"
        data = response.json()
        
        # Verify seller_code is generated
        assert "seller_code" in data, "seller_code not in response"
        assert data["seller_code"].startswith("LS-"), f"Invalid seller_code format: {data['seller_code']}"
        assert len(data["seller_code"]) == 8, f"seller_code should be 8 chars (LS-XXXXX): {data['seller_code']}"
        
        # Verify is_active
        assert data["is_active"] == True
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/sellers/{data['id']}",
            headers={"Authorization": f"Bearer {auth_token}"})
        print(f"PASS: Seller created with seller_code={data['seller_code']}")

    def test_seller_is_active_toggle(self, auth_token):
        """Test seller activation/deactivation toggle"""
        # Create active seller
        seller_data = {
            "name": "TEST_Active Seller",
            "company_name": "TEST_Active Company",
            "is_active": True
        }
        
        create_res = requests.post(f"{BASE_URL}/api/sellers",
            json=seller_data,
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        seller_id = create_res.json()["id"]
        
        # Deactivate seller
        update_res = requests.put(f"{BASE_URL}/api/sellers/{seller_id}",
            json={"is_active": False},
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert update_res.status_code == 200
        assert update_res.json()["is_active"] == False
        
        # Verify GET returns is_active=false
        get_res = requests.get(f"{BASE_URL}/api/sellers/{seller_id}")
        assert get_res.json()["is_active"] == False
        
        # Reactivate seller
        update_res2 = requests.put(f"{BASE_URL}/api/sellers/{seller_id}",
            json={"is_active": True},
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert update_res2.json()["is_active"] == True
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/sellers/{seller_id}",
            headers={"Authorization": f"Bearer {auth_token}"})
        print("PASS: Seller is_active toggle works")

    def test_get_sellers_filters_inactive_by_default(self, auth_token):
        """Test that GET /sellers excludes inactive sellers by default"""
        # Create inactive seller
        seller_data = {
            "name": "TEST_Inactive Seller",
            "company_name": "TEST_Inactive Company",
            "is_active": False
        }
        
        create_res = requests.post(f"{BASE_URL}/api/sellers",
            json=seller_data,
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        seller_id = create_res.json()["id"]
        
        # GET without include_inactive should not include this seller
        get_res = requests.get(f"{BASE_URL}/api/sellers")
        sellers = get_res.json()
        seller_ids = [s["id"] for s in sellers]
        assert seller_id not in seller_ids, "Inactive seller should not appear in default list"
        
        # GET with include_inactive=true should include this seller
        get_res2 = requests.get(f"{BASE_URL}/api/sellers?include_inactive=true")
        sellers2 = get_res2.json()
        seller_ids2 = [s["id"] for s in sellers2]
        assert seller_id in seller_ids2, "Inactive seller should appear when include_inactive=true"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/sellers/{seller_id}",
            headers={"Authorization": f"Bearer {auth_token}"})
        print("PASS: GET /sellers filters inactive sellers correctly")


class TestArticleCRUD:
    """Test Article CRUD with article_code generation"""

    def test_create_article_generates_article_code(self, auth_token):
        """Test that creating an article auto-generates article_code like ART-XXXXX"""
        article_data = {
            "name": "TEST_Article Name",
            "description": "Test article description"
        }
        
        response = requests.post(f"{BASE_URL}/api/articles",
            json=article_data,
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200, f"Create article failed: {response.text}"
        data = response.json()
        
        # Verify article_code is generated
        assert "article_code" in data, "article_code not in response"
        assert data["article_code"].startswith("ART-"), f"Invalid article_code format: {data['article_code']}"
        assert len(data["article_code"]) == 9, f"article_code should be 9 chars (ART-XXXXX): {data['article_code']}"
        
        # Verify other fields
        assert data["name"] == "TEST_Article Name"
        assert data["variant_count"] == 0
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/articles/{data['id']}",
            headers={"Authorization": f"Bearer {auth_token}"})
        print(f"PASS: Article created with article_code={data['article_code']}")

    def test_article_crud_operations(self, auth_token, category_id):
        """Test full CRUD operations on articles"""
        # Get a seller
        sellers_res = requests.get(f"{BASE_URL}/api/sellers")
        sellers = sellers_res.json()
        seller_id = sellers[0]["id"] if sellers else None
        
        # Create
        article_data = {
            "name": "TEST_CRUD Article",
            "description": "Article for CRUD testing",
            "seller_id": seller_id,
            "category_id": category_id
        }
        
        create_res = requests.post(f"{BASE_URL}/api/articles",
            json=article_data,
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert create_res.status_code == 200
        article_id = create_res.json()["id"]
        
        # Read
        get_res = requests.get(f"{BASE_URL}/api/articles/{article_id}")
        assert get_res.status_code == 200
        data = get_res.json()
        assert data["name"] == "TEST_CRUD Article"
        if seller_id:
            assert data["seller_id"] == seller_id
        
        # Update
        update_res = requests.put(f"{BASE_URL}/api/articles/{article_id}",
            json={"name": "TEST_Updated Article", "description": "Updated description"},
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert update_res.status_code == 200
        assert update_res.json()["name"] == "TEST_Updated Article"
        
        # Delete
        delete_res = requests.delete(f"{BASE_URL}/api/articles/{article_id}",
            headers={"Authorization": f"Bearer {auth_token}"})
        assert delete_res.status_code == 200
        
        # Verify deleted
        get_res2 = requests.get(f"{BASE_URL}/api/articles/{article_id}")
        assert get_res2.status_code == 404
        
        print("PASS: Article CRUD operations work correctly")


class TestFabricInventoryFields:
    """Test Fabric with new inventory fields"""

    def test_create_fabric_with_inventory_fields(self, auth_token, category_id):
        """Test fabric creation with quantity_available, rate_per_meter, dispatch_timeline, is_bookable"""
        fabric_data = {
            "name": "TEST_Inventory Fabric",
            "category_id": category_id,
            "fabric_type": "woven",
            "pattern": "Solid",
            "composition": [{"material": "Cotton", "percentage": 100}],
            "gsm": 180,
            "width": "58 inches",
            "warp_count": "76",
            "weft_count": "68",
            "color": "White",
            "moq": "500 meters",
            "description": "Test fabric with inventory fields",
            "tags": ["test"],
            # Inventory fields
            "quantity_available": 1500,
            "rate_per_meter": 125.75,
            "dispatch_timeline": "5-7 days",
            "is_bookable": True
        }
        
        response = requests.post(f"{BASE_URL}/api/fabrics",
            json=fabric_data,
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200, f"Create fabric failed: {response.text}"
        data = response.json()
        
        # Verify inventory fields
        assert data["quantity_available"] == 1500, f"quantity_available mismatch: {data.get('quantity_available')}"
        assert data["rate_per_meter"] == 125.75, f"rate_per_meter mismatch: {data.get('rate_per_meter')}"
        assert data["dispatch_timeline"] == "5-7 days", f"dispatch_timeline mismatch: {data.get('dispatch_timeline')}"
        assert data["is_bookable"] == True, f"is_bookable mismatch: {data.get('is_bookable')}"
        
        # Verify GET returns same data
        get_res = requests.get(f"{BASE_URL}/api/fabrics/{data['id']}")
        get_data = get_res.json()
        assert get_data["quantity_available"] == 1500
        assert get_data["rate_per_meter"] == 125.75
        assert get_data["is_bookable"] == True
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/fabrics/{data['id']}",
            headers={"Authorization": f"Bearer {auth_token}"})
        print("PASS: Fabric created with all inventory fields")

    def test_update_fabric_inventory_fields(self, auth_token, category_id):
        """Test updating fabric inventory fields"""
        # Create fabric
        fabric_data = {
            "name": "TEST_Update Inventory",
            "category_id": category_id,
            "fabric_type": "woven",
            "composition": [{"material": "Cotton", "percentage": 100}],
            "gsm": 150,
            "width": "58 inches",
            "warp_count": "60",
            "color": "Blue",
            "moq": "300 meters",
            "description": "Test",
            "quantity_available": 500,
            "is_bookable": False
        }
        
        create_res = requests.post(f"{BASE_URL}/api/fabrics",
            json=fabric_data,
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        fabric_id = create_res.json()["id"]
        
        # Update inventory fields
        update_res = requests.put(f"{BASE_URL}/api/fabrics/{fabric_id}",
            json={
                "quantity_available": 1000,
                "rate_per_meter": 200.00,
                "dispatch_timeline": "3-5 days",
                "is_bookable": True
            },
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert update_res.status_code == 200
        updated = update_res.json()
        assert updated["quantity_available"] == 1000
        assert updated["rate_per_meter"] == 200.00
        assert updated["is_bookable"] == True
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/fabrics/{fabric_id}",
            headers={"Authorization": f"Bearer {auth_token}"})
        print("PASS: Fabric inventory fields update works")


class TestFabricDenimFields:
    """Test Fabric with denim-specific fields"""

    def test_create_fabric_with_denim_fields(self, auth_token, category_id):
        """Test fabric creation with weft_shrinkage and stretch_percentage"""
        fabric_data = {
            "name": "TEST_Denim Fabric",
            "category_id": category_id,
            "fabric_type": "woven",
            "pattern": "Solid",
            "composition": [
                {"material": "Cotton", "percentage": 98},
                {"material": "Spandex", "percentage": 2}
            ],
            "gsm": 340,
            "width": "56 inches",
            "warp_count": "80",
            "weft_count": "60",
            "color": "Indigo",
            "moq": "500 meters",
            "description": "Stretch denim",
            "tags": ["denim", "stretch"],
            # Denim fields
            "weft_shrinkage": 2.5,
            "stretch_percentage": 15.0
        }
        
        response = requests.post(f"{BASE_URL}/api/fabrics",
            json=fabric_data,
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200, f"Create fabric failed: {response.text}"
        data = response.json()
        
        # Verify denim fields
        assert data["weft_shrinkage"] == 2.5, f"weft_shrinkage mismatch: {data.get('weft_shrinkage')}"
        assert data["stretch_percentage"] == 15.0, f"stretch_percentage mismatch: {data.get('stretch_percentage')}"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/fabrics/{data['id']}",
            headers={"Authorization": f"Bearer {auth_token}"})
        print("PASS: Fabric created with denim fields (weft_shrinkage, stretch_percentage)")


class TestFabricArticleLinking:
    """Test Fabric linking to Article via article_id"""

    def test_fabric_article_id_linking(self, auth_token, category_id):
        """Test fabric can be linked to an article via article_id"""
        # Create article first
        article_res = requests.post(f"{BASE_URL}/api/articles",
            json={"name": "TEST_Parent Article"},
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        article_id = article_res.json()["id"]
        article_code = article_res.json()["article_code"]
        
        # Create fabric linked to article
        fabric_data = {
            "name": "TEST_Linked Fabric",
            "category_id": category_id,
            "article_id": article_id,
            "fabric_type": "woven",
            "composition": [{"material": "Cotton", "percentage": 100}],
            "gsm": 150,
            "width": "58 inches",
            "warp_count": "60",
            "color": "Red",
            "moq": "300 meters",
            "description": "Fabric linked to article"
        }
        
        fabric_res = requests.post(f"{BASE_URL}/api/fabrics",
            json=fabric_data,
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert fabric_res.status_code == 200
        fabric_data = fabric_res.json()
        assert fabric_data["article_id"] == article_id
        
        # Verify article now has variant_count = 1
        article_get = requests.get(f"{BASE_URL}/api/articles/{article_id}")
        assert article_get.json()["variant_count"] == 1
        
        # Test GET /articles/{id}/variants returns the fabric
        variants_res = requests.get(f"{BASE_URL}/api/articles/{article_id}/variants")
        variants = variants_res.json()
        assert len(variants) == 1
        assert variants[0]["id"] == fabric_data["id"]
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/fabrics/{fabric_data['id']}",
            headers={"Authorization": f"Bearer {auth_token}"})
        requests.delete(f"{BASE_URL}/api/articles/{article_id}",
            headers={"Authorization": f"Bearer {auth_token}"})
        print(f"PASS: Fabric linked to article {article_code}, variant_count updated correctly")


class TestFabricSellerSKU:
    """Test Fabric with seller_sku field"""

    def test_fabric_seller_sku(self, auth_token, category_id):
        """Test fabric can store seller's SKU/serial number"""
        fabric_data = {
            "name": "TEST_SKU Fabric",
            "category_id": category_id,
            "fabric_type": "woven",
            "composition": [{"material": "Polyester", "percentage": 100}],
            "gsm": 120,
            "width": "60 inches",
            "warp_count": "50",
            "color": "Black",
            "moq": "400 meters",
            "description": "Fabric with seller SKU",
            "seller_sku": "SELLER-SKU-12345"
        }
        
        response = requests.post(f"{BASE_URL}/api/fabrics",
            json=fabric_data,
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert data["seller_sku"] == "SELLER-SKU-12345"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/fabrics/{data['id']}",
            headers={"Authorization": f"Bearer {auth_token}"})
        print("PASS: Fabric seller_sku field works")


class TestStatsEndpoint:
    """Test Stats endpoint returns new Phase 1 fields"""

    def test_stats_returns_new_fields(self, auth_token):
        """Test /stats endpoint returns articles, active_sellers, bookable_fabrics"""
        response = requests.get(f"{BASE_URL}/api/stats",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify new fields exist
        assert "articles" in data, "articles count missing from stats"
        assert "active_sellers" in data, "active_sellers count missing from stats"
        assert "bookable_fabrics" in data, "bookable_fabrics count missing from stats"
        
        # Verify types
        assert isinstance(data["articles"], int)
        assert isinstance(data["active_sellers"], int)
        assert isinstance(data["bookable_fabrics"], int)
        
        print(f"PASS: Stats returns articles={data['articles']}, active_sellers={data['active_sellers']}, bookable_fabrics={data['bookable_fabrics']}")

    def test_bookable_fabrics_count_updates(self, auth_token, category_id):
        """Test that bookable_fabrics count updates when is_bookable=true"""
        # Get initial count
        stats1 = requests.get(f"{BASE_URL}/api/stats",
            headers={"Authorization": f"Bearer {auth_token}"}
        ).json()
        initial_bookable = stats1["bookable_fabrics"]
        
        # Create bookable fabric
        fabric_data = {
            "name": "TEST_Bookable Fabric",
            "category_id": category_id,
            "fabric_type": "woven",
            "composition": [{"material": "Cotton", "percentage": 100}],
            "gsm": 150,
            "width": "58 inches",
            "warp_count": "60",
            "color": "White",
            "moq": "200 meters",
            "description": "Test bookable",
            "is_bookable": True,
            "quantity_available": 500,
            "rate_per_meter": 100.00
        }
        
        create_res = requests.post(f"{BASE_URL}/api/fabrics",
            json=fabric_data,
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        fabric_id = create_res.json()["id"]
        
        # Check stats updated
        stats2 = requests.get(f"{BASE_URL}/api/stats",
            headers={"Authorization": f"Bearer {auth_token}"}
        ).json()
        assert stats2["bookable_fabrics"] == initial_bookable + 1
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/fabrics/{fabric_id}",
            headers={"Authorization": f"Bearer {auth_token}"})
        print("PASS: bookable_fabrics count updates correctly")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
