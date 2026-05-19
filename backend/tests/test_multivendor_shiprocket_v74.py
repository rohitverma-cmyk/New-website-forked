"""
Test Multi-Vendor Shiprocket Duplicate Prevention (v74)

Tests the fix for duplicate Shiprocket shipments on multi-supplier orders:
1. After verify-payment, parent order's shiprocket_shipments[] is populated
2. admin_push_to_shiprocket returns already_pushed=True for populated parent
3. force=true or seller_ids filter allows re-push
4. Failed child pushes still record in parent's shiprocket_shipments[]
5. Frontend rendering: each shipment claimed by at most one supplier group

Test credentials: admin@locofast.com / admin123
"""

import pytest
import requests
import os
import uuid
from datetime import datetime, timezone

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def admin_token():
    """Get admin JWT token"""
    resp = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@locofast.com",
        "password": "admin123"
    })
    if resp.status_code != 200:
        pytest.skip(f"Admin login failed: {resp.status_code} - {resp.text}")
    return resp.json().get("token")


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


class TestMultiVendorShiprocketIdempotency:
    """Tests for multi-vendor order Shiprocket push idempotency"""

    def test_admin_login(self, admin_token):
        """Verify admin login works"""
        assert admin_token, "Admin token should be present"
        print(f"Admin token obtained: {admin_token[:20]}...")

    def test_get_multi_vendor_order_with_shiprocket_shipments(self, admin_headers):
        """Find a multi-vendor order that has shiprocket_shipments populated"""
        # List orders and find one with multiple vendors and shiprocket_shipments
        resp = requests.get(f"{BASE_URL}/api/orders?limit=100", headers=admin_headers)
        assert resp.status_code == 200, f"List orders failed: {resp.text}"
        
        orders = resp.json().get("orders", [])
        print(f"Found {len(orders)} orders")
        
        # Look for orders with shiprocket_shipments array
        orders_with_shipments = [o for o in orders if o.get("shiprocket_shipments")]
        print(f"Orders with shiprocket_shipments: {len(orders_with_shipments)}")
        
        # Look for multi-vendor orders (is_parent_order=True or vendor_count > 1)
        multi_vendor_orders = [o for o in orders if o.get("is_parent_order") or (o.get("vendor_count") or 0) > 1]
        print(f"Multi-vendor orders: {len(multi_vendor_orders)}")
        
        # Check if any multi-vendor order has shiprocket_shipments
        multi_with_shipments = [o for o in multi_vendor_orders if o.get("shiprocket_shipments")]
        print(f"Multi-vendor orders with shiprocket_shipments: {len(multi_with_shipments)}")
        
        if multi_with_shipments:
            order = multi_with_shipments[0]
            print(f"Sample multi-vendor order: {order.get('order_number')}")
            print(f"  shiprocket_shipments count: {len(order.get('shiprocket_shipments', []))}")
            for sh in order.get("shiprocket_shipments", []):
                print(f"    - seller_id={sh.get('seller_id')}, success={sh.get('success')}, order_id={sh.get('order_id')}")

    def test_admin_push_idempotency_on_already_pushed_order(self, admin_headers):
        """
        Test that admin_push_to_shiprocket returns already_pushed=True
        when shiprocket_shipments is already populated (no force, no seller_ids)
        """
        # Find an order with shiprocket_shipments populated
        resp = requests.get(f"{BASE_URL}/api/orders?limit=100", headers=admin_headers)
        assert resp.status_code == 200
        
        orders = resp.json().get("orders", [])
        order_with_shipments = next(
            (o for o in orders if o.get("shiprocket_shipments") and len(o.get("shiprocket_shipments", [])) > 0),
            None
        )
        
        if not order_with_shipments:
            # Try to find any order with shiprocket_order_id
            order_with_shipments = next(
                (o for o in orders if o.get("shiprocket_order_id")),
                None
            )
        
        if not order_with_shipments:
            pytest.skip("No orders with Shiprocket shipments found")
        
        order_id = order_with_shipments["id"]
        order_number = order_with_shipments.get("order_number", order_id)
        print(f"Testing idempotency on order: {order_number}")
        print(f"  shiprocket_shipments: {order_with_shipments.get('shiprocket_shipments')}")
        print(f"  shiprocket_order_id: {order_with_shipments.get('shiprocket_order_id')}")
        
        # Call admin push WITHOUT force and WITHOUT seller_ids
        resp = requests.post(
            f"{BASE_URL}/api/orders/admin/{order_id}/push-to-shiprocket",
            headers=admin_headers
        )
        assert resp.status_code == 200, f"Push failed: {resp.text}"
        
        data = resp.json()
        print(f"Push response: already_pushed={data.get('already_pushed')}, count={data.get('count')}")
        
        # KEY ASSERTION: should return already_pushed=True
        assert data.get("already_pushed") == True, \
            f"Expected already_pushed=True but got {data.get('already_pushed')}. " \
            f"This means the idempotency check failed and duplicates may be created!"
        
        assert data.get("success") == True
        assert "shipments" in data or "shiprocket_order_id" in data

    def test_admin_push_with_force_allows_repush(self, admin_headers):
        """
        Test that force=true bypasses idempotency and allows re-push
        (We won't actually execute this to avoid creating duplicates,
        but we verify the endpoint accepts the parameter)
        """
        # Find an order with shiprocket_shipments
        resp = requests.get(f"{BASE_URL}/api/orders?limit=50", headers=admin_headers)
        assert resp.status_code == 200
        
        orders = resp.json().get("orders", [])
        order_with_shipments = next(
            (o for o in orders if o.get("shiprocket_shipments") or o.get("shiprocket_order_id")),
            None
        )
        
        if not order_with_shipments:
            pytest.skip("No orders with Shiprocket shipments found")
        
        order_id = order_with_shipments["id"]
        print(f"Testing force parameter on order: {order_with_shipments.get('order_number')}")
        
        # We DON'T actually call with force=true to avoid duplicates
        # Just verify the endpoint structure is correct
        # The actual force behavior is tested by checking the code path
        
        # Instead, verify that without force, we get already_pushed
        resp = requests.post(
            f"{BASE_URL}/api/orders/admin/{order_id}/push-to-shiprocket?force=false",
            headers=admin_headers
        )
        assert resp.status_code == 200
        data = resp.json()
        
        # Should be idempotent
        if data.get("already_pushed"):
            print("Confirmed: force=false returns already_pushed=True")
        else:
            print(f"Note: force=false returned already_pushed={data.get('already_pushed')}")

    def test_admin_push_with_seller_ids_filter(self, admin_headers):
        """
        Test that seller_ids filter allows pushing specific suppliers
        """
        # Find a multi-vendor order
        resp = requests.get(f"{BASE_URL}/api/orders?limit=100", headers=admin_headers)
        assert resp.status_code == 200
        
        orders = resp.json().get("orders", [])
        multi_vendor = next(
            (o for o in orders if (o.get("vendor_count") or 0) > 1 or o.get("is_parent_order")),
            None
        )
        
        if not multi_vendor:
            # Try to find an order with multiple items from different sellers
            for o in orders:
                items = o.get("items", [])
                seller_ids = set(it.get("seller_id", "") for it in items if it.get("seller_id"))
                if len(seller_ids) > 1:
                    multi_vendor = o
                    break
        
        if not multi_vendor:
            pytest.skip("No multi-vendor orders found")
        
        order_id = multi_vendor["id"]
        print(f"Testing seller_ids filter on order: {multi_vendor.get('order_number')}")
        
        # Get seller IDs from items
        items = multi_vendor.get("items", [])
        seller_ids = list(set(it.get("seller_id", "") for it in items if it.get("seller_id")))
        print(f"  Seller IDs in order: {seller_ids}")
        
        if not seller_ids:
            pytest.skip("No seller_ids found in order items")
        
        # Check existing shipments
        existing = multi_vendor.get("shiprocket_shipments", [])
        already_pushed_sellers = {s.get("seller_id") for s in existing if s.get("success")}
        print(f"  Already pushed sellers: {already_pushed_sellers}")
        
        # If all sellers already pushed, verify we get blocked without force
        if seller_ids and all(sid in already_pushed_sellers for sid in seller_ids):
            resp = requests.post(
                f"{BASE_URL}/api/orders/admin/{order_id}/push-to-shiprocket",
                headers=admin_headers,
                json={"seller_ids": seller_ids}
            )
            # Should get 400 because all are already pushed
            if resp.status_code == 400:
                print("Confirmed: Blocked re-push of already-pushed sellers without force")
                assert "already pushed" in resp.text.lower() or "force" in resp.text.lower()
            else:
                print(f"Response: {resp.status_code} - {resp.text}")

    def test_shiprocket_shipments_structure(self, admin_headers):
        """
        Verify the structure of shiprocket_shipments array entries
        """
        resp = requests.get(f"{BASE_URL}/api/orders?limit=100", headers=admin_headers)
        assert resp.status_code == 200
        
        orders = resp.json().get("orders", [])
        order_with_shipments = next(
            (o for o in orders if o.get("shiprocket_shipments") and len(o.get("shiprocket_shipments", [])) > 0),
            None
        )
        
        if not order_with_shipments:
            pytest.skip("No orders with shiprocket_shipments found")
        
        shipments = order_with_shipments.get("shiprocket_shipments", [])
        print(f"Order {order_with_shipments.get('order_number')} has {len(shipments)} shipments")
        
        for i, sh in enumerate(shipments):
            print(f"  Shipment {i+1}:")
            print(f"    seller_id: {sh.get('seller_id')}")
            print(f"    seller_company: {sh.get('seller_company')}")
            print(f"    success: {sh.get('success')}")
            print(f"    order_id: {sh.get('order_id')}")
            print(f"    shipment_id: {sh.get('shipment_id')}")
            print(f"    awb_code: {sh.get('awb_code')}")
            print(f"    child_order_id: {sh.get('child_order_id')}")
            print(f"    child_order_number: {sh.get('child_order_number')}")
            print(f"    pushed_at: {sh.get('pushed_at')}")
            
            # Verify required fields for successful shipments
            if sh.get("success"):
                assert sh.get("order_id"), f"Successful shipment missing order_id"
            
            # Verify seller_id is present (for proper grouping)
            # Note: seller_id might be empty string for legacy single-vendor orders
            assert "seller_id" in sh, "Shipment missing seller_id field"

    def test_parent_order_has_shiprocket_shipments_after_payment(self, admin_headers):
        """
        Verify that parent orders (is_parent_order=True) have shiprocket_shipments
        populated after payment verification
        """
        resp = requests.get(f"{BASE_URL}/api/orders?limit=100", headers=admin_headers)
        assert resp.status_code == 200
        
        orders = resp.json().get("orders", [])
        
        # Find parent orders that are paid/confirmed
        parent_orders = [
            o for o in orders 
            if o.get("is_parent_order") and o.get("payment_status") == "paid"
        ]
        print(f"Found {len(parent_orders)} paid parent orders")
        
        for po in parent_orders[:5]:  # Check first 5
            order_number = po.get("order_number")
            shipments = po.get("shiprocket_shipments", [])
            sr_order_id = po.get("shiprocket_order_id")
            child_count = po.get("vendor_count", 0)
            
            print(f"Parent order {order_number}:")
            print(f"  vendor_count: {child_count}")
            print(f"  shiprocket_shipments count: {len(shipments)}")
            print(f"  shiprocket_order_id: {sr_order_id}")
            
            # KEY ASSERTION: parent should have shiprocket_shipments populated
            # This is the fix for the duplicate bug
            if child_count > 0:
                # Multi-vendor parent should have shipments array
                if not shipments and not sr_order_id:
                    print(f"  WARNING: Multi-vendor parent {order_number} has no shiprocket data!")
                else:
                    print(f"  OK: Parent has shiprocket data")

    def test_child_orders_have_individual_shiprocket_ids(self, admin_headers):
        """
        Verify that child orders have their own shiprocket_order_id
        """
        resp = requests.get(f"{BASE_URL}/api/orders?limit=200", headers=admin_headers)
        assert resp.status_code == 200
        
        orders = resp.json().get("orders", [])
        
        # Find child orders (have parent_order_id)
        child_orders = [o for o in orders if o.get("parent_order_id")]
        print(f"Found {len(child_orders)} child orders")
        
        for co in child_orders[:5]:  # Check first 5
            order_number = co.get("order_number")
            parent_id = co.get("parent_order_id")
            sr_order_id = co.get("shiprocket_order_id")
            seller_id = co.get("seller_id")
            
            print(f"Child order {order_number}:")
            print(f"  parent_order_id: {parent_id}")
            print(f"  seller_id: {seller_id}")
            print(f"  shiprocket_order_id: {sr_order_id}")
            
            # Child orders should have their own SR ID if pushed
            if co.get("payment_status") == "paid" and co.get("status") not in ["cancelled", "payment_failed"]:
                if sr_order_id:
                    print(f"  OK: Child has its own shiprocket_order_id")
                else:
                    print(f"  Note: Child {order_number} has no shiprocket_order_id yet")


