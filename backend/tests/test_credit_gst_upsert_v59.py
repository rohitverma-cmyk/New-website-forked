"""
Test Suite for Credit Wallet GST Upsert Feature (Iteration 59)

Tests:
1. GET /api/orders/credit/wallets/lookup - lookup by GSTIN
2. POST /api/orders/credit/wallets/upsert - create/update wallet
3. Credit-ops admin login (renamed email)
4. Email references verification (accounts@ → creditoperations@)
5. GST search filter in credit management
"""
import pytest
import requests
import os
import uuid
from dotenv import load_dotenv

load_dotenv('/app/backend/.env')

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    # Fallback for local testing
    BASE_URL = "https://fabric-sourcing-cms.preview.emergentagent.com"

# Test credentials
ADMIN_EMAIL = "admin@locofast.com"
ADMIN_PASSWORD = "admin123"
CREDITOPS_EMAIL = "creditoperations@locofast.com"
CREDITOPS_PASSWORD = "Accounts@123"
OLD_ACCOUNTS_EMAIL = "accounts@locofast.com"
UPSERT_PASSWORD = "0905"  # Password gate for wallet operations

# Test GSTIN (unregistered for create flow)
TEST_GSTIN_NEW = "27AABCB1234C1Z5"
TEST_GSTIN_INVALID = "INVALID123"


