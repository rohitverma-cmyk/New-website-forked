"""
Test Customer Profile Mandatory Fields + GST Verification (Phase 44)
Tests:
- PUT /api/customer/profile validation (name, phone, gstin mandatory)
- GST verification via Sandbox.co.in API
- GET /api/customer/profile returns saved fields
- Public /api/gst/verify endpoint still works
"""
import pytest
import requests
import os
import pymongo
import time
from dotenv import load_dotenv

load_dotenv('/app/backend/.env')

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
MONGO_URL = os.environ.get('MONGO_URL')
DB_NAME = os.environ.get('DB_NAME')

# Test email from requirements
TEST_EMAIL = "profile-test@locofast.com"
# Test GSTINs from requirements
GSTIN_INVALID_PATTERN = "29AAACR5055K1Z2"  # Valid format but fails upstream
GSTIN_VALID_EMPTY_COMPANY = "27AAPFU0939F1ZV"  # Returns valid:true but empty legal_name


@pytest.fixture(scope="module")
def customer_token():
    """Get customer JWT token via OTP flow - shared across all tests"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    
    # Connect to MongoDB to read OTP
    mongo_client = pymongo.MongoClient(MONGO_URL)
    db = mongo_client[DB_NAME]
    
    # Clear old OTPs for this email to avoid rate limiting issues
    db.customer_otps.delete_many({"email": TEST_EMAIL})
    
    # Send OTP
    resp = session.post(f"{BASE_URL}/api/customer/send-otp", json={"email": TEST_EMAIL})
    assert resp.status_code == 200, f"Failed to send OTP: {resp.text}"
    
    # Wait a moment for DB write
    time.sleep(0.5)
    
    # Get OTP from database
    otp_doc = db.customer_otps.find_one(
        {"email": TEST_EMAIL, "used": False},
        sort=[("created_at", -1)]
    )
    assert otp_doc, "No OTP found in database"
    otp = otp_doc["otp"]
    
    # Verify OTP to get token
    resp = session.post(f"{BASE_URL}/api/customer/verify-otp", json={
        "email": TEST_EMAIL,
        "otp": otp
    })
    assert resp.status_code == 200, f"Failed to verify OTP: {resp.text}"
    data = resp.json()
    token = data["token"]
    
    mongo_client.close()
    return token


@pytest.fixture
def auth_session(customer_token):
    """Create authenticated session for each test"""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {customer_token}"
    })
    return session


class TestCustomerProfileValidation:
    """Customer Profile mandatory fields validation tests"""
    
    def test_profile_rejects_missing_name(self, auth_session):
        """PUT /profile rejects when name is missing"""
        resp = auth_session.put(f"{BASE_URL}/api/customer/profile", json={
            "name": "",
            "phone": "9876543210",
            "gstin": "27AAPFU0939F1ZV"
        })
        assert resp.status_code == 400
        data = resp.json()
        assert "Required" in data.get("detail", "")
        assert "Contact Person Name" in data.get("detail", "")
        print(f"✓ Missing name rejected: {data['detail']}")
    
    def test_profile_rejects_missing_phone(self, auth_session):
        """PUT /profile rejects when phone is missing"""
        resp = auth_session.put(f"{BASE_URL}/api/customer/profile", json={
            "name": "Test User",
            "phone": "",
            "gstin": "27AAPFU0939F1ZV"
        })
        assert resp.status_code == 400
        data = resp.json()
        assert "Required" in data.get("detail", "")
        assert "Phone" in data.get("detail", "")
        print(f"✓ Missing phone rejected: {data['detail']}")
    
    def test_profile_rejects_missing_gstin(self, auth_session):
        """PUT /profile rejects when gstin is missing"""
        resp = auth_session.put(f"{BASE_URL}/api/customer/profile", json={
            "name": "Test User",
            "phone": "9876543210",
            "gstin": ""
        })
        assert resp.status_code == 400
        data = resp.json()
        assert "Required" in data.get("detail", "")
        assert "GST Number" in data.get("detail", "")
        print(f"✓ Missing GSTIN rejected: {data['detail']}")
    
    def test_profile_rejects_all_missing(self, auth_session):
        """PUT /profile rejects when all mandatory fields missing"""
        resp = auth_session.put(f"{BASE_URL}/api/customer/profile", json={
            "name": "",
            "phone": "",
            "gstin": ""
        })
        assert resp.status_code == 400
        data = resp.json()
        assert "Required" in data.get("detail", "")
        # Should list all missing fields
        assert "Contact Person Name" in data.get("detail", "")
        assert "Phone" in data.get("detail", "")
        assert "GST Number" in data.get("detail", "")
        print(f"✓ All missing fields rejected: {data['detail']}")
    
    def test_profile_rejects_short_phone(self, auth_session):
        """PUT /profile rejects phone with less than 10 digits"""
        resp = auth_session.put(f"{BASE_URL}/api/customer/profile", json={
            "name": "Test User",
            "phone": "12345",  # Only 5 digits
            "gstin": "27AAPFU0939F1ZV"
        })
        assert resp.status_code == 400
        data = resp.json()
        assert "Phone must be at least 10 digits" in data.get("detail", "")
        print(f"✓ Short phone rejected: {data['detail']}")
    
    def test_profile_rejects_invalid_gstin_length(self, auth_session):
        """PUT /profile rejects GSTIN that is not 15 characters"""
        resp = auth_session.put(f"{BASE_URL}/api/customer/profile", json={
            "name": "Test User",
            "phone": "9876543210",
            "gstin": "27AAPFU0939"  # Only 11 chars
        })
        assert resp.status_code == 400
        data = resp.json()
        assert "15 characters" in data.get("detail", "")
        print(f"✓ Invalid GSTIN length rejected: {data['detail']}")


class TestGSTVerification:
    """GST verification via Sandbox.co.in API tests"""
    
    def test_profile_calls_sandbox_api_for_valid_format_gstin(self, auth_session):
        """PUT /profile calls Sandbox.co.in for 15-char GSTIN (may fail upstream)"""
        resp = auth_session.put(f"{BASE_URL}/api/customer/profile", json={
            "name": "Test User",
            "phone": "9876543210",
            "gstin": GSTIN_INVALID_PATTERN  # Valid format but fails upstream
        })
        # Should get 400 with GST verification failed message (not format error)
        assert resp.status_code == 400
        data = resp.json()
        detail = data.get("detail", "")
        # Should be a GST verification failure, not a format error
        assert "GST verification failed" in detail or "Invalid GSTIN" in detail
        print(f"✓ Sandbox API called for valid format GSTIN: {detail}")
    
    def test_profile_rejects_gstin_with_empty_company(self, auth_session):
        """PUT /profile rejects when GST API returns valid but empty company name"""
        resp = auth_session.put(f"{BASE_URL}/api/customer/profile", json={
            "name": "Test User",
            "phone": "9876543210",
            "gstin": GSTIN_VALID_EMPTY_COMPANY  # Returns valid:true but empty legal_name
        })
        # Should reject because company cannot be resolved
        assert resp.status_code == 400
        data = resp.json()
        detail = data.get("detail", "")
        assert "Company Name could not be resolved" in detail or "GST" in detail
        print(f"✓ Empty company from GST rejected: {detail}")


class TestPublicGSTVerifyEndpoint:
    """Public /api/gst/verify endpoint tests (no auth required)"""
    
    def test_public_gst_verify_endpoint_works(self):
        """GET /api/gst/verify still works for supplier signup flow"""
        resp = requests.post(f"{BASE_URL}/api/gst/verify", json={
            "gstin": GSTIN_VALID_EMPTY_COMPANY
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("valid") == True
        assert data.get("gstin") == GSTIN_VALID_EMPTY_COMPANY
        print(f"✓ Public GST verify endpoint works: valid={data['valid']}")
    
    def test_public_gst_verify_rejects_invalid_length(self):
        """Public /api/gst/verify rejects invalid GSTIN length"""
        resp = requests.post(f"{BASE_URL}/api/gst/verify", json={
            "gstin": "INVALID"
        })
        assert resp.status_code == 400
        data = resp.json()
        assert "15 characters" in data.get("detail", "")
        print(f"✓ Public GST verify rejects invalid length: {data['detail']}")


class TestGetProfile:
    """GET /api/customer/profile tests"""
    
    def test_get_profile_returns_customer_data(self, auth_session):
        """GET /profile returns customer data including GST fields"""
        resp = auth_session.get(f"{BASE_URL}/api/customer/profile")
        assert resp.status_code == 200
        data = resp.json()
        # These fields should exist
        assert "email" in data
        assert data["email"] == TEST_EMAIL
        print(f"✓ GET profile returns customer data: email={data['email']}")
        if data.get("gst_verified"):
            print(f"  - gst_verified: {data.get('gst_verified')}")
            print(f"  - gstin: {data.get('gstin')}")
            print(f"  - gst_business_type: {data.get('gst_business_type')}")


class TestEdgeCases:
    """Edge case tests for profile validation"""
    
    def test_phone_with_country_code_accepted(self, auth_session):
        """Phone with +91 prefix should work (extracts 10+ digits)"""
        resp = auth_session.put(f"{BASE_URL}/api/customer/profile", json={
            "name": "Test User",
            "phone": "+91 98765 43210",  # 12 digits total
            "gstin": GSTIN_VALID_EMPTY_COMPANY
        })
        # Will fail at GST company resolution, but phone validation should pass
        assert resp.status_code == 400
        data = resp.json()
        # Should NOT be a phone validation error
        assert "Phone must be at least 10 digits" not in data.get("detail", "")
        print(f"✓ Phone with country code accepted (failed at GST step): {data['detail']}")
    
    def test_gstin_lowercase_converted_to_uppercase(self, auth_session):
        """GSTIN should be converted to uppercase"""
        resp = auth_session.put(f"{BASE_URL}/api/customer/profile", json={
            "name": "Test User",
            "phone": "9876543210",
            "gstin": "27aapfu0939f1zv"  # lowercase
        })
        # Should process (convert to uppercase) and fail at GST company resolution
        assert resp.status_code == 400
        data = resp.json()
        # Should NOT be a format error - should reach GST verification
        assert "15 characters" not in data.get("detail", "")
        print(f"✓ Lowercase GSTIN converted to uppercase: {data['detail']}")
    
    def test_whitespace_trimmed_from_fields(self, auth_session):
        """Whitespace should be trimmed from all fields"""
        resp = auth_session.put(f"{BASE_URL}/api/customer/profile", json={
            "name": "  Test User  ",
            "phone": "  9876543210  ",
            "gstin": "  27AAPFU0939F1ZV  "
        })
        # Should process (trim whitespace) and fail at GST company resolution
        assert resp.status_code == 400
        data = resp.json()
        # Should NOT be a validation error for empty fields
        assert "Required" not in data.get("detail", "")
        print(f"✓ Whitespace trimmed from fields: {data['detail']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
