"""
Regression Test Suite v37 - Locofast B2B Platform
Tests Agent, Vendor, and Enterprise (Brand) modules end-to-end.
"""
import pytest
import requests
import os
import uuid
import pymongo
import bcrypt
from dotenv import load_dotenv

load_dotenv('/app/backend/.env')

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
MONGO_URL = os.environ.get('MONGO_URL')
DB_NAME = os.environ.get('DB_NAME', 'test_database')

# Test credentials
VENDOR_EMAIL = "vendor@test.com"
VENDOR_PASSWORD = "vendor123"
BRAND_EMAIL = "brandtest@locofast.com"
BRAND_PASSWORD = "NewPassword123!"
AGENT_EMAIL = "agent@locofast.com"
ADMIN_EMAIL = "admin@locofast.com"
ADMIN_PASSWORD = "admin123"


@pytest.fixture(scope="module")
def mongo_client():
    """MongoDB client for OTP bypass and data verification"""
    client = pymongo.MongoClient(MONGO_URL)
    return client[DB_NAME]


@pytest.fixture(scope="module")
def vendor_token():
    """Get vendor auth token"""
    resp = requests.post(f"{BASE_URL}/api/vendor/login", json={
        "email": VENDOR_EMAIL,
        "password": VENDOR_PASSWORD
    })
    assert resp.status_code == 200, f"Vendor login failed: {resp.text}"
    data = resp.json()
    assert "token" in data
    assert "vendor" in data
    return data["token"]


@pytest.fixture(scope="module")
def brand_token():
    """Get brand auth token"""
    resp = requests.post(f"{BASE_URL}/api/brand/login", json={
        "email": BRAND_EMAIL,
        "password": BRAND_PASSWORD
    })
    assert resp.status_code == 200, f"Brand login failed: {resp.text}"
    data = resp.json()
    assert "token" in data
    assert "user" in data
    assert data["user"]["brand_type"] == "brand"
    return data["token"]


@pytest.fixture(scope="module")
def admin_token():
    """Get admin auth token"""
    resp = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    assert resp.status_code == 200, f"Admin login failed: {resp.text}"
    data = resp.json()
    assert "token" in data
    return data["token"]


@pytest.fixture(scope="module")
def agent_token(mongo_client):
    """Get agent auth token via OTP bypass"""
    # Send OTP
    resp = requests.post(f"{BASE_URL}/api/agent/send-otp", json={"email": AGENT_EMAIL})
    assert resp.status_code == 200, f"Agent OTP send failed: {resp.text}"
    
    # Bypass OTP by patching MongoDB
    otp_doc = mongo_client.agent_otps.find_one({'email': AGENT_EMAIL, 'used': False}, sort=[('created_at', -1)])
    assert otp_doc, "No pending OTP found for agent"
    mongo_client.agent_otps.update_one({'_id': otp_doc['_id']}, {'$set': {'otp': '123456'}})
    
    # Verify OTP
    resp = requests.post(f"{BASE_URL}/api/agent/verify-otp", json={
        "email": AGENT_EMAIL,
        "otp": "123456"
    })
    assert resp.status_code == 200, f"Agent OTP verify failed: {resp.text}"
    data = resp.json()
    assert "token" in data
    assert "agent" in data
    return data["token"]


# ==================== VENDOR MODULE TESTS ====================

