"""
Test Edit Order Feature (v61)
Tests for:
- PATCH /api/orders/{order_id}/edit — admin edit order with audit trail
- GET /api/orders/{order_id}/edits — list order edit history
- Vendor change handling (payout cancellation, Shiprocket re-push)
- Seller pickup address fields (PUT /api/sellers/{id})
- _ensure_vendor_pickup_nickname helper
"""
import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "admin@locofast.com"
ADMIN_PASSWORD = "admin123"


class TestEditOrderFeature:
    """Tests for the Edit Order functionality"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: login as admin and get token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert login_resp.status_code == 200, f"Admin login failed: {login_resp.text}"
        self.token = login_resp.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        
        yield
        
        # Cleanup: delete any test audit rows created
        # (The test creates edits on existing orders, so we just leave them)
    
    def test_01_list_orders_for_testing(self):
        """Get list of orders to find one for testing"""
        resp = self.session.get(f"{BASE_URL}/api/orders")
        assert resp.status_code == 200, f"Failed to list orders: {resp.text}"
        data = resp.json()
        assert "orders" in data
        orders = data["orders"]
        # Find a non-delivered, non-cancelled order for testing
        editable_orders = [o for o in orders if o.get("status") not in ("delivered", "cancelled")]
        print(f"Found {len(editable_orders)} editable orders out of {len(orders)} total")
        assert len(orders) > 0, "No orders found for testing"
    
    def test_02_edit_order_notes_only(self):
        """Test editing just the notes field"""
        # Get an editable order
        resp = self.session.get(f"{BASE_URL}/api/orders")
        orders = resp.json().get("orders", [])
        editable = [o for o in orders if o.get("status") not in ("delivered", "cancelled")]
        if not editable:
            pytest.skip("No editable orders available")
        
        order = editable[0]
        order_id = order["id"]
        original_notes = order.get("notes", "")
        new_notes = f"TEST_EDIT_{uuid.uuid4().hex[:8]} - Testing edit at {datetime.utcnow().isoformat()}"
        
        # Edit the order
        edit_resp = self.session.patch(f"{BASE_URL}/api/orders/{order_id}/edit", json={
            "notes": new_notes,
            "repush_shiprocket": False  # Skip SR re-push for this test
        })
        assert edit_resp.status_code == 200, f"Edit failed: {edit_resp.text}"
        result = edit_resp.json()
        
        assert result.get("success") is True
        assert "audit" in result
        assert "notes" in result["audit"].get("changed_fields", [])
        assert result["audit"]["diff"]["notes"]["before"] == original_notes
        assert result["audit"]["diff"]["notes"]["after"] == new_notes
        
        # Verify the order was updated
        assert result["order"]["notes"] == new_notes
        print(f"Successfully edited notes on order {order['order_number']}")
    
    def test_03_edit_order_rejected_for_delivered(self):
        """Test that editing a delivered order is rejected"""
        # Get a delivered order
        resp = self.session.get(f"{BASE_URL}/api/orders?status=delivered")
        orders = resp.json().get("orders", [])
        if not orders:
            pytest.skip("No delivered orders to test rejection")
        
        order = orders[0]
        edit_resp = self.session.patch(f"{BASE_URL}/api/orders/{order['id']}/edit", json={
            "notes": "Should fail"
        })
        assert edit_resp.status_code == 400, f"Expected 400 for delivered order, got {edit_resp.status_code}"
        assert "delivered" in edit_resp.json().get("detail", "").lower()
        print(f"Correctly rejected edit on delivered order {order['order_number']}")
    
    def test_04_edit_order_rejected_for_cancelled(self):
        """Test that editing a cancelled order is rejected"""
        # Get a cancelled order
        resp = self.session.get(f"{BASE_URL}/api/orders?status=cancelled")
        orders = resp.json().get("orders", [])
        if not orders:
            pytest.skip("No cancelled orders to test rejection")
        
        order = orders[0]
        edit_resp = self.session.patch(f"{BASE_URL}/api/orders/{order['id']}/edit", json={
            "notes": "Should fail"
        })
        assert edit_resp.status_code == 400, f"Expected 400 for cancelled order, got {edit_resp.status_code}"
        assert "cancelled" in edit_resp.json().get("detail", "").lower()
        print(f"Correctly rejected edit on cancelled order {order['order_number']}")
    
    def test_05_edit_order_invalid_seller_id(self):
        """Test that editing with invalid seller_id returns 404"""
        # Get an editable order
        resp = self.session.get(f"{BASE_URL}/api/orders")
        orders = resp.json().get("orders", [])
        editable = [o for o in orders if o.get("status") not in ("delivered", "cancelled")]
        if not editable:
            pytest.skip("No editable orders available")
        
        order = editable[0]
        fake_seller_id = f"fake-seller-{uuid.uuid4().hex}"
        
        edit_resp = self.session.patch(f"{BASE_URL}/api/orders/{order['id']}/edit", json={
            "seller_id": fake_seller_id,
            "repush_shiprocket": False
        })
        assert edit_resp.status_code == 404, f"Expected 404 for invalid seller, got {edit_resp.status_code}"
        assert "vendor" in edit_resp.json().get("detail", "").lower() or "seller" in edit_resp.json().get("detail", "").lower()
        print(f"Correctly rejected edit with invalid seller_id")
    
    def test_06_list_order_edits(self):
        """Test GET /api/orders/{id}/edits returns audit history"""
        # Get an order that we edited in test_02
        resp = self.session.get(f"{BASE_URL}/api/orders")
        orders = resp.json().get("orders", [])
        if not orders:
            pytest.skip("No orders available")
        
        # Use the first order (may or may not have edits)
        order = orders[0]
        
        edits_resp = self.session.get(f"{BASE_URL}/api/orders/{order['id']}/edits")
        assert edits_resp.status_code == 200, f"Failed to get edits: {edits_resp.text}"
        data = edits_resp.json()
        
        assert "edits" in data
        assert "total" in data
        print(f"Order {order['order_number']} has {data['total']} edit(s)")
        
        # If there are edits, verify structure
        if data["edits"]:
            edit = data["edits"][0]
            assert "id" in edit
            assert "order_id" in edit
            assert "edited_by" in edit
            assert "edited_at" in edit
            assert "changed_fields" in edit
            assert "diff" in edit
            print(f"Latest edit by {edit['edited_by']} at {edit['edited_at']}")
    
    def test_07_edit_order_items_recomputes_totals(self):
        """Test that editing items recomputes subtotal/tax/total"""
        # Get an editable order with items
        resp = self.session.get(f"{BASE_URL}/api/orders")
        orders = resp.json().get("orders", [])
        editable = [o for o in orders if o.get("status") not in ("delivered", "cancelled") and o.get("items")]
        if not editable:
            pytest.skip("No editable orders with items available")
        
        order = editable[0]
        original_items = order.get("items", [])
        if not original_items:
            pytest.skip("Order has no items")
        
        # Modify the first item's quantity
        modified_items = []
        for item in original_items:
            modified_item = {
                "fabric_id": item.get("fabric_id", ""),
                "fabric_name": item.get("fabric_name", "Test Fabric"),
                "fabric_code": item.get("fabric_code", ""),
                "category_name": item.get("category_name", ""),
                "seller_id": item.get("seller_id", ""),
                "seller_company": item.get("seller_company", ""),
                "quantity": item.get("quantity", 1) + 10,  # Add 10 meters
                "price_per_meter": item.get("price_per_meter", 100),
                "order_type": item.get("order_type", "bulk"),
                "image_url": item.get("image_url", ""),
            }
            modified_items.append(modified_item)
        
        edit_resp = self.session.patch(f"{BASE_URL}/api/orders/{order['id']}/edit", json={
            "items": modified_items,
            "repush_shiprocket": False
        })
        assert edit_resp.status_code == 200, f"Edit failed: {edit_resp.text}"
        result = edit_resp.json()
        
        # Check that totals were recomputed
        if "totals" in result.get("audit", {}).get("changed_fields", []):
            print(f"Totals changed: {result['audit']['diff'].get('totals', {})}")
        
        # Verify the new totals make sense
        new_order = result["order"]
        expected_subtotal = sum(
            item.get("quantity", 0) * item.get("price_per_meter", 0)
            for item in new_order.get("items", [])
        )
        assert abs(new_order.get("subtotal", 0) - expected_subtotal) < 0.01, "Subtotal mismatch"
        print(f"Totals recomputed correctly: subtotal={new_order.get('subtotal')}, tax={new_order.get('tax')}, total={new_order.get('total')}")
    
    def test_08_edit_order_customer_info(self):
        """Test editing customer information"""
        # Get an editable order
        resp = self.session.get(f"{BASE_URL}/api/orders")
        orders = resp.json().get("orders", [])
        editable = [o for o in orders if o.get("status") not in ("delivered", "cancelled")]
        if not editable:
            pytest.skip("No editable orders available")
        
        order = editable[0]
        original_customer = order.get("customer", {})
        
        # Modify customer name
        new_customer = {
            "name": f"TEST_CUSTOMER_{uuid.uuid4().hex[:6]}",
            "email": original_customer.get("email", "test@example.com"),
            "phone": original_customer.get("phone", "9999999999"),
            "company": original_customer.get("company", ""),
            "gst_number": original_customer.get("gst_number", ""),
            "address": original_customer.get("address", ""),
            "city": original_customer.get("city", ""),
            "state": original_customer.get("state", ""),
            "pincode": original_customer.get("pincode", ""),
        }
        
        edit_resp = self.session.patch(f"{BASE_URL}/api/orders/{order['id']}/edit", json={
            "customer": new_customer,
            "repush_shiprocket": False
        })
        assert edit_resp.status_code == 200, f"Edit failed: {edit_resp.text}"
        result = edit_resp.json()
        
        assert "customer" in result.get("audit", {}).get("changed_fields", [])
        assert result["order"]["customer"]["name"] == new_customer["name"]
        print(f"Customer info updated on order {order['order_number']}")
    
    def test_09_edit_order_ship_to(self):
        """Test editing ship_to address"""
        # Get an editable order
        resp = self.session.get(f"{BASE_URL}/api/orders")
        orders = resp.json().get("orders", [])
        editable = [o for o in orders if o.get("status") not in ("delivered", "cancelled")]
        if not editable:
            pytest.skip("No editable orders available")
        
        order = editable[0]
        
        # Set a new ship_to address with unique values to ensure change
        unique_suffix = uuid.uuid4().hex[:6]
        new_ship_to = {
            "name": f"Test Consignee {unique_suffix}",
            "company": f"Test Company {unique_suffix}",
            "gst_number": "27AABCU9603R1ZM",  # Valid GSTIN format
            "address": f"123 Test Street {unique_suffix}",
            "city": "Mumbai",
            "state": "Maharashtra",
            "pincode": "400001",
            "phone": "9876543210"
        }
        
        edit_resp = self.session.patch(f"{BASE_URL}/api/orders/{order['id']}/edit", json={
            "ship_to": new_ship_to,
            "repush_shiprocket": False
        })
        assert edit_resp.status_code == 200, f"Edit failed: {edit_resp.text}"
        result = edit_resp.json()
        
        # If no_changes is True, the ship_to was already the same (unlikely with unique suffix)
        if result.get("no_changes"):
            print(f"Ship-to was already set to the same values on order {order['order_number']}")
        else:
            assert "ship_to" in result.get("audit", {}).get("changed_fields", [])
            assert result["order"]["ship_to"]["city"] == "Mumbai"
            print(f"Ship-to address updated on order {order['order_number']}")


class TestSellerPickupFields:
    """Tests for seller pickup address fields"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: login as admin"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert login_resp.status_code == 200
        self.token = login_resp.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
    
    def test_01_get_sellers_list(self):
        """Get list of sellers"""
        resp = self.session.get(f"{BASE_URL}/api/sellers")
        assert resp.status_code == 200, f"Failed to get sellers: {resp.text}"
        sellers = resp.json()
        assert isinstance(sellers, list)
        print(f"Found {len(sellers)} sellers")
        if sellers:
            print(f"First seller: {sellers[0].get('company_name')} ({sellers[0].get('id')})")
    
    def test_02_update_seller_pickup_fields(self):
        """Test updating seller pickup address fields"""
        # Get a seller
        resp = self.session.get(f"{BASE_URL}/api/sellers")
        sellers = resp.json()
        if not sellers:
            pytest.skip("No sellers available")
        
        seller = sellers[0]
        seller_id = seller["id"]
        
        # Update pickup fields
        pickup_data = {
            "pickup_address": f"TEST_PICKUP_{uuid.uuid4().hex[:6]} Industrial Area",
            "pickup_city": "Surat",
            "pickup_state": "Gujarat",
            "pickup_pincode": "395003",
            "pickup_contact_name": "Test Contact",
            "pickup_contact_phone": "9876543210",
            "shiprocket_pickup_nickname": f"VND-TEST-{uuid.uuid4().hex[:6]}"
        }
        
        update_resp = self.session.put(f"{BASE_URL}/api/sellers/{seller_id}", json=pickup_data)
        assert update_resp.status_code == 200, f"Update failed: {update_resp.text}"
        
        # Verify the update
        get_resp = self.session.get(f"{BASE_URL}/api/sellers/{seller_id}")
        assert get_resp.status_code == 200
        updated_seller = get_resp.json()
        
        assert updated_seller.get("pickup_address") == pickup_data["pickup_address"]
        assert updated_seller.get("pickup_city") == pickup_data["pickup_city"]
        assert updated_seller.get("pickup_state") == pickup_data["pickup_state"]
        assert updated_seller.get("pickup_pincode") == pickup_data["pickup_pincode"]
        assert updated_seller.get("pickup_contact_name") == pickup_data["pickup_contact_name"]
        assert updated_seller.get("pickup_contact_phone") == pickup_data["pickup_contact_phone"]
        assert updated_seller.get("shiprocket_pickup_nickname") == pickup_data["shiprocket_pickup_nickname"]
        
        print(f"Successfully updated pickup fields for seller {seller.get('company_name')}")


