"""
Brand Portal API Tests - Comprehensive testing for B2B Brand Portal feature
Tests: Admin Brand CRUD, Brand User Management, Brand Auth, Filtered Catalog,
       Credit Line OTP Upload, FIFO Debit, Sample Credits, Razorpay Top-up
"""
import pytest
import requests
import os
import bcrypt
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "admin@locofast.com"
ADMIN_PASSWORD = "admin123"
BRAND_TEST_EMAIL = "brandtest@locofast.com"
BRAND_TEST_PASSWORD = "GQRh59B87Zod"
BRAND_ID = "03b50566-e559-4a54-97f0-4cd1179615d4"


@pytest.fixture(scope="module")
def admin_token():
    """Get admin authentication token"""
    res = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    if res.status_code == 200:
        return res.json().get("token")
    pytest.skip("Admin authentication failed")


@pytest.fixture(scope="module")
def brand_token():
    """Get brand user authentication token"""
    res = requests.post(f"{BASE_URL}/api/brand/login", json={
        "email": BRAND_TEST_EMAIL,
        "password": BRAND_TEST_PASSWORD
    })
    if res.status_code == 200:
        return res.json().get("token")
    # Try with a reset password if the original fails
    pytest.skip(f"Brand authentication failed: {res.text}")


class TestAdminBrandCRUD:
    """Slice 1 — Admin Brand CRUD operations"""
    
    def test_list_brands(self, admin_token):
        """GET /api/admin/brands returns list with user_count"""
        res = requests.get(f"{BASE_URL}/api/admin/brands", 
                          headers={"Authorization": f"Bearer {admin_token}"})
        assert res.status_code == 200
        data = res.json()
        assert isinstance(data, list)
        if len(data) > 0:
            brand = data[0]
            assert "id" in brand
            assert "name" in brand
            assert "user_count" in brand
            assert "allowed_category_ids" in brand
            print(f"✓ Found {len(data)} brands, first brand has {brand['user_count']} users")
    
    def test_get_brand_detail(self, admin_token):
        """GET /api/admin/brands/{id} returns detail with users"""
        res = requests.get(f"{BASE_URL}/api/admin/brands/{BRAND_ID}",
                          headers={"Authorization": f"Bearer {admin_token}"})
        assert res.status_code == 200
        data = res.json()
        assert "brand" in data
        assert "users" in data
        assert data["brand"]["id"] == BRAND_ID
        assert isinstance(data["users"], list)
        print(f"✓ Brand detail: {data['brand']['name']} with {len(data['users'])} users")
    
    def test_create_brand_requires_admin_auth(self):
        """POST /api/admin/brands requires admin auth"""
        res = requests.post(f"{BASE_URL}/api/admin/brands", json={
            "name": "Test Brand",
            "admin_user_email": "test@test.com",
            "admin_user_name": "Test User"
        })
        assert res.status_code in [401, 403]
        print("✓ Create brand requires admin auth")
    
    def test_create_brand_success(self, admin_token):
        """POST /api/admin/brands creates brand + first brand_admin user"""
        unique_email = f"testbrand_{uuid.uuid4().hex[:8]}@test.com"
        res = requests.post(f"{BASE_URL}/api/admin/brands",
                           headers={"Authorization": f"Bearer {admin_token}"},
                           json={
                               "name": f"TEST_Brand_{uuid.uuid4().hex[:6]}",
                               "gst": "27TEST0000A1Z5",
                               "address": "Test Address",
                               "phone": "+919999999999",
                               "admin_user_email": unique_email,
                               "admin_user_name": "Test Admin",
                               "allowed_category_ids": ["cat-denim"]
                           })
        assert res.status_code == 200
        data = res.json()
        assert "id" in data
        assert "admin_user_id" in data
        assert "temporary_password_for_reference" in data
        print(f"✓ Created brand {data['id']} with temp password")
        
        # Cleanup - soft delete the test brand
        requests.delete(f"{BASE_URL}/api/admin/brands/{data['id']}",
                       headers={"Authorization": f"Bearer {admin_token}"})
    
    def test_update_brand(self, admin_token):
        """PUT /api/admin/brands/{id} updates fields"""
        res = requests.put(f"{BASE_URL}/api/admin/brands/{BRAND_ID}",
                          headers={"Authorization": f"Bearer {admin_token}"},
                          json={"phone": "+919999999999"})
        assert res.status_code == 200
        assert res.json().get("message") == "Brand updated"
        print("✓ Brand updated successfully")
    
    def test_update_brand_allowed_categories(self, admin_token):
        """PUT /api/admin/brands/{id} updates allowed categories"""
        res = requests.put(f"{BASE_URL}/api/admin/brands/{BRAND_ID}",
                          headers={"Authorization": f"Bearer {admin_token}"},
                          json={"allowed_category_ids": ["cat-denim", "cat-cotton"]})
        assert res.status_code == 200
        print("✓ Brand allowed categories updated")