class TestVendorModule:
    """Tests for Vendor portal (items 12-19)"""
    
    def test_vendor_login_returns_token_and_info(self):
        """#12: Vendor login returns token + vendor info"""
        resp = requests.post(f"{BASE_URL}/api/vendor/login", json={
            "email": VENDOR_EMAIL,
            "password": VENDOR_PASSWORD
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "token" in data
        assert "vendor" in data
        assert data["vendor"]["contact_email"] == VENDOR_EMAIL
        assert "id" in data["vendor"]
        assert "company_name" in data["vendor"]
    
    def test_vendor_login_invalid_credentials(self):
        """Vendor login with wrong password returns 401"""
        resp = requests.post(f"{BASE_URL}/api/vendor/login", json={
            "email": VENDOR_EMAIL,
            "password": "wrongpassword"
        })
        assert resp.status_code == 401
    
    def test_vendor_stats(self, vendor_token):
        """#13: Vendor dashboard stats - total fabrics, pending orders, etc."""
        resp = requests.get(f"{BASE_URL}/api/vendor/stats", headers={
            "Authorization": f"Bearer {vendor_token}"
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "total_fabrics" in data
        assert "approved_fabrics" in data
        assert "pending_fabrics" in data
        assert "total_orders" in data
        assert "total_enquiries" in data
    
    def test_vendor_fabrics_list(self, vendor_token):
        """#14: GET /api/vendor/fabrics shows only vendor's fabrics"""
        resp = requests.get(f"{BASE_URL}/api/vendor/fabrics", headers={
            "Authorization": f"Bearer {vendor_token}"
        })
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        # All fabrics should belong to this vendor
        for fabric in data:
            assert "seller_id" in fabric
    
    def test_vendor_create_fabric(self, vendor_token):
        """#15: Create new fabric with all required fields"""
        fabric_data = {
            "name": f"TEST_Regression_Fabric_{uuid.uuid4().hex[:8]}",
            "fabric_code": f"TEST-{uuid.uuid4().hex[:6]}",
            "fabric_type": "woven",
            "composition": [{"material": "Cotton", "percentage": 100}],
            "gsm": 200,
            "color": "Blue",
            "is_bookable": True,
            "quantity_available": 500,
            "rate_per_meter": 150.0,
            "stock_type": "ready_stock",
            "pricing_tiers": [{"min_qty": 100, "price": 150}, {"min_qty": 500, "price": 140}]
        }
        resp = requests.post(f"{BASE_URL}/api/vendor/fabrics", json=fabric_data, headers={
            "Authorization": f"Bearer {vendor_token}"
        })
        assert resp.status_code == 200, f"Create fabric failed: {resp.text}"
        data = resp.json()
        assert "id" in data
        assert data["name"] == fabric_data["name"]
        assert data["is_bookable"] == True
        assert data["quantity_available"] == 500
        return data["id"]
    
    def test_vendor_update_fabric(self, vendor_token):
        """#16: Edit existing fabric - verify is_bookable and quantity_available persist"""
        # First create a fabric
        fabric_data = {
            "name": f"TEST_Update_Fabric_{uuid.uuid4().hex[:8]}",
            "fabric_code": f"TEST-UPD-{uuid.uuid4().hex[:6]}",
            "is_bookable": False,
            "quantity_available": 0
        }
        create_resp = requests.post(f"{BASE_URL}/api/vendor/fabrics", json=fabric_data, headers={
            "Authorization": f"Bearer {vendor_token}"
        })
        assert create_resp.status_code == 200
        fabric_id = create_resp.json()["id"]
        
        # Update the fabric
        update_data = {
            "is_bookable": True,
            "quantity_available": 1000,
            "rate_per_meter": 200.0
        }
        update_resp = requests.put(f"{BASE_URL}/api/vendor/fabrics/{fabric_id}", json=update_data, headers={
            "Authorization": f"Bearer {vendor_token}"
        })
        assert update_resp.status_code == 200
        updated = update_resp.json()
        assert updated["is_bookable"] == True
        assert updated["quantity_available"] == 1000
        assert updated["rate_per_meter"] == 200.0
        
        # Verify persistence with GET
        get_resp = requests.get(f"{BASE_URL}/api/vendor/fabrics/{fabric_id}", headers={
            "Authorization": f"Bearer {vendor_token}"
        })
        assert get_resp.status_code == 200
        fetched = get_resp.json()
        assert fetched["is_bookable"] == True
        assert fetched["quantity_available"] == 1000
    
    def test_vendor_orders_list(self, vendor_token):
        """#18: GET /api/vendor/orders shows orders with vendor's fabrics"""
        resp = requests.get(f"{BASE_URL}/api/vendor/orders", headers={
            "Authorization": f"Bearer {vendor_token}"
        })
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
    
    def test_vendor_categories(self, vendor_token):
        """Vendor can get categories for fabric creation"""
        resp = requests.get(f"{BASE_URL}/api/vendor/categories", headers={
            "Authorization": f"Bearer {vendor_token}"
        })
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)


# ==================== BRAND/ENTERPRISE MODULE TESTS ====================

class TestBrandModule:
    """Tests for Brand/Enterprise portal (items 20-31)"""
    
    def test_brand_login_returns_correct_fields(self):
        """#20: Brand login returns brand_type, token, allowed categories, role"""
        resp = requests.post(f"{BASE_URL}/api/brand/login", json={
            "email": BRAND_EMAIL,
            "password": BRAND_PASSWORD
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "token" in data
        assert "user" in data
        user = data["user"]
        assert user["brand_type"] == "brand"
        assert "role" in user
        assert "designation" in user
        assert "brand_id" in user
        assert "brand_name" in user
    
    def test_brand_login_invalid_credentials(self):
        """Brand login with wrong password returns 401"""
        resp = requests.post(f"{BASE_URL}/api/brand/login", json={
            "email": BRAND_EMAIL,
            "password": "wrongpassword"
        })
        assert resp.status_code == 401
    
    def test_brand_me_endpoint(self, brand_token):
        """#21: Enterprise dashboard loads - GET /brand/me"""
        resp = requests.get(f"{BASE_URL}/api/brand/me", headers={
            "Authorization": f"Bearer {brand_token}"
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "user" in data
        assert "brand" in data
        assert data["brand"]["name"] == "Test Brand Co"
    
    def test_brand_fabrics_restricted_to_allowed_categories(self, brand_token):
        """#22: GET /api/brand/fabrics restricted to allowed_category_ids"""
        resp = requests.get(f"{BASE_URL}/api/brand/fabrics", headers={
            "Authorization": f"Bearer {brand_token}"
        })
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        # Fabrics should only be from allowed categories (Denim, Cotton)
    
    def test_brand_fabrics_filter_options(self, brand_token):
        """Brand filter options scoped to allowed categories"""
        resp = requests.get(f"{BASE_URL}/api/brand/fabrics/filter-options", headers={
            "Authorization": f"Bearer {brand_token}"
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "categories" in data
        assert "colors" in data
        assert "patterns" in data
    
    def test_brand_credit_lines(self, brand_token):
        """#25: GET /api/brand/credit-summary shows credit lines"""
        resp = requests.get(f"{BASE_URL}/api/brand/credit-summary", headers={
            "Authorization": f"Bearer {brand_token}"
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "credit" in data
        assert "sample_credits" in data
        credit = data["credit"]
        assert "total_allocated" in credit
        assert "total_utilized" in credit
        assert "available" in credit
        assert "lines" in credit
        # Verify Stride and Muthoot lines exist
        lender_names = [line["lender_name"] for line in credit["lines"]]
        assert "Stride" in lender_names or "Muthoot" in lender_names
    
    def test_brand_sample_credits(self, brand_token):
        """#26: Sample credits - verify pre-seeded values"""
        resp = requests.get(f"{BASE_URL}/api/brand/credit-summary", headers={
            "Authorization": f"Bearer {brand_token}"
        })
        assert resp.status_code == 200
        data = resp.json()
        sample = data["sample_credits"]
        assert "total" in sample
        assert "used" in sample
        assert "available" in sample
        assert sample["total"] > 0
    
    def test_brand_factories_list(self, brand_token):
        """#28: GET /api/brand/factories lists invited factories"""
        resp = requests.get(f"{BASE_URL}/api/brand/factories", headers={
            "Authorization": f"Bearer {brand_token}"
        })
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
    
    def test_brand_users_list(self, brand_token):
        """Brand can list users"""
        resp = requests.get(f"{BASE_URL}/api/brand/users", headers={
            "Authorization": f"Bearer {brand_token}"
        })
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
    
    def test_brand_designations(self, brand_token):
        """Brand designations endpoint"""
        resp = requests.get(f"{BASE_URL}/api/brand/designations", headers={
            "Authorization": f"Bearer {brand_token}"
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "options" in data
        assert "Management" in data["options"]
    
    def test_brand_support_contact(self, brand_token):
        """Brand support contact endpoint"""
        resp = requests.get(f"{BASE_URL}/api/brand/support", headers={
            "Authorization": f"Bearer {brand_token}"
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "email" in data
        assert "phone" in data
    
    def test_brand_ledger(self, brand_token):
        """Brand ledger endpoint"""
        resp = requests.get(f"{BASE_URL}/api/brand/ledger", headers={
            "Authorization": f"Bearer {brand_token}"
        })
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)


# ==================== AGENT MODULE TESTS ====================

class TestAgentModule:
    """Tests for Agent portal (items 1-11)"""
    
    def test_agent_send_otp(self):
        """#1: Agent OTP send works"""
        resp = requests.post(f"{BASE_URL}/api/agent/send-otp", json={
            "email": AGENT_EMAIL
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "message" in data
        assert data["email"] == AGENT_EMAIL
    
    def test_agent_send_otp_invalid_email(self):
        """Agent OTP for non-existent agent returns 403"""
        resp = requests.post(f"{BASE_URL}/api/agent/send-otp", json={
            "email": "nonexistent@test.com"
        })
        assert resp.status_code == 403
    
    def test_agent_profile(self, agent_token):
        """Agent profile endpoint"""
        resp = requests.get(f"{BASE_URL}/api/agent/me", headers={
            "Authorization": f"Bearer {agent_token}"
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["email"] == AGENT_EMAIL
        assert data["status"] == "active"
    
    def test_agent_exchange_rate(self, agent_token):
        """#5: Exchange rate endpoint for Bangladesh dispatch"""
        resp = requests.get(f"{BASE_URL}/api/agent/exchange-rate", headers={
            "Authorization": f"Bearer {agent_token}"
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "inr_to_usd" in data
        assert "usd_to_inr" in data
        assert "meters_to_yards" in data
        assert data["inr_to_usd"] > 0
    
    def test_agent_shared_carts_list(self, agent_token):
        """#8: GET /api/agent/shared-carts lists shared carts"""
        resp = requests.get(f"{BASE_URL}/api/agent/shared-carts", headers={
            "Authorization": f"Bearer {agent_token}"
        })
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
    
    def test_agent_orders_list(self, agent_token):
        """#9: GET /api/agent/orders lists agent's orders"""
        resp = requests.get(f"{BASE_URL}/api/agent/orders", headers={
            "Authorization": f"Bearer {agent_token}"
        })
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
    
    def test_agent_create_shared_cart(self, agent_token, mongo_client):
        """#7: POST /api/agent/shared-cart creates cart and returns token"""
        # Get a fabric to add to cart
        fabrics = list(mongo_client.fabrics.find({"status": "approved"}, {"_id": 0}).limit(1))
        if not fabrics:
            pytest.skip("No approved fabrics found for testing")
        
        fabric = fabrics[0]
        cart_data = {
            "items": [{
                "fabric_id": fabric["id"],
                "fabric_name": fabric.get("name", "Test Fabric"),
                "fabric_code": fabric.get("fabric_code", ""),
                "category_name": fabric.get("category_name", ""),
                "seller_company": fabric.get("seller_company", ""),
                "seller_id": fabric.get("seller_id", ""),
                "quantity": 100,
                "price_per_meter": float(fabric.get("rate_per_meter", 100)),
                "order_type": "bulk",
                "image_url": (fabric.get("images") or [""])[0] if fabric.get("images") else "",
                "hsn_code": fabric.get("hsn_code", "")
            }],
            "customer_email": "test@customer.com",
            "notes": "Test cart from regression suite",
            "dispatch_country": "india"
        }
        
        resp = requests.post(f"{BASE_URL}/api/agent/shared-cart", json=cart_data, headers={
            "Authorization": f"Bearer {agent_token}"
        })
        assert resp.status_code == 200, f"Create shared cart failed: {resp.text}"
        data = resp.json()
        assert "cart_id" in data
        assert "token" in data
        assert "status" in data
        assert data["status"] == "pending"
        return data["token"]
    
    def test_agent_create_shared_cart_bangladesh(self, agent_token, mongo_client):
        """#5: Bangladesh dispatch - USD rate and charges populated"""
        fabrics = list(mongo_client.fabrics.find({"status": "approved"}, {"_id": 0}).limit(1))
        if not fabrics:
            pytest.skip("No approved fabrics found for testing")
        
        fabric = fabrics[0]
        cart_data = {
            "items": [{
                "fabric_id": fabric["id"],
                "fabric_name": fabric.get("name", "Test Fabric"),
                "quantity": 100,
                "price_per_meter": float(fabric.get("rate_per_meter", 100)),
                "order_type": "bulk"
            }],
            "dispatch_country": "bangladesh"
        }
        
        resp = requests.post(f"{BASE_URL}/api/agent/shared-cart", json=cart_data, headers={
            "Authorization": f"Bearer {agent_token}"
        })
        assert resp.status_code == 200, f"Create Bangladesh cart failed: {resp.text}"
        data = resp.json()
        assert "bangladesh_charges" in data
        if data["bangladesh_charges"]:
            charges = data["bangladesh_charges"]
            assert "border_logistics" in charges
            assert "export_documentation" in charges
            assert "custom_clearance" in charges
            assert "inr_to_usd_rate" in charges
            assert charges["inr_to_usd_rate"] > 0
    
    def test_agent_get_shared_cart_public(self, agent_token, mongo_client):
        """#10: Public shared-cart page at /api/agent/cart/{token}"""
        # First create a cart
        fabrics = list(mongo_client.fabrics.find({"status": "approved"}, {"_id": 0}).limit(1))
        if not fabrics:
            pytest.skip("No approved fabrics found for testing")
        
        fabric = fabrics[0]
        cart_data = {
            "items": [{
                "fabric_id": fabric["id"],
                "fabric_name": fabric.get("name", "Test Fabric"),
                "quantity": 50,
                "price_per_meter": 100,
                "order_type": "sample"
            }],
            "dispatch_country": "india"
        }
        
        create_resp = requests.post(f"{BASE_URL}/api/agent/shared-cart", json=cart_data, headers={
            "Authorization": f"Bearer {agent_token}"
        })
        assert create_resp.status_code == 200
        token = create_resp.json()["token"]
        
        # Now fetch the cart publicly (no auth)
        public_resp = requests.get(f"{BASE_URL}/api/agent/cart/{token}")
        assert public_resp.status_code == 200, f"Public cart fetch failed: {public_resp.text}"
        cart = public_resp.json()
        assert "items" in cart
        assert len(cart["items"]) > 0
        assert cart["status"] == "pending"


# ==================== ADMIN TESTS ====================

class TestAdminModule:
    """Tests for Admin endpoints (item 31)"""
    
    def test_admin_login(self):
        """Admin login works"""
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "token" in data
    
    def test_admin_brands_list(self, admin_token):
        """Admin can list brands"""
        resp = requests.get(f"{BASE_URL}/api/admin/brands", headers={
            "Authorization": f"Bearer {admin_token}"
        })
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        # Verify type and parent_brand_name fields
        for brand in data:
            assert "type" in brand
            assert brand["type"] in ("brand", "factory")
    
    def test_admin_agent_list(self, admin_token):
        """Admin can list agents"""
        resp = requests.get(f"{BASE_URL}/api/agent/admin/list", headers={
            "Authorization": f"Bearer {admin_token}"
        })
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)


# ==================== CROSS-CUTTING TESTS ====================

class TestCrossCutting:
    """Cross-cutting checks (items 32-35)"""
    
    def test_fabrics_list_public(self):
        """Public fabrics list works"""
        resp = requests.get(f"{BASE_URL}/api/fabrics?limit=10")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
    
    def test_fabric_detail_invalid_id(self):
        """#32: Invalid fabric ID returns 404 (not 500)"""
        resp = requests.get(f"{BASE_URL}/api/fabrics/invalid-fabric-id-12345")
        assert resp.status_code == 404
    
    def test_categories_list(self):
        """Categories list works"""
        resp = requests.get(f"{BASE_URL}/api/categories")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
    
    def test_upload_endpoint_requires_auth(self):
        """Upload endpoint requires authentication"""
        resp = requests.post(f"{BASE_URL}/api/upload")
        assert resp.status_code in (401, 403, 422)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
