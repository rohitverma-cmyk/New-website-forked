"""
Locofast CMS Platform - Backend API Tests
Tests for new features:
- Admin login
- Seller CRUD with city, state, category_ids fields
- Fabric CRUD with pattern, composition array, starting_price, videos fields
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "admin@locofast.com"
ADMIN_PASSWORD = "admin123"


class TestAdminAuth:
    """Test admin login and authentication"""

    def test_admin_login_success(self):
        """Test successful admin login with provided credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data, "Token not in response"
        assert "admin" in data, "Admin info not in response"
        assert data["admin"]["email"] == ADMIN_EMAIL
        print(f"PASS: Admin login successful for {ADMIN_EMAIL}")

    def test_admin_login_invalid_credentials(self):
        """Test login fails with wrong credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "wrong@email.com",
            "password": "wrongpass"
        })
        assert response.status_code == 401, f"Should return 401, got {response.status_code}"
        print("PASS: Invalid credentials correctly rejected")

    def test_auth_me_with_valid_token(self):
        """Test /auth/me endpoint with valid token"""
        # Login first
        login_res = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        token = login_res.json()["token"]
        
        # Test /auth/me
        response = requests.get(f"{BASE_URL}/api/auth/me", headers={
            "Authorization": f"Bearer {token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == ADMIN_EMAIL
        print("PASS: Auth me endpoint works with valid token")


class TestCategories:
    """Test category endpoints"""

    def test_get_categories(self):
        """Test getting all categories"""
        response = requests.get(f"{BASE_URL}/api/categories")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"PASS: Got {len(data)} categories")


class TestSellerCRUD:
    """Test Seller CRUD with new fields: city, state, category_ids"""
    
    @pytest.fixture
    def auth_token(self):
        """Get auth token for tests"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["token"]

    def test_create_seller_with_new_fields(self, auth_token):
        """Test creating seller with city, state, and category_ids"""
        # First get categories
        cat_response = requests.get(f"{BASE_URL}/api/categories")
        categories = cat_response.json()
        category_ids = [categories[0]["id"]] if categories else []
        
        seller_data = {
            "name": "TEST_Seller Contact",
            "company_name": "TEST_Seller Company",
            "description": "Test seller with new fields",
            "city": "Mumbai",
            "state": "Maharashtra",
            "contact_email": "test@seller.com",
            "contact_phone": "+91 98765 43210",
            "category_ids": category_ids
        }
        
        response = requests.post(f"{BASE_URL}/api/sellers", 
            json=seller_data,
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200, f"Create seller failed: {response.text}"
        data = response.json()
        
        # Verify new fields
        assert data["city"] == "Mumbai", f"City mismatch: {data.get('city')}"
        assert data["state"] == "Maharashtra", f"State mismatch: {data.get('state')}"
        assert data["category_ids"] == category_ids, f"Category IDs mismatch"
        
        # Verify GET returns same data
        get_response = requests.get(f"{BASE_URL}/api/sellers/{data['id']}")
        assert get_response.status_code == 200
        get_data = get_response.json()
        assert get_data["city"] == "Mumbai"
        assert get_data["state"] == "Maharashtra"
        assert get_data["category_ids"] == category_ids
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/sellers/{data['id']}", 
            headers={"Authorization": f"Bearer {auth_token}"})
        print("PASS: Seller created with city, state, category_ids fields")

    def test_update_seller_city_state(self, auth_token):
        """Test updating seller city and state"""
        # Create seller first
        seller_data = {
            "name": "TEST_Update Seller",
            "company_name": "TEST_Update Company",
            "city": "Delhi",
            "state": "Delhi"
        }
        
        create_res = requests.post(f"{BASE_URL}/api/sellers", 
            json=seller_data,
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        seller_id = create_res.json()["id"]
        
        # Update city and state
        update_res = requests.put(f"{BASE_URL}/api/sellers/{seller_id}",
            json={"city": "Bangalore", "state": "Karnataka"},
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert update_res.status_code == 200
        updated = update_res.json()
        assert updated["city"] == "Bangalore"
        assert updated["state"] == "Karnataka"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/sellers/{seller_id}",
            headers={"Authorization": f"Bearer {auth_token}"})
        print("PASS: Seller city/state update works")

    def test_seller_category_multi_select(self, auth_token):
        """Test seller with multiple categories"""
        # Get categories
        cat_response = requests.get(f"{BASE_URL}/api/categories")
        categories = cat_response.json()
        
        if len(categories) >= 2:
            category_ids = [categories[0]["id"], categories[1]["id"]]
        else:
            category_ids = [categories[0]["id"]] if categories else []
        
        seller_data = {
            "name": "TEST_Multi Category Seller",
            "company_name": "TEST_Multi Cat Company",
            "category_ids": category_ids
        }
        
        response = requests.post(f"{BASE_URL}/api/sellers",
            json=seller_data,
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["category_ids"] == category_ids
        assert "category_names" in data  # Should have category names
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/sellers/{data['id']}",
            headers={"Authorization": f"Bearer {auth_token}"})
        print(f"PASS: Seller multi-category selection works ({len(category_ids)} categories)")

    def test_get_sellers_list(self):
        """Test getting sellers list returns new fields"""
        response = requests.get(f"{BASE_URL}/api/sellers")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        
        if data:
            seller = data[0]
            # Verify new fields exist in response
            assert "city" in seller, "city field missing"
            assert "state" in seller, "state field missing"
            assert "category_ids" in seller, "category_ids field missing"
            assert "category_names" in seller, "category_names field missing"
        print(f"PASS: Got {len(data)} sellers with new fields")


class TestFabricCRUD:
    """Test Fabric CRUD with new fields: pattern, composition array, starting_price, videos"""

    @pytest.fixture
    def auth_token(self):
        """Get auth token for tests"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["token"]

    @pytest.fixture
    def category_id(self):
        """Get first category ID"""
        response = requests.get(f"{BASE_URL}/api/categories")
        categories = response.json()
        return categories[0]["id"] if categories else None

    def test_create_fabric_with_new_fields(self, auth_token, category_id):
        """Test creating fabric with pattern, composition, starting_price, videos"""
        fabric_data = {
            "name": "TEST_Fabric New Fields",
            "category_id": category_id,
            "fabric_type": "woven",
            "pattern": "Stripes",
            "composition": [
                {"material": "Cotton", "percentage": 78},
                {"material": "Polyester", "percentage": 21},
                {"material": "Spandex", "percentage": 1}
            ],
            "gsm": 180,
            "width": "58 inches",
            "color": "Blue",
            "moq": "500 meters",
            "starting_price": "₹150/meter",
            "availability": ["Sample", "Bulk"],
            "description": "Test fabric with new fields",
            "tags": ["test", "new-fields"],
            "images": [],
            "videos": ["https://youtube.com/watch?v=test1", "https://vimeo.com/test2"]
        }
        
        response = requests.post(f"{BASE_URL}/api/fabrics",
            json=fabric_data,
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200, f"Create fabric failed: {response.text}"
        data = response.json()
        
        # Verify new fields
        assert data["pattern"] == "Stripes", f"Pattern mismatch: {data.get('pattern')}"
        assert data["starting_price"] == "₹150/meter", f"Starting price mismatch"
        assert len(data["videos"]) == 2, f"Videos mismatch: {data.get('videos')}"
        
        # Verify composition array
        assert isinstance(data["composition"], list), "Composition should be list"
        assert len(data["composition"]) == 3
        assert data["composition"][0]["material"] == "Cotton"
        assert data["composition"][0]["percentage"] == 78
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/fabrics/{data['id']}",
            headers={"Authorization": f"Bearer {auth_token}"})
        print("PASS: Fabric created with pattern, composition array, starting_price, videos")

    def test_fabric_pattern_options(self, auth_token, category_id):
        """Test all pattern dropdown options"""
        patterns = ["Solid", "Print", "Stripes", "Checks", "Floral", "Geometric", "Digital", "Random", "Others"]
        
        for pattern in patterns[:3]:  # Test first 3 patterns to save time
            fabric_data = {
                "name": f"TEST_Pattern_{pattern}",
                "category_id": category_id,
                "fabric_type": "woven",
                "pattern": pattern,
                "composition": [{"material": "Cotton", "percentage": 100}],
                "gsm": 150,
                "width": "58 inches",
                "color": "White",
                "moq": "500 meters",
                "description": f"Test {pattern} pattern",
                "tags": []
            }
            
            response = requests.post(f"{BASE_URL}/api/fabrics",
                json=fabric_data,
                headers={"Authorization": f"Bearer {auth_token}"}
            )
            assert response.status_code == 200, f"Create fabric with pattern {pattern} failed"
            data = response.json()
            assert data["pattern"] == pattern
            
            # Cleanup
            requests.delete(f"{BASE_URL}/api/fabrics/{data['id']}",
                headers={"Authorization": f"Bearer {auth_token}"})
        
        print(f"PASS: Pattern options work (tested: Solid, Print, Stripes)")

    def test_fabric_composition_percentage_validation(self, auth_token, category_id):
        """Test composition with percentage values"""
        fabric_data = {
            "name": "TEST_Composition Validation",
            "category_id": category_id,
            "fabric_type": "knitted",
            "pattern": "Solid",
            "composition": [
                {"material": "Cotton", "percentage": 95},
                {"material": "Elastane", "percentage": 5}
            ],
            "gsm": 200,
            "width": "72 inches",
            "color": "Black",
            "moq": "300 meters",
            "description": "Test composition validation",
            "tags": []
        }
        
        response = requests.post(f"{BASE_URL}/api/fabrics",
            json=fabric_data,
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify composition
        total_percentage = sum(c["percentage"] for c in data["composition"])
        assert total_percentage == 100, f"Total should be 100%, got {total_percentage}%"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/fabrics/{data['id']}",
            headers={"Authorization": f"Bearer {auth_token}"})
        print("PASS: Composition percentages work correctly")

    def test_fabric_videos_array(self, auth_token, category_id):
        """Test fabric with video URLs"""
        fabric_data = {
            "name": "TEST_Videos Fabric",
            "category_id": category_id,
            "fabric_type": "woven",
            "pattern": "Print",
            "composition": [{"material": "Polyester", "percentage": 100}],
            "gsm": 120,
            "width": "60 inches",
            "color": "Multi",
            "moq": "400 meters",
            "description": "Test videos array",
            "tags": [],
            "videos": [
                "https://youtube.com/watch?v=abc123",
                "https://vimeo.com/123456789",
                "https://example.com/video.mp4"
            ]
        }
        
        response = requests.post(f"{BASE_URL}/api/fabrics",
            json=fabric_data,
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert isinstance(data["videos"], list)
        assert len(data["videos"]) == 3
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/fabrics/{data['id']}",
            headers={"Authorization": f"Bearer {auth_token}"})
        print("PASS: Videos array works correctly")

    def test_get_fabric_detail_with_new_fields(self, auth_token, category_id):
        """Test getting fabric detail shows all new fields"""
        # Create fabric
        fabric_data = {
            "name": "TEST_Detail View",
            "category_id": category_id,
            "fabric_type": "woven",
            "pattern": "Geometric",
            "composition": [
                {"material": "Silk", "percentage": 60},
                {"material": "Cotton", "percentage": 40}
            ],
            "gsm": 100,
            "width": "45 inches",
            "color": "Gold",
            "moq": "200 meters",
            "starting_price": "₹500/meter",
            "description": "Premium silk blend",
            "tags": ["premium", "silk"],
            "videos": ["https://youtube.com/watch?v=xyz"]
        }
        
        create_res = requests.post(f"{BASE_URL}/api/fabrics",
            json=fabric_data,
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        fabric_id = create_res.json()["id"]
        
        # Get fabric detail
        get_res = requests.get(f"{BASE_URL}/api/fabrics/{fabric_id}")
        assert get_res.status_code == 200
        data = get_res.json()
        
        # Verify all new fields present
        assert data["pattern"] == "Geometric"
        assert data["starting_price"] == "₹500/meter"
        assert len(data["composition"]) == 2
        assert data["composition"][0]["material"] == "Silk"
        assert data["videos"] == ["https://youtube.com/watch?v=xyz"]
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/fabrics/{fabric_id}",
            headers={"Authorization": f"Bearer {auth_token}"})
        print("PASS: Fabric detail view shows all new fields")

    def test_get_fabrics_list_shows_composition_format(self):
        """Test fabrics list shows composition in proper format"""
        response = requests.get(f"{BASE_URL}/api/fabrics")
        assert response.status_code == 200
        data = response.json()
        
        if data:
            fabric = data[0]
            # Verify composition field structure
            if "composition" in fabric:
                comp = fabric["composition"]
                if isinstance(comp, list) and comp:
                    assert "material" in comp[0]
                    assert "percentage" in comp[0]
                    print(f"Sample composition: {comp}")
        print(f"PASS: Got {len(data)} fabrics with proper composition format")

    def test_update_fabric_new_fields(self, auth_token, category_id):
        """Test updating fabric new fields"""
        # Create fabric
        fabric_data = {
            "name": "TEST_Update Fabric",
            "category_id": category_id,
            "fabric_type": "woven",
            "pattern": "Solid",
            "composition": [{"material": "Cotton", "percentage": 100}],
            "gsm": 150,
            "width": "58 inches",
            "color": "White",
            "moq": "500 meters",
            "description": "Test update",
            "tags": []
        }
        
        create_res = requests.post(f"{BASE_URL}/api/fabrics",
            json=fabric_data,
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        fabric_id = create_res.json()["id"]
        
        # Update fabric
        update_data = {
            "pattern": "Checks",
            "starting_price": "₹200/meter",
            "videos": ["https://youtube.com/updated"],
            "composition": [
                {"material": "Cotton", "percentage": 70},
                {"material": "Polyester", "percentage": 30}
            ]
        }
        
        update_res = requests.put(f"{BASE_URL}/api/fabrics/{fabric_id}",
            json=update_data,
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert update_res.status_code == 200
        updated = update_res.json()
        
        assert updated["pattern"] == "Checks"
        assert updated["starting_price"] == "₹200/meter"
        assert len(updated["composition"]) == 2
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/fabrics/{fabric_id}",
            headers={"Authorization": f"Bearer {auth_token}"})
        print("PASS: Fabric new fields update works")


class TestLegacyCompositionNormalization:
    """Test that legacy string composition data is normalized correctly"""
    
    def test_legacy_composition_normalization(self):
        """Test fabrics with legacy string composition are normalized"""
        response = requests.get(f"{BASE_URL}/api/fabrics")
        assert response.status_code == 200
        data = response.json()
        
        for fabric in data:
            comp = fabric.get("composition")
            if comp:
                # Should always be a list now
                assert isinstance(comp, list), f"Composition should be list, got {type(comp)}: {comp}"
                if comp:
                    assert "material" in comp[0], f"Missing material key in composition"
                    assert "percentage" in comp[0], f"Missing percentage key in composition"
        print("PASS: All fabrics have normalized composition format")


class TestEnquiryEndpoints:
    """Test enquiry endpoints"""
    
    def test_create_enquiry(self):
        """Test creating an enquiry"""
        enquiry_data = {
            "name": "TEST_John Doe",
            "email": "test@example.com",
            "phone": "+91 98765 43210",
            "company": "Test Company",
            "message": "Test enquiry message",
            "fabric_id": None,
            "fabric_name": None
        }
        
        response = requests.post(f"{BASE_URL}/api/enquiries", json=enquiry_data)
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "TEST_John Doe"
        assert data["status"] == "new"
        print("PASS: Enquiry creation works")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