class TestBrandUserManagement:
    """Slice 1 — Brand User Management"""
    
    def test_admin_add_brand_user(self, admin_token):
        """POST /api/admin/brands/{id}/users creates new brand user"""
        unique_email = f"testuser_{uuid.uuid4().hex[:8]}@test.com"
        res = requests.post(f"{BASE_URL}/api/admin/brands/{BRAND_ID}/users",
                           headers={"Authorization": f"Bearer {admin_token}"},
                           json={
                               "email": unique_email,
                               "name": "Test User",
                               "role": "brand_user"
                           })
        assert res.status_code == 200
        data = res.json()
        assert "id" in data
        assert "temporary_password_for_reference" in data
        print(f"✓ Created brand user {data['id']}")
        
        # Cleanup - suspend the test user
        requests.delete(f"{BASE_URL}/api/admin/brands/{BRAND_ID}/users/{data['id']}",
                       headers={"Authorization": f"Bearer {admin_token}"})
    
    def test_admin_suspend_brand_user(self, admin_token):
        """DELETE /api/admin/brands/{id}/users/{uid} suspends user"""
        # First create a user to suspend
        unique_email = f"suspend_{uuid.uuid4().hex[:8]}@test.com"
        create_res = requests.post(f"{BASE_URL}/api/admin/brands/{BRAND_ID}/users",
                                   headers={"Authorization": f"Bearer {admin_token}"},
                                   json={
                                       "email": unique_email,
                                       "name": "To Suspend",
                                       "role": "brand_user"
                                   })
        if create_res.status_code != 200:
            pytest.skip("Could not create test user")
        
        user_id = create_res.json()["id"]
        
        # Now suspend
        res = requests.delete(f"{BASE_URL}/api/admin/brands/{BRAND_ID}/users/{user_id}",
                             headers={"Authorization": f"Bearer {admin_token}"})
        assert res.status_code == 200
        assert res.json().get("message") == "User suspended"
        print("✓ Brand user suspended")


class TestBrandAuth:
    """Slice 1 — Brand authentication"""
    
    def test_brand_login_success(self):
        """POST /api/brand/login returns JWT with must_reset_password flag"""
        res = requests.post(f"{BASE_URL}/api/brand/login", json={
            "email": BRAND_TEST_EMAIL,
            "password": BRAND_TEST_PASSWORD
        })
        assert res.status_code == 200
        data = res.json()
        assert "token" in data
        assert "user" in data
        assert "must_reset_password" in data["user"]
        assert data["user"]["email"] == BRAND_TEST_EMAIL.lower()
        print(f"✓ Brand login success, must_reset_password={data['user']['must_reset_password']}")
    
    def test_brand_login_invalid_password(self):
        """POST /api/brand/login with invalid password returns 401"""
        res = requests.post(f"{BASE_URL}/api/brand/login", json={
            "email": BRAND_TEST_EMAIL,
            "password": "wrongpassword"
        })
        assert res.status_code == 401
        print("✓ Invalid password returns 401")
    
    def test_brand_me(self, brand_token):
        """GET /api/brand/me works with token"""
        res = requests.get(f"{BASE_URL}/api/brand/me",
                          headers={"Authorization": f"Bearer {brand_token}"})
        assert res.status_code == 200
        data = res.json()
        assert "user" in data
        assert "brand" in data
        print(f"✓ Brand me: {data['user']['name']} at {data['brand']['name']}")


