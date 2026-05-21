"""
Phase 45 Backend Tests:
1. GET /api/customer/orders/{order_id} - Customer order detail (owner access)
2. GET /api/customer/orders/{order_id}/pay-context - Razorpay re-checkout context
3. POST /api/admin/brands - Standalone factory creation (parent_brand_id optional)
"""
import pytest
import requests
import os
from dotenv import load_dotenv

load_dotenv('/app/backend/.env')

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://fabric-sourcing-cms.preview.emergentagent.com"

# Test credentials from review_request
ADMIN_EMAIL = "admin@locofast.com"
ADMIN_PASSWORD = "admin123"
CUSTOMER_EMAIL = "deepak.wadhwa@locofast.com"
DIFFERENT_CUSTOMER_EMAIL = "profile-test@locofast.com"

# Sample order IDs from review_request
PAID_ORDER_ID = "220475e5-fa34-40c5-ae1d-8738781996b1"  # ORD-BGFIJQ, paid
PENDING_ORDER_ID = "bd026916-78e1-4b83-b6fd-1bad95cd2a2c"  # ORD-JYDG63, payment_pending


class TestCustomerOrderDetail:
    """Tests for GET /api/customer/orders/{order_id}"""
    
    @pytest.fixture(scope="class")
    def customer_token(self):
        """Get customer token via OTP flow for deepak.wadhwa@locofast.com"""
        import pymongo
        from datetime import datetime, timezone
        
        # Send OTP
        resp = requests.post(f"{BASE_URL}/api/customer/send-otp", json={"email": CUSTOMER_EMAIL})
        if resp.status_code != 200:
            pytest.skip(f"Could not send OTP: {resp.status_code} {resp.text}")
        
        # Get OTP from database
        client = pymongo.MongoClient(os.environ.get('MONGO_URL'))
        db = client[os.environ.get('DB_NAME', 'locofast')]
        otp_doc = db.customer_otps.find_one(
            {'email': CUSTOMER_EMAIL, 'used': False},
            sort=[('created_at', -1)]
        )
        if not otp_doc:
            pytest.skip("No OTP found in database")
        
        otp = otp_doc['otp']
        
        # Verify OTP
        resp = requests.post(f"{BASE_URL}/api/customer/verify-otp", json={"email": CUSTOMER_EMAIL, "otp": otp})
        if resp.status_code != 200:
            pytest.skip(f"OTP verification failed: {resp.status_code} {resp.text}")
        
        return resp.json().get('token')
    
    @pytest.fixture(scope="class")
    def different_customer_token(self):
        """Get customer token for profile-test@locofast.com (different customer)"""
        import pymongo
        
        # Send OTP
        resp = requests.post(f"{BASE_URL}/api/customer/send-otp", json={"email": DIFFERENT_CUSTOMER_EMAIL})
        if resp.status_code != 200:
            pytest.skip(f"Could not send OTP for different customer: {resp.status_code}")
        
        # Get OTP from database
        client = pymongo.MongoClient(os.environ.get('MONGO_URL'))
        db = client[os.environ.get('DB_NAME', 'locofast')]
        otp_doc = db.customer_otps.find_one(
            {'email': DIFFERENT_CUSTOMER_EMAIL, 'used': False},
            sort=[('created_at', -1)]
        )
        if not otp_doc:
            pytest.skip("No OTP found for different customer")
        
        otp = otp_doc['otp']
        
        # Verify OTP
        resp = requests.post(f"{BASE_URL}/api/customer/verify-otp", json={"email": DIFFERENT_CUSTOMER_EMAIL, "otp": otp})
        if resp.status_code != 200:
            pytest.skip(f"OTP verification failed for different customer: {resp.status_code}")
        
        return resp.json().get('token')
    
    def test_get_order_returns_order_for_owner(self, customer_token):
        """GET /api/customer/orders/{order_id} returns order when scoped to logged-in customer"""
        resp = requests.get(
            f"{BASE_URL}/api/customer/orders/{PAID_ORDER_ID}",
            headers={"Authorization": f"Bearer {customer_token}"}
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        data = resp.json()
        assert data.get('id') == PAID_ORDER_ID
        assert 'order_number' in data
        assert 'items' in data
        assert 'total' in data
        assert 'customer' in data
        print(f"PASS: Order {data.get('order_number')} returned for owner")
    
    def test_get_order_returns_404_for_different_customer(self, different_customer_token):
        """GET /api/customer/orders/{order_id} returns 404 when different customer tries to access"""
        resp = requests.get(
            f"{BASE_URL}/api/customer/orders/{PAID_ORDER_ID}",
            headers={"Authorization": f"Bearer {different_customer_token}"}
        )
        assert resp.status_code == 404, f"Expected 404, got {resp.status_code}: {resp.text}"
        print("PASS: 404 returned for cross-customer access attempt")
    
    def test_get_order_returns_401_without_auth(self):
        """GET /api/customer/orders/{order_id} returns 401 with no auth"""
        resp = requests.get(f"{BASE_URL}/api/customer/orders/{PAID_ORDER_ID}")
        assert resp.status_code == 401, f"Expected 401, got {resp.status_code}: {resp.text}"
        print("PASS: 401 returned for unauthenticated request")


class TestOrderPayContext:
    """Tests for GET /api/customer/orders/{order_id}/pay-context"""
    
    @pytest.fixture(scope="class")
    def customer_token(self):
        """Get customer token via OTP flow"""
        import pymongo
        
        resp = requests.post(f"{BASE_URL}/api/customer/send-otp", json={"email": CUSTOMER_EMAIL})
        if resp.status_code != 200:
            pytest.skip(f"Could not send OTP: {resp.status_code}")
        
        client = pymongo.MongoClient(os.environ.get('MONGO_URL'))
        db = client[os.environ.get('DB_NAME', 'locofast')]
        otp_doc = db.customer_otps.find_one(
            {'email': CUSTOMER_EMAIL, 'used': False},
            sort=[('created_at', -1)]
        )
        if not otp_doc:
            pytest.skip("No OTP found")
        
        resp = requests.post(f"{BASE_URL}/api/customer/verify-otp", json={"email": CUSTOMER_EMAIL, "otp": otp_doc['otp']})
        if resp.status_code != 200:
            pytest.skip(f"OTP verification failed: {resp.status_code}")
        
        return resp.json().get('token')
    
    @pytest.fixture(scope="class")
    def different_customer_token(self):
        """Get token for different customer"""
        import pymongo
        
        resp = requests.post(f"{BASE_URL}/api/customer/send-otp", json={"email": DIFFERENT_CUSTOMER_EMAIL})
        if resp.status_code != 200:
            pytest.skip(f"Could not send OTP: {resp.status_code}")
        
        client = pymongo.MongoClient(os.environ.get('MONGO_URL'))
        db = client[os.environ.get('DB_NAME', 'locofast')]
        otp_doc = db.customer_otps.find_one(
            {'email': DIFFERENT_CUSTOMER_EMAIL, 'used': False},
            sort=[('created_at', -1)]
        )
        if not otp_doc:
            pytest.skip("No OTP found")
        
        resp = requests.post(f"{BASE_URL}/api/customer/verify-otp", json={"email": DIFFERENT_CUSTOMER_EMAIL, "otp": otp_doc['otp']})
        if resp.status_code != 200:
            pytest.skip(f"OTP verification failed: {resp.status_code}")
        
        return resp.json().get('token')
    
    def test_pay_context_returns_razorpay_info_for_pending_order(self, customer_token):
        """pay-context returns razorpay_order_id + razorpay_key_id + amount_paise for payment_pending order"""
        resp = requests.get(
            f"{BASE_URL}/api/customer/orders/{PENDING_ORDER_ID}/pay-context",
            headers={"Authorization": f"Bearer {customer_token}"}
        )
        # Could be 200 (has razorpay_order_id) or 400 (no razorpay_order_id)
        if resp.status_code == 400:
            data = resp.json()
            if "no Razorpay order" in data.get('detail', ''):
                pytest.skip("Pending order has no razorpay_order_id - expected for some orders")
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        data = resp.json()
        assert 'razorpay_order_id' in data
        assert 'razorpay_key_id' in data
        assert 'amount_paise' in data
        assert 'customer' in data
        assert data.get('amount_paise') > 0
        print(f"PASS: pay-context returned razorpay_order_id={data.get('razorpay_order_id')}, amount_paise={data.get('amount_paise')}")
    
    def test_pay_context_returns_400_for_paid_order(self, customer_token):
        """pay-context returns 400 'Order is already paid' when order is already paid"""
        resp = requests.get(
            f"{BASE_URL}/api/customer/orders/{PAID_ORDER_ID}/pay-context",
            headers={"Authorization": f"Bearer {customer_token}"}
        )
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}: {resp.text}"
        
        data = resp.json()
        assert "already paid" in data.get('detail', '').lower(), f"Expected 'already paid' in detail, got: {data}"
        print("PASS: 400 'Order is already paid' returned for paid order")
    
    def test_pay_context_returns_404_for_different_customer(self, different_customer_token):
        """pay-context returns 404 when order isn't owned by the customer"""
        resp = requests.get(
            f"{BASE_URL}/api/customer/orders/{PENDING_ORDER_ID}/pay-context",
            headers={"Authorization": f"Bearer {different_customer_token}"}
        )
        assert resp.status_code == 404, f"Expected 404, got {resp.status_code}: {resp.text}"
        print("PASS: 404 returned for cross-customer pay-context access")


