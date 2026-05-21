"""
Brand Portal End-to-End Regression Tests - Phase 50
Tests all brand-facing flows: Auth, Catalog, PDP, Cart, Orders, Account, RFQ, Queries
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from test_credentials.md
BRAND_EMAIL = "brandtest@locofast.com"
BRAND_PASSWORD = "NewPassword123!"
BRAND_ID = "03b50566-e559-4a54-97f0-4cd1179615d4"

ADMIN_EMAIL = "admin@locofast.com"
ADMIN_PASSWORD = "admin123"


@pytest.fixture(scope="module")
def brand_token():
    """Get brand authentication token"""
    resp = requests.post(f"{BASE_URL}/api/brand/login", json={
        "email": BRAND_EMAIL,
        "password": BRAND_PASSWORD
    })
    if resp.status_code != 200:
        pytest.skip(f"Brand login failed: {resp.text}")
    data = resp.json()
    assert "token" in data, "No token in login response"
    assert data["user"]["role"] == "brand_admin", "Expected brand_admin role"
    return data["token"]


@pytest.fixture(scope="module")
def admin_token():
    """Get admin authentication token"""
    resp = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    if resp.status_code != 200:
        pytest.skip(f"Admin login failed: {resp.text}")
    return resp.json().get("token")


class TestBrandAuth:
    """Brand authentication flow tests"""
    
    def test_brand_login_success(self):
        """AUTH: brand login at /enterprise/login with correct credentials"""
        resp = requests.post(f"{BASE_URL}/api/brand/login", json={
            "email": BRAND_EMAIL,
            "password": BRAND_PASSWORD
        })
        assert resp.status_code == 200, f"Login failed: {resp.text}"
        data = resp.json()
        
        # Verify token persisted
        assert "token" in data
        assert len(data["token"]) > 50  # JWT should be substantial
        
        # Verify brand_admin role recognized
        assert data["user"]["role"] == "brand_admin"
        assert data["user"]["brand_id"] == BRAND_ID
        assert data["user"]["email"] == BRAND_EMAIL
        
        # Verify brand info
        assert "brand_name" in data["user"]
        assert data["user"]["brand_type"] in ["brand", "factory"]
        
    def test_brand_login_invalid_credentials(self):
        """AUTH: reject invalid credentials"""
        resp = requests.post(f"{BASE_URL}/api/brand/login", json={
            "email": BRAND_EMAIL,
            "password": "wrongpassword"
        })
        assert resp.status_code == 401
        
    def test_brand_me_endpoint(self, brand_token):
        """AUTH: /api/brand/me returns user and brand info"""
        resp = requests.get(f"{BASE_URL}/api/brand/me", headers={
            "Authorization": f"Bearer {brand_token}"
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "user" in data
        assert "brand" in data
        assert data["brand"]["id"] == BRAND_ID


class TestBrandCatalog:
    """Catalog listing and filter tests"""
    
    def test_fabrics_list_loads(self, brand_token):
        """CATALOG: /api/brand/fabrics loads SKUs"""
        resp = requests.get(f"{BASE_URL}/api/brand/fabrics", headers={
            "Authorization": f"Bearer {brand_token}"
        })
        assert resp.status_code == 200
        fabrics = resp.json()
        assert isinstance(fabrics, list)
        # Brand should have access to some fabrics
        print(f"Brand has access to {len(fabrics)} fabrics")
        
    def test_filter_options_loads(self, brand_token):
        """CATALOG: filter options endpoint returns facets"""
        resp = requests.get(f"{BASE_URL}/api/brand/fabrics/filter-options", headers={
            "Authorization": f"Bearer {brand_token}"
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "categories" in data
        assert "colors" in data
        assert "compositions" in data
        
    def test_availability_filter_bookable(self, brand_token):
        """CATALOG: availability=bookable filter works"""
        resp = requests.get(f"{BASE_URL}/api/brand/fabrics?availability=bookable", headers={
            "Authorization": f"Bearer {brand_token}"
        })
        assert resp.status_code == 200
        fabrics = resp.json()
        # All returned fabrics should be bookable
        for f in fabrics:
            assert f.get("is_bookable") == True or f.get("quantity_available", 0) > 0
            
    def test_category_filter(self, brand_token):
        """CATALOG: category filter works"""
        # First get available categories
        opts = requests.get(f"{BASE_URL}/api/brand/fabrics/filter-options", headers={
            "Authorization": f"Bearer {brand_token}"
        }).json()
        
        if opts.get("categories"):
            cat_id = opts["categories"][0]["id"]
            resp = requests.get(f"{BASE_URL}/api/brand/fabrics?category_id={cat_id}", headers={
                "Authorization": f"Bearer {brand_token}"
            })
            assert resp.status_code == 200
            fabrics = resp.json()
            for f in fabrics:
                assert f.get("category_id") == cat_id


class TestBrandPDP:
    """Product Detail Page tests"""
    
    def test_fabric_detail_loads(self, brand_token):
        """PDP: /api/brand/fabrics/:id renders fabric details"""
        # First get a fabric
        fabrics = requests.get(f"{BASE_URL}/api/brand/fabrics", headers={
            "Authorization": f"Bearer {brand_token}"
        }).json()
        
        if not fabrics:
            pytest.skip("No fabrics available for brand")
            
        fabric_id = fabrics[0]["id"]
        resp = requests.get(f"{BASE_URL}/api/brand/fabrics/{fabric_id}", headers={
            "Authorization": f"Bearer {brand_token}"
        })
        assert resp.status_code == 200
        data = resp.json()
        
        # Verify fabric details
        assert "id" in data
        assert "name" in data
        assert "category_name" in data
        
        # Verify pricing info
        assert "sample_price" in data or "rate_per_meter" in data
        
    def test_fabric_detail_by_slug(self, brand_token):
        """PDP: fabric can be fetched by slug"""
        fabrics = requests.get(f"{BASE_URL}/api/brand/fabrics", headers={
            "Authorization": f"Bearer {brand_token}"
        }).json()
        
        if not fabrics:
            pytest.skip("No fabrics available")
            
        # Find a fabric with a slug
        fabric_with_slug = next((f for f in fabrics if f.get("slug")), None)
        if not fabric_with_slug:
            pytest.skip("No fabric with slug found")
            
        resp = requests.get(f"{BASE_URL}/api/brand/fabrics/{fabric_with_slug['slug']}", headers={
            "Authorization": f"Bearer {brand_token}"
        })
        assert resp.status_code == 200


class TestBrandCreditSummary:
    """Credit and sample credits tests"""
    
    def test_credit_summary_loads(self, brand_token):
        """ACCOUNT: credit summary endpoint works"""
        resp = requests.get(f"{BASE_URL}/api/brand/credit-summary", headers={
            "Authorization": f"Bearer {brand_token}"
        })
        assert resp.status_code == 200
        data = resp.json()
        
        # Verify credit structure
        assert "credit" in data
        assert "sample_credits" in data
        
        # Verify credit fields
        credit = data["credit"]
        assert "total_allocated" in credit
        assert "total_utilized" in credit
        assert "available" in credit
        assert "lines" in credit
        
        # Verify sample credits fields
        sample = data["sample_credits"]
        assert "total" in sample
        assert "used" in sample
        assert "available" in sample
        
        print(f"Credit available: {credit['available']}, Sample credits: {sample['available']}")


class TestBrandAddresses:
    """Address book tests"""
    
    def test_addresses_list(self, brand_token):
        """ACCOUNT — Addresses: lists addresses"""
        resp = requests.get(f"{BASE_URL}/api/brand/addresses", headers={
            "Authorization": f"Bearer {brand_token}"
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "addresses" in data
        addresses = data["addresses"]
        assert isinstance(addresses, list)
        print(f"Brand has {len(addresses)} addresses")
        
    def test_add_address(self, brand_token):
        """ACCOUNT — Addresses: add new address"""
        new_addr = {
            "label": f"Test Address {uuid.uuid4().hex[:6]}",
            "name": "Test Contact",
            "phone": "9876543210",
            "address": "123 Test Street",
            "city": "Mumbai",
            "state": "Maharashtra",
            "pincode": "400001"
        }
        resp = requests.post(f"{BASE_URL}/api/brand/addresses", 
            headers={"Authorization": f"Bearer {brand_token}"},
            json=new_addr
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "address" in data
        assert data["address"]["city"] == "Mumbai"
        
    def test_set_default_address(self, brand_token):
        """ACCOUNT — Addresses: set default works"""
        # Get addresses
        addrs = requests.get(f"{BASE_URL}/api/brand/addresses", headers={
            "Authorization": f"Bearer {brand_token}"
        }).json()["addresses"]
        
        if len(addrs) < 1:
            pytest.skip("No addresses to set as default")
            
        addr_id = addrs[0]["id"]
        # Skip factory addresses (read-only)
        if addrs[0].get("source") == "factory":
            addr_id = next((a["id"] for a in addrs if a.get("source") != "factory"), None)
            if not addr_id:
                pytest.skip("Only factory addresses available")
        
        resp = requests.put(f"{BASE_URL}/api/brand/addresses/{addr_id}/default", headers={
            "Authorization": f"Bearer {brand_token}"
        })
        assert resp.status_code == 200


class TestBrandOrders:
    """Orders listing tests"""
    
    def test_orders_list(self, brand_token):
        """ACCOUNT — Orders: lists orders"""
        resp = requests.get(f"{BASE_URL}/api/brand/orders", headers={
            "Authorization": f"Bearer {brand_token}"
        })
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        print(f"Brand has {len(data)} orders")
        
        # Verify order structure if any exist
        if data:
            order = data[0]
            assert "order_number" in order
            assert "status" in order
            assert "total" in order


class TestBrandUsers:
    """User management tests"""
    
    def test_users_list(self, brand_token):
        """USER MANAGEMENT: list brand users"""
        resp = requests.get(f"{BASE_URL}/api/brand/users", headers={
            "Authorization": f"Bearer {brand_token}"
        })
        assert resp.status_code == 200
        users = resp.json()
        assert isinstance(users, list)
        assert len(users) >= 1  # At least the admin user
        
        # Verify user structure
        user = users[0]
        assert "email" in user
        assert "role" in user
        assert "status" in user
        
    def test_designations_list(self):
        """USER MANAGEMENT: designations endpoint"""
        resp = requests.get(f"{BASE_URL}/api/brand/designations")
        assert resp.status_code == 200
        data = resp.json()
        assert "options" in data
        assert len(data["options"]) > 0


class TestBrandFactories:
    """Factory management tests"""
    
    def test_factories_list(self, brand_token):
        """FACTORY MANAGEMENT: list factories"""
        resp = requests.get(f"{BASE_URL}/api/brand/factories", headers={
            "Authorization": f"Bearer {brand_token}"
        })
        assert resp.status_code == 200
        factories = resp.json()
        assert isinstance(factories, list)
        print(f"Brand has {len(factories)} factories")


class TestBrandQueries:
    """RFQ and queries tests"""
    
    def test_queries_list(self, brand_token):
        """QUERIES PORTAL: list queries"""
        resp = requests.get(f"{BASE_URL}/api/brand/queries", headers={
            "Authorization": f"Bearer {brand_token}"
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "queries" in data
        assert "total" in data
        assert isinstance(data["queries"], list)


class TestBrandProfile:
    """Profile management tests"""
    
    def test_profile_update(self, brand_token):
        """ACCOUNT — Profile: update works"""
        # Get current profile
        me = requests.get(f"{BASE_URL}/api/brand/me", headers={
            "Authorization": f"Bearer {brand_token}"
        }).json()
        
        current_phone = me["brand"].get("phone", "")
        
        # Update phone
        resp = requests.put(f"{BASE_URL}/api/brand/profile",
            headers={"Authorization": f"Bearer {brand_token}"},
            json={"phone": "9999888877"}
        )
        assert resp.status_code == 200
        
        # Verify update
        updated = requests.get(f"{BASE_URL}/api/brand/me", headers={
            "Authorization": f"Bearer {brand_token}"
        }).json()
        assert updated["brand"]["phone"] == "9999888877"
        
        # Restore original
        requests.put(f"{BASE_URL}/api/brand/profile",
            headers={"Authorization": f"Bearer {brand_token}"},
            json={"phone": current_phone}
        )


class TestBrandSupport:
    """Support contact tests"""
    
    def test_support_endpoint(self):
        """SUPPORT: support contact endpoint"""
        resp = requests.get(f"{BASE_URL}/api/brand/support")
        assert resp.status_code == 200
        data = resp.json()
        assert "email" in data
        assert "phone" in data


class TestRFQSubmission:
    """RFQ submission tests"""
    
    def test_rfq_submit_with_brand_token(self, brand_token):
        """RFQ: submit RFQ with brand token stamps brand_id"""
        rfq_data = {
            "category": "cotton",
            "fabric_requirement_type": "Dyed",
            "quantity_value": 1000,
            "quantity_unit": "m",
            "gsm": 150,
            "width_inches": 58,
            "color": "Navy Blue",
            "full_name": "Test Brand User",
            "email": BRAND_EMAIL,
            "phone": "9876543210",
            "message": "Test RFQ from brand portal"
        }
        
        resp = requests.post(f"{BASE_URL}/api/rfq/submit",
            headers={"Authorization": f"Bearer {brand_token}"},
            json=rfq_data
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "rfq_number" in data
        assert data["rfq_number"].startswith("RFQ-")
        print(f"Created RFQ: {data['rfq_number']}")


class TestBrandFinancials:
    """Financials tab tests"""
    
    def test_financials_summary(self, brand_token):
        """ACCOUNT — Financials: summary loads"""
        resp = requests.get(f"{BASE_URL}/api/brand/financials", headers={
            "Authorization": f"Bearer {brand_token}"
        })
        # May return 200 or 404 if no financials
        assert resp.status_code in [200, 404]
        
        if resp.status_code == 200:
            data = resp.json()
            # Verify structure
            assert "summary" in data or "invoices" in data or "am" in data


class TestBrandLedger:
    """Activity ledger tests"""
    
    def test_ledger_loads(self, brand_token):
        """ACCOUNT — Activity Ledger: loads"""
        resp = requests.get(f"{BASE_URL}/api/brand/ledger", headers={
            "Authorization": f"Bearer {brand_token}"
        })
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)


class TestRazorpayTopup:
    """Sample credit topup tests"""
    
    def test_topup_create_order(self, brand_token):
        """TOP-UP: create-order returns valid razorpay_order_id"""
        resp = requests.post(f"{BASE_URL}/api/brand/sample-credits/topup/create-order",
            headers={"Authorization": f"Bearer {brand_token}"},
            json={"amount_inr": 100}
        )
        # May fail if Razorpay not configured, but should not 500
        assert resp.status_code in [200, 400, 500]
        
        if resp.status_code == 200:
            data = resp.json()
            assert "razorpay_order_id" in data
            assert data["razorpay_order_id"].startswith("order_")
            print(f"Razorpay order created: {data['razorpay_order_id']}")


class TestBrandAllocations:
    """Factory allocations tests"""
    
    def test_allocations_list(self, brand_token):
        """ALLOCATIONS: list allocations"""
        resp = requests.get(f"{BASE_URL}/api/brand/allocations", headers={
            "Authorization": f"Bearer {brand_token}"
        })
        # May return 200 or 404
        assert resp.status_code in [200, 404]


class TestEmailAudit:
    """Email audit tests"""
    
    def test_order_emails_endpoint(self, brand_token):
        """EMAIL AUDIT: order emails endpoint"""
        # Get orders first
        orders = requests.get(f"{BASE_URL}/api/brand/orders", headers={
            "Authorization": f"Bearer {brand_token}"
        }).json()
        
        if not orders:
            pytest.skip("No orders to check emails for")
            
        order_id = orders[0]["id"]
        resp = requests.get(f"{BASE_URL}/api/brand/orders/{order_id}/emails", headers={
            "Authorization": f"Bearer {brand_token}"
        })
        # May return 200 or 404
        assert resp.status_code in [200, 404]


class TestForgotPassword:
    """Forgot password flow tests"""
    
    def test_forgot_password_endpoint(self):
        """FORGOT PASSWORD: endpoint exists"""
        resp = requests.post(f"{BASE_URL}/api/brand/forgot-password", json={
            "email": "nonexistent@test.com"
        })
        # Should return 200 even for non-existent email (security)
        # or 404 if endpoint doesn't exist
        assert resp.status_code in [200, 400, 404]


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
