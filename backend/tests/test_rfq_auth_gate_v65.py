"""
Test suite for RFQ Auth Gate (WhatsApp OTP flow) - v65
Tests the unified RFQ flow per May 2026 spec:
1. WhatsApp OTP send/verify endpoints
2. Profile update with GST verification
3. Customer profile completeness checks
"""
import pytest
import requests
import os
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
MONGO_URL = 'mongodb://localhost:27017'
DB_NAME = 'test_database'


class TestWhatsAppOTPEndpoints:
    """Test WhatsApp OTP send and verify endpoints"""
    
    def test_send_whatsapp_otp_success(self):
        """POST /api/customer/send-whatsapp-otp returns success with masked phone"""
        response = requests.post(
            f"{BASE_URL}/api/customer/send-whatsapp-otp",
            json={"phone": "9876543210"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "message" in data, "Response should contain 'message'"
        assert "phone_masked" in data, "Response should contain 'phone_masked'"
        assert "OTP sent" in data["message"], f"Unexpected message: {data['message']}"
        # Phone should be masked (e.g., "9198****10")
        assert "****" in data["phone_masked"], f"Phone not masked: {data['phone_masked']}"
        print(f"✓ send-whatsapp-otp: {data}")
    
    def test_send_whatsapp_otp_invalid_phone(self):
        """POST /api/customer/send-whatsapp-otp with invalid phone returns 400"""
        response = requests.post(
            f"{BASE_URL}/api/customer/send-whatsapp-otp",
            json={"phone": "123"}  # Too short
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print(f"✓ send-whatsapp-otp invalid phone: {response.json()}")
    
    def test_verify_whatsapp_otp_invalid(self):
        """POST /api/customer/verify-whatsapp-otp with wrong OTP returns 400"""
        response = requests.post(
            f"{BASE_URL}/api/customer/verify-whatsapp-otp",
            json={"phone": "9876543210", "otp": "000000"}
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        
        data = response.json()
        assert "Invalid or expired OTP" in data.get("detail", ""), f"Unexpected error: {data}"
        print(f"✓ verify-whatsapp-otp invalid: {data}")


class TestFullOTPFlow:
    """Test complete OTP flow: send → read from DB → verify → profile update"""
    
    @pytest.fixture
    def test_phone(self):
        """Generate unique test phone for each test"""
        import time
        return f"98765{int(time.time()) % 100000:05d}"
    
    def test_full_otp_flow(self, test_phone):
        """Complete flow: send OTP, read from DB, verify, get token"""
        # Step 1: Send OTP
        send_response = requests.post(
            f"{BASE_URL}/api/customer/send-whatsapp-otp",
            json={"phone": test_phone}
        )
        assert send_response.status_code == 200, f"Send OTP failed: {send_response.text}"
        print(f"✓ Step 1: OTP sent to {test_phone}")
        
        # Step 2: Read OTP from database
        async def get_otp():
            client = AsyncIOMotorClient(MONGO_URL)
            db = client[DB_NAME]
            e164_phone = f"91{test_phone}"
            otp_doc = await db.customer_otps.find_one(
                {'phone': e164_phone, 'used': False, 'channel': 'whatsapp'},
                sort=[('created_at', -1)]
            )
            return otp_doc['otp'] if otp_doc else None
        
        otp = asyncio.run(get_otp())
        assert otp is not None, "OTP not found in database"
        print(f"✓ Step 2: OTP retrieved from DB: {otp}")
        
        # Step 3: Verify OTP
        verify_response = requests.post(
            f"{BASE_URL}/api/customer/verify-whatsapp-otp",
            json={"phone": test_phone, "otp": otp}
        )
        assert verify_response.status_code == 200, f"Verify OTP failed: {verify_response.text}"
        
        data = verify_response.json()
        assert "token" in data, "Response should contain 'token'"
        assert "customer" in data, "Response should contain 'customer'"
        assert "is_new" in data, "Response should contain 'is_new'"
        
        token = data["token"]
        customer = data["customer"]
        is_new = data["is_new"]
        
        print(f"✓ Step 3: OTP verified, is_new={is_new}")
        print(f"  Customer: {customer.get('email', 'N/A')}, phone_verified={customer.get('phone_verified')}")
        
        # Verify customer has placeholder email for new phone-only signup
        if is_new:
            assert "@phone.locofast.local" in customer.get("email", ""), \
                "New phone-only customer should have placeholder email"
        
        return token, customer, is_new
    
    def test_profile_update_with_gst(self, test_phone):
        """Test profile update with GST verification after OTP login"""
        # First complete OTP flow
        send_response = requests.post(
            f"{BASE_URL}/api/customer/send-whatsapp-otp",
            json={"phone": test_phone}
        )
        assert send_response.status_code == 200
        
        async def get_otp():
            client = AsyncIOMotorClient(MONGO_URL)
            db = client[DB_NAME]
            e164_phone = f"91{test_phone}"
            otp_doc = await db.customer_otps.find_one(
                {'phone': e164_phone, 'used': False, 'channel': 'whatsapp'},
                sort=[('created_at', -1)]
            )
            return otp_doc['otp'] if otp_doc else None
        
        otp = asyncio.run(get_otp())
        assert otp is not None
        
        verify_response = requests.post(
            f"{BASE_URL}/api/customer/verify-whatsapp-otp",
            json={"phone": test_phone, "otp": otp}
        )
        assert verify_response.status_code == 200
        
        token = verify_response.json()["token"]
        
        # Now update profile with GST
        profile_response = requests.put(
            f"{BASE_URL}/api/customer/profile",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "name": "E2E Test User",
                "email": f"e2e.test+{test_phone}@example.com",
                "phone": test_phone,
                "gstin": "07AIKPY4565A1Z0"  # Known valid GSTIN
            }
        )
        assert profile_response.status_code == 200, f"Profile update failed: {profile_response.text}"
        
        profile = profile_response.json()
        assert profile.get("gst_verified") == True, "GST should be verified"
        assert profile.get("name") == "E2E Test User", "Name should be updated"
        assert "e2e.test" in profile.get("email", ""), "Email should be updated"
        
        print(f"✓ Profile updated with GST verification")
        print(f"  Company: {profile.get('company')}")
        print(f"  GST Status: {profile.get('gst_status')}")
        print(f"  City: {profile.get('city')}, State: {profile.get('state')}")


class TestProfileValidation:
    """Test profile validation rules"""
    
    def test_profile_update_missing_name(self):
        """Profile update without name should fail"""
        # Create a test customer first
        send_response = requests.post(
            f"{BASE_URL}/api/customer/send-whatsapp-otp",
            json={"phone": "9876500001"}
        )
        if send_response.status_code != 200:
            pytest.skip("Could not send OTP")
        
        async def get_otp():
            client = AsyncIOMotorClient(MONGO_URL)
            db = client[DB_NAME]
            otp_doc = await db.customer_otps.find_one(
                {'phone': '919876500001', 'used': False, 'channel': 'whatsapp'},
                sort=[('created_at', -1)]
            )
            return otp_doc['otp'] if otp_doc else None
        
        otp = asyncio.run(get_otp())
        if not otp:
            pytest.skip("Could not retrieve OTP")
        
        verify_response = requests.post(
            f"{BASE_URL}/api/customer/verify-whatsapp-otp",
            json={"phone": "9876500001", "otp": otp}
        )
        if verify_response.status_code != 200:
            pytest.skip("Could not verify OTP")
        
        token = verify_response.json()["token"]
        
        # Try to update without name
        profile_response = requests.put(
            f"{BASE_URL}/api/customer/profile",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "name": "",  # Empty name
                "email": "test@example.com",
                "phone": "9876500001",
                "gstin": "07AIKPY4565A1Z0"
            }
        )
        assert profile_response.status_code == 400, f"Expected 400, got {profile_response.status_code}"
        assert "Name" in profile_response.json().get("detail", "") or "Required" in profile_response.json().get("detail", "")
        print(f"✓ Profile update without name correctly rejected")
    
    def test_profile_update_invalid_gstin(self):
        """Profile update with invalid GSTIN should fail"""
        send_response = requests.post(
            f"{BASE_URL}/api/customer/send-whatsapp-otp",
            json={"phone": "9876500002"}
        )
        if send_response.status_code != 200:
            pytest.skip("Could not send OTP")
        
        async def get_otp():
            client = AsyncIOMotorClient(MONGO_URL)
            db = client[DB_NAME]
            otp_doc = await db.customer_otps.find_one(
                {'phone': '919876500002', 'used': False, 'channel': 'whatsapp'},
                sort=[('created_at', -1)]
            )
            return otp_doc['otp'] if otp_doc else None
        
        otp = asyncio.run(get_otp())
        if not otp:
            pytest.skip("Could not retrieve OTP")
        
        verify_response = requests.post(
            f"{BASE_URL}/api/customer/verify-whatsapp-otp",
            json={"phone": "9876500002", "otp": otp}
        )
        if verify_response.status_code != 200:
            pytest.skip("Could not verify OTP")
        
        token = verify_response.json()["token"]
        
        # Try to update with invalid GSTIN
        profile_response = requests.put(
            f"{BASE_URL}/api/customer/profile",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "name": "Test User",
                "email": "test@example.com",
                "phone": "9876500002",
                "gstin": "INVALID123456"  # Invalid GSTIN
            }
        )
        # Should fail with 400 (validation) or 502 (GST API error)
        assert profile_response.status_code in [400, 502], \
            f"Expected 400 or 502, got {profile_response.status_code}: {profile_response.text}"
        print(f"✓ Profile update with invalid GSTIN correctly rejected: {profile_response.json()}")


class TestRegressionEndpoints:
    """Regression tests for existing endpoints"""
    
    def test_fabrics_endpoint(self):
        """GET /api/fabrics should return fabric list"""
        response = requests.get(f"{BASE_URL}/api/fabrics?limit=1")
        assert response.status_code == 200, f"Fabrics endpoint failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        if len(data) > 0:
            assert "id" in data[0] or "slug" in data[0], "Fabric should have id or slug"
        print(f"✓ Fabrics endpoint working, returned {len(data)} fabric(s)")
    
    def test_customer_profile_unauthorized(self):
        """GET /api/customer/profile without token should return 401"""
        response = requests.get(f"{BASE_URL}/api/customer/profile")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print(f"✓ Profile endpoint correctly requires auth")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
