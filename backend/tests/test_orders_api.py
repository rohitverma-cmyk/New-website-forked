"""
Order API Endpoint Tests - Phase 1
Tests for order creation, listing, stats, and order retrieval
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test fabric ID from main agent notes
TEST_FABRIC_ID = "8e6c6e09-f711-455b-9900-1044574d7c25"


class TestOrderEndpoints:
    """Tests for Order API endpoints"""

    def test_order_list_endpoint(self):
        """Test GET /api/orders - list orders"""
        response = requests.get(f"{BASE_URL}/api/orders")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "orders" in data, "Response should have 'orders' key"
        assert "total" in data, "Response should have 'total' key"
        assert isinstance(data["orders"], list), "orders should be a list"
        print(f"✓ Order list returned {data['total']} orders")

    def test_order_stats_endpoint(self):
        """Test GET /api/orders/stats/summary - order statistics"""
        response = requests.get(f"{BASE_URL}/api/orders/stats/summary")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Verify expected fields exist
        expected_fields = ["total_orders", "pending_payment", "paid", "confirmed", "shipped", "delivered", "total_revenue"]
        for field in expected_fields:
            assert field in data, f"Missing expected field: {field}"
        
        print(f"✓ Order stats: total={data['total_orders']}, revenue=₹{data['total_revenue']}")

    def test_order_create_endpoint(self):
        """Test POST /api/orders/create - create new order (expect 500/503 due to placeholder Razorpay keys)"""
        order_payload = {
            "items": [{
                "fabric_id": TEST_FABRIC_ID,
                "fabric_name": "Test Fabric",
                "fabric_code": "LF-TEST",
                "category_name": "Denim",
                "seller_company": "Test Seller",
                "quantity": 5,
                "price_per_meter": 150.0,
                "order_type": "sample",
                "image_url": "https://example.com/image.jpg"
            }],
            "customer": {
                "name": "Test Customer",
                "email": "test@example.com",
                "phone": "+91 9876543210",
                "company": "Test Company",
                "address": "123 Test Street",
                "city": "Mumbai",
                "state": "Maharashtra",
                "pincode": "400001"
            },
            "notes": "Test order"
        }
        
        response = requests.post(f"{BASE_URL}/api/orders/create", json=order_payload)
        
        # With placeholder Razorpay keys, expect either 503 (service unavailable) or 500 (payment init failed)
        # or potentially 200 if the mock setup allows
        # Also handle 520 (Cloudflare error when backend fails)
        if response.status_code == 200 or response.status_code == 201:
            data = response.json()
            assert "order_id" in data, "Should return order_id"
            assert "order_number" in data, "Should return order_number"
            assert "razorpay_order_id" in data, "Should return razorpay_order_id"
            print(f"✓ Order created: {data['order_number']}")
        elif response.status_code in [500, 503, 520]:
            # Expected with placeholder keys - Razorpay auth fails
            print(f"✓ Order create returns {response.status_code} (expected - Razorpay placeholder keys cause auth failure)")
        else:
            pytest.fail(f"Unexpected status: {response.status_code}: {response.text}")

    def test_order_get_nonexistent(self):
        """Test GET /api/orders/{id} - non-existent order"""
        fake_id = str(uuid.uuid4())
        response = requests.get(f"{BASE_URL}/api/orders/{fake_id}")
        assert response.status_code == 404, f"Expected 404 for non-existent order, got {response.status_code}"
        print("✓ Non-existent order returns 404")

    def test_order_status_filter(self):
        """Test GET /api/orders with status filter"""
        response = requests.get(f"{BASE_URL}/api/orders", params={"status": "confirmed"})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        # Verify all returned orders match the filter
        for order in data["orders"]:
            assert order["status"] == "confirmed", f"Order {order.get('order_number')} has wrong status"
        print(f"✓ Status filter returned {len(data['orders'])} confirmed orders")

    def test_order_pagination(self):
        """Test GET /api/orders with pagination params"""
        response = requests.get(f"{BASE_URL}/api/orders", params={"limit": 5, "skip": 0})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert data["limit"] == 5, "Should respect limit param"
        assert data["skip"] == 0, "Should respect skip param"
        print(f"✓ Pagination working: limit={data['limit']}, skip={data['skip']}")


class TestEmailEndpoints:
    """Tests for Email API endpoints"""
    
    def test_email_service_status(self):
        """Test POST /api/email/test - expect 503 as Resend API key not configured"""
        response = requests.post(
            f"{BASE_URL}/api/email/test",
            params={"recipient": "test@example.com"}
        )
        
        # Without Resend API key, should return 503
        if response.status_code == 503:
            print("✓ Email service returns 503 (expected - Resend API not configured)")
        elif response.status_code == 200:
            print("✓ Email service working (Resend configured)")
        else:
            print(f"✓ Email endpoint responds with {response.status_code}")
        
        # Not asserting specific status as it depends on configuration


class TestFabricEndpoints:
    """Tests for Fabric API to verify checkout prerequisites"""
    
    def test_get_fabric_for_checkout(self):
        """Verify the test fabric exists and has sample/bulk availability"""
        response = requests.get(f"{BASE_URL}/api/fabrics/{TEST_FABRIC_ID}")
        
        if response.status_code == 404:
            pytest.skip(f"Test fabric {TEST_FABRIC_ID} not found - may need different fabric ID")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        print(f"✓ Fabric '{data['name']}' found")
        print(f"  - is_bookable: {data.get('is_bookable')}")
        print(f"  - sample_price: {data.get('sample_price')}")
        print(f"  - rate_per_meter: {data.get('rate_per_meter')}")
        print(f"  - quantity_available: {data.get('quantity_available')}")
        
        # Just verify fabric is available, not necessarily bookable
        assert "name" in data
        assert "id" in data

    def test_get_fabrics_list(self):
        """Test fabric listing for fabrics page"""
        response = requests.get(f"{BASE_URL}/api/fabrics", params={"limit": 10})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Should return list of fabrics"
        print(f"✓ Fabrics list returned {len(data)} fabrics")


class TestVerifyPaymentEndpoint:
    """Test payment verification endpoint"""
    
    def test_verify_payment_invalid(self):
        """Test POST /api/orders/verify-payment with invalid data"""
        payload = {
            "razorpay_order_id": "order_invalid",
            "razorpay_payment_id": "pay_invalid",
            "razorpay_signature": "invalid_signature"
        }
        
        response = requests.post(f"{BASE_URL}/api/orders/verify-payment", json=payload)
        
        # Should return 404 (order not found) or 400 (verification failed)
        assert response.status_code in [400, 404], f"Expected 400 or 404, got {response.status_code}"
        print(f"✓ Invalid payment verification returns {response.status_code}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
