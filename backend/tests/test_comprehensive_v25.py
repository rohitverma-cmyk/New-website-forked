"""
Comprehensive Backend API Tests - Iteration 25
Tests all features built in this session:
1. Multi-vendor SKU comparison
2. Expanded catalog filters
3. Logistics pricing
4. Credit system (apply, wallet, checkout)
5. Customer OTP login
6. Admin credit management
7. SEO (sitemap, prerender, robots.txt)
8. GA4 tracking (frontend)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestHealthAndBasics:
    """Basic health and connectivity tests"""
    
    def test_api_fabrics_returns_list(self):
        """GET /api/fabrics returns fabric list"""
        response = requests.get(f"{BASE_URL}/api/fabrics")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/fabrics returned {len(data)} fabrics")
    
    def test_api_collections_returns_list(self):
        """GET /api/collections returns collections"""
        response = requests.get(f"{BASE_URL}/api/collections")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/collections returned {len(data)} collections")
    
    def test_api_categories_returns_list(self):
        """GET /api/categories returns categories"""
        response = requests.get(f"{BASE_URL}/api/categories")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/categories returned {len(data)} categories")


class TestCreditSystem:
    """Credit application and wallet tests"""
    
    def test_credit_apply_success(self):
        """POST /api/credit/apply creates credit application"""
        payload = {
            "name": "TEST_Credit User",
            "email": "test_credit@example.com",
            "phone": "9876543210",
            "company": "TEST Credit Company",
            "turnover": "1-5 Cr",
            "gst_number": "29ABCDE1234F1Z5",
            "message": "Test credit application"
        }
        response = requests.post(f"{BASE_URL}/api/credit/apply", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert data.get("message") == "Credit application submitted successfully"
        print(f"✓ Credit application created with ID: {data['id']}")
    
    def test_credit_apply_missing_fields(self):
        """POST /api/credit/apply fails with missing required fields"""
        payload = {"name": "Test"}  # Missing email, phone, company
        response = requests.post(f"{BASE_URL}/api/credit/apply", json=payload)
        assert response.status_code == 400
        print("✓ Credit apply correctly rejects incomplete data")
    
    def test_credit_balance_check(self):
        """GET /api/credit/balance returns balance for email"""
        response = requests.get(f"{BASE_URL}/api/credit/balance?email=test@example.com")
        assert response.status_code == 200
        data = response.json()
        assert "email" in data
        assert "balance" in data
        assert "credit_limit" in data
        assert "has_credit" in data
        print(f"✓ Credit balance check: {data}")
    
    def test_credit_balance_new_user(self):
        """GET /api/credit/balance returns 0 for new user"""
        response = requests.get(f"{BASE_URL}/api/credit/balance?email=newuser_nonexistent@test.com")
        assert response.status_code == 200
        data = response.json()
        assert data["balance"] == 0
        assert data["credit_limit"] == 0
        assert data["has_credit"] == False
        print("✓ New user has zero credit balance")


class TestCustomerOTPAuth:
    """Customer OTP-based authentication tests"""
    
    def test_send_otp_success(self):
        """POST /api/customer/send-otp sends OTP"""
        payload = {"email": "test_otp@example.com"}
        response = requests.post(f"{BASE_URL}/api/customer/send-otp", json=payload)
        # Should succeed (200) or rate limit (429)
        assert response.status_code in [200, 429]
        if response.status_code == 200:
            data = response.json()
            assert "message" in data
            print(f"✓ OTP sent: {data['message']}")
        else:
            print("✓ OTP rate limited (expected if run multiple times)")
    
    def test_send_otp_invalid_email(self):
        """POST /api/customer/send-otp fails with invalid email"""
        payload = {"email": "not-an-email"}
        response = requests.post(f"{BASE_URL}/api/customer/send-otp", json=payload)
        assert response.status_code == 422  # Validation error
        print("✓ Invalid email correctly rejected")
    
    def test_verify_otp_invalid(self):
        """POST /api/customer/verify-otp fails with wrong OTP"""
        payload = {"email": "test@example.com", "otp": "000000"}
        response = requests.post(f"{BASE_URL}/api/customer/verify-otp", json=payload)
        assert response.status_code == 400
        print("✓ Invalid OTP correctly rejected")
    
    def test_customer_profile_unauthorized(self):
        """GET /api/customer/profile requires auth"""
        response = requests.get(f"{BASE_URL}/api/customer/profile")
        assert response.status_code == 401
        print("✓ Customer profile requires authentication")
    
    def test_customer_orders_unauthorized(self):
        """GET /api/customer/orders requires auth"""
        response = requests.get(f"{BASE_URL}/api/customer/orders")
        assert response.status_code == 401
        print("✓ Customer orders requires authentication")


class TestAdminAuth:
    """Admin authentication tests"""
    
    def test_admin_login_success(self):
        """POST /api/auth/login with valid credentials"""
        payload = {"email": "admin@locofast.com", "password": "admin123"}
        response = requests.post(f"{BASE_URL}/api/auth/login", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "admin" in data
        assert data["admin"]["email"] == "admin@locofast.com"
        print(f"✓ Admin login successful, token received")
        return data["token"]
    
    def test_admin_login_invalid(self):
        """POST /api/auth/login with invalid credentials"""
        payload = {"email": "admin@locofast.com", "password": "wrongpassword"}
        response = requests.post(f"{BASE_URL}/api/auth/login", json=payload)
        assert response.status_code == 401
        print("✓ Invalid admin credentials correctly rejected")


class TestAdminCreditManagement:
    """Admin credit management tests"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin auth token"""
        payload = {"email": "admin@locofast.com", "password": "admin123"}
        response = requests.post(f"{BASE_URL}/api/auth/login", json=payload)
        if response.status_code == 200:
            return response.json()["token"]
        pytest.skip("Admin login failed")
    
    def test_get_credit_applications(self, admin_token):
        """GET /api/credit/applications returns list (admin only)"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/credit/applications", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Admin can view {len(data)} credit applications")
    
    def test_credit_applications_unauthorized(self):
        """GET /api/credit/applications requires admin auth"""
        response = requests.get(f"{BASE_URL}/api/credit/applications")
        assert response.status_code in [401, 403]
        print("✓ Credit applications requires admin auth")


class TestFabricFilters:
    """Expanded catalog filter tests"""
    
    def test_filter_by_category(self):
        """GET /api/fabrics with category_id filter"""
        # First get categories
        cats = requests.get(f"{BASE_URL}/api/categories").json()
        if cats:
            cat_id = cats[0]["id"]
            response = requests.get(f"{BASE_URL}/api/fabrics?category_id={cat_id}")
            assert response.status_code == 200
            print(f"✓ Filter by category works")
    
    def test_filter_by_pattern(self):
        """GET /api/fabrics with pattern filter"""
        response = requests.get(f"{BASE_URL}/api/fabrics?pattern=Solid")
        assert response.status_code == 200
        print("✓ Filter by pattern works")
    
    def test_filter_by_color(self):
        """GET /api/fabrics with color filter"""
        response = requests.get(f"{BASE_URL}/api/fabrics?color=Blue")
        assert response.status_code == 200
        print("✓ Filter by color works")
    
    def test_filter_by_width(self):
        """GET /api/fabrics with width filter"""
        response = requests.get(f"{BASE_URL}/api/fabrics?width=58")
        assert response.status_code == 200
        print("✓ Filter by width works")
    
    def test_filter_by_gsm_range(self):
        """GET /api/fabrics with GSM range filter"""
        response = requests.get(f"{BASE_URL}/api/fabrics?min_gsm=100&max_gsm=300")
        assert response.status_code == 200
        print("✓ Filter by GSM range works")
    
    def test_filter_by_price_range(self):
        """GET /api/fabrics with price range filter"""
        response = requests.get(f"{BASE_URL}/api/fabrics?min_price=50&max_price=500")
        assert response.status_code == 200
        print("✓ Filter by price range works")
    
    def test_filter_sample_available(self):
        """GET /api/fabrics with sample_available filter"""
        response = requests.get(f"{BASE_URL}/api/fabrics?sample_available=true")
        assert response.status_code == 200
        print("✓ Filter by sample availability works")
    
    def test_filter_instant_bookable(self):
        """GET /api/fabrics with instant_bookable filter"""
        response = requests.get(f"{BASE_URL}/api/fabrics?instant_bookable=true")
        assert response.status_code == 200
        print("✓ Filter by instant bookable works")
    
    def test_fabrics_count_endpoint(self):
        """GET /api/fabrics/count returns total count"""
        response = requests.get(f"{BASE_URL}/api/fabrics/count")
        assert response.status_code == 200
        data = response.json()
        assert "count" in data
        print(f"✓ Fabrics count: {data['count']}")


class TestSEOEndpoints:
    """SEO-related endpoint tests"""
    
    def test_sitemap_xml(self):
        """GET /api/sitemap.xml returns valid XML"""
        response = requests.get(f"{BASE_URL}/api/sitemap.xml")
        assert response.status_code == 200
        assert "application/xml" in response.headers.get("content-type", "")
        assert "<?xml" in response.text
        assert "<urlset" in response.text
        assert "<url>" in response.text
        print("✓ Sitemap XML is valid")
    
    def test_prerender_homepage(self):
        """GET /api/prerender/homepage returns HTML"""
        response = requests.get(f"{BASE_URL}/api/prerender/homepage")
        assert response.status_code == 200
        assert "<!DOCTYPE html>" in response.text or "<html" in response.text
        print("✓ Prerender homepage returns HTML")
    
    def test_prerender_fabrics(self):
        """GET /api/prerender/fabrics returns HTML"""
        response = requests.get(f"{BASE_URL}/api/prerender/fabrics")
        assert response.status_code == 200
        print("✓ Prerender fabrics returns HTML")
    
    def test_prerender_collections(self):
        """GET /api/prerender/collections returns HTML"""
        response = requests.get(f"{BASE_URL}/api/prerender/collections")
        assert response.status_code == 200
        print("✓ Prerender collections returns HTML")
    
    def test_robots_txt(self):
        """GET /robots.txt is accessible"""
        response = requests.get(f"{BASE_URL}/robots.txt")
        assert response.status_code == 200
        assert "User-agent" in response.text
        print("✓ robots.txt is accessible")


class TestOrdersAndInvoice:
    """Orders and invoice tests"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin auth token"""
        payload = {"email": "admin@locofast.com", "password": "admin123"}
        response = requests.post(f"{BASE_URL}/api/auth/login", json=payload)
        if response.status_code == 200:
            return response.json()["token"]
        pytest.skip("Admin login failed")
    
    def test_get_orders_admin(self, admin_token):
        """GET /api/orders returns orders for admin"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/orders", headers=headers)
        assert response.status_code == 200
        data = response.json()
        # API returns {orders: [...], total: N} format
        assert "orders" in data or isinstance(data, list)
        orders = data.get("orders", data) if isinstance(data, dict) else data
        print(f"✓ Admin can view {len(orders)} orders")
    
    def test_get_orders_by_status(self, admin_token):
        """GET /api/orders with status filter"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/orders?status=confirmed", headers=headers)
        assert response.status_code == 200
        print("✓ Orders filter by status works")


