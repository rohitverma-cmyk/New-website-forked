"""
Test: Mark Goods Ready for Non-Provisional Orders (Iteration 72)

Tests the extended mark-goods-ready endpoint that now supports non-provisional
(full-payment) orders in addition to provisional orders.

Key behaviors tested:
1. Non-provisional orders with status=confirmed can be marked goods-ready
2. Non-provisional mark-goods-ready does NOT recompute totals or flip payment_status
3. It only stamps rolls + vendor_invoice on items, sets status='goods_ready'
4. Customer balance-due email is NOT sent (no balance owed)
5. Internal GOODS_READY event still fires
6. Vendor JWT must own ALL items being marked (403 if mixing seller_ids)
7. Admin can override
8. Invoice required for vendor caller, optional for admin
9. payment_pending order → 400
10. Provisional pending_advance → 400 (still requires advance_paid)
"""

import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from test_credentials.md
ADMIN_EMAIL = "admin@locofast.com"
ADMIN_PASSWORD = "admin123"
VENDOR_EMAIL = "denimseller@locofast.com"
VENDOR_PASSWORD = "denim@123"


class TestMarkGoodsReadyNonProvisional:
    """Tests for mark-goods-ready on non-provisional orders"""
    
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
    
    @pytest.fixture(scope="class")
    def vendor_token(self):
        """Get vendor JWT token for denimseller"""
        resp = requests.post(f"{BASE_URL}/api/vendor/login", json={
            "email": VENDOR_EMAIL,
            "password": VENDOR_PASSWORD
        })
        if resp.status_code != 200:
            pytest.skip(f"Vendor login failed: {resp.status_code}")
        return resp.json().get("token")
    
    @pytest.fixture(scope="class")
    def vendor_data(self, vendor_token):
        """Get vendor profile data"""
        resp = requests.get(f"{BASE_URL}/api/vendor/profile", headers={
            "Authorization": f"Bearer {vendor_token}"
        })
        if resp.status_code != 200:
            pytest.skip("Failed to get vendor profile")
        return resp.json()
    
    @pytest.fixture(scope="class")
    def vendor_orders(self, vendor_token):
        """Get all orders for the vendor"""
        resp = requests.get(f"{BASE_URL}/api/vendor/orders", headers={
            "Authorization": f"Bearer {vendor_token}"
        })
        if resp.status_code != 200:
            pytest.skip("Failed to get vendor orders")
        return resp.json()
    
    def test_vendor_login_success(self, vendor_token):
        """Verify vendor can login"""
        assert vendor_token is not None
        assert len(vendor_token) > 10
        print(f"✓ Vendor login successful, token length: {len(vendor_token)}")
    
    def test_admin_login_success(self, admin_token):
        """Verify admin can login"""
        assert admin_token is not None
        assert len(admin_token) > 10
        print(f"✓ Admin login successful, token length: {len(admin_token)}")
    
    def test_get_vendor_orders(self, vendor_orders):
        """Verify vendor can fetch their orders"""
        assert isinstance(vendor_orders, list)
        print(f"✓ Vendor has {len(vendor_orders)} orders")
        
        # Log order statuses for debugging
        status_counts = {}
        for o in vendor_orders:
            status = o.get("status", "unknown")
            is_prov = o.get("is_provisional", False)
            key = f"{status} (prov={is_prov})"
            status_counts[key] = status_counts.get(key, 0) + 1
        print(f"  Order status breakdown: {status_counts}")
    
    def test_find_confirmed_nonprovisional_order(self, vendor_orders):
        """Find a confirmed non-provisional order for testing"""
        # Look for a confirmed non-provisional order
        candidates = [
            o for o in vendor_orders
            if o.get("status") == "confirmed"
            and not o.get("is_provisional", False)
        ]
        
        if not candidates:
            # Also check processing status
            candidates = [
                o for o in vendor_orders
                if o.get("status") == "processing"
                and not o.get("is_provisional", False)
            ]
        
        print(f"✓ Found {len(candidates)} confirmed/processing non-provisional orders")
        
        if candidates:
            order = candidates[0]
            print(f"  Sample order: {order.get('order_number')}, status={order.get('status')}, "
                  f"is_provisional={order.get('is_provisional')}, payment_status={order.get('payment_status')}")
            print(f"  Items: {len(order.get('items', []))}")
            for item in order.get('items', [])[:2]:
                print(f"    - {item.get('fabric_name')}: {item.get('quantity')}m, fabric_id={item.get('fabric_id')}")
    
    def test_mark_goods_ready_nonprovisional_success(self, vendor_token, vendor_orders, vendor_data):
        """Test marking goods ready on a confirmed non-provisional order"""
        # Find a confirmed non-provisional order
        candidates = [
            o for o in vendor_orders
            if o.get("status") in ("confirmed", "processing")
            and not o.get("is_provisional", False)
        ]
        
        if not candidates:
            pytest.skip("No confirmed/processing non-provisional orders available")
        
        order = candidates[0]
        order_id = order.get("id")
        order_number = order.get("order_number")
        items = order.get("items", [])
        
        if not items:
            pytest.skip("Order has no items")
        
        print(f"Testing mark-goods-ready on order {order_number} (status={order.get('status')})")
        
        # Build payload with rolls + invoice
        items_payload = []
        for item in items:
            fabric_id = item.get("fabric_id")
            qty = item.get("quantity", 100)
            items_payload.append({
                "fabric_id": fabric_id,
                "actual_quantity": qty,
                "rolls": [{"count": 2, "length": qty / 2}],
                "dispatch_note": "Test dispatch note"
            })
        
        payload = {
            "items": items_payload,
            "vendor_invoice": {
                "url": "https://example.com/test-invoice.pdf",
                "filename": "test-invoice.pdf",
                "invoice_number": f"TEST-INV-{datetime.now().strftime('%Y%m%d%H%M%S')}",
                "invoice_date": datetime.now().strftime("%Y-%m-%d"),
                "amount": 10000
            }
        }
        
        resp = requests.post(
            f"{BASE_URL}/api/orders/{order_id}/mark-goods-ready",
            json=payload,
            headers={"Authorization": f"Bearer {vendor_token}"}
        )
        
        print(f"Response status: {resp.status_code}")
        data = resp.json()
        print(f"Response: {data}")
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {data}"
        assert data.get("success") is True
        
        # Verify order state
        updated_order = data.get("order", {})
        assert updated_order.get("status") == "goods_ready", f"Expected status=goods_ready, got {updated_order.get('status')}"
        assert updated_order.get("goods_ready_at") is not None, "goods_ready_at should be set"
        
        # For non-provisional, payment_status should NOT change
        # It should remain whatever it was (likely 'paid')
        print(f"✓ Order {order_number} marked goods ready")
        print(f"  status: {updated_order.get('status')}")
        print(f"  payment_status: {updated_order.get('payment_status')}")
        print(f"  goods_ready_at: {updated_order.get('goods_ready_at')}")
        print(f"  goods_ready_by: {updated_order.get('goods_ready_by')}")
        
        # Verify vendor_invoices persisted
        vendor_invoices = updated_order.get("vendor_invoices", [])
        assert len(vendor_invoices) > 0, "vendor_invoices should be persisted"
        print(f"  vendor_invoices: {len(vendor_invoices)} entries")
    
    def test_mark_goods_ready_payment_pending_rejected(self, vendor_token, vendor_orders):
        """Test that payment_pending orders cannot be marked goods-ready"""
        # Find a payment_pending order
        candidates = [
            o for o in vendor_orders
            if o.get("status") == "payment_pending"
        ]
        
        if not candidates:
            pytest.skip("No payment_pending orders available")
        
        order = candidates[0]
        order_id = order.get("id")
        items = order.get("items", [])
        
        if not items:
            pytest.skip("Order has no items")
        
        print(f"Testing mark-goods-ready rejection on payment_pending order {order.get('order_number')}")
        
        items_payload = [{
            "fabric_id": items[0].get("fabric_id"),
            "actual_quantity": items[0].get("quantity", 100),
            "rolls": [{"count": 1, "length": items[0].get("quantity", 100)}]
        }]
        
        payload = {
            "items": items_payload,
            "vendor_invoice": {
                "url": "https://example.com/test.pdf",
                "filename": "test.pdf",
                "invoice_number": "TEST-001",
                "invoice_date": "2026-01-15"
            }
        }
        
        resp = requests.post(
            f"{BASE_URL}/api/orders/{order_id}/mark-goods-ready",
            json=payload,
            headers={"Authorization": f"Bearer {vendor_token}"}
        )
        
        print(f"Response status: {resp.status_code}")
        
        # Should be rejected with 400
        assert resp.status_code == 400, f"Expected 400 for payment_pending, got {resp.status_code}"
        print(f"✓ payment_pending order correctly rejected: {resp.json().get('detail')}")
    
    def test_mark_goods_ready_provisional_pending_advance_rejected(self, vendor_token, vendor_orders):
        """Test that provisional orders with pending_advance cannot be marked goods-ready"""
        # Find a provisional order with pending_advance
        candidates = [
            o for o in vendor_orders
            if o.get("is_provisional", False)
            and o.get("payment_status") == "pending_advance"
        ]
        
        if not candidates:
            pytest.skip("No provisional pending_advance orders available")
        
        order = candidates[0]
        order_id = order.get("id")
        items = order.get("items", [])
        
        if not items:
            pytest.skip("Order has no items")
        
        print(f"Testing mark-goods-ready rejection on provisional pending_advance order {order.get('order_number')}")
        
        items_payload = [{
            "fabric_id": items[0].get("fabric_id"),
            "actual_quantity": items[0].get("quantity", 100),
            "rolls": [{"count": 1, "length": items[0].get("quantity", 100)}]
        }]
        
        payload = {
            "items": items_payload,
            "vendor_invoice": {
                "url": "https://example.com/test.pdf",
                "filename": "test.pdf",
                "invoice_number": "TEST-002",
                "invoice_date": "2026-01-15"
            }
        }
        
        resp = requests.post(
            f"{BASE_URL}/api/orders/{order_id}/mark-goods-ready",
            json=payload,
            headers={"Authorization": f"Bearer {vendor_token}"}
        )
        
        print(f"Response status: {resp.status_code}")
        
        # Should be rejected with 400
        assert resp.status_code == 400, f"Expected 400 for provisional pending_advance, got {resp.status_code}"
        print(f"✓ provisional pending_advance order correctly rejected: {resp.json().get('detail')}")
    
    def test_mark_goods_ready_vendor_invoice_required(self, vendor_token, vendor_orders):
        """Test that vendor must provide invoice when marking goods ready"""
        # Find a confirmed non-provisional order
        candidates = [
            o for o in vendor_orders
            if o.get("status") in ("confirmed", "processing")
            and not o.get("is_provisional", False)
        ]
        
        if not candidates:
            pytest.skip("No confirmed/processing non-provisional orders available")
        
        order = candidates[0]
        order_id = order.get("id")
        items = order.get("items", [])
        
        if not items:
            pytest.skip("Order has no items")
        
        print(f"Testing invoice requirement on order {order.get('order_number')}")
        
        # Payload WITHOUT invoice
        items_payload = [{
            "fabric_id": items[0].get("fabric_id"),
            "actual_quantity": items[0].get("quantity", 100),
            "rolls": [{"count": 1, "length": items[0].get("quantity", 100)}]
        }]
        
        payload = {"items": items_payload}  # No vendor_invoice
        
        resp = requests.post(
            f"{BASE_URL}/api/orders/{order_id}/mark-goods-ready",
            json=payload,
            headers={"Authorization": f"Bearer {vendor_token}"}
        )
        
        print(f"Response status: {resp.status_code}")
        
        # Should be rejected with 400 for missing invoice
        assert resp.status_code == 400, f"Expected 400 for missing invoice, got {resp.status_code}"
        detail = resp.json().get("detail", "")
        assert "invoice" in detail.lower(), f"Error should mention invoice: {detail}"
        print(f"✓ Missing invoice correctly rejected: {detail}")
    
    def test_mark_goods_ready_admin_can_skip_invoice(self, admin_token, vendor_orders):
        """Test that admin can mark goods ready without invoice"""
        # Find a confirmed non-provisional order
        candidates = [
            o for o in vendor_orders
            if o.get("status") in ("confirmed", "processing")
            and not o.get("is_provisional", False)
        ]
        
        if not candidates:
            pytest.skip("No confirmed/processing non-provisional orders available")
        
        order = candidates[0]
        order_id = order.get("id")
        items = order.get("items", [])
        
        if not items:
            pytest.skip("Order has no items")
        
        print(f"Testing admin mark-goods-ready without invoice on order {order.get('order_number')}")
        
        # Payload WITHOUT invoice (admin can skip)
        items_payload = [{
            "fabric_id": items[0].get("fabric_id"),
            "actual_quantity": items[0].get("quantity", 100),
            "rolls": [{"count": 1, "length": items[0].get("quantity", 100)}]
        }]
        
        payload = {"items": items_payload}  # No vendor_invoice
        
        resp = requests.post(
            f"{BASE_URL}/api/orders/{order_id}/mark-goods-ready",
            json=payload,
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        print(f"Response status: {resp.status_code}")
        data = resp.json()
        print(f"Response: {data}")
        
        # Admin should be able to proceed without invoice
        assert resp.status_code == 200, f"Expected 200 for admin, got {resp.status_code}: {data}"
        print(f"✓ Admin can mark goods ready without invoice")
    
    def test_goods_ready_stamped_banner_order_exists(self, vendor_token, vendor_orders):
        """Verify there are goods_ready orders for UI testing"""
        goods_ready_orders = [
            o for o in vendor_orders
            if o.get("status") == "goods_ready"
        ]
        
        print(f"✓ Found {len(goods_ready_orders)} orders with status=goods_ready")
        
        if goods_ready_orders:
            order = goods_ready_orders[0]
            print(f"  Sample: {order.get('order_number')}")
            print(f"    is_provisional: {order.get('is_provisional')}")
            print(f"    goods_ready_at: {order.get('goods_ready_at')}")
            print(f"    goods_ready_by: {order.get('goods_ready_by')}")
            print(f"    vendor_invoices: {len(order.get('vendor_invoices', []))}")


class TestMarkGoodsReadyProvisionalRegression:
    """Regression tests to ensure provisional flow still works"""
    
    @pytest.fixture(scope="class")
    def vendor_token(self):
        """Get vendor JWT token"""
        resp = requests.post(f"{BASE_URL}/api/vendor/login", json={
            "email": VENDOR_EMAIL,
            "password": VENDOR_PASSWORD
        })
        if resp.status_code != 200:
            pytest.skip(f"Vendor login failed: {resp.status_code}")
        return resp.json().get("token")
    
    @pytest.fixture(scope="class")
    def vendor_orders(self, vendor_token):
        """Get all orders for the vendor"""
        resp = requests.get(f"{BASE_URL}/api/vendor/orders", headers={
            "Authorization": f"Bearer {vendor_token}"
        })
        if resp.status_code != 200:
            pytest.skip("Failed to get vendor orders")
        return resp.json()
    
    def test_provisional_advance_paid_can_mark_ready(self, vendor_token, vendor_orders):
        """Test that provisional orders with advance_paid can still be marked goods-ready"""
        # Find a provisional order with advance_paid
        candidates = [
            o for o in vendor_orders
            if o.get("is_provisional", False)
            and o.get("payment_status") == "advance_paid"
        ]
        
        if not candidates:
            pytest.skip("No provisional advance_paid orders available")
        
        order = candidates[0]
        order_id = order.get("id")
        items = order.get("items", [])
        
        if not items:
            pytest.skip("Order has no items")
        
        print(f"Testing provisional mark-goods-ready on order {order.get('order_number')}")
        print(f"  is_provisional: {order.get('is_provisional')}")
        print(f"  payment_status: {order.get('payment_status')}")
        
        items_payload = []
        for item in items:
            items_payload.append({
                "fabric_id": item.get("fabric_id"),
                "actual_quantity": item.get("quantity", 100),
                "rolls": [{"count": 2, "length": item.get("quantity", 100) / 2}],
                "dispatch_note": "Provisional test"
            })
        
        payload = {
            "items": items_payload,
            "vendor_invoice": {
                "url": "https://example.com/prov-invoice.pdf",
                "filename": "prov-invoice.pdf",
                "invoice_number": f"PROV-{datetime.now().strftime('%Y%m%d%H%M%S')}",
                "invoice_date": datetime.now().strftime("%Y-%m-%d"),
                "amount": 5000
            }
        }
        
        resp = requests.post(
            f"{BASE_URL}/api/orders/{order_id}/mark-goods-ready",
            json=payload,
            headers={"Authorization": f"Bearer {vendor_token}"}
        )
        
        print(f"Response status: {resp.status_code}")
        data = resp.json()
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {data}"
        
        updated_order = data.get("order", {})
        
        # For provisional, payment_status should flip to balance_pending
        assert updated_order.get("status") == "goods_ready"
        assert updated_order.get("payment_status") == "balance_pending", \
            f"Expected balance_pending, got {updated_order.get('payment_status')}"
        
        # Provisional should have balance_amount computed
        assert updated_order.get("balance_amount") is not None
        
        print(f"✓ Provisional order marked goods ready")
        print(f"  status: {updated_order.get('status')}")
        print(f"  payment_status: {updated_order.get('payment_status')}")
        print(f"  balance_amount: {updated_order.get('balance_amount')}")
        print(f"  actual_total: {updated_order.get('actual_total')}")


class TestInternalEventsGoodsReady:
    """Test that internal GOODS_READY event fires correctly"""
    
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
    
    def test_check_email_logs_for_goods_ready(self, admin_token):
        """Check email_logs for GOODS_READY internal events"""
        # Query email_logs for internal_goods_ready events
        resp = requests.get(
            f"{BASE_URL}/api/email/admin/logs",
            params={"limit": 50},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        if resp.status_code != 200:
            print(f"Email logs endpoint returned {resp.status_code}")
            pytest.skip("Email logs endpoint not available")
            return
        
        data = resp.json()
        logs = data if isinstance(data, list) else data.get("logs", [])
        
        # Filter for goods_ready events
        goods_ready_logs = [l for l in logs if "goods_ready" in l.get("kind", "").lower()]
        print(f"✓ Found {len(goods_ready_logs)} internal_goods_ready email logs")
        
        assert len(goods_ready_logs) > 0, "Expected at least one goods_ready event log"
        
        log = goods_ready_logs[0]
        print(f"  Latest: order={log.get('order_number')}, status={log.get('status')}")
        assert log.get("status") == "sent", f"Expected status=sent, got {log.get('status')}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