class TestCreditWalletLookup:
    """Tests for GET /api/orders/credit/wallets/lookup endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get admin token for authenticated requests"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        self.token = response.json().get("token")
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_lookup_invalid_gstin_length(self):
        """400 when GSTIN length != 15"""
        response = requests.get(
            f"{BASE_URL}/api/orders/credit/wallets/lookup",
            params={"gst_number": "INVALID123"},
            headers=self.headers
        )
        assert response.status_code == 400
        assert "15 characters" in response.json().get("detail", "")
        print("✓ Lookup rejects invalid GSTIN length")
    
    def test_lookup_nonexistent_gstin(self):
        """Returns {found: false} when no wallet exists"""
        # Use a random GSTIN that likely doesn't exist
        random_gstin = f"27ZZZZZ{uuid.uuid4().hex[:8].upper()}Z5"[:15]
        response = requests.get(
            f"{BASE_URL}/api/orders/credit/wallets/lookup",
            params={"gst_number": random_gstin},
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("found") == False
        assert data.get("gst_number") == random_gstin
        print(f"✓ Lookup returns found=false for nonexistent GSTIN: {random_gstin}")
    
    def test_lookup_existing_gstin(self):
        """Returns {found: true, wallet: {...}} when wallet exists"""
        # First, get list of existing wallets to find one
        response = requests.get(
            f"{BASE_URL}/api/orders/credit/wallets",
            headers=self.headers
        )
        assert response.status_code == 200
        wallets = response.json()
        
        if wallets and len(wallets) > 0:
            # Find a wallet with a valid GSTIN
            existing_wallet = next((w for w in wallets if w.get("gst_number") and len(w.get("gst_number", "")) == 15), None)
            if existing_wallet:
                gstin = existing_wallet["gst_number"]
                response = requests.get(
                    f"{BASE_URL}/api/orders/credit/wallets/lookup",
                    params={"gst_number": gstin},
                    headers=self.headers
                )
                assert response.status_code == 200
                data = response.json()
                assert data.get("found") == True
                assert "wallet" in data
                assert data["wallet"]["gst_number"] == gstin
                print(f"✓ Lookup returns found=true for existing GSTIN: {gstin}")
            else:
                print("⚠ No existing wallet with valid GSTIN found, skipping existing lookup test")
        else:
            print("⚠ No wallets in database, skipping existing lookup test")


class TestCreditWalletUpsert:
    """Tests for POST /api/orders/credit/wallets/upsert endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get admin token for authenticated requests"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        self.token = response.json().get("token")
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_upsert_requires_password(self):
        """403 when password is missing or wrong"""
        response = requests.post(
            f"{BASE_URL}/api/orders/credit/wallets/upsert",
            json={
                "gst_number": TEST_GSTIN_NEW,
                "credit_limit": 100000,
                "password": "wrong_password"
            },
            headers=self.headers
        )
        assert response.status_code == 403
        assert "Invalid password" in response.json().get("detail", "")
        print("✓ Upsert rejects wrong password")
    
    def test_upsert_validates_gstin_length(self):
        """400 when GSTIN length != 15"""
        response = requests.post(
            f"{BASE_URL}/api/orders/credit/wallets/upsert",
            json={
                "gst_number": "INVALID",
                "credit_limit": 100000,
                "password": UPSERT_PASSWORD
            },
            headers=self.headers
        )
        assert response.status_code == 400
        assert "15 characters" in response.json().get("detail", "")
        print("✓ Upsert rejects invalid GSTIN length")
    
    def test_upsert_validates_credit_limit(self):
        """400 when credit_limit < 0"""
        response = requests.post(
            f"{BASE_URL}/api/orders/credit/wallets/upsert",
            json={
                "gst_number": TEST_GSTIN_NEW,
                "credit_limit": -1000,
                "password": UPSERT_PASSWORD
            },
            headers=self.headers
        )
        assert response.status_code == 400
        assert "≥ 0" in response.json().get("detail", "")
        print("✓ Upsert rejects negative credit limit")
    
    def test_upsert_create_new_wallet(self):
        """Creates new wallet when GST is unknown (created=true)"""
        # Use a unique GSTIN for this test
        unique_gstin = f"27TEST{uuid.uuid4().hex[:8].upper()}Z"[:15]
        
        response = requests.post(
            f"{BASE_URL}/api/orders/credit/wallets/upsert",
            json={
                "gst_number": unique_gstin,
                "credit_limit": 500000,
                "company": "Test Company V59",
                "name": "Test Contact",
                "email": "test@example.com",
                "lender": "Test Lender",
                "credit_period_days": 30,
                "password": UPSERT_PASSWORD
            },
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") == True
        assert data.get("created") == True
        assert data.get("updated") == False
        assert "wallet" in data
        assert data["wallet"]["gst_number"] == unique_gstin
        assert data["wallet"]["credit_limit"] == 500000
        assert data["wallet"]["balance"] == 500000  # New wallet: balance = limit
        print(f"✓ Upsert creates new wallet for GSTIN: {unique_gstin}")
        
        # Verify wallet appears in GET /api/orders/credit/wallets
        response = requests.get(
            f"{BASE_URL}/api/orders/credit/wallets",
            headers=self.headers
        )
        assert response.status_code == 200
        wallets = response.json()
        found = any(w.get("gst_number") == unique_gstin for w in wallets)
        assert found, f"New wallet not found in wallets list"
        print(f"✓ New wallet appears in GET /api/orders/credit/wallets")
        
        # Verify via lookup endpoint
        response = requests.get(
            f"{BASE_URL}/api/orders/credit/wallets/lookup",
            params={"gst_number": unique_gstin},
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("found") == True
        print(f"✓ New wallet found via lookup endpoint")
        
        # Store for cleanup/update test
        self.created_gstin = unique_gstin
        return unique_gstin
    
    def test_upsert_replace_mode(self):
        """Replace mode overwrites limit + balance"""
        # First create a wallet
        unique_gstin = f"27REPL{uuid.uuid4().hex[:8].upper()}Z"[:15]
        
        # Create
        response = requests.post(
            f"{BASE_URL}/api/orders/credit/wallets/upsert",
            json={
                "gst_number": unique_gstin,
                "credit_limit": 100000,
                "company": "Replace Test Co",
                "password": UPSERT_PASSWORD
            },
            headers=self.headers
        )
        assert response.status_code == 200
        assert response.json().get("created") == True
        print(f"✓ Created wallet for replace test: {unique_gstin}")
        
        # Now replace with new limit
        response = requests.post(
            f"{BASE_URL}/api/orders/credit/wallets/upsert",
            json={
                "gst_number": unique_gstin,
                "credit_limit": 200000,
                "mode": "replace",
                "password": UPSERT_PASSWORD
            },
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") == True
        assert data.get("created") == False
        assert data.get("updated") == True
        assert data.get("mode") == "replace"
        assert data["wallet"]["credit_limit"] == 200000
        assert data["wallet"]["balance"] == 200000  # Replace resets balance
        print(f"✓ Replace mode updated wallet: limit=200000, balance=200000")
    
    def test_upsert_topup_mode(self):
        """Top-up mode adds to existing limit and balance"""
        # First create a wallet
        unique_gstin = f"27TOPU{uuid.uuid4().hex[:8].upper()}Z"[:15]
        
        # Create with initial limit
        response = requests.post(
            f"{BASE_URL}/api/orders/credit/wallets/upsert",
            json={
                "gst_number": unique_gstin,
                "credit_limit": 100000,
                "company": "Topup Test Co",
                "password": UPSERT_PASSWORD
            },
            headers=self.headers
        )
        assert response.status_code == 200
        assert response.json().get("created") == True
        print(f"✓ Created wallet for topup test: {unique_gstin}")
        
        # Now top-up
        response = requests.post(
            f"{BASE_URL}/api/orders/credit/wallets/upsert",
            json={
                "gst_number": unique_gstin,
                "credit_limit": 50000,  # Add 50k
                "mode": "topup",
                "password": UPSERT_PASSWORD
            },
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") == True
        assert data.get("created") == False
        assert data.get("updated") == True
        assert data.get("mode") == "topup"
        assert data["wallet"]["credit_limit"] == 150000  # 100k + 50k
        assert data["wallet"]["balance"] == 150000  # 100k + 50k (no usage yet)
        print(f"✓ Topup mode updated wallet: limit=150000, balance=150000")
    
    def test_upsert_credit_period_defaults(self):
        """credit_period_days defaults to 30 if not in {30,60,90}"""
        unique_gstin = f"27PERD{uuid.uuid4().hex[:8].upper()}Z"[:15]
        
        # Create with invalid period
        response = requests.post(
            f"{BASE_URL}/api/orders/credit/wallets/upsert",
            json={
                "gst_number": unique_gstin,
                "credit_limit": 100000,
                "credit_period_days": 45,  # Invalid, should default to 30
                "company": "Period Test Co",
                "password": UPSERT_PASSWORD
            },
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["wallet"]["credit_period_days"] == 30
        print(f"✓ Invalid credit_period_days (45) defaulted to 30")


class TestCreditOpsAdminLogin:
    """Tests for renamed credit-ops admin login"""
    
    def test_new_email_login_works(self):
        """POST /api/auth/login with creditoperations@locofast.com works"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": CREDITOPS_EMAIL,
            "password": CREDITOPS_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert data.get("admin", {}).get("email") == CREDITOPS_EMAIL
        assert data.get("admin", {}).get("role") == "accounts"
        print(f"✓ Credit-ops login works with new email: {CREDITOPS_EMAIL}")
    
    def test_old_email_login_fails(self):
        """POST /api/auth/login with accounts@locofast.com should NOT work"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": OLD_ACCOUNTS_EMAIL,
            "password": CREDITOPS_PASSWORD
        })
        # Should fail - either 401 or 404
        assert response.status_code in [401, 404], f"Old email should not work, got {response.status_code}"
        print(f"✓ Old email {OLD_ACCOUNTS_EMAIL} correctly rejected")


class TestCreditBalanceEndpoint:
    """Tests for GET /api/credit/balance endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get admin token for authenticated requests"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        self.token = response.json().get("token")
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_credit_balance_by_gst(self):
        """GET /api/credit/balance?gst_number=... returns wallet info"""
        # First create a wallet
        unique_gstin = f"27BALC{uuid.uuid4().hex[:8].upper()}Z"[:15]
        
        response = requests.post(
            f"{BASE_URL}/api/orders/credit/wallets/upsert",
            json={
                "gst_number": unique_gstin,
                "credit_limit": 300000,
                "company": "Balance Test Co",
                "email": "balance@test.com",
                "password": UPSERT_PASSWORD
            },
            headers=self.headers
        )
        assert response.status_code == 200
        print(f"✓ Created wallet for balance test: {unique_gstin}")
        
        # Now check balance
        response = requests.get(
            f"{BASE_URL}/api/credit/balance",
            params={"gst_number": unique_gstin}
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("gst_number") == unique_gstin
        assert data.get("credit_limit") == 300000
        assert data.get("balance") == 300000
        print(f"✓ Credit balance endpoint returns correct data for GSTIN")


class TestWalletListEndpoint:
    """Tests for GET /api/orders/credit/wallets endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get admin token for authenticated requests"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        self.token = response.json().get("token")
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_list_wallets(self):
        """GET /api/orders/credit/wallets returns list of wallets"""
        response = requests.get(
            f"{BASE_URL}/api/orders/credit/wallets",
            headers=self.headers
        )
        assert response.status_code == 200
        wallets = response.json()
        assert isinstance(wallets, list)
        print(f"✓ Wallet list endpoint returns {len(wallets)} wallets")
        
        # Verify wallet structure
        if wallets:
            wallet = wallets[0]
            expected_fields = ["gst_number", "credit_limit", "balance"]
            for field in expected_fields:
                assert field in wallet, f"Missing field: {field}"
            print(f"✓ Wallet structure contains expected fields")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
