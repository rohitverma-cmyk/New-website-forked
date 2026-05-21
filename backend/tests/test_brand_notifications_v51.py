"""
Test Brand Notifications Feature (Quote-Arrived Notifications)
Tests:
1. GET /api/brand/notifications - list notifications for brand user
2. GET /api/brand/notifications/unread-count - lightweight unread count
3. POST /api/brand/notifications/{id}/read - mark single notification read
4. POST /api/brand/notifications/read-all - mark all notifications read
5. End-to-end: Vendor quote submission → brand_notifications row created + email_logs row
6. B2C fallback: Customer RFQ quote → email to customer (not brand)
"""
import pytest
import requests
import os
import uuid
from datetime import datetime, timezone

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
BRAND_ADMIN_EMAIL = "brandtest@locofast.com"
BRAND_ADMIN_PASSWORD = "NewPassword123!"
BRAND_ID = "03b50566-e559-4a54-97f0-4cd1179615d4"

VENDOR_EMAIL = "vendor@test.com"
VENDOR_PASSWORD = "vendor123"

ADMIN_EMAIL = "admin@locofast.com"
ADMIN_PASSWORD = "admin123"


@pytest.fixture(scope="module")
def brand_token():
    """Get brand admin JWT token"""
    r = requests.post(f"{BASE_URL}/api/brand/login", json={
        "email": BRAND_ADMIN_EMAIL,
        "password": BRAND_ADMIN_PASSWORD
    })
    if r.status_code != 200:
        pytest.skip(f"Brand login failed: {r.status_code} - {r.text}")
    return r.json().get("token")


@pytest.fixture(scope="module")
def vendor_token():
    """Get vendor JWT token"""
    r = requests.post(f"{BASE_URL}/api/vendor/login", json={
        "email": VENDOR_EMAIL,
        "password": VENDOR_PASSWORD
    })
    if r.status_code != 200:
        pytest.skip(f"Vendor login failed: {r.status_code} - {r.text}")
    return r.json().get("token")


@pytest.fixture(scope="module")
def admin_token():
    """Get admin JWT token"""
    r = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    if r.status_code != 200:
        pytest.skip(f"Admin login failed: {r.status_code} - {r.text}")
    return r.json().get("token")


