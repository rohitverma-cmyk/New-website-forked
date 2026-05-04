"""
Brand Portal Slice 4 Tests — Cart, Sample Cap, OTP, Support, Email Fanout
Tests for iteration 34 features:
1. GET /api/brand/support returns support contact info
2. POST /api/brand/orders with sample qty > 5 returns 400
3. POST /api/brand/orders with sample qty = 5 proceeds
4. POST /api/admin/brands/{id}/sample-credits without OTP returns 422/400
5. POST /api/admin/brands/{id}/sample-credits/otp returns otp_request_id
6. POST /api/admin/brands/{id}/sample-credits with valid OTP succeeds
7. POST /api/brand/default-ship-to (brand_admin only)
8. /api/brand/login response includes brand_logo_url + designation + brand_name
9. Regression: existing brand flows still work
"""
import pytest
import requests
import os
import pymongo
import bcrypt
from dotenv import load_dotenv

load_dotenv('/app/backend/.env')

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://fabric-sourcing-cms.preview.emergentagent.com').rstrip('/')
MONGO_URL = os.environ.get('MONGO_URL')
DB_NAME = os.environ.get('DB_NAME')

# Test credentials
ADMIN_EMAIL = "admin@locofast.com"
ADMIN_PASSWORD = "admin123"
BRAND_EMAIL = "brandtest@locofast.com"
BRAND_PASSWORD = "NewPassword123!"
BRAND_ID = "03b50566-e559-4a54-97f0-4cd1179615d4"


@pytest.fixture(scope="module")
def admin_token():
    """Get admin token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip(f"Admin login failed: {response.status_code} - {response.text}")


@pytest.fixture(scope="module")
def brand_token():
    """Get brand user token"""
    response = requests.post(f"{BASE_URL}/api/brand/login", json={
        "email": BRAND_EMAIL,
        "password": BRAND_PASSWORD
    })
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip(f"Brand login failed: {response.status_code} - {response.text}")


@pytest.fixture(scope="module")
def brand_login_response():
    """Get full brand login response for testing payload"""
    response = requests.post(f"{BASE_URL}/api/brand/login", json={
        "email": BRAND_EMAIL,
        "password": BRAND_PASSWORD
    })
    if response.status_code == 200:
        return response.json()
    pytest.skip(f"Brand login failed: {response.status_code}")


@pytest.fixture(scope="module")
def fabric_id(brand_token):
    """Get a fabric ID from the brand's catalog"""
    response = requests.get(
        f"{BASE_URL}/api/brand/fabrics",
        headers={"Authorization": f"Bearer {brand_token}"}
    )
    if response.status_code == 200:
        fabrics = response.json()
        if fabrics and len(fabrics) > 0:
            return fabrics[0].get("id")
    pytest.skip("No fabrics available for brand")


class TestBrandSupportEndpoint:
    """Test GET /api/brand/support endpoint"""
    
    def test_support_endpoint_returns_contact_info(self):
        """Support endpoint returns email, phone, hours, escalation_email"""
        response = requests.get(f"{BASE_URL}/api/brand/support")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "email" in data, "Missing email field"
        assert "phone" in data, "Missing phone field"
        assert "hours" in data, "Missing hours field"
        assert "escalation_email" in data, "Missing escalation_email field"
        
        # Verify values are non-empty
        assert data["email"], "Email should not be empty"
        assert data["phone"], "Phone should not be empty"
        print(f"Support info: {data}")


class TestBrandLoginPayload:
    """Test brand login response includes required fields"""
    
    def test_login_includes_brand_logo_url(self, brand_login_response):
        """Login response includes brand_logo_url in user payload"""
        user = brand_login_response.get("user", {})
        assert "brand_logo_url" in user, "Missing brand_logo_url in user payload"
        print(f"brand_logo_url: {user.get('brand_logo_url')}")
    
    def test_login_includes_designation(self, brand_login_response):
        """Login response includes designation in user payload"""
        user = brand_login_response.get("user", {})
        assert "designation" in user, "Missing designation in user payload"
        print(f"designation: {user.get('designation')}")
    
    def test_login_includes_brand_name(self, brand_login_response):
        """Login response includes brand_name in user payload"""
        user = brand_login_response.get("user", {})
        assert "brand_name" in user, "Missing brand_name in user payload"
        assert user["brand_name"], "brand_name should not be empty"
        print(f"brand_name: {user.get('brand_name')}")


