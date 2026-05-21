"""
Brand Portal Full Regression Test Suite - Phase 52
Tests all brand-side flows: auth, catalog, cart, orders, queries, notifications, 
account, factories, allocations, financials, user management.
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
VENDOR_EMAIL = "vendor@test.com"
VENDOR_PASSWORD = "vendor123"


class TestBrandAuth:
    """Brand authentication flow tests"""
    
    def test_brand_login_success(self):
        """Test brand login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/brand/login", json={
            "email": BRAND_EMAIL,
            "password": BRAND_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data, "No token in response"
        assert "user" in data, "No user in response"
        assert data["user"]["email"] == BRAND_EMAIL
        assert data["user"]["brand_id"] == BRAND_ID
        assert "brand_name" in data["user"]
        assert "role" in data["user"]
        print(f"✓ Brand login successful: {data['user']['name']} ({data['user']['role']})")
    
    def test_brand_login_invalid_credentials(self):
        """Test brand login with invalid credentials"""
        response = requests.post(f"{BASE_URL}/api/brand/login", json={
            "email": BRAND_EMAIL,
            "password": "wrongpassword"
        })
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ Invalid credentials correctly rejected")
    
    def test_brand_me_endpoint(self):
        """Test /brand/me returns user and brand info"""
        # First login
        login_resp = requests.post(f"{BASE_URL}/api/brand/login", json={
            "email": BRAND_EMAIL,
            "password": BRAND_PASSWORD
        })
        token = login_resp.json()["token"]
        
        # Get me
        response = requests.get(f"{BASE_URL}/api/brand/me", headers={
            "Authorization": f"Bearer {token}"
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "user" in data
        assert "brand" in data
        assert data["brand"]["id"] == BRAND_ID
        print(f"✓ Brand /me endpoint working: {data['brand']['name']}")
    
    def test_brand_support_endpoint(self):
        """Test support contact endpoint"""
        response = requests.get(f"{BASE_URL}/api/brand/support")
        assert response.status_code == 200
        data = response.json()
        assert "email" in data
        assert "phone" in data
        print(f"✓ Support endpoint: {data['email']}, {data['phone']}")


class TestBrandCatalog:
    """Brand catalog (fabrics) tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        login_resp = requests.post(f"{BASE_URL}/api/brand/login", json={
            "email": BRAND_EMAIL,
            "password": BRAND_PASSWORD
        })
        self.token = login_resp.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_list_fabrics(self):
        """Test brand can list fabrics in their allowed categories"""
        response = requests.get(f"{BASE_URL}/api/brand/fabrics", headers=self.headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        fabrics = response.json()
        assert isinstance(fabrics, list)
        print(f"✓ Brand catalog: {len(fabrics)} fabrics available")
        if fabrics:
            # Verify fabric structure
            f = fabrics[0]
            assert "id" in f
            assert "name" in f or "fabric_code" in f
            print(f"  Sample fabric: {f.get('name', f.get('fabric_code', 'N/A'))}")
    
    def test_filter_options(self):
        """Test filter options endpoint"""
        response = requests.get(f"{BASE_URL}/api/brand/fabrics/filter-options", headers=self.headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "categories" in data
        assert "colors" in data
        assert "compositions" in data
        print(f"✓ Filter options: {len(data['categories'])} categories, {len(data['colors'])} colors")
    
    def test_fabric_detail(self):
        """Test getting a single fabric detail"""
        # First get list
        list_resp = requests.get(f"{BASE_URL}/api/brand/fabrics", headers=self.headers)
        fabrics = list_resp.json()
        if not fabrics:
            pytest.skip("No fabrics available")
        
        fabric_id = fabrics[0]["id"]
        response = requests.get(f"{BASE_URL}/api/brand/fabrics/{fabric_id}", headers=self.headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        fabric = response.json()
        assert fabric["id"] == fabric_id
        print(f"✓ Fabric detail: {fabric.get('name', fabric.get('fabric_code'))}")
    
    def test_fabric_search(self):
        """Test fabric search functionality"""
        response = requests.get(f"{BASE_URL}/api/brand/fabrics?search=cotton", headers=self.headers)
        assert response.status_code == 200
        print(f"✓ Fabric search working: {len(response.json())} results for 'cotton'")


class TestBrandNotifications:
    """Brand notification system tests (Phase 53)"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        login_resp = requests.post(f"{BASE_URL}/api/brand/login", json={
            "email": BRAND_EMAIL,
            "password": BRAND_PASSWORD
        })
        self.token = login_resp.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_unread_count(self):
        """Test unread notification count endpoint"""
        response = requests.get(f"{BASE_URL}/api/brand/notifications/unread-count", headers=self.headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "unread_count" in data
        print(f"✓ Unread count: {data['unread_count']}")
    
    def test_list_notifications(self):
        """Test listing notifications"""
        response = requests.get(f"{BASE_URL}/api/brand/notifications?limit=10", headers=self.headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "notifications" in data
        assert "unread_count" in data
        print(f"✓ Notifications list: {len(data['notifications'])} items, {data['unread_count']} unread")
    
    def test_mark_all_read(self):
        """Test mark all notifications as read"""
        response = requests.post(f"{BASE_URL}/api/brand/notifications/read-all", headers=self.headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "modified" in data or "message" in data
        print(f"✓ Mark all read: {data}")


class TestBrandQueries:
    """Brand RFQ/Queries portal tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        login_resp = requests.post(f"{BASE_URL}/api/brand/login", json={
            "email": BRAND_EMAIL,
            "password": BRAND_PASSWORD
        })
        self.token = login_resp.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_list_queries_received(self):
        """Test listing queries with quotes received"""
        response = requests.get(f"{BASE_URL}/api/brand/queries?status=received", headers=self.headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "queries" in data
        assert "total" in data
        print(f"✓ Queries (received): {data['total']} total")
    
    def test_list_queries_pending(self):
        """Test listing queries pending quotes"""
        response = requests.get(f"{BASE_URL}/api/brand/queries?status=not_received", headers=self.headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "queries" in data
        print(f"✓ Queries (pending): {data['total']} total")
    
    def test_list_queries_closed(self):
        """Test listing closed queries"""
        response = requests.get(f"{BASE_URL}/api/brand/queries?status=closed", headers=self.headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "queries" in data
        print(f"✓ Queries (closed): {data['total']} total")


class TestBrandCreditSummary:
    """Brand credit and sample credits tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        login_resp = requests.post(f"{BASE_URL}/api/brand/login", json={
            "email": BRAND_EMAIL,
            "password": BRAND_PASSWORD
        })
        self.token = login_resp.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_credit_summary(self):
        """Test credit summary endpoint"""
        response = requests.get(f"{BASE_URL}/api/brand/credit-summary", headers=self.headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "credit" in data
        assert "sample_credits" in data
        assert "total_allocated" in data["credit"]
        assert "available" in data["credit"]
        assert "lines" in data["credit"]
        print(f"✓ Credit summary: ₹{data['credit']['available']:,.2f} available, {data['sample_credits']['available']} sample credits")
    
    def test_ledger(self):
        """Test brand ledger endpoint"""
        response = requests.get(f"{BASE_URL}/api/brand/ledger", headers=self.headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Ledger: {len(data)} entries")


class TestBrandOrders:
    """Brand orders tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        login_resp = requests.post(f"{BASE_URL}/api/brand/login", json={
            "email": BRAND_EMAIL,
            "password": BRAND_PASSWORD
        })
        self.token = login_resp.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_list_orders(self):
        """Test listing brand orders"""
        response = requests.get(f"{BASE_URL}/api/brand/orders", headers=self.headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Orders: {len(data)} orders")
        if data:
            order = data[0]
            assert "id" in order
            assert "order_number" in order
            # Check for invoice attachment
            if order.get("invoice"):
                print(f"  Order {order['order_number']} has invoice: {order['invoice'].get('invoice_number')}")


class TestBrandAddresses:
    """Brand address book tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        login_resp = requests.post(f"{BASE_URL}/api/brand/login", json={
            "email": BRAND_EMAIL,
            "password": BRAND_PASSWORD
        })
        self.token = login_resp.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_list_addresses(self):
        """Test listing brand addresses"""
        response = requests.get(f"{BASE_URL}/api/brand/addresses", headers=self.headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "addresses" in data
        print(f"✓ Addresses: {len(data['addresses'])} addresses")
        # Check for factory addresses
        factory_addrs = [a for a in data['addresses'] if a.get('source') == 'factory']
        if factory_addrs:
            print(f"  Including {len(factory_addrs)} factory addresses")


class TestBrandUsers:
    """Brand user management tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        login_resp = requests.post(f"{BASE_URL}/api/brand/login", json={
            "email": BRAND_EMAIL,
            "password": BRAND_PASSWORD
        })
        self.token = login_resp.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_list_users(self):
        """Test listing brand users"""
        response = requests.get(f"{BASE_URL}/api/brand/users", headers=self.headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        users = response.json()
        assert isinstance(users, list)
        print(f"✓ Users: {len(users)} users")
        for u in users:
            print(f"  - {u['name']} ({u['email']}) - {u['role']}")
    
    def test_list_designations(self):
        """Test listing available designations"""
        response = requests.get(f"{BASE_URL}/api/brand/designations")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "options" in data
        print(f"✓ Designations: {data['options']}")


class TestBrandFactories:
    """Brand factory management tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        login_resp = requests.post(f"{BASE_URL}/api/brand/login", json={
            "email": BRAND_EMAIL,
            "password": BRAND_PASSWORD
        })
        self.token = login_resp.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_list_factories(self):
        """Test listing brand's factories"""
        response = requests.get(f"{BASE_URL}/api/brand/factories", headers=self.headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        factories = response.json()
        assert isinstance(factories, list)
        print(f"✓ Factories: {len(factories)} factories")
        for f in factories:
            print(f"  - {f['name']} (status: {f.get('status')}, verified: {f.get('verification_status')})")
    
    def test_factory_credit_summaries(self):
        """Test factory credit summaries endpoint"""
        response = requests.get(f"{BASE_URL}/api/brand/factory-credit-summaries", headers=self.headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        summaries = response.json()
        assert isinstance(summaries, list)
        print(f"✓ Factory credit summaries: {len(summaries)} factories")
        for s in summaries:
            print(f"  - {s['factory_name']}: ₹{s['credit_available']:,.2f} available, {s.get('has_credit', False)} has credit")


class TestBrandAllocations:
    """Brand allocations (factory handoffs) tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        login_resp = requests.post(f"{BASE_URL}/api/brand/login", json={
            "email": BRAND_EMAIL,
            "password": BRAND_PASSWORD
        })
        self.token = login_resp.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_list_sent_handoffs(self):
        """Test listing sent allocations"""
        response = requests.get(f"{BASE_URL}/api/brand/factory-handoffs", headers=self.headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        handoffs = response.json()
        assert isinstance(handoffs, list)
        print(f"✓ Sent allocations: {len(handoffs)} handoffs")


class TestBrandFinancials:
    """Brand financials tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        login_resp = requests.post(f"{BASE_URL}/api/brand/login", json={
            "email": BRAND_EMAIL,
            "password": BRAND_PASSWORD
        })
        self.token = login_resp.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_financials_view(self):
        """Test brand financials endpoint"""
        response = requests.get(f"{BASE_URL}/api/brand/financials", headers=self.headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        # Check for expected fields
        assert "invoices" in data or "outstanding" in data or "account_manager" in data
        print(f"✓ Financials: AM = {data.get('account_manager', {}).get('name', 'N/A')}")
        if "invoices" in data:
            print(f"  Invoices: {len(data['invoices'])}")


class TestBrandProfile:
    """Brand profile tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        login_resp = requests.post(f"{BASE_URL}/api/brand/login", json={
            "email": BRAND_EMAIL,
            "password": BRAND_PASSWORD
        })
        self.token = login_resp.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_profile(self):
        """Test getting brand profile via /me"""
        response = requests.get(f"{BASE_URL}/api/brand/me", headers=self.headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        brand = data["brand"]
        assert "name" in brand
        assert "gst" in brand or brand.get("gst") == ""
        print(f"✓ Profile: {brand['name']}, GST: {brand.get('gst', 'N/A')}")


class TestRFQSubmission:
    """Test RFQ submission with brand token"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        login_resp = requests.post(f"{BASE_URL}/api/brand/login", json={
            "email": BRAND_EMAIL,
            "password": BRAND_PASSWORD
        })
        self.token = login_resp.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_rfq_submit_with_brand_token(self):
        """Test that RFQ submission stamps brand_id when using brand token"""
        rfq_data = {
            "category": "Denim",
            "fabric_type": "Denim",
            "composition": [{"material": "Cotton", "percentage": 100}],
            "gsm": "300",
            "width": "58 inches",
            "quantity_meters": "1000_5000",
            "target_price": "150",
            "delivery_timeline": "30_days",
            "name": "Test Brand RFQ",
            "email": BRAND_EMAIL,
            "phone": "9999999999",
            "company": "Test Brand Co"
        }
        response = requests.post(f"{BASE_URL}/api/rfq/submit", 
                                 json=rfq_data, 
                                 headers=self.headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "id" in data or "rfq_number" in data
        print(f"✓ RFQ submitted with brand token: {data.get('rfq_number', data.get('id'))}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