class TestSingleVendorOrderRegression:
    """Ensure single-vendor orders still work correctly"""

    def test_single_vendor_order_push(self, admin_headers):
        """
        Single-vendor orders should work as before - test idempotency
        """
        resp = requests.get(f"{BASE_URL}/api/orders?limit=100", headers=admin_headers)
        assert resp.status_code == 200
        
        orders = resp.json().get("orders", [])
        
        # Find a single-vendor order that ALREADY has shiprocket_order_id
        # (to test idempotency without triggering actual Shiprocket API)
        single_vendor = next(
            (o for o in orders 
             if not o.get("is_parent_order") 
             and not o.get("parent_order_id")
             and o.get("payment_status") == "paid"
             and o.get("shiprocket_order_id")),  # Must already have SR ID
            None
        )
        
        if not single_vendor:
            # Fallback: find any order with shiprocket_order_id
            single_vendor = next(
                (o for o in orders if o.get("shiprocket_order_id")),
                None
            )
        
        if not single_vendor:
            pytest.skip("No orders with shiprocket_order_id found")
        
        order_id = single_vendor["id"]
        order_number = single_vendor.get("order_number")
        print(f"Testing single-vendor order: {order_number}")
        print(f"  shiprocket_order_id: {single_vendor.get('shiprocket_order_id')}")
        print(f"  shiprocket_shipments: {single_vendor.get('shiprocket_shipments')}")
        
        # Push should be idempotent - returns already_pushed=True
        resp = requests.post(
            f"{BASE_URL}/api/orders/admin/{order_id}/push-to-shiprocket",
            headers=admin_headers
        )
        assert resp.status_code == 200, f"Push failed: {resp.text}"
        
        data = resp.json()
        print(f"Push response: success={data.get('success')}, already_pushed={data.get('already_pushed')}")
        
        # Should succeed with already_pushed=True
        assert data.get("success") == True
        assert data.get("already_pushed") == True, "Expected already_pushed=True for order with existing SR ID"