class TestSampleOrderCap:
    """Test 5-meter cap on sample orders"""
    
    def test_sample_order_qty_over_5_returns_400(self, brand_token, fabric_id):
        """POST /api/brand/orders with sample qty > 5 returns 400"""
        response = requests.post(
            f"{BASE_URL}/api/brand/orders",
            headers={"Authorization": f"Bearer {brand_token}", "Content-Type": "application/json"},
            json={
                "order_type": "sample",
                "items": [{"fabric_id": fabric_id, "quantity": 6}],
                "ship_to_address": "Test Address",
                "ship_to_city": "Test City",
                "ship_to_state": "Test State",
                "ship_to_pincode": "123456"
            }
        )
        assert response.status_code == 400, f"Expected 400 for qty > 5, got {response.status_code}"
        
        data = response.json()
        detail = data.get("detail", "")
        assert "5" in detail or "meter" in detail.lower(), f"Error should mention 5 meters: {detail}"
        print(f"Correctly rejected qty > 5: {detail}")
    
    def test_sample_order_qty_5_proceeds(self, brand_token, fabric_id):
        """POST /api/brand/orders with sample qty = 5 proceeds to credit check"""
        response = requests.post(
            f"{BASE_URL}/api/brand/orders",
            headers={"Authorization": f"Bearer {brand_token}", "Content-Type": "application/json"},
            json={
                "order_type": "sample",
                "items": [{"fabric_id": fabric_id, "quantity": 5}],
                "ship_to_address": "Test Address",
                "ship_to_city": "Test City",
                "ship_to_state": "Test State",
                "ship_to_pincode": "123456"
            }
        )
        # Should either succeed (200) or fail on credit check (400 with credit message), NOT 400 for qty
        if response.status_code == 400:
            detail = response.json().get("detail", "")
            # Should NOT be a qty cap error
            assert "5 meters per line" not in detail, f"qty=5 should not trigger cap error: {detail}"
            print(f"qty=5 passed cap check, failed on: {detail}")
        else:
            assert response.status_code == 200, f"Expected 200 or credit error, got {response.status_code}"
            print(f"qty=5 order placed successfully")