class TestFilteredCatalog:
    """Slice 1 — Filtered catalog for brands"""
    
    def test_brand_fabrics_returns_allowed_categories_only(self, brand_token):
        """GET /api/brand/fabrics returns fabrics only from allowed_category_ids"""
        res = requests.get(f"{BASE_URL}/api/brand/fabrics",
                          headers={"Authorization": f"Bearer {brand_token}"})
        assert res.status_code == 200
        fabrics = res.json()
        assert isinstance(fabrics, list)
        # Brand has cat-denim and cat-cotton allowed
        for f in fabrics:
            assert f.get("category_id") in ["cat-denim", "cat-cotton"], \
                f"Fabric {f.get('name')} has disallowed category {f.get('category_id')}"
        print(f"✓ Brand fabrics: {len(fabrics)} fabrics from allowed categories")
    
    def test_brand_fabric_detail_allowed(self, brand_token):
        """GET /api/brand/fabrics/{id} returns fabric if category allowed"""
        # First get a fabric from the list
        list_res = requests.get(f"{BASE_URL}/api/brand/fabrics",
                               headers={"Authorization": f"Bearer {brand_token}"})
        fabrics = list_res.json()
        if not fabrics:
            pytest.skip("No fabrics available for brand")
        
        fabric_id = fabrics[0]["id"]
        res = requests.get(f"{BASE_URL}/api/brand/fabrics/{fabric_id}",
                          headers={"Authorization": f"Bearer {brand_token}"})
        assert res.status_code == 200
        data = res.json()
        assert data["id"] == fabric_id
        print(f"✓ Brand fabric detail: {data['name']}")


class TestCreditLineOTP:
    """Slice 2 — Credit Line OTP upload"""
    
    def test_request_otp_requires_valid_lender(self, admin_token):
        """POST /api/admin/brands/{id}/credit-lines/otp requires lender in {Stride,Muthoot,Mintifi}"""
        res = requests.post(f"{BASE_URL}/api/admin/brands/{BRAND_ID}/credit-lines/otp",
                           headers={"Authorization": f"Bearer {admin_token}"},
                           json={
                               "lender_name": "InvalidLender",
                               "amount_inr": 100000
                           })
        assert res.status_code == 400
        assert "Lender must be one of" in res.json().get("detail", "")
        print("✓ Invalid lender rejected")
    
    def test_request_otp_requires_positive_amount(self, admin_token):
        """POST /api/admin/brands/{id}/credit-lines/otp requires positive amount"""
        res = requests.post(f"{BASE_URL}/api/admin/brands/{BRAND_ID}/credit-lines/otp",
                           headers={"Authorization": f"Bearer {admin_token}"},
                           json={
                               "lender_name": "Stride",
                               "amount_inr": -100
                           })
        assert res.status_code == 400
        assert "positive" in res.json().get("detail", "").lower()
        print("✓ Negative amount rejected")
    
    def test_request_otp_success(self, admin_token):
        """POST /api/admin/brands/{id}/credit-lines/otp returns otp_request_id + sent_to"""
        res = requests.post(f"{BASE_URL}/api/admin/brands/{BRAND_ID}/credit-lines/otp",
                           headers={"Authorization": f"Bearer {admin_token}"},
                           json={
                               "lender_name": "Stride",
                               "amount_inr": 50000
                           })
        assert res.status_code == 200
        data = res.json()
        assert "otp_request_id" in data
        assert "sent_to" in data
        assert "expires_in_minutes" in data
        print(f"✓ OTP requested, sent to {data['sent_to']}")
    
    def test_create_credit_line_invalid_otp(self, admin_token):
        """POST /api/admin/brands/{id}/credit-lines with invalid OTP returns 400"""
        res = requests.post(f"{BASE_URL}/api/admin/brands/{BRAND_ID}/credit-lines",
                           headers={"Authorization": f"Bearer {admin_token}"},
                           json={
                               "otp_request_id": "invalid-id",
                               "otp_code": "123456",
                               "lender_name": "Stride",
                               "amount_inr": 50000
                           })
        assert res.status_code == 400
        print("✓ Invalid OTP request rejected")


class TestCreditSummaryAndLedger:
    """Slice 2 — Credit summary and ledger"""
    
    def test_brand_credit_summary(self, brand_token):
        """GET /api/brand/credit-summary returns credit + sample_credits"""
        res = requests.get(f"{BASE_URL}/api/brand/credit-summary",
                          headers={"Authorization": f"Bearer {brand_token}"})
        assert res.status_code == 200
        data = res.json()
        assert "credit" in data
        assert "sample_credits" in data
        
        credit = data["credit"]
        assert "total_allocated" in credit
        assert "total_utilized" in credit
        assert "available" in credit
        assert "lines" in credit
        
        sample = data["sample_credits"]
        assert "total" in sample
        assert "used" in sample
        assert "available" in sample
        
        print(f"✓ Credit summary: ₹{credit['available']} available, {sample['available']} sample credits")
    
    def test_brand_ledger(self, brand_token):
        """GET /api/brand/ledger returns entries sorted desc"""
        res = requests.get(f"{BASE_URL}/api/brand/ledger",
                          headers={"Authorization": f"Bearer {brand_token}"})
        assert res.status_code == 200
        data = res.json()
        assert isinstance(data, list)
        if len(data) > 1:
            # Check descending order
            dates = [e["created_at"] for e in data]
            assert dates == sorted(dates, reverse=True), "Ledger not sorted desc"
        print(f"✓ Brand ledger: {len(data)} entries")
    
    def test_admin_list_credit_lines(self, admin_token):
        """GET /api/admin/brands/{id}/credit-lines returns lines"""
        res = requests.get(f"{BASE_URL}/api/admin/brands/{BRAND_ID}/credit-lines",
                          headers={"Authorization": f"Bearer {admin_token}"})
        assert res.status_code == 200
        data = res.json()
        assert isinstance(data, list)
        print(f"✓ Admin credit lines: {len(data)} lines for brand")
    
    def test_admin_list_ledger(self, admin_token):
        """GET /api/admin/brands/{id}/ledger returns entries"""
        res = requests.get(f"{BASE_URL}/api/admin/brands/{BRAND_ID}/ledger",
                          headers={"Authorization": f"Bearer {admin_token}"})
        assert res.status_code == 200
        data = res.json()
        assert isinstance(data, list)
        print(f"✓ Admin ledger: {len(data)} entries for brand")


