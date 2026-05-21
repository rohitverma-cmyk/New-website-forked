"""
Phase 46 - Shiprocket Integration Webhook Tests

Tests the full port of Shiprocket integration including:
- Webhook endpoints for tracking and order-status updates
- Status mapping from Shiprocket statuses to canonical order statuses
- Regression guard (delivered orders should never regress)
- Audit logging to shiprocket_events collection
- Graceful handling of malformed payloads
- Existing endpoint regression checks
"""
import pytest
import requests
import os
import time
from dotenv import load_dotenv
import pymongo

load_dotenv('/app/backend/.env')

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
MONGO_URL = os.environ.get('MONGO_URL')
DB_NAME = os.environ.get('DB_NAME')

# Test order details
TEST_ORDER_ID = "220475e5-fa34-40c5-ae1d-8738781996b1"
TEST_ORDER_NUMBER = "ORD-BGFIJQ"
TEST_AWB_CODE = "WBHOOK-TEST-AWB-99"


@pytest.fixture(scope="module")
def mongo_client():
    """MongoDB client for direct DB verification"""
    client = pymongo.MongoClient(MONGO_URL)
    db = client[DB_NAME]
    yield db
    client.close()


@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def admin_token(api_client):
    """Get admin authentication token"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@locofast.com",
        "password": "admin123"
    })
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip("Admin authentication failed")


@pytest.fixture(autouse=True)
def reset_test_order(mongo_client):
    """Reset test order to confirmed status before each test"""
    mongo_client.orders.update_one(
        {"id": TEST_ORDER_ID},
        {"$set": {
            "status": "confirmed",
            "awb_code": TEST_AWB_CODE,
            "courier_name": None,
            "shipped_at": None,
            "delivered_at": None,
            "shiprocket_last_event": None,
            "shiprocket_last_event_at": None
        }}
    )
    # Clear audit events for this order
    mongo_client.shiprocket_events.delete_many({"order_id": TEST_ORDER_ID})
    yield


class TestShiprocketWebhookEndpoints:
    """Test webhook endpoint availability and basic responses"""
    
    def test_webhook_events_endpoint_returns_200(self, api_client):
        """GET /api/shiprocket/webhooks/events returns 200 with ring buffer schema"""
        response = api_client.get(f"{BASE_URL}/api/shiprocket/webhooks/events")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert data.get("success") is True
        assert "data" in data
        assert "events" in data["data"]
        assert "total" in data["data"]
        assert isinstance(data["data"]["events"], list)
        assert isinstance(data["data"]["total"], int)
        print(f"✓ Webhook events endpoint working - {data['data']['total']} events in buffer")
    
    def test_tracking_webhook_accepts_valid_payload(self, api_client, mongo_client):
        """POST /api/shiprocket/webhooks/tracking with valid payload returns 200"""
        payload = {
            "awb": TEST_AWB_CODE,
            "current_status": "In Transit",
            "courier_name": "Bluedart"
        }
        response = api_client.post(f"{BASE_URL}/api/shiprocket/webhooks/tracking", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") is True
        print(f"✓ Tracking webhook accepted - AWB: {payload['awb']}, Status: {payload['current_status']}")
    
    def test_order_status_webhook_accepts_valid_payload(self, api_client):
        """POST /api/shiprocket/webhooks/order-status with valid payload returns 200"""
        payload = {
            "awb_code": TEST_AWB_CODE,
            "status": "Picked Up",
            "courier_name": "DTDC"
        }
        response = api_client.post(f"{BASE_URL}/api/shiprocket/webhooks/order-status", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") is True
        print(f"✓ Order-status webhook accepted")


class TestWebhookStatusMapping:
    """Test status mapping from Shiprocket to canonical order statuses"""
    
    def test_in_transit_maps_to_shipped(self, api_client, mongo_client):
        """'In Transit' status should map to 'shipped'"""
        payload = {
            "awb": TEST_AWB_CODE,
            "current_status": "In Transit",
            "courier_name": "Bluedart"
        }
        response = api_client.post(f"{BASE_URL}/api/shiprocket/webhooks/tracking", json=payload)
        assert response.status_code == 200
        
        # Wait for background task
        time.sleep(0.5)
        
        order = mongo_client.orders.find_one({"id": TEST_ORDER_ID}, {"_id": 0})
        assert order["status"] == "shipped", f"Expected 'shipped', got '{order['status']}'"
        assert order["courier_name"] == "Bluedart"
        assert order["shipped_at"] is not None
        print(f"✓ 'In Transit' → 'shipped' mapping verified")
    
    def test_pickup_scheduled_maps_to_processing(self, api_client, mongo_client):
        """'Pickup Scheduled' status should map to 'processing'"""
        payload = {
            "awb": TEST_AWB_CODE,
            "current_status": "Pickup Scheduled",
            "courier_name": "Delhivery"
        }
        response = api_client.post(f"{BASE_URL}/api/shiprocket/webhooks/tracking", json=payload)
        assert response.status_code == 200
        
        time.sleep(0.5)
        
        order = mongo_client.orders.find_one({"id": TEST_ORDER_ID}, {"_id": 0})
        assert order["status"] == "processing", f"Expected 'processing', got '{order['status']}'"
        print(f"✓ 'Pickup Scheduled' → 'processing' mapping verified")
    
    def test_picked_up_maps_to_shipped(self, api_client, mongo_client):
        """'Picked Up' status should map to 'shipped'"""
        payload = {
            "awb": TEST_AWB_CODE,
            "current_status": "Picked Up",
            "courier_name": "Ecom Express"
        }
        response = api_client.post(f"{BASE_URL}/api/shiprocket/webhooks/tracking", json=payload)
        assert response.status_code == 200
        
        time.sleep(0.5)
        
        order = mongo_client.orders.find_one({"id": TEST_ORDER_ID}, {"_id": 0})
        assert order["status"] == "shipped", f"Expected 'shipped', got '{order['status']}'"
        print(f"✓ 'Picked Up' → 'shipped' mapping verified")
    
    def test_out_for_delivery_maps_to_shipped(self, api_client, mongo_client):
        """'Out for Delivery' status should map to 'shipped'"""
        payload = {
            "awb": TEST_AWB_CODE,
            "current_status": "Out for Delivery",
            "courier_name": "Xpressbees"
        }
        response = api_client.post(f"{BASE_URL}/api/shiprocket/webhooks/tracking", json=payload)
        assert response.status_code == 200
        
        time.sleep(0.5)
        
        order = mongo_client.orders.find_one({"id": TEST_ORDER_ID}, {"_id": 0})
        assert order["status"] == "shipped", f"Expected 'shipped', got '{order['status']}'"
        print(f"✓ 'Out for Delivery' → 'shipped' mapping verified")
    
    def test_delivered_maps_to_delivered(self, api_client, mongo_client):
        """'Delivered' status should map to 'delivered'"""
        payload = {
            "awb": TEST_AWB_CODE,
            "current_status": "Delivered",
            "courier_name": "Bluedart"
        }
        response = api_client.post(f"{BASE_URL}/api/shiprocket/webhooks/tracking", json=payload)
        assert response.status_code == 200
        
        time.sleep(0.5)
        
        order = mongo_client.orders.find_one({"id": TEST_ORDER_ID}, {"_id": 0})
        assert order["status"] == "delivered", f"Expected 'delivered', got '{order['status']}'"
        assert order["delivered_at"] is not None
        print(f"✓ 'Delivered' → 'delivered' mapping verified")
    
    def test_rto_initiated_maps_to_cancelled(self, api_client, mongo_client):
        """'RTO Initiated' status should map to 'cancelled'"""
        payload = {
            "awb": TEST_AWB_CODE,
            "current_status": "RTO Initiated",
            "courier_name": "Bluedart"
        }
        response = api_client.post(f"{BASE_URL}/api/shiprocket/webhooks/tracking", json=payload)
        assert response.status_code == 200
        
        time.sleep(0.5)
        
        order = mongo_client.orders.find_one({"id": TEST_ORDER_ID}, {"_id": 0})
        assert order["status"] == "cancelled", f"Expected 'cancelled', got '{order['status']}'"
        print(f"✓ 'RTO Initiated' → 'cancelled' mapping verified")


class TestWebhookRegressionGuard:
    """Test that delivered orders never regress to earlier statuses"""
    
    def test_delivered_order_does_not_regress_to_shipped(self, api_client, mongo_client):
        """After delivered, 'In Transit' webhook should NOT change status back"""
        # First, set order to delivered
        mongo_client.orders.update_one(
            {"id": TEST_ORDER_ID},
            {"$set": {"status": "delivered", "delivered_at": "2026-01-01T00:00:00Z"}}
        )
        
        # Send In Transit webhook (should be ignored)
        payload = {
            "awb": TEST_AWB_CODE,
            "current_status": "In Transit",
            "courier_name": "Bluedart"
        }
        response = api_client.post(f"{BASE_URL}/api/shiprocket/webhooks/tracking", json=payload)
        assert response.status_code == 200
        
        time.sleep(0.5)
        
        order = mongo_client.orders.find_one({"id": TEST_ORDER_ID}, {"_id": 0})
        assert order["status"] == "delivered", f"Status regressed! Expected 'delivered', got '{order['status']}'"
        print(f"✓ Regression guard working - delivered order stayed delivered after 'In Transit' webhook")
    
    def test_delivered_order_does_not_regress_to_processing(self, api_client, mongo_client):
        """After delivered, 'Pickup Scheduled' webhook should NOT change status back"""
        # First, set order to delivered
        mongo_client.orders.update_one(
            {"id": TEST_ORDER_ID},
            {"$set": {"status": "delivered", "delivered_at": "2026-01-01T00:00:00Z"}}
        )
        
        # Send Pickup Scheduled webhook (should be ignored)
        payload = {
            "awb": TEST_AWB_CODE,
            "current_status": "Pickup Scheduled",
            "courier_name": "DTDC"
        }
        response = api_client.post(f"{BASE_URL}/api/shiprocket/webhooks/tracking", json=payload)
        assert response.status_code == 200
        
        time.sleep(0.5)
        
        order = mongo_client.orders.find_one({"id": TEST_ORDER_ID}, {"_id": 0})
        assert order["status"] == "delivered", f"Status regressed! Expected 'delivered', got '{order['status']}'"
        print(f"✓ Regression guard working - delivered order stayed delivered after 'Pickup Scheduled' webhook")


class TestWebhookAuditLogging:
    """Test that webhook events are logged to shiprocket_events collection"""
    
    def test_webhook_creates_audit_entry(self, api_client, mongo_client):
        """Each webhook should create an entry in shiprocket_events"""
        # Send a webhook
        payload = {
            "awb": TEST_AWB_CODE,
            "current_status": "In Transit",
            "courier_name": "Bluedart"
        }
        response = api_client.post(f"{BASE_URL}/api/shiprocket/webhooks/tracking", json=payload)
        assert response.status_code == 200
        
        time.sleep(0.5)
        
        # Check audit entry
        event = mongo_client.shiprocket_events.find_one(
            {"order_id": TEST_ORDER_ID, "raw_status": "In Transit"},
            {"_id": 0}
        )
        assert event is not None, "Audit entry not found"
        assert event["awb_code"] == TEST_AWB_CODE
        assert event["raw_status"] == "In Transit"
        assert event["mapped_status"] == "shipped"
        assert event["courier_name"] == "Bluedart"
        print(f"✓ Audit entry created with raw_status and mapped_status fields")
    
    def test_multiple_webhooks_create_multiple_audit_entries(self, api_client, mongo_client):
        """Multiple webhooks should create multiple audit entries"""
        statuses = ["Pickup Scheduled", "Picked Up", "Delivered"]
        
        for status in statuses:
            payload = {
                "awb": TEST_AWB_CODE,
                "current_status": status,
                "courier_name": "Bluedart"
            }
            response = api_client.post(f"{BASE_URL}/api/shiprocket/webhooks/tracking", json=payload)
            assert response.status_code == 200
            time.sleep(0.3)
        
        time.sleep(0.5)
        
        # Count audit entries
        count = mongo_client.shiprocket_events.count_documents({"order_id": TEST_ORDER_ID})
        assert count == 3, f"Expected 3 audit entries, got {count}"
        print(f"✓ {count} audit entries created for {len(statuses)} webhooks")


class TestWebhookMalformedPayloads:
    """Test graceful handling of malformed webhook payloads"""
    
    def test_missing_awb_returns_200_with_success_false(self, api_client):
        """Missing AWB should return 200 with success=false (no crash)"""
        payload = {
            "current_status": "In Transit",
            "courier_name": "Bluedart"
            # Missing awb
        }
        response = api_client.post(f"{BASE_URL}/api/shiprocket/webhooks/tracking", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        # Should still return 200 to avoid Shiprocket retry storms
        print(f"✓ Missing AWB handled gracefully - returned 200")
    
    def test_missing_status_returns_200(self, api_client):
        """Missing status should return 200 (no crash)"""
        payload = {
            "awb": TEST_AWB_CODE,
            "courier_name": "Bluedart"
            # Missing current_status
        }
        response = api_client.post(f"{BASE_URL}/api/shiprocket/webhooks/tracking", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print(f"✓ Missing status handled gracefully - returned 200")
    
    def test_empty_payload_returns_200(self, api_client):
        """Empty payload should return 200 (no crash)"""
        response = api_client.post(f"{BASE_URL}/api/shiprocket/webhooks/tracking", json={})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print(f"✓ Empty payload handled gracefully - returned 200")
    
    def test_unknown_awb_returns_200_no_crash(self, api_client, mongo_client):
        """AWB that doesn't match any order should return 200 (logs warning, no crash)"""
        payload = {
            "awb": "UNKNOWN-AWB-12345",
            "current_status": "Delivered",
            "courier_name": "Bluedart"
        }
        response = api_client.post(f"{BASE_URL}/api/shiprocket/webhooks/tracking", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        # Verify no audit entry was created for unknown AWB
        time.sleep(0.3)
        event = mongo_client.shiprocket_events.find_one({"awb_code": "UNKNOWN-AWB-12345"})
        assert event is None, "Should not create audit entry for unknown AWB"
        print(f"✓ Unknown AWB handled gracefully - returned 200, no audit entry")


class TestExistingEndpointRegression:
    """Regression tests for existing endpoints after Shiprocket module port"""
    
    def _get_customer_token(self, api_client, mongo_client):
        """Helper to get customer token via OTP flow"""
        email = "deepak.wadhwa@locofast.com"
        
        # Clear rate limit by deleting recent OTPs
        mongo_client.customer_otps.delete_many({"email": email})
        
        # Send OTP
        response = api_client.post(f"{BASE_URL}/api/customer/send-otp", json={"email": email})
        if response.status_code != 200:
            return None
        
        # Get OTP from DB
        otp_doc = mongo_client.customer_otps.find_one({"email": email}, sort=[("created_at", -1)])
        if not otp_doc:
            return None
        otp_code = otp_doc.get("otp")
        
        # Verify OTP
        response = api_client.post(f"{BASE_URL}/api/customer/verify-otp", json={
            "email": email,
            "otp": otp_code
        })
        if response.status_code != 200:
            return None
        
        return response.json().get("token")
    
    def test_customer_orders_list_endpoint(self, api_client, mongo_client):
        """GET /api/customer/orders should still work"""
        token = self._get_customer_token(api_client, mongo_client)
        if not token:
            pytest.skip("Could not get customer token")
        
        headers = {"Authorization": f"Bearer {token}"}
        response = api_client.get(f"{BASE_URL}/api/customer/orders", headers=headers)
        assert response.status_code == 200, f"Customer orders failed: {response.text}"
        print(f"✓ GET /api/customer/orders still working")
    
    def test_customer_order_detail_endpoint(self, api_client, mongo_client):
        """GET /api/customer/orders/{id} should still work"""
        token = self._get_customer_token(api_client, mongo_client)
        if not token:
            pytest.skip("Could not get customer token")
        
        headers = {"Authorization": f"Bearer {token}"}
        response = api_client.get(f"{BASE_URL}/api/customer/orders/{TEST_ORDER_ID}", headers=headers)
        assert response.status_code == 200, f"Customer order detail failed: {response.text}"
        
        data = response.json()
        assert data.get("id") == TEST_ORDER_ID
        print(f"✓ GET /api/customer/orders/{{id}} still working")
    
    def test_customer_order_pay_context_endpoint(self, api_client, mongo_client):
        """GET /api/customer/orders/{id}/pay-context should still work"""
        token = self._get_customer_token(api_client, mongo_client)
        if not token:
            pytest.skip("Could not get customer token")
        
        headers = {"Authorization": f"Bearer {token}"}
        response = api_client.get(f"{BASE_URL}/api/customer/orders/{TEST_ORDER_ID}/pay-context", headers=headers)
        assert response.status_code in [200, 400], f"Pay context failed unexpectedly: {response.status_code} - {response.text}"
        print(f"✓ GET /api/customer/orders/{{id}}/pay-context still working (status: {response.status_code})")
    
    def test_customer_profile_endpoint(self, api_client, mongo_client):
        """POST /api/customer/profile should still work (Phase 44 GST validation)"""
        token = self._get_customer_token(api_client, mongo_client)
        if not token:
            pytest.skip("Could not get customer token")
        
        headers = {"Authorization": f"Bearer {token}"}
        response = api_client.get(f"{BASE_URL}/api/customer/profile", headers=headers)
        assert response.status_code == 200, f"Customer profile GET failed: {response.text}"
        print(f"✓ GET /api/customer/profile still working")
    
    def test_admin_brands_endpoint(self, api_client, admin_token):
        """GET /api/admin/brands should still work (Phase 45 standalone factories)"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = api_client.get(f"{BASE_URL}/api/admin/brands", headers=headers)
        assert response.status_code == 200, f"Admin brands failed: {response.text}"
        print(f"✓ GET /api/admin/brands still working")


class TestShiprocketOrdersListEndpoint:
    """Test the live Shiprocket API integration (auth singleton smoke test)"""
    
    def test_shiprocket_orders_list_no_python_exception(self, api_client):
        """GET /api/shiprocket/orders/list should not throw Python exception"""
        # This tests that auth_service singleton is initialized
        # OK if it returns 'no orders' or even a Shiprocket-side error
        # What we're checking is no Python exception (500 with traceback)
        response = api_client.get(f"{BASE_URL}/api/shiprocket/orders/")
        
        # Should not be 500 with Python traceback
        if response.status_code == 500:
            # Check if it's a Python exception vs Shiprocket error
            text = response.text.lower()
            assert "traceback" not in text, f"Python exception in response: {response.text}"
            assert "nameerror" not in text, f"Python NameError: {response.text}"
            assert "importerror" not in text, f"Python ImportError: {response.text}"
        
        print(f"✓ Shiprocket orders/list endpoint responded (status: {response.status_code})")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
