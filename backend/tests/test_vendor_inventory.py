"""
Test Vendor Inventory API - Comprehensive form fields testing
Tests vendor login, fabric CRUD with all new fields (composition, pricing tiers, availability, etc.)
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
VENDOR_EMAIL = "vendor@test.com"
VENDOR_PASSWORD = "vendor123"
ADMIN_EMAIL = "admin@locofast.com"
ADMIN_PASSWORD = "admin123"


class TestVendorAuth:
    """Vendor authentication tests"""
    
    def test_vendor_login_success(self):
        """Test vendor login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/vendor/login", json={
            "email": VENDOR_EMAIL,
            "password": VENDOR_PASSWORD
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "token" in data, "Response should contain token"
        assert "vendor" in data, "Response should contain vendor info"
        assert data["vendor"]["contact_email"] == VENDOR_EMAIL
        print(f"✓ Vendor login successful: {data['vendor']['company_name']}")
    
    def test_vendor_login_invalid_credentials(self):
        """Test vendor login with invalid credentials"""
        response = requests.post(f"{BASE_URL}/api/vendor/login", json={
            "email": "wrong@test.com",
            "password": "wrongpass"
        })
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ Invalid credentials correctly rejected")


class TestVendorInventory:
    """Vendor inventory CRUD tests with comprehensive fields"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get vendor token before each test"""
        response = requests.post(f"{BASE_URL}/api/vendor/login", json={
            "email": VENDOR_EMAIL,
            "password": VENDOR_PASSWORD
        })
        assert response.status_code == 200, f"Vendor login failed: {response.text}"
        self.vendor_token = response.json()["token"]
        self.vendor_id = response.json()["vendor"]["id"]
        self.headers = {"Authorization": f"Bearer {self.vendor_token}"}
    
    def test_get_vendor_fabrics(self):
        """Test getting vendor's fabric list"""
        response = requests.get(f"{BASE_URL}/api/vendor/fabrics", headers=self.headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ Got {len(data)} fabrics for vendor")
    
    def test_get_vendor_categories(self):
        """Test getting categories for fabric creation dropdown"""
        response = requests.get(f"{BASE_URL}/api/vendor/categories", headers=self.headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ Got {len(data)} categories")
    
    def test_create_fabric_comprehensive_fields(self):
        """Test creating fabric with all comprehensive fields"""
        test_fabric = {
            "name": f"TEST_Denim_Fabric_{uuid.uuid4().hex[:8]}",
            "fabric_code": f"TEST-DEN-{uuid.uuid4().hex[:6]}",
            "description": "Premium stretch denim fabric for testing",
            "fabric_type": "woven",
            "pattern": "Solid",
            "color": "Indigo",
            "composition": [
                {"material": "Cotton", "percentage": 70},
                {"material": "Polyester", "percentage": 30}
            ],
            "gsm": 280,
            "weight_unit": "gsm",
            "width": "58",
            "warp_count": "1/40",
            "weft_count": "2/20",
            "weft_shrinkage": 3.5,
            "stretch_percentage": 2.0,
            "finish": "Bio",
            "quantity_available": 1000,
            "rate_per_meter": 150.0,
            "sample_price": 200.0,
            "moq": "500 meters",
            "sample_delivery_days": "3-5",
            "bulk_delivery_days": "15-17",
            "availability": ["Sample", "Bulk"],
            "is_bookable": True,
            "tags": ["denim", "stretch", "premium"],
            "seller_sku": f"TEST-SKU-{uuid.uuid4().hex[:6]}",
            "pricing_tiers": [
                {"min_qty": 0, "max_qty": 100, "price_per_meter": 200},
                {"min_qty": 101, "max_qty": 500, "price_per_meter": 180},
                {"min_qty": 501, "max_qty": 1000, "price_per_meter": 160}
            ],
            "images": [],
            "videos": []
        }
        
        response = requests.post(f"{BASE_URL}/api/vendor/fabrics", json=test_fabric, headers=self.headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "id" in data, "Response should contain fabric id"
        assert data["name"] == test_fabric["name"]
        assert data["status"] == "pending", "New fabric should have pending status"
        assert data["fabric_type"] == "woven"
        assert data["pattern"] == "Solid"
        assert data["color"] == "Indigo"
        assert data["gsm"] == 280
        assert data["sample_price"] == 200.0
        assert data["availability"] == ["Sample", "Bulk"]
        assert len(data["composition"]) == 2
        assert data["composition"][0]["material"] == "Cotton"
        assert data["composition"][0]["percentage"] == 70
        
        # Store fabric id for cleanup
        self.created_fabric_id = data["id"]
        print(f"✓ Created fabric with comprehensive fields: {data['name']} (status: {data['status']})")
        
        # Verify by GET
        get_response = requests.get(f"{BASE_URL}/api/vendor/fabrics/{data['id']}", headers=self.headers)
        assert get_response.status_code == 200
        fetched = get_response.json()
        assert fetched["name"] == test_fabric["name"]
        assert fetched["seller_sku"] == test_fabric["seller_sku"]
        print(f"✓ Verified fabric persistence via GET")
        
        return data["id"]
    
    def test_create_fabric_minimal_fields(self):
        """Test creating fabric with only required fields (name, gsm)"""
        test_fabric = {
            "name": f"TEST_Minimal_Fabric_{uuid.uuid4().hex[:8]}",
            "gsm": 200,
            "weight_unit": "gsm"
        }
        
        response = requests.post(f"{BASE_URL}/api/vendor/fabrics", json=test_fabric, headers=self.headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["name"] == test_fabric["name"]
        assert data["gsm"] == 200
        assert data["status"] == "pending"
        print(f"✓ Created fabric with minimal fields: {data['name']}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/vendor/fabrics/{data['id']}", headers=self.headers)
    
    def test_update_fabric(self):
        """Test updating fabric fields"""
        # First create a fabric
        create_response = requests.post(f"{BASE_URL}/api/vendor/fabrics", json={
            "name": f"TEST_Update_Fabric_{uuid.uuid4().hex[:8]}",
            "gsm": 200,
            "weight_unit": "gsm",
            "sample_price": 100.0
        }, headers=self.headers)
        assert create_response.status_code == 200
        fabric_id = create_response.json()["id"]
        
        # Update the fabric
        update_data = {
            "name": f"TEST_Updated_Fabric_{uuid.uuid4().hex[:8]}",
            "gsm": 250,
            "sample_price": 150.0,
            "availability": ["Sample", "On Request"],
            "pricing_tiers": [
                {"min_qty": 0, "max_qty": 200, "price_per_meter": 180}
            ]
        }
        
        update_response = requests.put(f"{BASE_URL}/api/vendor/fabrics/{fabric_id}", json=update_data, headers=self.headers)
        assert update_response.status_code == 200, f"Expected 200, got {update_response.status_code}: {update_response.text}"
        
        updated = update_response.json()
        assert updated["gsm"] == 250
        assert updated["sample_price"] == 150.0
        assert "Sample" in updated["availability"]
        assert "On Request" in updated["availability"]
        print(f"✓ Updated fabric successfully")
        
        # Verify via GET
        get_response = requests.get(f"{BASE_URL}/api/vendor/fabrics/{fabric_id}", headers=self.headers)
        assert get_response.status_code == 200
        fetched = get_response.json()
        assert fetched["gsm"] == 250
        print(f"✓ Verified update persistence via GET")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/vendor/fabrics/{fabric_id}", headers=self.headers)
    
    def test_delete_fabric(self):
        """Test deleting a fabric"""
        # First create a fabric
        create_response = requests.post(f"{BASE_URL}/api/vendor/fabrics", json={
            "name": f"TEST_Delete_Fabric_{uuid.uuid4().hex[:8]}",
            "gsm": 200,
            "weight_unit": "gsm"
        }, headers=self.headers)
        assert create_response.status_code == 200
        fabric_id = create_response.json()["id"]
        
        # Delete the fabric
        delete_response = requests.delete(f"{BASE_URL}/api/vendor/fabrics/{fabric_id}", headers=self.headers)
        assert delete_response.status_code == 200, f"Expected 200, got {delete_response.status_code}: {delete_response.text}"
        
        # Verify deletion
        get_response = requests.get(f"{BASE_URL}/api/vendor/fabrics/{fabric_id}", headers=self.headers)
        assert get_response.status_code == 404, "Deleted fabric should return 404"
        print(f"✓ Deleted fabric and verified removal")
    
    def test_vendor_stats(self):
        """Test vendor statistics endpoint"""
        response = requests.get(f"{BASE_URL}/api/vendor/stats", headers=self.headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "total_fabrics" in data
        assert "approved_fabrics" in data
        assert "pending_fabrics" in data
        assert "rejected_fabrics" in data
        print(f"✓ Vendor stats: {data['total_fabrics']} total, {data['pending_fabrics']} pending, {data['approved_fabrics']} approved")


class TestAdminFabricApproval:
    """Test admin approval of vendor fabrics"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get admin and vendor tokens"""
        # Vendor login
        vendor_response = requests.post(f"{BASE_URL}/api/vendor/login", json={
            "email": VENDOR_EMAIL,
            "password": VENDOR_PASSWORD
        })
        assert vendor_response.status_code == 200
        self.vendor_token = vendor_response.json()["token"]
        self.vendor_headers = {"Authorization": f"Bearer {self.vendor_token}"}
        self.vendor_id = vendor_response.json()["vendor"]["id"]
        
        # Admin login
        admin_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert admin_response.status_code == 200, f"Admin login failed: {admin_response.text}"
        self.admin_token = admin_response.json()["token"]
        self.admin_headers = {"Authorization": f"Bearer {self.admin_token}"}
    
    def test_admin_can_see_pending_fabric(self):
        """Test that admin can see pending fabrics from vendor"""
        # Create a pending fabric as vendor
        create_response = requests.post(f"{BASE_URL}/api/vendor/fabrics", json={
            "name": f"TEST_Pending_Fabric_{uuid.uuid4().hex[:8]}",
            "gsm": 200,
            "weight_unit": "gsm"
        }, headers=self.vendor_headers)
        assert create_response.status_code == 200
        fabric_id = create_response.json()["id"]
        
        # Admin should be able to see it via fabrics endpoint with include_pending
        admin_response = requests.get(
            f"{BASE_URL}/api/fabrics",
            params={"seller_id": self.vendor_id, "include_pending": "true"},
            headers=self.admin_headers
        )
        assert admin_response.status_code == 200
        
        fabrics = admin_response.json()
        fabric_ids = [f["id"] for f in fabrics]
        assert fabric_id in fabric_ids, "Admin should see pending fabric"
        print(f"✓ Admin can see pending fabric from vendor")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/vendor/fabrics/{fabric_id}", headers=self.vendor_headers)
    
    def test_admin_approve_fabric(self):
        """Test admin approving a vendor fabric"""
        # Create a pending fabric as vendor
        create_response = requests.post(f"{BASE_URL}/api/vendor/fabrics", json={
            "name": f"TEST_Approve_Fabric_{uuid.uuid4().hex[:8]}",
            "gsm": 200,
            "weight_unit": "gsm"
        }, headers=self.vendor_headers)
        assert create_response.status_code == 200
        fabric_id = create_response.json()["id"]
        
        # Admin approves the fabric
        approve_response = requests.put(
            f"{BASE_URL}/api/fabrics/{fabric_id}",
            json={"status": "approved"},
            headers=self.admin_headers
        )
        assert approve_response.status_code == 200, f"Expected 200, got {approve_response.status_code}: {approve_response.text}"
        
        approved = approve_response.json()
        assert approved["status"] == "approved", f"Expected approved status, got {approved['status']}"
        print(f"✓ Admin approved fabric successfully")
        
        # Verify vendor sees updated status
        vendor_get = requests.get(f"{BASE_URL}/api/vendor/fabrics/{fabric_id}", headers=self.vendor_headers)
        assert vendor_get.status_code == 200
        assert vendor_get.json()["status"] == "approved"
        print(f"✓ Vendor sees approved status")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/fabrics/{fabric_id}", headers=self.admin_headers)
    
    def test_admin_reject_fabric(self):
        """Test admin rejecting a vendor fabric"""
        # Create a pending fabric as vendor
        create_response = requests.post(f"{BASE_URL}/api/vendor/fabrics", json={
            "name": f"TEST_Reject_Fabric_{uuid.uuid4().hex[:8]}",
            "gsm": 200,
            "weight_unit": "gsm"
        }, headers=self.vendor_headers)
        assert create_response.status_code == 200
        fabric_id = create_response.json()["id"]
        
        # Admin rejects the fabric
        reject_response = requests.put(
            f"{BASE_URL}/api/fabrics/{fabric_id}",
            json={"status": "rejected"},
            headers=self.admin_headers
        )
        assert reject_response.status_code == 200, f"Expected 200, got {reject_response.status_code}: {reject_response.text}"
        
        rejected = reject_response.json()
        assert rejected["status"] == "rejected", f"Expected rejected status, got {rejected['status']}"
        print(f"✓ Admin rejected fabric successfully")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/fabrics/{fabric_id}", headers=self.admin_headers)


class TestCloudinaryVendorAccess:
    """Test that vendors can access cloudinary for image uploads"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get vendor token"""
        response = requests.post(f"{BASE_URL}/api/vendor/login", json={
            "email": VENDOR_EMAIL,
            "password": VENDOR_PASSWORD
        })
        assert response.status_code == 200
        self.vendor_token = response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.vendor_token}"}
    
    def test_vendor_can_get_cloudinary_signature(self):
        """Test that vendor can get cloudinary upload signature"""
        response = requests.get(
            f"{BASE_URL}/api/cloudinary/signature",
            params={"resource_type": "image", "folder": "fabrics"},
            headers=self.headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "signature" in data
        assert "timestamp" in data
        assert "cloud_name" in data
        assert "api_key" in data
        print(f"✓ Vendor can get cloudinary signature for uploads")


# Cleanup function to remove test data
def cleanup_test_fabrics():
    """Remove all TEST_ prefixed fabrics"""
    # Login as vendor
    response = requests.post(f"{BASE_URL}/api/vendor/login", json={
        "email": VENDOR_EMAIL,
        "password": VENDOR_PASSWORD
    })
    if response.status_code != 200:
        return
    
    token = response.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}
    
    # Get all fabrics
    fabrics_response = requests.get(f"{BASE_URL}/api/vendor/fabrics", headers=headers)
    if fabrics_response.status_code == 200:
        fabrics = fabrics_response.json()
        for fabric in fabrics:
            if fabric.get("name", "").startswith("TEST_"):
                requests.delete(f"{BASE_URL}/api/vendor/fabrics/{fabric['id']}", headers=headers)
                print(f"Cleaned up: {fabric['name']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