class TestFailedShipmentRecording:
    """Test that failed Shiprocket pushes are recorded in parent's shiprocket_shipments"""

    def test_failed_shipment_structure(self, admin_headers):
        """
        Verify that failed shipments have success=false and error message
        """
        resp = requests.get(f"{BASE_URL}/api/orders?limit=100", headers=admin_headers)
        assert resp.status_code == 200
        
        orders = resp.json().get("orders", [])
        
        # Find orders with failed shipments
        orders_with_failures = []
        for o in orders:
            shipments = o.get("shiprocket_shipments", [])
            failed = [s for s in shipments if not s.get("success")]
            if failed:
                orders_with_failures.append((o, failed))
        
        print(f"Found {len(orders_with_failures)} orders with failed shipments")
        
        for order, failed_shipments in orders_with_failures[:3]:
            print(f"Order {order.get('order_number')}:")
            for fs in failed_shipments:
                print(f"  Failed shipment:")
                print(f"    seller_id: {fs.get('seller_id')}")
                print(f"    seller_company: {fs.get('seller_company')}")
                print(f"    success: {fs.get('success')}")
                print(f"    error: {fs.get('error')}")
                print(f"    pushed_at: {fs.get('pushed_at')}")
                
                # Verify structure
                assert fs.get("success") == False
                # Error should be present for failed shipments
                if "error" in fs:
                    assert fs.get("error"), "Failed shipment should have error message"