class TestStandaloneFactoryCreation:
    """Tests for POST /api/admin/brands with type='factory' and optional parent_brand_id"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin token"""
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if resp.status_code != 200:
            pytest.skip(f"Admin login failed: {resp.status_code}")
        return resp.json().get('token')
    
    @pytest.fixture(scope="class")
    def existing_brand_id(self, admin_token):
        """Get an existing brand ID for parent_brand_id tests"""
        resp = requests.get(
            f"{BASE_URL}/api/admin/brands",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        if resp.status_code != 200:
            pytest.skip("Could not fetch brands")
        
        brands = resp.json()
        # Find a brand (not factory) to use as parent
        for b in brands:
            if b.get('type', 'brand') == 'brand' and b.get('status') == 'active':
                return b['id']
        
        pytest.skip("No active brand found to use as parent")
    
    def test_standalone_factory_creation_succeeds(self, admin_token):
        """POST /api/admin/brands with type='factory' AND empty parent_brand_id creates standalone factory"""
        import uuid
        unique_email = f"test-factory-{uuid.uuid4().hex[:8]}@test.com"
        
        resp = requests.post(
            f"{BASE_URL}/api/admin/brands",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "name": f"TEST Standalone Factory {uuid.uuid4().hex[:6]}",
                "type": "factory",
                "parent_brand_id": "",  # Empty = standalone
                "admin_user_email": unique_email,
                "admin_user_name": "Test Factory Admin",
                "admin_user_designation": "Management",
                "allowed_category_ids": []
            }
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        data = resp.json()
        assert 'id' in data
        assert 'temporary_password_for_reference' in data
        print(f"PASS: Standalone factory created with id={data.get('id')}")
        
        # Cleanup: delete the test factory
        requests.delete(
            f"{BASE_URL}/api/admin/brands/{data['id']}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
    
    def test_factory_with_nonexistent_parent_returns_400(self, admin_token):
        """POST /api/admin/brands with type='factory' AND non-existent parent_brand_id returns 400"""
        import uuid
        unique_email = f"test-factory-{uuid.uuid4().hex[:8]}@test.com"
        
        resp = requests.post(
            f"{BASE_URL}/api/admin/brands",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "name": f"TEST Factory {uuid.uuid4().hex[:6]}",
                "type": "factory",
                "parent_brand_id": "nonexistent-brand-id-12345",
                "admin_user_email": unique_email,
                "admin_user_name": "Test Factory Admin",
                "admin_user_designation": "Management",
                "allowed_category_ids": []
            }
        )
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}: {resp.text}"
        
        data = resp.json()
        assert "parent_brand_id does not refer to an active brand" in data.get('detail', ''), f"Unexpected detail: {data}"
        print("PASS: 400 returned for non-existent parent_brand_id")
    
    def test_factory_with_valid_parent_succeeds(self, admin_token, existing_brand_id):
        """POST /api/admin/brands with type='factory' AND valid parent_brand_id works (regression)"""
        import uuid
        unique_email = f"test-factory-{uuid.uuid4().hex[:8]}@test.com"
        
        resp = requests.post(
            f"{BASE_URL}/api/admin/brands",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "name": f"TEST Factory with Parent {uuid.uuid4().hex[:6]}",
                "type": "factory",
                "parent_brand_id": existing_brand_id,
                "admin_user_email": unique_email,
                "admin_user_name": "Test Factory Admin",
                "admin_user_designation": "Management",
                "allowed_category_ids": []
            }
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        data = resp.json()
        assert 'id' in data
        print(f"PASS: Factory with parent brand created, id={data.get('id')}")
        
        # Cleanup
        requests.delete(
            f"{BASE_URL}/api/admin/brands/{data['id']}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
    
    def test_brand_type_ignores_parent_brand_id(self, admin_token, existing_brand_id):
        """POST /api/admin/brands with type='brand' AND parent_brand_id ignores the parent_brand_id"""
        import uuid
        unique_email = f"test-brand-{uuid.uuid4().hex[:8]}@test.com"
        
        resp = requests.post(
            f"{BASE_URL}/api/admin/brands",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "name": f"TEST Brand {uuid.uuid4().hex[:6]}",
                "type": "brand",
                "parent_brand_id": existing_brand_id,  # Should be ignored for brands
                "admin_user_email": unique_email,
                "admin_user_name": "Test Brand Admin",
                "admin_user_designation": "Management",
                "allowed_category_ids": []
            }
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        data = resp.json()
        assert 'id' in data
        
        # Verify the brand was created without parent_brand_id
        brand_resp = requests.get(
            f"{BASE_URL}/api/admin/brands/{data['id']}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        if brand_resp.status_code == 200:
            brand_data = brand_resp.json()
            brand = brand_data.get('brand', {})
            assert brand.get('parent_brand_id') is None, f"Brand should not have parent_brand_id, got: {brand.get('parent_brand_id')}"
        
        print("PASS: Brand created, parent_brand_id ignored")
        
        # Cleanup
        requests.delete(
            f"{BASE_URL}/api/admin/brands/{data['id']}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
