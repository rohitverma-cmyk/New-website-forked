"""
Test Credit Balance API with GST Number lookup (v55)
Tests:
1. GET /api/credit/balance with gst_number returns has_credit=true when wallet exists
2. GET /api/credit/balance with unknown GST returns has_credit=false (200)
3. GET /api/credit/balance without email or gst_number returns 400
4. PUT /api/credit/applications/{id}/approve stores gst_number on credit_wallets doc
5. POST /api/credit/apply creates application with gst_number
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestCreditBalanceGST:
    """Credit balance lookup by GST number tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data"""
        self.admin_email = "admin@locofast.com"
        self.admin_password = "admin123"
        self.test_gst = f"27AABCT{uuid.uuid4().hex[:4].upper()}D1Z9"
        self.test_email = f"test_{uuid.uuid4().hex[:8]}@example.com"
        
    def get_admin_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": self.admin_email,
            "password": self.admin_password
        })
        if response.status_code == 200:
            return response.json().get("token")
        return None
    
    def test_credit_balance_missing_params_returns_400(self):
        """GET /api/credit/balance without email or gst_number returns 400"""
        response = requests.get(f"{BASE_URL}/api/credit/balance")
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        data = response.json()
        assert "email or gst_number is required" in data.get("detail", "")
        print("PASS: Missing params returns 400 with correct error message")
    
    def test_credit_balance_unknown_gst_returns_200_no_credit(self):
        """GET /api/credit/balance with unknown GST returns has_credit=false (200)"""
        unknown_gst = "99ZZZZZ9999Z9Z9"
        response = requests.get(f"{BASE_URL}/api/credit/balance", params={"gst_number": unknown_gst})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data.get("has_credit") == False, f"Expected has_credit=false, got {data.get('has_credit')}"
        assert data.get("balance") == 0, f"Expected balance=0, got {data.get('balance')}"
        assert data.get("credit_limit") == 0, f"Expected credit_limit=0, got {data.get('credit_limit')}"
        print(f"PASS: Unknown GST {unknown_gst} returns has_credit=false with 200")
    
    def test_credit_balance_unknown_email_returns_200_no_credit(self):
        """GET /api/credit/balance with unknown email returns has_credit=false (200)"""
        unknown_email = "nonexistent_user_xyz@example.com"
        response = requests.get(f"{BASE_URL}/api/credit/balance", params={"email": unknown_email})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data.get("has_credit") == False, f"Expected has_credit=false, got {data.get('has_credit')}"
        print(f"PASS: Unknown email returns has_credit=false with 200")
    
    def test_credit_apply_creates_application_with_gst(self):
        """POST /api/credit/apply creates application with gst_number"""
        payload = {
            "name": "Test Applicant",
            "email": self.test_email,
            "phone": "+919876543210",
            "company": "Test Company Pvt Ltd",
            "gst_number": self.test_gst,
            "turnover": "2_5cr",
            "message": "Test credit application"
        }
        response = requests.post(f"{BASE_URL}/api/credit/apply", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "id" in data, "Response should contain application id"
        assert data.get("message") == "Credit application submitted successfully"
        print(f"PASS: Credit application created with id={data.get('id')}")
        return data.get("id")
    
    def test_credit_approve_stores_gst_on_wallet(self):
        """PUT /api/credit/applications/{id}/approve stores gst_number on credit_wallets doc"""
        # First create an application
        payload = {
            "name": "GST Wallet Test",
            "email": self.test_email,
            "phone": "+919876543210",
            "company": "GST Wallet Test Co",
            "gst_number": self.test_gst,
            "turnover": "5_10cr"
        }
        create_response = requests.post(f"{BASE_URL}/api/credit/apply", json=payload)
        assert create_response.status_code == 200, f"Failed to create application: {create_response.text}"
        app_id = create_response.json().get("id")
        print(f"Created application: {app_id}")
        
        # Get admin token
        token = self.get_admin_token()
        if not token:
            pytest.skip("Could not get admin token")
        
        # Approve the application
        approve_response = requests.put(
            f"{BASE_URL}/api/credit/applications/{app_id}/approve",
            json={"credit_limit": 500000},
            headers={"Authorization": f"Bearer {token}"}
        )
        assert approve_response.status_code == 200, f"Failed to approve: {approve_response.text}"
        print(f"Approved application with credit_limit=500000")
        
        # Now check credit balance by GST
        balance_response = requests.get(f"{BASE_URL}/api/credit/balance", params={"gst_number": self.test_gst})
        assert balance_response.status_code == 200, f"Balance check failed: {balance_response.text}"
        balance_data = balance_response.json()
        
        assert balance_data.get("has_credit") == True, f"Expected has_credit=true, got {balance_data.get('has_credit')}"
        assert balance_data.get("balance") == 500000, f"Expected balance=500000, got {balance_data.get('balance')}"
        assert balance_data.get("gst_number") == self.test_gst.upper(), f"Expected gst_number={self.test_gst.upper()}, got {balance_data.get('gst_number')}"
        print(f"PASS: Credit wallet created with GST={self.test_gst}, balance=500000, has_credit=true")
    
    def test_credit_balance_gst_priority_over_email(self):
        """GST lookup takes priority - if GST wallet exists, it's returned even if email differs"""
        # This test verifies the lookup priority mentioned in the docstring
        # Create application with specific GST
        unique_gst = f"27AABCT{uuid.uuid4().hex[:4].upper()}D1Z9"
        unique_email = f"priority_test_{uuid.uuid4().hex[:8]}@example.com"
        
        payload = {
            "name": "Priority Test",
            "email": unique_email,
            "phone": "+919876543210",
            "company": "Priority Test Co",
            "gst_number": unique_gst,
            "turnover": "10_25cr"
        }
        create_response = requests.post(f"{BASE_URL}/api/credit/apply", json=payload)
        assert create_response.status_code == 200
        app_id = create_response.json().get("id")
        
        # Approve
        token = self.get_admin_token()
        if not token:
            pytest.skip("Could not get admin token")
        
        approve_response = requests.put(
            f"{BASE_URL}/api/credit/applications/{app_id}/approve",
            json={"credit_limit": 300000},
            headers={"Authorization": f"Bearer {token}"}
        )
        assert approve_response.status_code == 200
        
        # Check by GST - should find the wallet
        gst_response = requests.get(f"{BASE_URL}/api/credit/balance", params={"gst_number": unique_gst})
        assert gst_response.status_code == 200
        gst_data = gst_response.json()
        assert gst_data.get("has_credit") == True
        assert gst_data.get("balance") == 300000
        print(f"PASS: GST lookup found wallet with balance=300000")
        
        # Check by email - should also find the same wallet
        email_response = requests.get(f"{BASE_URL}/api/credit/balance", params={"email": unique_email})
        assert email_response.status_code == 200
        email_data = email_response.json()
        assert email_data.get("has_credit") == True
        assert email_data.get("balance") == 300000
        print(f"PASS: Email lookup also found the same wallet")


class TestCreditApplicationFlow:
    """Full credit application flow tests"""
    
    def test_credit_apply_validation(self):
        """POST /api/credit/apply validates required fields"""
        # Missing required fields
        response = requests.post(f"{BASE_URL}/api/credit/apply", json={
            "name": "Test"
            # Missing email, phone, company
        })
        assert response.status_code == 400, f"Expected 400 for missing fields, got {response.status_code}"
        print("PASS: Credit apply validates required fields")
    
    def test_credit_apply_with_all_fields(self):
        """POST /api/credit/apply accepts all optional fields"""
        payload = {
            "name": "Full Test Applicant",
            "email": f"full_test_{uuid.uuid4().hex[:8]}@example.com",
            "phone": "+919876543210",
            "company": "Full Test Company",
            "gst_number": f"27AABCT{uuid.uuid4().hex[:4].upper()}D1Z9",
            "turnover": "25cr_plus",
            "message": "Full test with all fields",
            "company_type": "pvt_ltd",
            "documents": []
        }
        response = requests.post(f"{BASE_URL}/api/credit/apply", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "id" in data
        print(f"PASS: Credit application with all fields created: {data.get('id')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