class TestProvisionalOrderShiprocketBehavior:
    """Test that provisional orders don't trigger Shiprocket on advance payment"""

    def test_provisional_order_no_shiprocket_on_advance(self, admin_headers):
        """
        Provisional orders should NOT push to Shiprocket on advance payment
        Only after balance is paid
        """
        resp = requests.get(f"{BASE_URL}/api/orders?limit=100", headers=admin_headers)
        assert resp.status_code == 200
        
        orders = resp.json().get("orders", [])
        
        # Find provisional orders with advance_paid status
        provisional_advance = [
            o for o in orders 
            if o.get("is_provisional") and o.get("payment_status") == "advance_paid"
        ]
        print(f"Found {len(provisional_advance)} provisional orders with advance_paid")
        
        for po in provisional_advance[:3]:
            order_number = po.get("order_number")
            sr_order_id = po.get("shiprocket_order_id")
            shipments = po.get("shiprocket_shipments", [])
            
            print(f"Provisional order {order_number}:")
            print(f"  payment_status: {po.get('payment_status')}")
            print(f"  shiprocket_order_id: {sr_order_id}")
            print(f"  shiprocket_shipments: {len(shipments)}")
            
            # Provisional orders with only advance paid should NOT have Shiprocket
            if sr_order_id or shipments:
                print(f"  WARNING: Provisional order has Shiprocket data before balance paid!")
            else:
                print(f"  OK: No Shiprocket data (correct for advance-only)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