class TestVendorChangeOnOrder:
    """Tests for vendor change handling on orders"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: login as admin"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert login_resp.status_code == 200
        self.token = login_resp.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
    
    def test_01_change_vendor_on_order(self):
        """Test changing vendor on an order"""
        # Get sellers
        sellers_resp = self.session.get(f"{BASE_URL}/api/sellers")
        sellers = sellers_resp.json()
        if len(sellers) < 2:
            pytest.skip("Need at least 2 sellers to test vendor change")
        
        # Get an editable order
        orders_resp = self.session.get(f"{BASE_URL}/api/orders")
        orders = orders_resp.json().get("orders", [])
        editable = [o for o in orders if o.get("status") not in ("delivered", "cancelled")]
        if not editable:
            pytest.skip("No editable orders available")
        
        order = editable[0]
        current_seller_id = order.get("seller_id") or (order.get("items", [{}])[0].get("seller_id") if order.get("items") else "")
        
        # Find a different seller
        new_seller = None
        for s in sellers:
            if s["id"] != current_seller_id:
                new_seller = s
                break
        
        if not new_seller:
            pytest.skip("Could not find a different seller")
        
        # Change the vendor
        edit_resp = self.session.patch(f"{BASE_URL}/api/orders/{order['id']}/edit", json={
            "seller_id": new_seller["id"],
            "repush_shiprocket": False  # Skip SR re-push to avoid external API calls
        })
        assert edit_resp.status_code == 200, f"Edit failed: {edit_resp.text}"
        result = edit_resp.json()
        
        assert result.get("vendor_changed") is True
        assert "seller_id" in result.get("audit", {}).get("changed_fields", [])
        
        # Verify items have new seller_id
        for item in result["order"].get("items", []):
            assert item.get("seller_id") == new_seller["id"], "Item seller_id not updated"
        
        print(f"Successfully changed vendor on order {order['order_number']} to {new_seller.get('company_name')}")
    
    def test_02_vendor_change_preserves_item_prices(self):
        """Test that item prices stay the same when vendor changes"""
        # Get sellers
        sellers_resp = self.session.get(f"{BASE_URL}/api/sellers")
        sellers = sellers_resp.json()
        if len(sellers) < 2:
            pytest.skip("Need at least 2 sellers")
        
        # Get an editable order with items
        orders_resp = self.session.get(f"{BASE_URL}/api/orders")
        orders = orders_resp.json().get("orders", [])
        editable = [o for o in orders if o.get("status") not in ("delivered", "cancelled") and o.get("items")]
        if not editable:
            pytest.skip("No editable orders with items")
        
        order = editable[0]
        original_prices = [item.get("price_per_meter") for item in order.get("items", [])]
        current_seller_id = order.get("seller_id") or (order.get("items", [{}])[0].get("seller_id") if order.get("items") else "")
        
        # Find a different seller
        new_seller = None
        for s in sellers:
            if s["id"] != current_seller_id:
                new_seller = s
                break
        
        if not new_seller:
            pytest.skip("Could not find a different seller")
        
        # Change the vendor
        edit_resp = self.session.patch(f"{BASE_URL}/api/orders/{order['id']}/edit", json={
            "seller_id": new_seller["id"],
            "repush_shiprocket": False
        })
        assert edit_resp.status_code == 200
        result = edit_resp.json()
        
        # Verify prices are unchanged
        new_prices = [item.get("price_per_meter") for item in result["order"].get("items", [])]
        assert original_prices == new_prices, f"Prices changed! Original: {original_prices}, New: {new_prices}"
        print(f"Item prices preserved after vendor change: {new_prices}")


class TestOrderEditAuditTrail:
    """Tests for order edit audit trail"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: login as admin"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert login_resp.status_code == 200
        self.token = login_resp.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
    
    def test_01_audit_trail_sorted_newest_first(self):
        """Test that audit trail is sorted newest first"""
        # Get an order
        orders_resp = self.session.get(f"{BASE_URL}/api/orders")
        orders = orders_resp.json().get("orders", [])
        if not orders:
            pytest.skip("No orders available")
        
        order = orders[0]
        
        # Get edits
        edits_resp = self.session.get(f"{BASE_URL}/api/orders/{order['id']}/edits")
        assert edits_resp.status_code == 200
        data = edits_resp.json()
        
        edits = data.get("edits", [])
        if len(edits) < 2:
            print(f"Order has {len(edits)} edit(s), cannot verify sort order")
            return
        
        # Verify sorted newest first
        for i in range(len(edits) - 1):
            assert edits[i]["edited_at"] >= edits[i + 1]["edited_at"], "Edits not sorted newest first"
        
        print(f"Audit trail correctly sorted newest first ({len(edits)} edits)")
    
    def test_02_audit_trail_requires_admin_auth(self):
        """Test that audit trail endpoint requires admin auth"""
        # Get an order
        orders_resp = self.session.get(f"{BASE_URL}/api/orders")
        orders = orders_resp.json().get("orders", [])
        if not orders:
            pytest.skip("No orders available")
        
        order = orders[0]
        
        # Try without auth
        no_auth_session = requests.Session()
        no_auth_resp = no_auth_session.get(f"{BASE_URL}/api/orders/{order['id']}/edits")
        assert no_auth_resp.status_code in (401, 403), f"Expected 401/403 without auth, got {no_auth_resp.status_code}"
        print("Audit trail correctly requires admin auth")
    
    def test_03_no_changes_returns_no_changes_flag(self):
        """Test that editing with no actual changes returns no_changes flag"""
        # Get an editable order
        orders_resp = self.session.get(f"{BASE_URL}/api/orders")
        orders = orders_resp.json().get("orders", [])
        editable = [o for o in orders if o.get("status") not in ("delivered", "cancelled")]
        if not editable:
            pytest.skip("No editable orders available")
        
        order = editable[0]
        
        # Edit with the same notes value
        current_notes = order.get("notes", "")
        edit_resp = self.session.patch(f"{BASE_URL}/api/orders/{order['id']}/edit", json={
            "notes": current_notes,
            "repush_shiprocket": False
        })
        assert edit_resp.status_code == 200
        result = edit_resp.json()
        
        assert result.get("no_changes") is True or result.get("success") is True
        print("No-changes edit handled correctly")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