class TestSampleCredits:
    """Slice 3 — Sample credits admin adjust"""
    
    def test_admin_adjust_sample_credits_add(self, admin_token):
        """POST /api/admin/brands/{id}/sample-credits with positive delta adds"""
        res = requests.post(f"{BASE_URL}/api/admin/brands/{BRAND_ID}/sample-credits",
                           headers={"Authorization": f"Bearer {admin_token}"},
                           json={"delta": 10, "note": "Test add"})
        assert res.status_code == 200
        data = res.json()
        assert "sample_credits_total" in data
        print(f"✓ Sample credits added, new total: {data['sample_credits_total']}")
        
        # Revert
        requests.post(f"{BASE_URL}/api/admin/brands/{BRAND_ID}/sample-credits",
                     headers={"Authorization": f"Bearer {admin_token}"},
                     json={"delta": -10, "note": "Test revert"})
    
    def test_admin_adjust_sample_credits_cannot_reduce_below_used(self, admin_token):
        """POST /api/admin/brands/{id}/sample-credits cannot reduce below used"""
        # Get current state
        detail_res = requests.get(f"{BASE_URL}/api/admin/brands/{BRAND_ID}",
                                 headers={"Authorization": f"Bearer {admin_token}"})
        brand = detail_res.json()["brand"]
        total = brand.get("sample_credits_total", 0)
        used = brand.get("sample_credits_used", 0)
        
        # Try to reduce below used
        if used > 0:
            res = requests.post(f"{BASE_URL}/api/admin/brands/{BRAND_ID}/sample-credits",
                               headers={"Authorization": f"Bearer {admin_token}"},
                               json={"delta": -(total + 1), "note": "Test invalid"})
            assert res.status_code == 400
            assert "below" in res.json().get("detail", "").lower()
            print("✓ Cannot reduce sample credits below used amount")
        else:
            print("✓ Skipped (no used credits to test)")


class TestBrandOrders:
    """Slice 2 & 3 — Brand order placement"""
    
    def test_brand_orders_list(self, brand_token):
        """GET /api/brand/orders returns orders for this brand only"""
        res = requests.get(f"{BASE_URL}/api/brand/orders",
                          headers={"Authorization": f"Bearer {brand_token}"})
        assert res.status_code == 200
        data = res.json()
        assert isinstance(data, list)
        # All orders should belong to this brand
        for order in data:
            assert order.get("brand_id") == BRAND_ID
        print(f"✓ Brand orders: {len(data)} orders")
    
    def test_brand_order_insufficient_credit(self, brand_token):
        """POST /api/brand/orders when total > available returns 400"""
        # Get a fabric
        fabrics_res = requests.get(f"{BASE_URL}/api/brand/fabrics",
                                  headers={"Authorization": f"Bearer {brand_token}"})
        fabrics = fabrics_res.json()
        if not fabrics:
            pytest.skip("No fabrics available")
        
        fabric = fabrics[0]
        
        # Try to order a huge quantity that exceeds credit
        res = requests.post(f"{BASE_URL}/api/brand/orders",
                           headers={"Authorization": f"Bearer {brand_token}"},
                           json={
                               "items": [{"fabric_id": fabric["id"], "quantity": 999999}],
                               "order_type": "bulk"
                           })
        # Should fail due to insufficient credit or MOQ
        assert res.status_code == 400
        print(f"✓ Insufficient credit/MOQ blocked: {res.json().get('detail', '')[:50]}")
    
    def test_brand_order_disallowed_category(self, brand_token, admin_token):
        """POST /api/brand/orders with fabric in disallowed category returns 403"""
        # Get a fabric from a category NOT in brand's allowed list
        # Brand has cat-denim and cat-cotton, so we need cat-polyester or similar
        all_fabrics_res = requests.get(f"{BASE_URL}/api/fabrics",
                                       headers={"Authorization": f"Bearer {admin_token}"})
        all_fabrics = all_fabrics_res.json()
        
        disallowed_fabric = None
        for f in all_fabrics:
            if f.get("category_id") not in ["cat-denim", "cat-cotton"]:
                disallowed_fabric = f
                break
        
        if not disallowed_fabric:
            pytest.skip("No disallowed category fabric found")
        
        res = requests.post(f"{BASE_URL}/api/brand/orders",
                           headers={"Authorization": f"Bearer {brand_token}"},
                           json={
                               "items": [{"fabric_id": disallowed_fabric["id"], "quantity": 100}],
                               "order_type": "bulk"
                           })
        assert res.status_code == 403
        print(f"✓ Disallowed category blocked: {res.json().get('detail', '')[:50]}")