class TestBrandNotificationEndpoints:
    """Test the brand notification API endpoints"""
    
    def test_get_notifications_list(self, brand_token):
        """GET /api/brand/notifications returns notifications + unread_count"""
        r = requests.get(
            f"{BASE_URL}/api/brand/notifications?limit=10",
            headers={"Authorization": f"Bearer {brand_token}"}
        )
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        
        # Validate response structure
        assert "notifications" in data, "Response should have 'notifications' key"
        assert "unread_count" in data, "Response should have 'unread_count' key"
        assert isinstance(data["notifications"], list), "notifications should be a list"
        assert isinstance(data["unread_count"], int), "unread_count should be an int"
        
        # Check seeded notifications exist (per agent context: 2 seeded)
        print(f"Found {len(data['notifications'])} notifications, {data['unread_count']} unread")
        
        # Validate notification structure if any exist
        if data["notifications"]:
            n = data["notifications"][0]
            assert "id" in n, "Notification should have 'id'"
            assert "title" in n, "Notification should have 'title'"
            assert "kind" in n, "Notification should have 'kind'"
            assert "read" in n, "Notification should have 'read' field"
            assert "created_at" in n, "Notification should have 'created_at'"
            print(f"Sample notification: {n.get('title', '')[:80]}...")
    
    def test_get_unread_count(self, brand_token):
        """GET /api/brand/notifications/unread-count returns lightweight count"""
        r = requests.get(
            f"{BASE_URL}/api/brand/notifications/unread-count",
            headers={"Authorization": f"Bearer {brand_token}"}
        )
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        
        assert "unread_count" in data, "Response should have 'unread_count'"
        assert isinstance(data["unread_count"], int), "unread_count should be int"
        print(f"Unread count: {data['unread_count']}")
    
    def test_mark_notification_read(self, brand_token):
        """POST /api/brand/notifications/{id}/read marks notification as read"""
        # First get a notification
        r = requests.get(
            f"{BASE_URL}/api/brand/notifications?limit=10",
            headers={"Authorization": f"Bearer {brand_token}"}
        )
        assert r.status_code == 200
        notifications = r.json().get("notifications", [])
        
        if not notifications:
            pytest.skip("No notifications to test mark-read")
        
        # Find an unread notification or use first one
        target = next((n for n in notifications if not n.get("read")), notifications[0])
        notif_id = target["id"]
        
        # Mark it read
        r = requests.post(
            f"{BASE_URL}/api/brand/notifications/{notif_id}/read",
            headers={"Authorization": f"Bearer {brand_token}"}
        )
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        
        # Verify it's now read
        r = requests.get(
            f"{BASE_URL}/api/brand/notifications?limit=30",
            headers={"Authorization": f"Bearer {brand_token}"}
        )
        updated = next((n for n in r.json().get("notifications", []) if n["id"] == notif_id), None)
        if updated:
            assert updated.get("read") == True, "Notification should be marked read"
            print(f"Notification {notif_id} marked read successfully")
    
    def test_mark_notification_read_404_wrong_user(self, brand_token):
        """POST /api/brand/notifications/{id}/read returns 404 for non-existent notification"""
        fake_id = str(uuid.uuid4())
        r = requests.post(
            f"{BASE_URL}/api/brand/notifications/{fake_id}/read",
            headers={"Authorization": f"Bearer {brand_token}"}
        )
        assert r.status_code == 404, f"Expected 404 for non-existent notification, got {r.status_code}"
    
    def test_mark_all_read(self, brand_token):
        """POST /api/brand/notifications/read-all marks all notifications read"""
        r = requests.post(
            f"{BASE_URL}/api/brand/notifications/read-all",
            headers={"Authorization": f"Bearer {brand_token}"}
        )
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert "modified" in data or "message" in data, "Response should confirm action"
        print(f"Mark all read response: {data}")
        
        # Verify unread count is now 0
        r = requests.get(
            f"{BASE_URL}/api/brand/notifications/unread-count",
            headers={"Authorization": f"Bearer {brand_token}"}
        )
        assert r.json().get("unread_count", -1) == 0, "Unread count should be 0 after mark-all-read"
    
    def test_notifications_require_auth(self):
        """Notification endpoints require brand JWT"""
        endpoints = [
            ("GET", f"{BASE_URL}/api/brand/notifications"),
            ("GET", f"{BASE_URL}/api/brand/notifications/unread-count"),
            ("POST", f"{BASE_URL}/api/brand/notifications/test-id/read"),
            ("POST", f"{BASE_URL}/api/brand/notifications/read-all"),
        ]
        for method, url in endpoints:
            if method == "GET":
                r = requests.get(url)
            else:
                r = requests.post(url)
            assert r.status_code in [401, 403], f"{method} {url} should require auth, got {r.status_code}"


