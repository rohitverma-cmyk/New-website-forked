"""
Test GST Verification and RFQ Lead endpoints
Tests for:
- POST /api/gst/verify with valid GSTIN
- POST /api/gst/verify with invalid GSTIN
- POST /api/enquiries/rfq-lead creates enquiry
- GET /api/fabrics regression check
- GET /api/sellers regression check
- Admin login at /api/auth/login
- Vendor login at /api/vendor/login
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "admin@locofast.com"
ADMIN_PASSWORD = "admin123"
VENDOR_EMAIL = "vendor@test.com"
VENDOR_PASSWORD = "vendor123"

# Test GSTIN (Shiv Sagar Foods)
VALID_GSTIN = "27AASCS2460H1Z0"
INVALID_GSTIN = "27AAAAA0000A1Z5"


class TestGSTVerification:
    """GST Verification endpoint tests using Sandbox.co.in API"""
    
    def test_gst_verify_valid_gstin(self):
        """POST /api/gst/verify with valid GSTIN returns valid=true with legal_name"""
        response = requests.post(
            f"{BASE_URL}/api/gst/verify",
            json={"gstin": VALID_GSTIN},
            headers={"Content-Type": "application/json"},
            timeout=30  # GST API can be slow
        )
        
        print(f"GST Verify Response Status: {response.status_code}")
        print(f"GST Verify Response: {response.json()}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert data.get('valid') == True, "Expected valid=True for valid GSTIN"
        assert 'legal_name' in data, "Response should contain legal_name"
        assert data.get('gstin') == VALID_GSTIN, "GSTIN should match input"
        assert len(data.get('legal_name', '')) > 0, "legal_name should not be empty"
        
        print(f"✓ GST verified successfully: {data.get('legal_name')}")
    
    def test_gst_verify_invalid_gstin(self):
        """POST /api/gst/verify with invalid GSTIN returns valid=false"""
        response = requests.post(
            f"{BASE_URL}/api/gst/verify",
            json={"gstin": INVALID_GSTIN},
            headers={"Content-Type": "application/json"},
            timeout=30
        )
        
        print(f"Invalid GST Response Status: {response.status_code}")
        print(f"Invalid GST Response: {response.json()}")
        
        # Should return 200 with valid=false OR 4xx error
        assert response.status_code in [200, 400, 404], f"Unexpected status: {response.status_code}"
        
        data = response.json()
        if response.status_code == 200:
            assert data.get('valid') == False, "Expected valid=False for invalid GSTIN"
        
        print("✓ Invalid GSTIN handled correctly")
    
    def test_gst_verify_short_gstin(self):
        """POST /api/gst/verify with short GSTIN returns 400"""
        response = requests.post(
            f"{BASE_URL}/api/gst/verify",
            json={"gstin": "27AAAA"},
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        
        print(f"Short GST Response Status: {response.status_code}")
        
        assert response.status_code == 400, f"Expected 400 for short GSTIN, got {response.status_code}"
        print("✓ Short GSTIN rejected with 400")


class TestRFQLead:
    """RFQ Lead endpoint tests"""
    
    def test_rfq_lead_create_success(self):
        """POST /api/enquiries/rfq-lead creates enquiry and returns success"""
        test_data = {
            "name": "TEST_RFQ_User",
            "phone": "9876543210",
            "gst_number": VALID_GSTIN,
            "company_name": "Test Company Pvt Ltd",
            "email": "test_rfq@example.com",
            "fabric_type": "Dyed Fabric",
            "gst_legal_name": "Test Legal Name",
            "gst_trade_name": "Test Trade Name",
            "gst_status": "Active",
            "gst_city": "Mumbai",
            "gst_state": "Maharashtra",
            "gst_address": "123 Test Street"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/enquiries/rfq-lead",
            json=test_data,
            headers={"Content-Type": "application/json"},
            timeout=15
        )
        
        print(f"RFQ Lead Response Status: {response.status_code}")
        print(f"RFQ Lead Response: {response.json()}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert 'message' in data, "Response should contain message"
        assert 'id' in data, "Response should contain enquiry id"
        assert len(data.get('id', '')) > 0, "Enquiry ID should not be empty"
        
        print(f"✓ RFQ Lead created successfully with ID: {data.get('id')}")
    
    def test_rfq_lead_missing_required_fields(self):
        """POST /api/enquiries/rfq-lead without required fields returns 400"""
        # Missing name, email, phone
        test_data = {
            "company_name": "Test Company",
            "fabric_type": "Greige Fabric"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/enquiries/rfq-lead",
            json=test_data,
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        
        print(f"Missing Fields Response Status: {response.status_code}")
        
        assert response.status_code == 400, f"Expected 400 for missing fields, got {response.status_code}"
        print("✓ Missing required fields rejected with 400")
    
    def test_rfq_lead_minimal_data(self):
        """POST /api/enquiries/rfq-lead with only required fields succeeds"""
        test_data = {
            "name": "TEST_Minimal_User",
            "phone": "9876543211",
            "email": "minimal@example.com"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/enquiries/rfq-lead",
            json=test_data,
            headers={"Content-Type": "application/json"},
            timeout=15
        )
        
        print(f"Minimal RFQ Response Status: {response.status_code}")
        print(f"Minimal RFQ Response: {response.json()}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert 'id' in data, "Response should contain enquiry id"
        
        print("✓ Minimal RFQ Lead created successfully")


class TestRegressionEndpoints:
    """Regression tests for existing endpoints"""
    
    def test_get_fabrics(self):
        """GET /api/fabrics returns 200 (regression check)"""
        response = requests.get(
            f"{BASE_URL}/api/fabrics",
            timeout=15
        )
        
        print(f"GET /api/fabrics Status: {response.status_code}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        print(f"✓ GET /api/fabrics returns {len(data)} fabrics")
    
    def test_get_sellers(self):
        """GET /api/sellers returns 200 (regression check)"""
        response = requests.get(
            f"{BASE_URL}/api/sellers",
            timeout=15
        )
        
        print(f"GET /api/sellers Status: {response.status_code}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        print(f"✓ GET /api/sellers returns {len(data)} sellers")


class TestAuthentication:
    """Authentication endpoint tests"""
    
    def test_admin_login(self):
        """POST /api/auth/login - Admin login works"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        
        print(f"Admin Login Status: {response.status_code}")
        
        assert response.status_code == 200, f"Admin login failed with {response.status_code}"
        
        data = response.json()
        assert 'token' in data or 'access_token' in data, "Response should contain token"
        
        print("✓ Admin login successful")
    
    def test_vendor_login(self):
        """POST /api/vendor/login - Vendor login works"""
        response = requests.post(
            f"{BASE_URL}/api/vendor/login",
            json={"email": VENDOR_EMAIL, "password": VENDOR_PASSWORD},
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        
        print(f"Vendor Login Status: {response.status_code}")
        
        assert response.status_code == 200, f"Vendor login failed with {response.status_code}"
        
        data = response.json()
        assert 'token' in data or 'access_token' in data, "Response should contain token"
        
        print("✓ Vendor login successful")
    
    def test_admin_login_invalid_credentials(self):
        """POST /api/auth/login with wrong password returns 401"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": "wrongpassword"},
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        
        print(f"Invalid Admin Login Status: {response.status_code}")
        
        assert response.status_code in [401, 400], f"Expected 401/400, got {response.status_code}"
        
        print("✓ Invalid admin credentials rejected")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
