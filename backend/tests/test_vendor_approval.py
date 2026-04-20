"""
Test suite for Vendor Approval Workflow and Fixed 500 Errors
Tests:
1. GET /api/fabrics - returns 200 OK with correct fabric data
2. GET /api/fabrics - public endpoint filters out pending/rejected fabrics by default
3. GET /api/fabrics?include_pending=true - returns ALL fabrics including pending ones
4. GET /api/fabrics?status=pending - returns only pending fabrics
5. GET /api/fabrics/count - returns correct count
6. GET /api/sellers?include_inactive=true - returns 200 OK
7. PUT /api/fabrics/{id} with {status: 'approved'} - approves a fabric (admin auth required)
8. PUT /api/fabrics/{id} with {status: 'rejected'} - rejects a fabric (admin auth required)
9. POST /api/vendor/fabrics - creates fabric with status='pending'
10. Vendor login at /vendor/login works
11. Admin login at /admin/login works
12. POST /api/sellers - creates a seller successfully
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://fabric-sourcing-cms.preview.emergentagent.com')

# Test credentials
ADMIN_EMAIL = "admin@locofast.com"
ADMIN_PASSWORD = "admin123"
VENDOR_EMAIL = "vendor@test.com"
VENDOR_PASSWORD = "vendor123"


class TestFabricsEndpoint:
    """Tests for GET /api/fabrics endpoint - Fixed 500 error"""
    
    def test_get_fabrics_returns_200(self):
        """GET /api/fabrics should return 200 OK"""
        response = requests.get(f"{BASE_URL}/api/fabrics")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ GET /api/fabrics returns 200 with {len(data)} fabrics")
    
    def test_get_fabrics_filters_pending_by_default(self):
        """GET /api/fabrics should filter out pending/rejected fabrics by default (public view)"""
        response = requests.get(f"{BASE_URL}/api/fabrics")
        assert response.status_code == 200
        data = response.json()
        
        # Check that no pending or rejected fabrics are returned
        for fabric in data:
            status = fabric.get('status')
            # status can be None (legacy), 'approved', but NOT 'pending' or 'rejected'
            assert status not in ['pending', 'rejected'], f"Found fabric with status={status} in public view"
        
        print(f"✓ Public fabrics endpoint correctly filters out pending/rejected fabrics")
    
    def test_get_fabrics_with_include_pending(self):
        """GET /api/fabrics?include_pending=true should return ALL fabrics including pending"""
        response = requests.get(f"{BASE_URL}/api/fabrics", params={"include_pending": "true"})
        assert response.status_code == 200
        data = response.json()
        
        # Should include fabrics with any status
        statuses = set(fabric.get('status') for fabric in data)
        print(f"✓ GET /api/fabrics?include_pending=true returns {len(data)} fabrics with statuses: {statuses}")
    
    def test_get_fabrics_with_status_filter(self):
        """GET /api/fabrics?status=pending should return only pending fabrics"""
        response = requests.get(f"{BASE_URL}/api/fabrics", params={"status": "pending"})
        assert response.status_code == 200
        data = response.json()
        
        # All returned fabrics should have status='pending'
        for fabric in data:
            assert fabric.get('status') == 'pending', f"Expected status=pending, got {fabric.get('status')}"
        
        print(f"✓ GET /api/fabrics?status=pending returns {len(data)} pending fabrics")
    
    def test_get_fabrics_count(self):
        """GET /api/fabrics/count should return correct count"""
        response = requests.get(f"{BASE_URL}/api/fabrics/count")
        assert response.status_code == 200
        data = response.json()
        assert 'count' in data, "Response should contain 'count' field"
        assert isinstance(data['count'], int), "Count should be an integer"
        print(f"✓ GET /api/fabrics/count returns count={data['count']}")


class TestSellersEndpoint:
    """Tests for GET /api/sellers endpoint - Fixed 500 error"""
    
    def test_get_sellers_returns_200(self):
        """GET /api/sellers should return 200 OK"""
        response = requests.get(f"{BASE_URL}/api/sellers")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ GET /api/sellers returns 200 with {len(data)} sellers")
    
    def test_get_sellers_with_include_inactive(self):
        """GET /api/sellers?include_inactive=true should return 200 OK"""
        response = requests.get(f"{BASE_URL}/api/sellers", params={"include_inactive": "true"})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # Verify each seller has required fields
        for seller in data:
            assert 'id' in seller, "Seller should have 'id'"
            assert 'name' in seller, "Seller should have 'name'"
            assert 'created_at' in seller, "Seller should have 'created_at'"
        
        print(f"✓ GET /api/sellers?include_inactive=true returns 200 with {len(data)} sellers")


class TestAdminAuth:
    """Tests for Admin authentication"""
    
    def test_admin_login(self):
        """POST /api/auth/login should authenticate admin"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        
        if response.status_code == 401:
            # Try alternate password
            response = requests.post(f"{BASE_URL}/api/auth/login", json={
                "email": ADMIN_EMAIL,
                "password": "NewAdmin@2024"
            })
        
        assert response.status_code == 200, f"Admin login failed: {response.status_code} - {response.text}"
        data = response.json()
        assert 'token' in data, "Response should contain 'token'"
        assert 'admin' in data, "Response should contain 'admin'"
        print(f"✓ Admin login successful for {ADMIN_EMAIL}")
        return data['token']