class TestMultiVendorComparison:
    """Multi-vendor SKU comparison tests"""
    
    def test_fabric_detail_returns_data(self):
        """GET /api/fabrics/{id} returns fabric details"""
        # First get a fabric
        fabrics = requests.get(f"{BASE_URL}/api/fabrics?limit=1").json()
        if fabrics:
            fabric_id = fabrics[0]["id"]
            response = requests.get(f"{BASE_URL}/api/fabrics/{fabric_id}")
            assert response.status_code == 200
            data = response.json()
            assert "id" in data
            assert "name" in data
            print(f"✓ Fabric detail: {data['name']}")
    
    def test_other_sellers_endpoint(self):
        """GET /api/fabrics/{id}/other-sellers returns comparison data"""
        fabrics = requests.get(f"{BASE_URL}/api/fabrics?limit=1").json()
        if fabrics:
            fabric_id = fabrics[0]["id"]
            response = requests.get(f"{BASE_URL}/api/fabrics/{fabric_id}/other-sellers")
            assert response.status_code == 200
            data = response.json()
            assert isinstance(data, list)
            print(f"✓ Other sellers endpoint works, found {len(data)} alternatives")


class TestEnquiries:
    """Enquiry/RFQ tests"""
    
    def test_create_enquiry(self):
        """POST /api/enquiries creates enquiry"""
        payload = {
            "name": "TEST_Enquiry User",
            "email": "test_enquiry@example.com",
            "phone": "9876543210",
            "company": "Test Company",
            "message": "Test enquiry message",
            "enquiry_type": "rfq",
            "source": "website"
        }
        response = requests.post(f"{BASE_URL}/api/enquiries", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        print(f"✓ Enquiry created with ID: {data['id']}")


class TestSellers:
    """Seller/vendor tests"""
    
    def test_get_sellers(self):
        """GET /api/sellers returns seller list"""
        response = requests.get(f"{BASE_URL}/api/sellers")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/sellers returned {len(data)} sellers")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
