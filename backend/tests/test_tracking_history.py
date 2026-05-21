"""
Phase 47 - Tracking History Endpoint & Webhook Location Extraction Tests

Tests the new tracking history endpoint and location/activity extraction:
- GET /api/customer/orders/{id}/tracking returns scan history
- Response includes order_id, order_number, awb_code, courier_name, shipped_at, delivered_at, status, events[]
- Each event has raw_status, mapped_status, courier_name, location, activity, event_time, received_at
- Events sorted newest-first by event_time
- Cross-customer scoping (404 for different customer)
- 401 when no auth header
- Webhook handler extracts location and activity fields
- Graceful handling of payloads without location/activity
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

# Test order details (pre-seeded with 5 events)
TEST_ORDER_ID = "220475e5-fa34-40c5-ae1d-8738781996b1"
TEST_ORDER_NUMBER = "ORD-BGFIJQ"
TEST_AWB_CODE = "SR-DEMO-AWB-2901"

# Customer emails
OWNER_EMAIL = "deepak.wadhwa@locofast.com"
OTHER_EMAIL = "profile-test@locofast.com"


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


def get_customer_token(api_client, mongo_client, email):
    """Helper to get customer token via OTP flow"""
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


@pytest.fixture(scope="module")
def owner_token(api_client, mongo_client):
    """Token for the order owner (deepak.wadhwa@locofast.com)"""
    token = get_customer_token(api_client, mongo_client, OWNER_EMAIL)
    if not token:
        pytest.skip("Could not get owner customer token")
    return token


@pytest.fixture(scope="module")
def other_token(api_client, mongo_client):
    """Token for a different customer (profile-test@locofast.com)"""
    token = get_customer_token(api_client, mongo_client, OTHER_EMAIL)
    if not token:
        pytest.skip("Could not get other customer token")
    return token


class TestTrackingHistoryEndpoint:
    """Test GET /api/customer/orders/{id}/tracking endpoint"""
    
    def test_tracking_returns_200_for_owner(self, api_client, owner_token):
        """Owner can access their order's tracking history"""
        headers = {"Authorization": f"Bearer {owner_token}"}
        response = api_client.get(f"{BASE_URL}/api/customer/orders/{TEST_ORDER_ID}/tracking", headers=headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print(f"✓ GET /api/customer/orders/{{id}}/tracking returns 200 for owner")
    
    def test_tracking_response_structure(self, api_client, owner_token):
        """Response includes all required fields"""
        headers = {"Authorization": f"Bearer {owner_token}"}
        response = api_client.get(f"{BASE_URL}/api/customer/orders/{TEST_ORDER_ID}/tracking", headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        
        # Check top-level fields
        assert "order_id" in data, "Missing order_id"
        assert "order_number" in data, "Missing order_number"
        assert "awb_code" in data, "Missing awb_code"
        assert "courier_name" in data, "Missing courier_name"
        assert "shipped_at" in data, "Missing shipped_at"
        assert "delivered_at" in data, "Missing delivered_at"
        assert "status" in data, "Missing status"
        assert "events" in data, "Missing events"
        
        assert data["order_id"] == TEST_ORDER_ID
        assert data["order_number"] == TEST_ORDER_NUMBER
        assert data["awb_code"] == TEST_AWB_CODE
        assert isinstance(data["events"], list)
        
        print(f"✓ Response structure verified: order_id, order_number, awb_code, courier_name, shipped_at, delivered_at, status, events")
    
    def test_tracking_events_have_required_fields(self, api_client, owner_token):
        """Each event includes raw_status, mapped_status, courier_name, location, activity, event_time, received_at"""
        headers = {"Authorization": f"Bearer {owner_token}"}
        response = api_client.get(f"{BASE_URL}/api/customer/orders/{TEST_ORDER_ID}/tracking", headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        events = data.get("events", [])
        
        assert len(events) >= 5, f"Expected at least 5 events, got {len(events)}"
        
        for i, event in enumerate(events):
            assert "raw_status" in event, f"Event {i} missing raw_status"
            assert "mapped_status" in event, f"Event {i} missing mapped_status"
            assert "courier_name" in event, f"Event {i} missing courier_name"
            assert "location" in event, f"Event {i} missing location"
            assert "activity" in event, f"Event {i} missing activity"
            assert "event_time" in event, f"Event {i} missing event_time"
            assert "received_at" in event, f"Event {i} missing received_at"
        
        print(f"✓ All {len(events)} events have required fields: raw_status, mapped_status, courier_name, location, activity, event_time, received_at")
    
    def test_tracking_events_sorted_newest_first(self, api_client, owner_token):
        """Events are sorted newest-first by event_time"""
        headers = {"Authorization": f"Bearer {owner_token}"}
        response = api_client.get(f"{BASE_URL}/api/customer/orders/{TEST_ORDER_ID}/tracking", headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        events = data.get("events", [])
        
        assert len(events) >= 2, "Need at least 2 events to verify sorting"
        
        # Check that events are in descending order by event_time
        for i in range(len(events) - 1):
            current_time = events[i].get("event_time", "")
            next_time = events[i + 1].get("event_time", "")
            assert current_time >= next_time, f"Events not sorted newest-first: {current_time} < {next_time}"
        
        # Verify first event is Delivered (newest)
        assert events[0]["raw_status"] == "Delivered", f"First event should be 'Delivered', got '{events[0]['raw_status']}'"
        
        print(f"✓ Events sorted newest-first (first: {events[0]['raw_status']}, last: {events[-1]['raw_status']})")
    
    def test_tracking_events_have_locations(self, api_client, owner_token):
        """Seeded events have location data: Gurugram → Mumbai → Bangalore"""
        headers = {"Authorization": f"Bearer {owner_token}"}
        response = api_client.get(f"{BASE_URL}/api/customer/orders/{TEST_ORDER_ID}/tracking", headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        events = data.get("events", [])
        
        # Collect locations (newest-first order)
        locations = [e.get("location", "") for e in events]
        
        # Expected locations in newest-first order: Bangalore, Bangalore, Mumbai, Gurugram, Gurugram
        assert "Bangalore" in locations[0] or "Karnataka" in locations[0], f"First event should be Bangalore, got {locations[0]}"
        assert "Gurugram" in locations[-1] or "Haryana" in locations[-1], f"Last event should be Gurugram, got {locations[-1]}"
        
        print(f"✓ Events have location data: {locations}")
    
    def test_tracking_returns_404_for_different_customer(self, api_client, other_token):
        """Different customer cannot access another customer's order tracking"""
        headers = {"Authorization": f"Bearer {other_token}"}
        response = api_client.get(f"{BASE_URL}/api/customer/orders/{TEST_ORDER_ID}/tracking", headers=headers)
        
        assert response.status_code == 404, f"Expected 404 for cross-customer access, got {response.status_code}"
        print(f"✓ Cross-customer scoping works - returns 404 for different customer")
    
    def test_tracking_returns_401_without_auth(self, api_client):
        """No auth header returns 401"""
        response = api_client.get(f"{BASE_URL}/api/customer/orders/{TEST_ORDER_ID}/tracking")
        
        assert response.status_code == 401, f"Expected 401 without auth, got {response.status_code}"
        print(f"✓ Returns 401 when no auth header supplied")
    
    def test_tracking_returns_404_for_nonexistent_order(self, api_client, owner_token):
        """Non-existent order returns 404"""
        headers = {"Authorization": f"Bearer {owner_token}"}
        response = api_client.get(f"{BASE_URL}/api/customer/orders/nonexistent-order-id/tracking", headers=headers)
        
        assert response.status_code == 404, f"Expected 404 for non-existent order, got {response.status_code}"
        print(f"✓ Returns 404 for non-existent order")


class TestWebhookLocationExtraction:
    """Test that webhook handler extracts location and activity fields"""
    
    def test_webhook_extracts_location_and_activity(self, api_client, mongo_client):
        """Webhook with location and activity fields persists them to shiprocket_events"""
        # Use a unique AWB to avoid conflicts
        test_awb = "LOCATION-TEST-AWB-001"
        
        # First, create a test order with this AWB
        test_order_id = "location-test-order-001"
        mongo_client.orders.update_one(
            {"id": test_order_id},
            {"$set": {
                "id": test_order_id,
                "order_number": "ORD-LOCTEST",
                "awb_code": test_awb,
                "status": "confirmed",
                "customer": {"email": OWNER_EMAIL}
            }},
            upsert=True
        )
        
        # Clear any existing events for this order
        mongo_client.shiprocket_events.delete_many({"order_id": test_order_id})
        
        # Send webhook with location and activity
        payload = {
            "awb": test_awb,
            "current_status": "In Transit",
            "courier_name": "Delhivery",
            "location": "Mumbai, MH",
            "activity": "Bag scanned at hub"
        }
        response = api_client.post(f"{BASE_URL}/api/shiprocket/webhooks/tracking", json=payload)
        assert response.status_code == 200, f"Webhook failed: {response.text}"
        
        # Wait for background task
        time.sleep(0.5)
        
        # Verify event was created with location and activity
        event = mongo_client.shiprocket_events.find_one(
            {"order_id": test_order_id},
            {"_id": 0}
        )
        
        assert event is not None, "Event not created"
        assert event.get("location") == "Mumbai, MH", f"Location not extracted: {event.get('location')}"
        assert event.get("activity") == "Bag scanned at hub", f"Activity not extracted: {event.get('activity')}"
        
        # Cleanup
        mongo_client.orders.delete_one({"id": test_order_id})
        mongo_client.shiprocket_events.delete_many({"order_id": test_order_id})
        
        print(f"✓ Webhook extracts location='{payload['location']}' and activity='{payload['activity']}'")
    
    def test_webhook_handles_missing_location_activity_gracefully(self, api_client, mongo_client):
        """Webhook without location/activity fields doesn't crash (graceful nulls)"""
        # Use a unique AWB
        test_awb = "NO-LOCATION-TEST-AWB-002"
        
        # Create test order
        test_order_id = "no-location-test-order-002"
        mongo_client.orders.update_one(
            {"id": test_order_id},
            {"$set": {
                "id": test_order_id,
                "order_number": "ORD-NOLOCTEST",
                "awb_code": test_awb,
                "status": "confirmed",
                "customer": {"email": OWNER_EMAIL}
            }},
            upsert=True
        )
        
        # Clear any existing events
        mongo_client.shiprocket_events.delete_many({"order_id": test_order_id})
        
        # Send webhook WITHOUT location and activity
        payload = {
            "awb": test_awb,
            "current_status": "Picked Up",
            "courier_name": "Bluedart"
            # No location or activity
        }
        response = api_client.post(f"{BASE_URL}/api/shiprocket/webhooks/tracking", json=payload)
        assert response.status_code == 200, f"Webhook failed: {response.text}"
        
        # Wait for background task
        time.sleep(0.5)
        
        # Verify event was created (with null location/activity)
        event = mongo_client.shiprocket_events.find_one(
            {"order_id": test_order_id},
            {"_id": 0}
        )
        
        assert event is not None, "Event not created"
        assert event.get("raw_status") == "Picked Up"
        # location and activity should be None/null, not cause a crash
        
        # Cleanup
        mongo_client.orders.delete_one({"id": test_order_id})
        mongo_client.shiprocket_events.delete_many({"order_id": test_order_id})
        
        print(f"✓ Webhook handles missing location/activity gracefully (no crash)")
    
    def test_order_status_webhook_extracts_location_activity(self, api_client, mongo_client):
        """Order-status webhook also extracts location and activity"""
        test_awb = "ORDER-STATUS-LOC-TEST-003"
        test_order_id = "order-status-loc-test-003"
        
        # Create test order
        mongo_client.orders.update_one(
            {"id": test_order_id},
            {"$set": {
                "id": test_order_id,
                "order_number": "ORD-OSLOCTEST",
                "awb_code": test_awb,
                "status": "confirmed",
                "customer": {"email": OWNER_EMAIL}
            }},
            upsert=True
        )
        
        mongo_client.shiprocket_events.delete_many({"order_id": test_order_id})
        
        # Send order-status webhook with location and activity
        payload = {
            "awb_code": test_awb,
            "status": "Delivered",
            "courier_name": "DTDC",
            "location": "Bangalore, KA",
            "activity": "Delivered to consignee"
        }
        response = api_client.post(f"{BASE_URL}/api/shiprocket/webhooks/order-status", json=payload)
        assert response.status_code == 200, f"Order-status webhook failed: {response.text}"
        
        time.sleep(0.5)
        
        event = mongo_client.shiprocket_events.find_one(
            {"order_id": test_order_id},
            {"_id": 0}
        )
        
        assert event is not None, "Event not created"
        assert event.get("location") == "Bangalore, KA", f"Location not extracted: {event.get('location')}"
        assert event.get("activity") == "Delivered to consignee", f"Activity not extracted: {event.get('activity')}"
        
        # Cleanup
        mongo_client.orders.delete_one({"id": test_order_id})
        mongo_client.shiprocket_events.delete_many({"order_id": test_order_id})
        
        print(f"✓ Order-status webhook extracts location and activity")


class TestSeededEventData:
    """Verify the pre-seeded event data for order 220475e5-fa34-40c5-ae1d-8738781996b1"""
    
    def test_order_has_5_seeded_events(self, api_client, owner_token):
        """Test order should have exactly 5 seeded events"""
        headers = {"Authorization": f"Bearer {owner_token}"}
        response = api_client.get(f"{BASE_URL}/api/customer/orders/{TEST_ORDER_ID}/tracking", headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        events = data.get("events", [])
        
        assert len(events) == 5, f"Expected 5 seeded events, got {len(events)}"
        print(f"✓ Order has 5 seeded events")
    
    def test_seeded_events_progression(self, api_client, owner_token):
        """Events show progression: Pickup Scheduled → Picked Up → In Transit (Mumbai) → In Transit (Bangalore) → Delivered"""
        headers = {"Authorization": f"Bearer {owner_token}"}
        response = api_client.get(f"{BASE_URL}/api/customer/orders/{TEST_ORDER_ID}/tracking", headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        events = data.get("events", [])
        
        # Events are newest-first, so reverse for chronological check
        chronological = list(reversed(events))
        
        expected_statuses = ["Pickup Scheduled", "Picked Up", "In Transit", "In Transit", "Delivered"]
        actual_statuses = [e.get("raw_status") for e in chronological]
        
        assert actual_statuses == expected_statuses, f"Expected {expected_statuses}, got {actual_statuses}"
        print(f"✓ Events show correct progression: {' → '.join(expected_statuses)}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