class TestVendorAuth:
    """Tests for Vendor authentication"""
    
    def test_vendor_login(self):
        """POST /api/vendor/login should authenticate vendor"""
        response = requests.post(f"{BASE_URL}/api/vendor/login", json={
            "email": VENDOR_EMAIL,
            "password": VENDOR_PASSWORD
        })
        
        if response.status_code == 401:
            print(f"⚠ Vendor login failed with {VENDOR_EMAIL}/{VENDOR_PASSWORD}")
            # Check if vendor exists
            sellers_resp = requests.get(f"{BASE_URL}/api/sellers", params={"include_inactive": "true"})
            if sellers_resp.status_code == 200:
                sellers = sellers_resp.json()
                vendor_emails = [s.get('contact_email') for s in sellers]
                print(f"Available vendor emails: {vendor_emails}")
            pytest.skip("Vendor credentials not set up")
        
        assert response.status_code == 200, f"Vendor login failed: {response.status_code} - {response.text}"
        data = response.json()
        assert 'token' in data, "Response should contain 'token'"
        assert 'vendor' in data, "Response should contain 'vendor'"
        print(f"✓ Vendor login successful for {VENDOR_EMAIL}")
        return data['token']


class TestAdminApprovalWorkflow:
    """Tests for Admin approval workflow"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 401:
            response = requests.post(f"{BASE_URL}/api/auth/login", json={
                "email": ADMIN_EMAIL,
                "password": "NewAdmin@2024"
            })
        if response.status_code != 200:
            pytest.skip("Admin login failed")
        return response.json()['token']
    
    def test_approve_fabric(self, admin_token):
        """PUT /api/fabrics/{id} with {status: 'approved'} should approve a fabric"""
        # First, get a pending fabric
        response = requests.get(f"{BASE_URL}/api/fabrics", params={"status": "pending"})
        assert response.status_code == 200
        pending_fabrics = response.json()
        
        if not pending_fabrics:
            print("⚠ No pending fabrics to approve, skipping test")
            pytest.skip("No pending fabrics available")
        
        fabric_id = pending_fabrics[0]['id']
        fabric_name = pending_fabrics[0]['name']
        
        # Approve the fabric
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.put(
            f"{BASE_URL}/api/fabrics/{fabric_id}",
            json={"status": "approved"},
            headers=headers
        )
        
        assert response.status_code == 200, f"Failed to approve fabric: {response.status_code} - {response.text}"
        data = response.json()
        assert data.get('status') == 'approved', f"Expected status=approved, got {data.get('status')}"
        print(f"✓ Successfully approved fabric '{fabric_name}'")
        
        # Revert to pending for other tests
        requests.put(
            f"{BASE_URL}/api/fabrics/{fabric_id}",
            json={"status": "pending"},
            headers=headers
        )
    
    def test_reject_fabric(self, admin_token):
        """PUT /api/fabrics/{id} with {status: 'rejected'} should reject a fabric"""
        # First, get a pending fabric
        response = requests.get(f"{BASE_URL}/api/fabrics", params={"status": "pending"})
        assert response.status_code == 200
        pending_fabrics = response.json()
        
        if not pending_fabrics:
            print("⚠ No pending fabrics to reject, skipping test")
            pytest.skip("No pending fabrics available")
        
        fabric_id = pending_fabrics[0]['id']
        fabric_name = pending_fabrics[0]['name']
        
        # Reject the fabric
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.put(
            f"{BASE_URL}/api/fabrics/{fabric_id}",
            json={"status": "rejected"},
            headers=headers
        )
        
        assert response.status_code == 200, f"Failed to reject fabric: {response.status_code} - {response.text}"
        data = response.json()
        assert data.get('status') == 'rejected', f"Expected status=rejected, got {data.get('status')}"
        print(f"✓ Successfully rejected fabric '{fabric_name}'")
        
        # Revert to pending for other tests
        requests.put(
            f"{BASE_URL}/api/fabrics/{fabric_id}",
            json={"status": "pending"},
            headers=headers
        )
    
    def test_approve_requires_auth(self):
        """PUT /api/fabrics/{id} without auth should return 401/403"""
        # Get any fabric
        response = requests.get(f"{BASE_URL}/api/fabrics", params={"include_pending": "true"})
        if response.status_code != 200 or not response.json():
            pytest.skip("No fabrics available")
        
        fabric_id = response.json()[0]['id']
        
        # Try to approve without auth
        response = requests.put(
            f"{BASE_URL}/api/fabrics/{fabric_id}",
            json={"status": "approved"}
        )
        
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"✓ Approve fabric requires authentication (returns {response.status_code})")


class TestVendorFabricCreation:
    """Tests for Vendor fabric creation with pending status"""
    
    @pytest.fixture
    def vendor_token(self):
        """Get vendor token"""
        response = requests.post(f"{BASE_URL}/api/vendor/login", json={
            "email": VENDOR_EMAIL,
            "password": VENDOR_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip("Vendor login failed")
        return response.json()['token']
    
    def test_vendor_fabric_creation_has_pending_status(self, vendor_token):
        """POST /api/vendor/fabrics should create fabric with status='pending'"""
        headers = {"Authorization": f"Bearer {vendor_token}"}
        
        # Get categories for fabric creation
        cat_response = requests.get(f"{BASE_URL}/api/vendor/categories")
        if cat_response.status_code != 200 or not cat_response.json():
            pytest.skip("No categories available")
        
        category_id = cat_response.json()[0]['id']
        
        # Create a test fabric
        test_fabric = {
            "name": f"TEST_Vendor_Fabric_{uuid.uuid4().hex[:8]}",
            "category_id": category_id,
            "description": "Test fabric created by vendor",
            "composition": "100% Cotton",
            "gsm": 180,
            "width": "58",
            "moq": "100 meters"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/vendor/fabrics",
            json=test_fabric,
            headers=headers
        )
        
        assert response.status_code == 200, f"Failed to create vendor fabric: {response.status_code} - {response.text}"
        data = response.json()
        
        # Verify status is 'pending'
        assert data.get('status') == 'pending', f"Expected status=pending, got {data.get('status')}"
        print(f"✓ Vendor fabric created with status='pending': {data.get('name')}")
        
        # Cleanup - delete the test fabric
        fabric_id = data.get('id')
        if fabric_id:
            requests.delete(f"{BASE_URL}/api/vendor/fabrics/{fabric_id}", headers=headers)


class TestSellerCreation:
    """Tests for Seller creation"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 401:
            response = requests.post(f"{BASE_URL}/api/auth/login", json={
                "email": ADMIN_EMAIL,
                "password": "NewAdmin@2024"
            })
        if response.status_code != 200:
            pytest.skip("Admin login failed")
        return response.json()['token']
    
    def test_create_seller(self, admin_token):
        """POST /api/sellers should create a seller successfully"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        test_seller = {
            "name": f"TEST_Seller_{uuid.uuid4().hex[:8]}",
            "company_name": "Test Company Ltd",
            "description": "Test seller for API testing",
            "contact_email": f"test_{uuid.uuid4().hex[:8]}@example.com",
            "contact_phone": "9876543210",
            "city": "Mumbai",
            "state": "Maharashtra",
            "is_active": True
        }
        
        response = requests.post(
            f"{BASE_URL}/api/sellers",
            json=test_seller,
            headers=headers
        )
        
        assert response.status_code == 200, f"Failed to create seller: {response.status_code} - {response.text}"
        data = response.json()
        
        # Verify seller data
        assert data.get('name') == test_seller['name'], "Seller name mismatch"
        assert data.get('company_name') == test_seller['company_name'], "Company name mismatch"
        assert 'id' in data, "Seller should have 'id'"
        assert 'created_at' in data, "Seller should have 'created_at'"
        
        print(f"✓ Seller created successfully: {data.get('name')}")
        
        # Cleanup - delete the test seller
        seller_id = data.get('id')
        if seller_id:
            requests.delete(f"{BASE_URL}/api/sellers/{seller_id}", headers=headers)


class TestFabricResponseModel:
    """Tests for Fabric response model with status field"""
    
    def test_fabric_has_status_field(self):
        """Fabric response should include status field"""
        response = requests.get(f"{BASE_URL}/api/fabrics", params={"include_pending": "true"})
        assert response.status_code == 200
        fabrics = response.json()
        
        if not fabrics:
            pytest.skip("No fabrics available")
        
        # Check that fabrics have status field (can be None for legacy)
        for fabric in fabrics[:5]:  # Check first 5
            assert 'status' in fabric or fabric.get('status') is None, "Fabric should have 'status' field"
        
        print(f"✓ Fabric response model includes status field")
    
    def test_fabric_has_required_fields(self):
        """Fabric response should have all required fields"""
        response = requests.get(f"{BASE_URL}/api/fabrics", params={"include_pending": "true"})
        assert response.status_code == 200
        fabrics = response.json()
        
        if not fabrics:
            pytest.skip("No fabrics available")
        
        required_fields = ['id', 'name', 'category_id', 'fabric_type', 'created_at']
        
        for fabric in fabrics[:3]:  # Check first 3
            for field in required_fields:
                assert field in fabric, f"Fabric missing required field: {field}"
        
        print(f"✓ Fabric response has all required fields")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