class TestRazorpayTopup:
    """Slice 3 — Razorpay sample-credit top-up"""
    
    def test_topup_create_order_min_amount(self, brand_token):
        """POST /api/brand/sample-credits/topup/create-order with amount<100 returns 400"""
        res = requests.post(f"{BASE_URL}/api/brand/sample-credits/topup/create-order",
                           headers={"Authorization": f"Bearer {brand_token}"},
                           json={"amount_inr": 50})
        assert res.status_code == 400
        assert "100" in res.json().get("detail", "")
        print("✓ Minimum ₹100 enforced")
    
    def test_topup_create_order_success(self, brand_token):
        """POST /api/brand/sample-credits/topup/create-order returns razorpay_order_id"""
        res = requests.post(f"{BASE_URL}/api/brand/sample-credits/topup/create-order",
                           headers={"Authorization": f"Bearer {brand_token}"},
                           json={"amount_inr": 100})
        assert res.status_code == 200
        data = res.json()
        assert "razorpay_order_id" in data
        assert "amount_paise" in data
        assert data["amount_paise"] == 10000  # 100 * 100
        assert "key_id" in data
        print(f"✓ Razorpay order created: {data['razorpay_order_id']}")
    
    def test_topup_verify_invalid_signature(self, brand_token):
        """POST /api/brand/sample-credits/topup/verify with invalid signature returns 400"""
        res = requests.post(f"{BASE_URL}/api/brand/sample-credits/topup/verify",
                           headers={"Authorization": f"Bearer {brand_token}"},
                           json={
                               "razorpay_order_id": "order_test123",
                               "razorpay_payment_id": "pay_test123",
                               "razorpay_signature": "invalid_signature"
                           })
        assert res.status_code == 400
        assert "signature" in res.json().get("detail", "").lower()
        print("✓ Invalid signature rejected")


class TestRoleBasedAccess:
    """Role-based access control tests"""
    
    def test_brand_user_cannot_add_users(self, admin_token):
        """brand_user (non-admin) cannot POST /api/brand/users"""
        # Create a brand_user
        unique_email = f"roletest_{uuid.uuid4().hex[:8]}@test.com"
        create_res = requests.post(f"{BASE_URL}/api/admin/brands/{BRAND_ID}/users",
                                   headers={"Authorization": f"Bearer {admin_token}"},
                                   json={
                                       "email": unique_email,
                                       "name": "Role Test User",
                                       "role": "brand_user"
                                   })
        if create_res.status_code != 200:
            pytest.skip("Could not create test user")
        
        temp_pw = create_res.json()["temporary_password_for_reference"]
        user_id = create_res.json()["id"]
        
        # Login as brand_user
        login_res = requests.post(f"{BASE_URL}/api/brand/login", json={
            "email": unique_email,
            "password": temp_pw
        })
        if login_res.status_code != 200:
            pytest.skip("Could not login as brand_user")
        
        user_token = login_res.json()["token"]
        
        # Try to add a user (should fail with 403)
        res = requests.post(f"{BASE_URL}/api/brand/users",
                           headers={"Authorization": f"Bearer {user_token}"},
                           json={
                               "email": "another@test.com",
                               "name": "Another User",
                               "role": "brand_user"
                           })
        assert res.status_code == 403
        print("✓ brand_user cannot add users (403)")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/admin/brands/{BRAND_ID}/users/{user_id}",
                       headers={"Authorization": f"Bearer {admin_token}"})


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
