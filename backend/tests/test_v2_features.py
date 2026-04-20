"""
Test Suite for Locofast v2.0 Features:
1. Enquiry source field - verify source is captured and displayed
2. Order type field - verify orders show Sample/Bulk distinction
3. Cloudinary signature endpoint - verify it returns valid signature data
"""
import pytest
import requests
import os
import uuid

# Use environment variable for BASE_URL
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://fabric-sourcing-cms.preview.emergentagent.com')


class TestAdminAuth:
    """Admin authentication tests"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@locofast.com",
            "password": "NewAdmin@2024"
        })
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip("Admin authentication failed - skipping authenticated tests")
    
    def test_admin_login(self):
        """Test admin login with correct credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@locofast.com",
            "password": "NewAdmin@2024"
        })
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "admin" in data
        print(f"✓ Admin login successful, token received")


class TestEnquirySourceField:
    """Test enquiry source field functionality"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@locofast.com",
            "password": "NewAdmin@2024"
        })
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip("Admin authentication failed")
    
    def test_create_enquiry_with_source_rfq_page(self, admin_token):
        """Test creating enquiry with source from RFQ page"""
        unique_id = str(uuid.uuid4())[:8]
        enquiry_data = {
            "name": f"TEST_RFQ User {unique_id}",
            "email": f"test_rfq_{unique_id}@example.com",
            "phone": "9876543210",
            "company": "Test Company",
            "message": "Test enquiry from RFQ page",
            "source": "rfq_page",
            "enquiry_type": "rfq"
        }
        response = requests.post(f"{BASE_URL}/api/enquiries", json=enquiry_data)
        assert response.status_code == 200
        data = response.json()
        assert data["source"] == "rfq_page"
        assert data["enquiry_type"] == "rfq"
        print(f"✓ Enquiry created with source='rfq_page', id={data['id']}")
        return data["id"]
    
    def test_create_enquiry_with_source_supplier_signup(self, admin_token):
        """Test creating enquiry with source from supplier signup page"""
        unique_id = str(uuid.uuid4())[:8]
        enquiry_data = {
            "name": f"TEST_Supplier User {unique_id}",
            "email": f"test_supplier_{unique_id}@example.com",
            "phone": "9876543211",
            "company": "Test Supplier Company",
            "message": "Interested in becoming a supplier",
            "source": "supplier_signup_page",
            "enquiry_type": "supplier_signup"
        }
        response = requests.post(f"{BASE_URL}/api/enquiries", json=enquiry_data)
        assert response.status_code == 200
        data = response.json()
        assert data["source"] == "supplier_signup_page"
        print(f"✓ Enquiry created with source='supplier_signup_page', id={data['id']}")
    
    def test_create_enquiry_with_source_fabric_detail(self, admin_token):
        """Test creating enquiry with source from fabric detail page"""
        unique_id = str(uuid.uuid4())[:8]
        enquiry_data = {
            "name": f"TEST_Fabric Detail User {unique_id}",
            "email": f"test_fabric_{unique_id}@example.com",
            "phone": "9876543212",
            "company": "Test Buyer Company",
            "message": "Interested in this fabric",
            "fabric_name": "Test Cotton Fabric",
            "fabric_code": "LF-TEST1",
            "source": "fabric_detail_page",
            "enquiry_type": "sample_order"
        }
        response = requests.post(f"{BASE_URL}/api/enquiries", json=enquiry_data)
        assert response.status_code == 200
        data = response.json()
        assert data["source"] == "fabric_detail_page"
        print(f"✓ Enquiry created with source='fabric_detail_page', id={data['id']}")
    
    def test_create_enquiry_with_source_contact_page(self, admin_token):
        """Test creating enquiry with source from contact page"""
        unique_id = str(uuid.uuid4())[:8]
        enquiry_data = {
            "name": f"TEST_Contact User {unique_id}",
            "email": f"test_contact_{unique_id}@example.com",
            "phone": "9876543213",
            "message": "General inquiry from contact page",
            "source": "contact_page",
            "enquiry_type": "general"
        }
        response = requests.post(f"{BASE_URL}/api/enquiries", json=enquiry_data)
        assert response.status_code == 200
        data = response.json()
        assert data["source"] == "contact_page"
        print(f"✓ Enquiry created with source='contact_page', id={data['id']}")
    
    def test_get_enquiries_admin_shows_source(self, admin_token):
        """Test admin can view enquiries with source field"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/enquiries", headers=headers)
        assert response.status_code == 200
        enquiries = response.json()
        assert len(enquiries) > 0
        
        # Check that enquiries have source field
        for enquiry in enquiries[:5]:  # Check first 5
            assert "source" in enquiry
            assert "enquiry_type" in enquiry
        
        # Check for different source values
        sources = [e.get("source") for e in enquiries]
        print(f"✓ Admin can view enquiries - Found {len(enquiries)} enquiries")
        print(f"✓ Source values found: {set(sources)}")