class TestSampleCreditOTPFlow:
    """Test OTP-gated sample credit adjustment"""
    
    def test_sample_credits_without_otp_returns_error(self, admin_token):
        """POST /api/admin/brands/{id}/sample-credits without OTP fields returns 422/400"""
        response = requests.post(
            f"{BASE_URL}/api/admin/brands/{BRAND_ID}/sample-credits",
            headers={"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"},
            json={"delta": 10, "note": "Test without OTP"}
        )
        # Should fail because otp_request_id and otp_code are missing
        assert response.status_code in [400, 422], f"Expected 400/422 without OTP, got {response.status_code}"
        print(f"Correctly rejected without OTP: {response.status_code}")
    
    def test_sample_credits_otp_request(self, admin_token):
        """POST /api/admin/brands/{id}/sample-credits/otp returns otp_request_id"""
        response = requests.post(
            f"{BASE_URL}/api/admin/brands/{BRAND_ID}/sample-credits/otp",
            headers={"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"},
            json={"delta": 10, "note": "Test OTP request"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "otp_request_id" in data, "Missing otp_request_id"
        assert "sent_to" in data, "Missing sent_to"
        assert "expires_in_minutes" in data, "Missing expires_in_minutes"
        print(f"OTP sent to: {data.get('sent_to')}, expires in {data.get('expires_in_minutes')} min")
        return data
    
    def test_sample_credits_with_wrong_otp_returns_400(self, admin_token):
        """POST /api/admin/brands/{id}/sample-credits with wrong OTP returns 400"""
        # First request OTP
        otp_response = requests.post(
            f"{BASE_URL}/api/admin/brands/{BRAND_ID}/sample-credits/otp",
            headers={"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"},
            json={"delta": 5, "note": "Test wrong OTP"}
        )
        assert otp_response.status_code == 200
        otp_data = otp_response.json()
        
        # Try with wrong OTP
        response = requests.post(
            f"{BASE_URL}/api/admin/brands/{BRAND_ID}/sample-credits",
            headers={"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"},
            json={
                "otp_request_id": otp_data["otp_request_id"],
                "otp_code": "000000",  # Wrong OTP
                "delta": 5,
                "note": "Test wrong OTP"
            }
        )
        assert response.status_code == 400, f"Expected 400 for wrong OTP, got {response.status_code}"
        print(f"Correctly rejected wrong OTP: {response.json().get('detail')}")
    
    def test_sample_credits_with_tampered_delta_returns_400(self, admin_token):
        """POST /api/admin/brands/{id}/sample-credits with tampered delta returns 400"""
        # Request OTP for delta=10
        otp_response = requests.post(
            f"{BASE_URL}/api/admin/brands/{BRAND_ID}/sample-credits/otp",
            headers={"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"},
            json={"delta": 10, "note": "Test tampered delta"}
        )
        assert otp_response.status_code == 200
        otp_data = otp_response.json()
        
        # Rehash OTP to 123456 for testing
        client = pymongo.MongoClient(MONGO_URL)
        db = client[DB_NAME]
        db.admin_otps.update_one(
            {"id": otp_data["otp_request_id"]},
            {"$set": {"code_hash": bcrypt.hashpw(b"123456", bcrypt.gensalt()).decode()}}
        )
        
        # Try with different delta (tampered)
        response = requests.post(
            f"{BASE_URL}/api/admin/brands/{BRAND_ID}/sample-credits",
            headers={"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"},
            json={
                "otp_request_id": otp_data["otp_request_id"],
                "otp_code": "123456",
                "delta": 20,  # Tampered - different from OTP request
                "note": "Test tampered delta"
            }
        )
        assert response.status_code == 400, f"Expected 400 for tampered delta, got {response.status_code}"
        detail = response.json().get("detail", "")
        assert "delta" in detail.lower() or "match" in detail.lower(), f"Error should mention delta mismatch: {detail}"
        print(f"Correctly rejected tampered delta: {detail}")
    
    def test_sample_credits_with_valid_otp_succeeds(self, admin_token):
        """POST /api/admin/brands/{id}/sample-credits with valid OTP succeeds"""
        # Request OTP
        otp_response = requests.post(
            f"{BASE_URL}/api/admin/brands/{BRAND_ID}/sample-credits/otp",
            headers={"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"},
            json={"delta": 1, "note": "Test valid OTP"}
        )
        assert otp_response.status_code == 200
        otp_data = otp_response.json()
        
        # Rehash OTP to 123456 for testing
        client = pymongo.MongoClient(MONGO_URL)
        db = client[DB_NAME]
        db.admin_otps.update_one(
            {"id": otp_data["otp_request_id"]},
            {"$set": {"code_hash": bcrypt.hashpw(b"123456", bcrypt.gensalt()).decode()}}
        )
        
        # Submit with correct OTP
        response = requests.post(
            f"{BASE_URL}/api/admin/brands/{BRAND_ID}/sample-credits",
            headers={"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"},
            json={
                "otp_request_id": otp_data["otp_request_id"],
                "otp_code": "123456",
                "delta": 1,
                "note": "Test valid OTP"
            }
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "sample_credits_total" in data, "Missing sample_credits_total in response"
        print(f"Sample credits updated. New total: {data.get('sample_credits_total')}")
    
    def test_reusing_consumed_otp_returns_400(self, admin_token):
        """Reusing a consumed OTP returns 400"""
        # Request OTP
        otp_response = requests.post(
            f"{BASE_URL}/api/admin/brands/{BRAND_ID}/sample-credits/otp",
            headers={"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"},
            json={"delta": 1, "note": "Test reuse OTP"}
        )
        assert otp_response.status_code == 200
        otp_data = otp_response.json()
        
        # Rehash OTP to 123456
        client = pymongo.MongoClient(MONGO_URL)
        db = client[DB_NAME]
        db.admin_otps.update_one(
            {"id": otp_data["otp_request_id"]},
            {"$set": {"code_hash": bcrypt.hashpw(b"123456", bcrypt.gensalt()).decode()}}
        )
        
        # First use - should succeed
        response1 = requests.post(
            f"{BASE_URL}/api/admin/brands/{BRAND_ID}/sample-credits",
            headers={"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"},
            json={
                "otp_request_id": otp_data["otp_request_id"],
                "otp_code": "123456",
                "delta": 1,
                "note": "Test reuse OTP - first use"
            }
        )
        assert response1.status_code == 200, f"First use should succeed: {response1.text}"
        
        # Second use - should fail
        response2 = requests.post(
            f"{BASE_URL}/api/admin/brands/{BRAND_ID}/sample-credits",
            headers={"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"},
            json={
                "otp_request_id": otp_data["otp_request_id"],
                "otp_code": "123456",
                "delta": 1,
                "note": "Test reuse OTP - second use"
            }
        )
        assert response2.status_code == 400, f"Reuse should fail: {response2.status_code}"
        print(f"Correctly rejected reused OTP: {response2.json().get('detail')}")


class TestDefaultShipTo:
    """Test default shipping address endpoint"""
    
    def test_brand_admin_can_save_default_ship_to(self, brand_token):
        """POST /api/brand/default-ship-to (brand_admin) saves address"""
        response = requests.post(
            f"{BASE_URL}/api/brand/default-ship-to",
            headers={"Authorization": f"Bearer {brand_token}", "Content-Type": "application/json"},
            json={
                "name": "Test Contact",
                "phone": "9876543210",
                "address": "123 Test Street",
                "city": "Mumbai",
                "state": "Maharashtra",
                "pincode": "400001"
            }
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "message" in data, "Missing message in response"
        print(f"Default ship-to saved: {data.get('message')}")
        
        # Verify it was saved by checking /api/brand/me
        me_response = requests.get(
            f"{BASE_URL}/api/brand/me",
            headers={"Authorization": f"Bearer {brand_token}"}
        )
        assert me_response.status_code == 200
        me_data = me_response.json()
        default_ship = me_data.get("brand", {}).get("default_ship_to", {})
        assert default_ship.get("city") == "Mumbai", f"City not saved: {default_ship}"
        print(f"Verified default_ship_to: {default_ship}")


class TestRegressionBrandFlows:
    """Regression tests for existing brand portal flows"""
    
    def test_brand_fabrics_returns_filtered_catalog(self, brand_token):
        """GET /api/brand/fabrics returns filtered catalog"""
        response = requests.get(
            f"{BASE_URL}/api/brand/fabrics",
            headers={"Authorization": f"Bearer {brand_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        fabrics = response.json()
        assert isinstance(fabrics, list), "Response should be a list"
        print(f"Brand catalog has {len(fabrics)} fabrics")
    
    def test_brand_credit_summary(self, brand_token):
        """GET /api/brand/credit-summary returns credit info"""
        response = requests.get(
            f"{BASE_URL}/api/brand/credit-summary",
            headers={"Authorization": f"Bearer {brand_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "credit" in data, "Missing credit field"
        assert "sample_credits" in data, "Missing sample_credits field"
        
        credit = data["credit"]
        assert "available" in credit, "Missing available in credit"
        
        sample = data["sample_credits"]
        assert "available" in sample, "Missing available in sample_credits"
        
        print(f"Credit available: ₹{credit.get('available')}, Sample credits: {sample.get('available')}")
    
    def test_admin_can_list_brands(self, admin_token):
        """GET /api/admin/brands returns brand list"""
        response = requests.get(
            f"{BASE_URL}/api/admin/brands",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        brands = response.json()
        assert isinstance(brands, list), "Response should be a list"
        print(f"Admin sees {len(brands)} brands")
    
    def test_admin_can_get_brand_detail(self, admin_token):
        """GET /api/admin/brands/{id} returns brand detail"""
        response = requests.get(
            f"{BASE_URL}/api/admin/brands/{BRAND_ID}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "brand" in data, "Missing brand field"
        assert "users" in data, "Missing users field"
        
        brand = data["brand"]
        assert brand.get("id") == BRAND_ID, "Brand ID mismatch"
        print(f"Brand detail: {brand.get('name')}, {len(data.get('users', []))} users")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
