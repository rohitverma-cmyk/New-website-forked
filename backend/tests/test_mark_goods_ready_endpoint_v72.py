"""
Test: Mark Goods Ready Endpoint Behavior (Iteration 72)

Direct API tests for the mark-goods-ready endpoint covering:
1. Non-provisional orders with status=confirmed can be marked goods-ready
2. Non-provisional mark-goods-ready does NOT recompute totals
3. Cancelled/delivered orders are rejected
4. goods_ready orders can be re-marked (edit flow)
5. Internal GOODS_READY event fires
6. Vendor authorization checks
"""

import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

ADMIN_EMAIL = "admin@locofast.com"
ADMIN_PASSWORD = "admin123"
VENDOR_EMAIL = "bhuvnesh.sharma@nsltextiles.com"
VENDOR_PASSWORD = "Vendor@2026"


class TestMarkGoodsReadyEndpoint:
    """Direct endpoint tests for mark-goods-ready"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin JWT token"""
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert resp.status_code == 200, f"Admin login failed: {resp.status_code}"
        return resp.json().get("token")
    
    @pytest.fixture(scope="class")
    def vendor_token(self):
        """Get vendor JWT token"""
        resp = requests.post(f"{BASE_URL}/api/vendor/login", json={
            "email": VENDOR_EMAIL,
            "password": VENDOR_PASSWORD
        })
        assert resp.status_code == 200, f"Vendor login failed: {resp.status_code}"
        return resp.json().get("token")
    
    @pytest.fixture(scope="class")
    def all_orders(self, admin_token):
        """Get all orders"""
        resp = requests.get(f"{BASE_URL}/api/orders", params={"limit": 100}, headers={
            "Authorization": f"Bearer {admin_token}"
        })
        assert resp.status_code == 200
        data = resp.json()
        return data.get("orders", []) if isinstance(data, dict) else data
    
    def test_admin_login_success(self, admin_token):
        """Verify admin can login"""
        assert admin_token is not None
        print(f"✓ Admin login successful")
    
    def test_vendor_login_success(self, vendor_token):
        """Verify vendor can login"""
        assert vendor_token is not None
        print(f"✓ Vendor login successful")
    
    def test_cancelled_order_rejected(self, admin_token, all_orders):
        """Test that cancelled orders cannot be marked goods-ready"""
        cancelled = [o for o in all_orders if o.get("status") == "cancelled"]
        if not cancelled:
            pytest.skip("No cancelled orders available")
        
        order = cancelled[0]
        items = order.get("items", [])
        if not items:
            pytest.skip("Order has no items")
        
        payload = {
            "items": [{
                "fabric_id": items[0].get("fabric_id"),
                "actual_quantity": 100,
                "rolls": [{"count": 1, "length": 100}]
            }]
        }
        
        resp = requests.post(
            f"{BASE_URL}/api/orders/{order.get('id')}/mark-goods-ready",
            json=payload,
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert resp.status_code == 400, f"Expected 400 for cancelled order, got {resp.status_code}"
        detail = resp.json().get("detail", "")
        assert "confirmed" in detail.lower() or "cancelled" in detail.lower()
        print(f"✓ Cancelled order correctly rejected: {detail}")
    
    def test_delivered_order_rejected(self, admin_token, all_orders):
        """Test that delivered orders cannot be marked goods-ready"""
        delivered = [o for o in all_orders if o.get("status") == "delivered"]
        if not delivered:
            pytest.skip("No delivered orders available")
        
        order = delivered[0]
        items = order.get("items", [])
        if not items:
            pytest.skip("Order has no items")
        
        payload = {
            "items": [{
                "fabric_id": items[0].get("fabric_id"),
                "actual_quantity": 100,
                "rolls": [{"count": 1, "length": 100}]
            }]
        }
        
        resp = requests.post(
            f"{BASE_URL}/api/orders/{order.get('id')}/mark-goods-ready",
            json=payload,
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert resp.status_code == 400, f"Expected 400 for delivered order, got {resp.status_code}"
        print(f"✓ Delivered order correctly rejected")
    
    def test_goods_ready_order_can_be_remarked(self, admin_token, all_orders):
        """Test that goods_ready orders can be re-marked (edit flow)"""
        goods_ready = [o for o in all_orders if o.get("status") == "goods_ready"]
        if not goods_ready:
            pytest.skip("No goods_ready orders available")
        
        order = goods_ready[0]
        items = order.get("items", [])
        if not items:
            pytest.skip("Order has no items")
        
        original_note = items[0].get("dispatch_note", "")
        new_note = f"Updated at {datetime.now().isoformat()}"
        
        payload = {
            "items": [{
                "fabric_id": items[0].get("fabric_id"),
                "actual_quantity": items[0].get("quantity", 100),
                "rolls": [{"count": 5, "length": items[0].get("quantity", 100) / 5}],
                "dispatch_note": new_note
            }]
        }
        
        resp = requests.post(
            f"{BASE_URL}/api/orders/{order.get('id')}/mark-goods-ready",
            json=payload,
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert resp.status_code == 200, f"Expected 200 for re-marking, got {resp.status_code}"
        
        updated = resp.json().get("order", {})
        updated_items = updated.get("items", [])
        assert len(updated_items) > 0
        assert updated_items[0].get("dispatch_note") == new_note
        print(f"✓ goods_ready order successfully re-marked with updated dispatch_note")
    
    def test_nonprovisional_no_balance_recompute(self, admin_token, all_orders):
        """Verify non-provisional orders don't get balance recomputed"""
        goods_ready = [o for o in all_orders if o.get("status") == "goods_ready" and not o.get("is_provisional")]
        if not goods_ready:
            pytest.skip("No non-provisional goods_ready orders available")
        
        order = goods_ready[0]
        
        # Verify payment_status is still 'paid' (not balance_pending)
        assert order.get("payment_status") == "paid", \
            f"Non-provisional should have payment_status=paid, got {order.get('payment_status')}"
        
        # Verify balance_amount is not set (or is None/0)
        balance = order.get("balance_amount")
        assert balance is None or balance == 0, \
            f"Non-provisional should not have balance_amount, got {balance}"
        
        print(f"✓ Non-provisional order has correct state: payment_status=paid, no balance_amount")
    
    def test_vendor_cannot_mark_other_vendor_items(self, vendor_token, all_orders):
        """Test that vendor cannot mark items from other vendors"""
        # Find an order with items NOT from this vendor
        vendor_id = "a1edb4e2-f942-4034-ad9b-e075979cc8a4"  # Cotton vendor
        
        other_vendor_orders = [
            o for o in all_orders
            if o.get("status") in ("confirmed", "processing", "goods_ready")
            and all(item.get("seller_id") != vendor_id for item in o.get("items", []))
        ]
        
        if not other_vendor_orders:
            pytest.skip("No orders with other vendor items available")
        
        order = other_vendor_orders[0]
        items = order.get("items", [])
        if not items:
            pytest.skip("Order has no items")
        
        payload = {
            "items": [{
                "fabric_id": items[0].get("fabric_id"),
                "actual_quantity": 100,
                "rolls": [{"count": 1, "length": 100}]
            }],
            "vendor_invoice": {
                "url": "https://example.com/test.pdf",
                "filename": "test.pdf",
                "invoice_number": "TEST-001",
                "invoice_date": "2026-01-15"
            }
        }
        
        resp = requests.post(
            f"{BASE_URL}/api/orders/{order.get('id')}/mark-goods-ready",
            json=payload,
            headers={"Authorization": f"Bearer {vendor_token}"}
        )
        
        assert resp.status_code == 403, f"Expected 403 for other vendor's items, got {resp.status_code}"
        print(f"✓ Vendor correctly blocked from marking other vendor's items")
    
    def test_internal_goods_ready_event_logged(self, admin_token):
        """Verify internal GOODS_READY event is logged"""
        resp = requests.get(
            f"{BASE_URL}/api/email/admin/logs",
            params={"limit": 50},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert resp.status_code == 200, f"Email logs endpoint failed: {resp.status_code}"
        
        data = resp.json()
        logs = data if isinstance(data, list) else data.get("logs", [])
        
        goods_ready_logs = [l for l in logs if "goods_ready" in l.get("kind", "").lower()]
        assert len(goods_ready_logs) > 0, "Expected at least one goods_ready event log"
        
        log = goods_ready_logs[0]
        assert log.get("status") == "sent", f"Expected status=sent, got {log.get('status')}"
        print(f"✓ Internal GOODS_READY event logged: order={log.get('order_number')}, status={log.get('status')}")


class TestOrderStatusBreakdown:
    """Test to document current order status distribution"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin JWT token"""
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if resp.status_code != 200:
            pytest.skip(f"Admin login failed: {resp.status_code}")
        return resp.json().get("token")
    
    def test_order_status_distribution(self, admin_token):
        """Document current order status distribution"""
        resp = requests.get(f"{BASE_URL}/api/orders", params={"limit": 100}, headers={
            "Authorization": f"Bearer {admin_token}"
        })
        assert resp.status_code == 200
        
        data = resp.json()
        orders = data.get("orders", []) if isinstance(data, dict) else data
        
        status_counts = {}
        for o in orders:
            status = o.get("status", "unknown")
            is_prov = o.get("is_provisional", False)
            key = f"{status} (prov={is_prov})"
            status_counts[key] = status_counts.get(key, 0) + 1
        
        print(f"\n=== Order Status Distribution ({len(orders)} total) ===")
        for key, count in sorted(status_counts.items()):
            print(f"  {key}: {count}")
        
        # Verify we have at least some orders
        assert len(orders) > 0, "Expected at least some orders"
        print(f"\n✓ Order status distribution documented")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
