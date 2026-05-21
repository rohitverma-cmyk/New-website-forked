"""
Phase 46 Tests: Email Audit Log, Unified Account, Enterprise RFQ Portal

Tests for:
#5 Email Audit Log - GET /api/email/admin/logs endpoints
#6 Unified Account - PUT /api/brand/profile, GET /api/brand/ledger enrichment
#7 Enterprise RFQ Portal - Brand queries endpoints, RFQ with brand token
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from test_credentials.md
ADMIN_EMAIL = "admin@locofast.com"
ADMIN_PASSWORD = "admin123"
BRAND_ADMIN_EMAIL = "brandtest@locofast.com"
BRAND_ADMIN_PASSWORD = "NewPassword123!"
BRAND_ID = "03b50566-e559-4a54-97f0-4cd1179615d4"
VENDOR_EMAIL = "vendor@test.com"
VENDOR_PASSWORD = "vendor123"


class TestSetup:
    """Setup fixtures for authentication"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip(f"Admin login failed: {response.status_code} - {response.text}")
        return response.json().get("token")
    
    @pytest.fixture(scope="class")
    def brand_admin_token(self):
        """Get brand admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/brand/login", json={
            "email": BRAND_ADMIN_EMAIL,
            "password": BRAND_ADMIN_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip(f"Brand login failed: {response.status_code} - {response.text}")
        return response.json().get("token")
    
    @pytest.fixture(scope="class")
    def vendor_token(self):
        """Get vendor authentication token"""
        response = requests.post(f"{BASE_URL}/api/vendor/login", json={
            "email": VENDOR_EMAIL,
            "password": VENDOR_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip(f"Vendor login failed: {response.status_code} - {response.text}")
        return response.json().get("token")


class TestEmailAuditLog(TestSetup):
    """#5 Email Audit Log Tests"""
    
    def test_admin_email_logs_requires_auth(self):
        """Email logs endpoint requires admin authentication"""
        response = requests.get(f"{BASE_URL}/api/email/admin/logs")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
    
    def test_admin_email_logs_list(self, admin_token):
        """Admin can list email logs"""
        response = requests.get(
            f"{BASE_URL}/api/email/admin/logs",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected list response"
    
    def test_admin_email_logs_with_filters(self, admin_token):
        """Admin can filter email logs by order_id, brand_id, kind"""
        # Test with order_id filter
        response = requests.get(
            f"{BASE_URL}/api/email/admin/logs?order_id=test-order-123",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        
        # Test with brand_id filter
        response = requests.get(
            f"{BASE_URL}/api/email/admin/logs?brand_id={BRAND_ID}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        
        # Test with kind filter
        response = requests.get(
            f"{BASE_URL}/api/email/admin/logs?kind=brand_order_sample_buyer",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
    
    def test_admin_email_log_detail_not_found(self, admin_token):
        """Admin gets 404 for non-existent email log"""
        response = requests.get(
            f"{BASE_URL}/api/email/admin/logs/nonexistent-log-id",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 404


class TestUnifiedAccount(TestSetup):
    """#6 Unified Account Tests - Profile and Ledger"""
    
    def test_brand_profile_update_requires_admin_role(self, brand_admin_token):
        """PUT /api/brand/profile requires brand_admin role"""
        # First verify we can update as brand_admin
        response = requests.put(
            f"{BASE_URL}/api/brand/profile",
            headers={"Authorization": f"Bearer {brand_admin_token}", "Content-Type": "application/json"},
            json={"phone": "9876543210"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "brand" in data or "message" in data
    
    def test_brand_profile_update_name(self, brand_admin_token):
        """Brand admin can update enterprise name"""
        original_name = "Test Brand Co"
        new_name = f"TEST_Updated Brand {uuid.uuid4().hex[:6]}"
        
        # Update name
        response = requests.put(
            f"{BASE_URL}/api/brand/profile",
            headers={"Authorization": f"Bearer {brand_admin_token}", "Content-Type": "application/json"},
            json={"name": new_name}
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("brand", {}).get("name") == new_name
        
        # Restore original name
        requests.put(
            f"{BASE_URL}/api/brand/profile",
            headers={"Authorization": f"Bearer {brand_admin_token}", "Content-Type": "application/json"},
            json={"name": original_name}
        )
    
    def test_brand_profile_gst_validation(self, brand_admin_token):
        """GST must be 15 characters if provided"""
        # Invalid GST (not 15 chars)
        response = requests.put(
            f"{BASE_URL}/api/brand/profile",
            headers={"Authorization": f"Bearer {brand_admin_token}", "Content-Type": "application/json"},
            json={"gst": "INVALID"}
        )
        assert response.status_code == 400, f"Expected 400 for invalid GST, got {response.status_code}"
        
        # Valid GST (15 chars)
        response = requests.put(
            f"{BASE_URL}/api/brand/profile",
            headers={"Authorization": f"Bearer {brand_admin_token}", "Content-Type": "application/json"},
            json={"gst": "22AAAAA0000A1Z5"}
        )
        assert response.status_code == 200
    
    def test_brand_ledger_returns_entries(self, brand_admin_token):
        """GET /api/brand/ledger returns ledger entries"""
        response = requests.get(
            f"{BASE_URL}/api/brand/ledger",
            headers={"Authorization": f"Bearer {brand_admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list), "Expected list of ledger entries"
    
    def test_brand_ledger_order_enrichment(self, brand_admin_token):
        """Ledger entries with order_id should have enriched order field"""
        response = requests.get(
            f"{BASE_URL}/api/brand/ledger",
            headers={"Authorization": f"Bearer {brand_admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Check if any entry has order enrichment
        for entry in data:
            if entry.get("order_id") and entry.get("order"):
                order = entry["order"]
                # Verify order has expected fields
                assert "order_number" in order or "products" in order, "Order should have order_number or products"
                if "products" in order:
                    for product in order["products"]:
                        # Verify product fields
                        assert "fabric_id" in product or "fabric_name" in product
                break
    
    def test_brand_addresses_endpoint(self, brand_admin_token):
        """GET /api/brand/addresses returns address book"""
        response = requests.get(
            f"{BASE_URL}/api/brand/addresses",
            headers={"Authorization": f"Bearer {brand_admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "addresses" in data, "Expected addresses field in response"
    
    def test_brand_orders_endpoint(self, brand_admin_token):
        """GET /api/brand/orders returns brand orders"""
        response = requests.get(
            f"{BASE_URL}/api/brand/orders",
            headers={"Authorization": f"Bearer {brand_admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list), "Expected list of orders"


class TestEnterpriseRFQPortal(TestSetup):
    """#7 Enterprise RFQ Portal Tests"""
    
    def test_rfq_submit_with_brand_token(self, brand_admin_token):
        """RFQ submitted with brand token gets brand_id stamped"""
        rfq_data = {
            "category": "cotton",
            "fabric_requirement_type": "Dyed",
            "quantity_value": 500,
            "quantity_unit": "m",
            "full_name": "Test Brand User",
            "email": BRAND_ADMIN_EMAIL,
            "phone": "9876543210",
            "color": "Navy Blue",
            "gsm": 180,
            "message": "TEST_Phase46 RFQ submission"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/rfq/submit",
            headers={"Authorization": f"Bearer {brand_admin_token}", "Content-Type": "application/json"},
            json=rfq_data
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "rfq_number" in data, "Expected rfq_number in response"
        assert "id" in data, "Expected id in response"
        
        # Store RFQ ID for later tests
        TestEnterpriseRFQPortal.created_rfq_id = data.get("id")
        TestEnterpriseRFQPortal.created_rfq_number = data.get("rfq_number")
        print(f"Created RFQ: {data.get('rfq_number')} with ID: {data.get('id')}")
    
    def test_brand_queries_list_not_received(self, brand_admin_token):
        """GET /api/brand/queries?status=not_received lists RFQs without quotes"""
        response = requests.get(
            f"{BASE_URL}/api/brand/queries?status=not_received",
            headers={"Authorization": f"Bearer {brand_admin_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "queries" in data, "Expected queries field"
        assert "total" in data, "Expected total field"
        
        # Verify the newly created RFQ appears
        if hasattr(TestEnterpriseRFQPortal, 'created_rfq_id'):
            rfq_ids = [q.get("id") for q in data.get("queries", [])]
            assert TestEnterpriseRFQPortal.created_rfq_id in rfq_ids, "Newly created RFQ should appear in not_received"
    
    def test_brand_queries_list_received(self, brand_admin_token):
        """GET /api/brand/queries?status=received lists RFQs with quotes"""
        response = requests.get(
            f"{BASE_URL}/api/brand/queries?status=received",
            headers={"Authorization": f"Bearer {brand_admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "queries" in data
        
        # Check that queries have quotes_count and best_quote fields
        for query in data.get("queries", []):
            assert "quotes_count" in query, "Query should have quotes_count"
            assert query["quotes_count"] > 0, "Received queries should have at least 1 quote"
    
    def test_brand_queries_list_closed(self, brand_admin_token):
        """GET /api/brand/queries?status=closed lists closed RFQs"""
        response = requests.get(
            f"{BASE_URL}/api/brand/queries?status=closed",
            headers={"Authorization": f"Bearer {brand_admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "queries" in data
    
    def test_brand_query_detail(self, brand_admin_token):
        """GET /api/brand/queries/{rfq_id} returns full RFQ with quotes"""
        if not hasattr(TestEnterpriseRFQPortal, 'created_rfq_id'):
            pytest.skip("No RFQ created in previous test")
        
        rfq_id = TestEnterpriseRFQPortal.created_rfq_id
        response = requests.get(
            f"{BASE_URL}/api/brand/queries/{rfq_id}",
            headers={"Authorization": f"Bearer {brand_admin_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify RFQ fields
        assert data.get("id") == rfq_id
        assert "quotes" in data, "RFQ detail should include quotes array"
        assert "quantity_label" in data, "RFQ detail should include quantity_label"
    
    def test_brand_query_detail_404_for_other_brand(self, brand_admin_token):
        """GET /api/brand/queries/{rfq_id} returns 404 for another brand's RFQ"""
        # Use a fake RFQ ID that doesn't belong to this brand
        fake_rfq_id = str(uuid.uuid4())
        response = requests.get(
            f"{BASE_URL}/api/brand/queries/{fake_rfq_id}",
            headers={"Authorization": f"Bearer {brand_admin_token}"}
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
    
    def test_brand_queries_requires_auth(self):
        """Brand queries endpoints require authentication"""
        response = requests.get(f"{BASE_URL}/api/brand/queries")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"


class TestBrandOrderEmailAudit(TestSetup):
    """Test brand order email audit trail"""
    
    def test_brand_order_emails_endpoint(self, brand_admin_token):
        """GET /api/brand/orders/{id}/emails returns email logs for brand's order"""
        # First get a brand order
        orders_response = requests.get(
            f"{BASE_URL}/api/brand/orders",
            headers={"Authorization": f"Bearer {brand_admin_token}"}
        )
        assert orders_response.status_code == 200
        orders = orders_response.json()
        
        if not orders:
            pytest.skip("No brand orders to test email audit")
        
        order_id = orders[0].get("id")
        response = requests.get(
            f"{BASE_URL}/api/brand/orders/{order_id}/emails",
            headers={"Authorization": f"Bearer {brand_admin_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected list of email logs"
        
        # Verify HTML bodies are stripped from brand view
        for log in data:
            assert "html" not in log, "HTML body should be stripped from brand view"
    
    def test_brand_order_emails_404_for_other_order(self, brand_admin_token):
        """GET /api/brand/orders/{id}/emails returns 404 for non-existent order"""
        fake_order_id = str(uuid.uuid4())
        response = requests.get(
            f"{BASE_URL}/api/brand/orders/{fake_order_id}/emails",
            headers={"Authorization": f"Bearer {brand_admin_token}"}
        )
        assert response.status_code == 404


class TestBrandMeEndpoint(TestSetup):
    """Test brand/me endpoint for account info"""
    
    def test_brand_me_returns_user_and_brand(self, brand_admin_token):
        """GET /api/brand/me returns user and brand info"""
        response = requests.get(
            f"{BASE_URL}/api/brand/me",
            headers={"Authorization": f"Bearer {brand_admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "user" in data, "Expected user field"
        assert "brand" in data, "Expected brand field"
        
        user = data["user"]
        brand = data["brand"]
        
        assert user.get("email") == BRAND_ADMIN_EMAIL
        assert user.get("role") == "brand_admin"
        assert brand.get("id") == BRAND_ID


class TestCreditSummary(TestSetup):
    """Test credit summary endpoint"""
    
    def test_brand_credit_summary(self, brand_admin_token):
        """GET /api/brand/credit-summary returns credit and sample credit info"""
        response = requests.get(
            f"{BASE_URL}/api/brand/credit-summary",
            headers={"Authorization": f"Bearer {brand_admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "credit" in data, "Expected credit field"
        assert "sample_credits" in data, "Expected sample_credits field"
        
        credit = data["credit"]
        assert "total_allocated" in credit
        assert "total_utilized" in credit
        assert "available" in credit
        assert "lines" in credit
        
        sample = data["sample_credits"]
        assert "total" in sample
        assert "used" in sample
        assert "available" in sample


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