class TestOrderTypeField:
    """Test order type field (Sample/Bulk) functionality"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@locofast.com",
            "password": "NewAdmin@2024"
        })
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip("Admin authentication failed")
    
    def test_list_orders_shows_order_type(self, admin_token):
        """Test that orders list includes order_type in items"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/orders", headers=headers)
        assert response.status_code == 200
        data = response.json()
        orders = data.get("orders", [])
        
        print(f"✓ Found {len(orders)} orders")
        
        # Check that orders have items with order_type
        for order in orders[:3]:  # Check first 3 orders
            items = order.get("items", [])
            for item in items:
                assert "order_type" in item, f"Missing order_type in order {order.get('order_number')}"
                order_type = item.get("order_type")
                assert order_type in ["sample", "bulk", "Sample", "Bulk"], f"Invalid order_type: {order_type}"
        
        # Count sample vs bulk orders
        sample_count = 0
        bulk_count = 0
        for order in orders:
            items = order.get("items", [])
            if items:
                order_type = items[0].get("order_type", "bulk").lower()
                if order_type == "sample":
                    sample_count += 1
                else:
                    bulk_count += 1
        
        print(f"✓ Sample orders: {sample_count}, Bulk orders: {bulk_count}")
    
    def test_order_stats_endpoint(self, admin_token):
        """Test order stats endpoint"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/orders/stats/summary", headers=headers)
        assert response.status_code == 200
        stats = response.json()
        
        assert "total_orders" in stats
        assert "pending_payment" in stats
        assert "paid" in stats
        assert "total_revenue" in stats
        
        print(f"✓ Order stats: total={stats.get('total_orders')}, paid={stats.get('paid')}, revenue=₹{stats.get('total_revenue')}")


class TestCloudinaryIntegration:
    """Test Cloudinary signature endpoint for image uploads"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@locofast.com",
            "password": "NewAdmin@2024"
        })
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip("Admin authentication failed")
    
    def test_get_cloudinary_signature(self, admin_token):
        """Test Cloudinary signature endpoint returns valid data"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(
            f"{BASE_URL}/api/cloudinary/signature?resource_type=image&folder=fabrics",
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify all required fields are present
        assert "signature" in data, "Missing signature"
        assert "timestamp" in data, "Missing timestamp"
        assert "cloud_name" in data, "Missing cloud_name"
        assert "api_key" in data, "Missing api_key"
        assert "folder" in data, "Missing folder"
        assert "resource_type" in data, "Missing resource_type"
        
        # Verify values
        assert data["cloud_name"] == "dqmk2qiy", f"Unexpected cloud_name: {data['cloud_name']}"
        assert data["folder"] == "fabrics"
        assert data["resource_type"] == "image"
        assert len(data["signature"]) > 0
        assert isinstance(data["timestamp"], int)
        
        print(f"✓ Cloudinary signature received:")
        print(f"  - cloud_name: {data['cloud_name']}")
        print(f"  - api_key: {data['api_key'][:10]}...")
        print(f"  - folder: {data['folder']}")
        print(f"  - signature: {data['signature'][:20]}...")
    
    def test_get_cloudinary_signature_video(self, admin_token):
        """Test Cloudinary signature for video uploads"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(
            f"{BASE_URL}/api/cloudinary/signature?resource_type=video&folder=fabrics",
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["resource_type"] == "video"
        print(f"✓ Cloudinary video signature received")
    
    def test_get_cloudinary_config(self, admin_token):
        """Test Cloudinary config endpoint"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/cloudinary/config", headers=headers)
        assert response.status_code == 200
        data = response.json()
        
        assert "cloud_name" in data
        assert "api_key" in data
        assert "enabled" in data
        assert data["enabled"] == True
        
        print(f"✓ Cloudinary config: cloud_name={data['cloud_name']}, enabled={data['enabled']}")
    
    def test_cloudinary_signature_without_auth_fails(self):
        """Test that Cloudinary signature endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/cloudinary/signature")
        assert response.status_code in [401, 403, 422]
        print(f"✓ Cloudinary signature endpoint requires auth (status={response.status_code})")


class TestCleanup:
    """Cleanup test data"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@locofast.com",
            "password": "NewAdmin@2024"
        })
        if response.status_code == 200:
            return response.json().get("token")
        return None
    
    def test_cleanup_test_enquiries(self, admin_token):
        """Clean up test enquiries created during testing"""
        if not admin_token:
            pytest.skip("No admin token available")
        
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/enquiries", headers=headers)
        
        if response.status_code == 200:
            enquiries = response.json()
            deleted_count = 0
            for enquiry in enquiries:
                if enquiry.get("name", "").startswith("TEST_"):
                    del_response = requests.delete(
                        f"{BASE_URL}/api/enquiries/{enquiry['id']}", 
                        headers=headers
                    )
                    if del_response.status_code == 200:
                        deleted_count += 1
            print(f"✓ Cleaned up {deleted_count} test enquiries")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