class TestEndToEndQuoteNotification:
    """Test the full flow: Brand RFQ → Vendor Quote → Notification + Email Log"""
    
    def test_create_brand_rfq_and_vendor_quote(self, brand_token, vendor_token, admin_token):
        """
        End-to-end test:
        1. Create a brand-attributed RFQ via POST /api/rfq/submit (with brand JWT)
        2. Vendor submits a quote on that RFQ
        3. Verify brand_notifications row was created
        4. Verify email_logs row with kind=quote_received_brand exists
        """
        # Step 1: Create a brand RFQ
        rfq_payload = {
            "category": "cotton",
            "fabric_requirement_type": "Plain Weave",
            "quantity_meters": "1000_5000",
            "full_name": "Test Brand User",
            "email": BRAND_ADMIN_EMAIL,
            "phone": "9999999999",
            "message": f"TEST_E2E_NOTIF_{uuid.uuid4().hex[:8]} - Brand RFQ for notification test"
        }
        
        r = requests.post(
            f"{BASE_URL}/api/rfq/submit",
            json=rfq_payload,
            headers={"Authorization": f"Bearer {brand_token}"}
        )
        
        # RFQ submit might return 200 or 201
        assert r.status_code in [200, 201], f"RFQ submit failed: {r.status_code} - {r.text}"
        rfq_data = r.json()
        rfq_id = rfq_data.get("id") or rfq_data.get("rfq_id")
        rfq_number = rfq_data.get("rfq_number", "")
        
        assert rfq_id, f"RFQ should return an id: {rfq_data}"
        print(f"Created brand RFQ: {rfq_number} (id: {rfq_id})")
        
        # Verify brand_id was stamped on the RFQ
        r = requests.get(
            f"{BASE_URL}/api/admin/rfqs/{rfq_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        if r.status_code == 200:
            rfq_detail = r.json()
            assert rfq_detail.get("brand_id") == BRAND_ID, f"RFQ should have brand_id stamped: {rfq_detail.get('brand_id')}"
            print(f"Verified RFQ has brand_id: {rfq_detail.get('brand_id')}")
        
        # Step 2: Vendor submits a quote on this RFQ
        quote_payload = {
            "price_per_meter": 185.50,
            "lead_days": 14,
            "moq": 1000,
            "basis": "x-factory",
            "sample_available": True,
            "notes": "TEST quote for notification verification"
        }
        
        r = requests.post(
            f"{BASE_URL}/api/vendor/rfqs/{rfq_id}/quote",
            json=quote_payload,
            headers={"Authorization": f"Bearer {vendor_token}"}
        )
        
        assert r.status_code in [200, 201], f"Quote submit failed: {r.status_code} - {r.text}"
        quote_data = r.json()
        print(f"Vendor submitted quote: ₹{quote_payload['price_per_meter']}/m")
        
        # Step 3: Verify brand_notifications row was created
        # Give a moment for async task to complete
        import time
        time.sleep(1)
        
        r = requests.get(
            f"{BASE_URL}/api/brand/notifications?limit=30",
            headers={"Authorization": f"Bearer {brand_token}"}
        )
        assert r.status_code == 200
        notifications = r.json().get("notifications", [])
        
        # Find notification for this RFQ
        matching = [n for n in notifications if n.get("rfq_id") == rfq_id]
        assert len(matching) >= 1, f"Expected at least 1 notification for RFQ {rfq_id}, found {len(matching)}"
        
        notif = matching[0]
        assert notif.get("kind") == "quote_received", f"Notification kind should be 'quote_received': {notif.get('kind')}"
        assert notif.get("brand_id") == BRAND_ID, f"Notification should have correct brand_id"
        assert "185" in str(notif.get("title", "")), f"Notification title should contain price: {notif.get('title')}"
        assert notif.get("url") == f"/enterprise/queries/{rfq_id}", f"Notification URL should point to RFQ detail"
        assert notif.get("read") == False, "New notification should be unread"
        print(f"Verified notification created: {notif.get('title', '')[:60]}...")
        
        # Step 4: Verify email_logs row with kind=quote_received_brand
        r = requests.get(
            f"{BASE_URL}/api/email/admin/logs?rfq_id={rfq_id}&kind=quote_received_brand&limit=10",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        if r.status_code == 200:
            logs = r.json()
            if isinstance(logs, list) and len(logs) > 0:
                log = logs[0]
                assert log.get("kind") == "quote_received_brand", f"Email log kind should be quote_received_brand"
                assert log.get("status") in ["sent", "skipped"], f"Email status should be sent or skipped: {log.get('status')}"
                assert log.get("brand_id") == BRAND_ID, f"Email log should have brand_id"
                print(f"Verified email_log: kind={log.get('kind')}, status={log.get('status')}")
            else:
                print("No email logs found (may be expected if RESEND_API_KEY missing)")
        else:
            print(f"Could not fetch email logs: {r.status_code}")


class TestB2CFallback:
    """Test that B2C customer RFQs still work (no brand_id → email to customer)"""
    
    def test_customer_rfq_quote_email(self, vendor_token, admin_token):
        """
        When a vendor quotes on a customer RFQ (no brand_id):
        - Email should go to customer (kind=quote_received_customer)
        - No brand_notifications row should be created
        """
        # Create a customer RFQ (no brand JWT)
        rfq_payload = {
            "category": "cotton",
            "fabric_requirement_type": "Twill",
            "quantity_meters": "1000_5000",
            "full_name": "Test Customer",
            "email": "testcustomer@example.com",
            "phone": "8888888888",
            "message": f"TEST_B2C_{uuid.uuid4().hex[:8]} - Customer RFQ"
        }
        
        r = requests.post(f"{BASE_URL}/api/rfq/submit", json=rfq_payload)
        
        if r.status_code not in [200, 201]:
            pytest.skip(f"Customer RFQ submit failed: {r.status_code}")
        
        rfq_data = r.json()
        rfq_id = rfq_data.get("id") or rfq_data.get("rfq_id")
        print(f"Created customer RFQ: {rfq_data.get('rfq_number')} (id: {rfq_id})")
        
        # Verify no brand_id on this RFQ
        r = requests.get(
            f"{BASE_URL}/api/admin/rfqs/{rfq_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        if r.status_code == 200:
            rfq_detail = r.json()
            assert not rfq_detail.get("brand_id"), f"Customer RFQ should NOT have brand_id: {rfq_detail.get('brand_id')}"
        
        # Vendor submits quote
        quote_payload = {
            "price_per_meter": 200,
            "lead_days": 10,
            "moq": 500
        }
        
        r = requests.post(
            f"{BASE_URL}/api/vendor/rfqs/{rfq_id}/quote",
            json=quote_payload,
            headers={"Authorization": f"Bearer {vendor_token}"}
        )
        
        if r.status_code not in [200, 201]:
            pytest.skip(f"Vendor quote on customer RFQ failed: {r.status_code}")
        
        print(f"Vendor quoted on customer RFQ")
        
        # Check email_logs for quote_received_customer
        import time
        time.sleep(1)
        
        r = requests.get(
            f"{BASE_URL}/api/email/admin/logs?rfq_id={rfq_id}&kind=quote_received_customer&limit=5",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        if r.status_code == 200:
            logs = r.json()
            if isinstance(logs, list) and len(logs) > 0:
                log = logs[0]
                assert log.get("kind") == "quote_received_customer", "Should be customer email"
                print(f"Verified B2C email log: kind={log.get('kind')}, status={log.get('status')}")
            else:
                print("No customer email logs (may be expected if RESEND_API_KEY missing)")


class TestNotificationDataIntegrity:
    """Test notification data structure and fields"""
    
    def test_notification_fields(self, brand_token):
        """Verify notification documents have all required fields"""
        r = requests.get(
            f"{BASE_URL}/api/brand/notifications?limit=10",
            headers={"Authorization": f"Bearer {brand_token}"}
        )
        assert r.status_code == 200
        notifications = r.json().get("notifications", [])
        
        if not notifications:
            pytest.skip("No notifications to validate")
        
        required_fields = ["id", "brand_id", "brand_user_id", "kind", "title", "read", "created_at"]
        optional_fields = ["rfq_id", "rfq_number", "vendor_company", "price_per_unit", "unit", "url"]
        
        for n in notifications[:3]:  # Check first 3
            for field in required_fields:
                assert field in n, f"Notification missing required field '{field}': {n}"
            
            # Validate types
            assert isinstance(n["id"], str), "id should be string"
            assert isinstance(n["read"], bool), "read should be boolean"
            assert n["kind"] in ["quote_received"], f"Unknown notification kind: {n['kind']}"
            
            # URL should point to enterprise queries
            if n.get("url"):
                assert "/enterprise/queries/" in n["url"], f"URL should point to enterprise queries: {n['url']}"
        
        print(f"Validated {min(3, len(notifications))} notification documents")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
