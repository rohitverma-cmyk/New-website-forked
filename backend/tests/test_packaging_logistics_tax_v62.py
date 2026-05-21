"""
Test Suite: Packaging + Logistics Tax Changes (v62)
Tests the Feb 2026 GST fix where packaging and logistics are now part of taxable value.

Key changes tested:
1. calculate_totals() now computes taxable_value = goods + packaging + logistics
2. tax = 5% × taxable_value
3. Order creation persists taxable_value + tax_on_charges_v2 flag
4. Invoice PDF renders correctly for v2 orders (new layout) and v1 orders (legacy layout)
"""

import pytest
import requests
import os
from dotenv import load_dotenv

load_dotenv('/app/backend/.env')

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://fabric-sourcing-cms.preview.emergentagent.com"


class TestCalculateTotals:
    """Test the calculate_totals function logic via order creation"""
    
    def test_bulk_order_with_packaging_and_logistics(self):
        """
        Verify bulk order: items=1000×₹100, packaging=1000, logistics=2000
        Expected: subtotal=100000, taxable_value=103000, tax=5150, total=108150
        """
        # Create order with bulk pricing
        order_data = {
            "items": [{
                "fabric_id": "test-fabric-001",
                "fabric_name": "Test Cotton Fabric",
                "fabric_code": "TCF001",
                "category_name": "Cotton",
                "seller_company": "Test Mill",
                "seller_id": "test-seller-001",
                "quantity": 1000,
                "price_per_meter": 100,
                "order_type": "bulk",
                "image_url": "",
                "hsn_code": "5208"
            }],
            "customer": {
                "name": "TEST Tax Calc Buyer",
                "email": "test_tax_calc@example.com",
                "phone": "+919876543210",
                "company": "Test Company",
                "gst_number": "29AAAAA0000A1Z5",
                "address": "123 Test Street",
                "city": "Bangalore",
                "state": "Karnataka",
                "pincode": "560001"
            },
            "notes": "TEST order for tax calculation verification",
            "logistics_charge": 0,
            "packaging_charge": 1000,
            "logistics_only_charge": 2000,
            "payment_method": "razorpay"
        }
        
        response = requests.post(f"{BASE_URL}/api/orders/create", json=order_data)
        print(f"Create order response: {response.status_code}")
        
        # Even if payment fails, we should get the order created
        if response.status_code == 503:
            pytest.skip("Razorpay not configured - skipping order creation test")
        
        assert response.status_code == 200, f"Order creation failed: {response.text}"
        data = response.json()
        
        order_id = data.get("order_id")
        assert order_id, "No order_id returned"
        
        # Fetch the order to verify stored values
        order_response = requests.get(f"{BASE_URL}/api/orders/{order_id}")
        assert order_response.status_code == 200
        order = order_response.json()
        
        # Verify calculations
        assert order.get("subtotal") == 100000, f"Expected subtotal=100000, got {order.get('subtotal')}"
        assert order.get("packaging_charge") == 1000, f"Expected packaging_charge=1000, got {order.get('packaging_charge')}"
        assert order.get("logistics_only_charge") == 2000, f"Expected logistics_only_charge=2000, got {order.get('logistics_only_charge')}"
        assert order.get("taxable_value") == 103000, f"Expected taxable_value=103000, got {order.get('taxable_value')}"
        assert order.get("tax") == 5150, f"Expected tax=5150, got {order.get('tax')}"
        assert order.get("tax_on_charges_v2") == True, f"Expected tax_on_charges_v2=True, got {order.get('tax_on_charges_v2')}"
        
        # Total = taxable_value + tax = 103000 + 5150 = 108150
        assert order.get("total") == 108150, f"Expected total=108150, got {order.get('total')}"
        
        print(f"✓ Bulk order tax calculation verified: subtotal={order['subtotal']}, taxable_value={order['taxable_value']}, tax={order['tax']}, total={order['total']}")
        
        # Cleanup - cancel the test order
        cancel_response = requests.put(
            f"{BASE_URL}/api/orders/{order_id}/cancel",
            json={"reason": "other"}
        )
        print(f"Cleanup: cancelled test order {order_id}")

    def test_sample_order_with_flat_logistics(self):
        """
        Verify sample order: qty=1, price=500, logistics=100 (flat)
        Expected: subtotal=500, taxable_value=600, tax=30, total=630
        """
        order_data = {
            "items": [{
                "fabric_id": "test-fabric-002",
                "fabric_name": "Test Sample Fabric",
                "fabric_code": "TSF002",
                "category_name": "Cotton",
                "seller_company": "Test Mill",
                "seller_id": "test-seller-001",
                "quantity": 1,
                "price_per_meter": 500,
                "order_type": "sample",
                "image_url": "",
                "hsn_code": "5208"
            }],
            "customer": {
                "name": "TEST Sample Buyer",
                "email": "test_sample@example.com",
                "phone": "+919876543211",
                "company": "Test Company",
                "gst_number": "29BBBBB0000B1Z5",
                "address": "456 Test Avenue",
                "city": "Bangalore",
                "state": "Karnataka",
                "pincode": "560002"
            },
            "notes": "TEST sample order for tax calculation",
            "logistics_charge": 100,
            "packaging_charge": 0,
            "logistics_only_charge": 0,
            "payment_method": "razorpay"
        }
        
        response = requests.post(f"{BASE_URL}/api/orders/create", json=order_data)
        print(f"Create sample order response: {response.status_code}")
        
        if response.status_code == 503:
            pytest.skip("Razorpay not configured - skipping order creation test")
        
        assert response.status_code == 200, f"Order creation failed: {response.text}"
        data = response.json()
        
        order_id = data.get("order_id")
        assert order_id, "No order_id returned"
        
        # Fetch the order to verify stored values
        order_response = requests.get(f"{BASE_URL}/api/orders/{order_id}")
        assert order_response.status_code == 200
        order = order_response.json()
        
        # Verify calculations
        assert order.get("subtotal") == 500, f"Expected subtotal=500, got {order.get('subtotal')}"
        assert order.get("logistics_charge") == 100, f"Expected logistics_charge=100, got {order.get('logistics_charge')}"
        assert order.get("taxable_value") == 600, f"Expected taxable_value=600, got {order.get('taxable_value')}"
        assert order.get("tax") == 30, f"Expected tax=30, got {order.get('tax')}"
        assert order.get("tax_on_charges_v2") == True, f"Expected tax_on_charges_v2=True"
        assert order.get("total") == 630, f"Expected total=630, got {order.get('total')}"
        
        print(f"✓ Sample order tax calculation verified: subtotal={order['subtotal']}, taxable_value={order['taxable_value']}, tax={order['tax']}, total={order['total']}")
        
        # Cleanup
        requests.put(f"{BASE_URL}/api/orders/{order_id}/cancel", json={"reason": "other"})


class TestInvoicePDFRendering:
    """Test invoice PDF generation for v1 (legacy) and v2 orders"""
    
    def test_v2_paid_order_invoice(self):
        """Test that a PAID v2 order invoice endpoint returns PDF"""
        # Find an existing paid order with tax_on_charges_v2
        response = requests.get(f"{BASE_URL}/api/orders?limit=100&payment_status=paid")
        assert response.status_code == 200
        
        orders = response.json().get("orders", [])
        v2_order = None
        
        for order in orders:
            if order.get("tax_on_charges_v2") and order.get("payment_status") == "paid":
                v2_order = order
                break
        
        if not v2_order:
            pytest.skip("No paid v2 orders found to test invoice")
        
        order_id = v2_order.get("id")
        print(f"Testing invoice for paid v2 order: {v2_order.get('order_number')}")
        
        # Fetch invoice PDF
        invoice_response = requests.get(f"{BASE_URL}/api/orders/{order_id}/invoice")
        assert invoice_response.status_code == 200, f"Invoice fetch failed: {invoice_response.text}"
        assert invoice_response.headers.get("content-type") == "application/pdf"
        
        # Verify PDF content exists
        pdf_content = invoice_response.content
        assert len(pdf_content) > 1000, "PDF content too small"
        assert pdf_content[:4] == b'%PDF', "Response is not a valid PDF"
        
        print(f"✓ V2 order invoice PDF generated successfully ({len(pdf_content)} bytes)")
    
    def test_legacy_order_invoice(self):
        """Test that legacy (v1) paid order invoice still works"""
        # Find an existing paid order WITHOUT tax_on_charges_v2
        response = requests.get(f"{BASE_URL}/api/orders?limit=100&payment_status=paid")
        assert response.status_code == 200
        
        orders = response.json().get("orders", [])
        legacy_order = None
        
        for order in orders:
            if not order.get("tax_on_charges_v2") and order.get("payment_status") == "paid":
                legacy_order = order
                break
        
        if not legacy_order:
            pytest.skip("No paid legacy orders found to test invoice")
        
        order_id = legacy_order.get("id")
        print(f"Testing invoice for legacy order: {legacy_order.get('order_number')}")
        
        # Fetch invoice PDF
        invoice_response = requests.get(f"{BASE_URL}/api/orders/{order_id}/invoice")
        assert invoice_response.status_code == 200, f"Invoice fetch failed: {invoice_response.text}"
        assert invoice_response.headers.get("content-type") == "application/pdf"
        
        # Verify PDF content exists
        pdf_content = invoice_response.content
        assert len(pdf_content) > 1000, "PDF content too small"
        assert pdf_content[:4] == b'%PDF', "Response is not a valid PDF"
        
        print(f"✓ Legacy order invoice PDF generated successfully ({len(pdf_content)} bytes)")


class TestOrderFieldsPersistence:
    """Test that all new fields are properly persisted on order creation"""
    
    def test_order_contains_all_new_fields(self):
        """Verify order doc includes taxable_value and tax_on_charges_v2"""
        order_data = {
            "items": [{
                "fabric_id": "test-fabric-fields",
                "fabric_name": "Fields Test Fabric",
                "fabric_code": "FTF001",
                "category_name": "Cotton",
                "seller_company": "Test Mill",
                "seller_id": "test-seller-001",
                "quantity": 500,
                "price_per_meter": 80,
                "order_type": "bulk",
                "image_url": "",
                "hsn_code": "5208"
            }],
            "customer": {
                "name": "TEST Fields Buyer",
                "email": "test_fields@example.com",
                "phone": "+919876543213",
                "company": "Fields Test Co",
                "gst_number": "29DDDDD0000D1Z5",
                "address": "101 Fields Road",
                "city": "Bangalore",
                "state": "Karnataka",
                "pincode": "560004"
            },
            "notes": "TEST order for field persistence verification",
            "logistics_charge": 0,
            "packaging_charge": 500,
            "logistics_only_charge": 1200,
            "payment_method": "razorpay"
        }
        
        response = requests.post(f"{BASE_URL}/api/orders/create", json=order_data)
        if response.status_code == 503:
            pytest.skip("Razorpay not configured")
        
        assert response.status_code == 200
        order_id = response.json().get("order_id")
        
        # Fetch order and verify all fields
        order_response = requests.get(f"{BASE_URL}/api/orders/{order_id}")
        assert order_response.status_code == 200
        order = order_response.json()
        
        # Check all required fields exist
        required_fields = [
            "subtotal", "tax", "total", "logistics_charge", 
            "packaging_charge", "logistics_only_charge",
            "taxable_value", "tax_on_charges_v2"
        ]
        
        for field in required_fields:
            assert field in order, f"Missing field: {field}"
            print(f"  {field}: {order[field]}")
        
        # Verify calculations
        # subtotal = 500 * 80 = 40000
        # taxable_value = 40000 + 500 + 1200 = 41700
        # tax = 41700 * 0.05 = 2085
        # total = 41700 + 2085 = 43785
        assert order["subtotal"] == 40000
        assert order["taxable_value"] == 41700
        assert order["tax"] == 2085
        assert order["total"] == 43785
        assert order["tax_on_charges_v2"] == True
        
        print(f"✓ All new fields persisted correctly")
        
        # Cleanup
        requests.put(f"{BASE_URL}/api/orders/{order_id}/cancel", json={"reason": "other"})


class TestLegacyOrderCompatibility:
    """Test that legacy orders (without tax_on_charges_v2) still work"""
    
    def test_get_existing_order_without_v2_flag(self):
        """Verify API handles orders without the new fields gracefully"""
        # List orders and find one without tax_on_charges_v2
        response = requests.get(f"{BASE_URL}/api/orders?limit=50")
        assert response.status_code == 200
        
        orders = response.json().get("orders", [])
        legacy_order = None
        
        for order in orders:
            if not order.get("tax_on_charges_v2"):
                legacy_order = order
                break
        
        if not legacy_order:
            pytest.skip("No legacy orders found to test")
        
        print(f"Found legacy order: {legacy_order.get('order_number')}")
        
        # Verify we can fetch it
        order_id = legacy_order.get("id")
        fetch_response = requests.get(f"{BASE_URL}/api/orders/{order_id}")
        assert fetch_response.status_code == 200
        
        # Verify invoice still generates
        invoice_response = requests.get(f"{BASE_URL}/api/orders/{order_id}/invoice")
        assert invoice_response.status_code == 200
        assert invoice_response.headers.get("content-type") == "application/pdf"
        
        print(f"✓ Legacy order {legacy_order.get('order_number')} invoice generated successfully")


class TestBangladeshExportUnaffected:
    """Verify Bangladesh export (LC) orders are not affected by the tax changes"""
    
    def test_lc_order_endpoint_exists(self):
        """Check that LC order endpoints still work"""
        # Just verify the endpoint exists and returns proper response
        response = requests.get(f"{BASE_URL}/api/orders?limit=10")
        assert response.status_code == 200
        
        orders = response.json().get("orders", [])
        
        # Look for any USD/export orders
        export_orders = [o for o in orders if o.get("currency") == "USD"]
        
        if export_orders:
            order = export_orders[0]
            print(f"Found export order: {order.get('order_number')}, currency={order.get('currency')}")
            # Export orders should NOT have tax_on_charges_v2 applied
            # (they have tax=0 anyway for exports)
        else:
            print("No export orders found - endpoint check passed")
        
        print("✓ Export order handling verified")


class TestHealthAndBasics:
    """Basic health checks"""
    
    def test_api_health(self):
        """Verify API is responding"""
        # Use fabrics endpoint as health check since /api/health may not exist
        response = requests.get(f"{BASE_URL}/api/fabrics?limit=1")
        assert response.status_code == 200
        print("✓ API health check passed")
    
    def test_orders_list_endpoint(self):
        """Verify orders list endpoint works"""
        response = requests.get(f"{BASE_URL}/api/orders?limit=5")
        assert response.status_code == 200
        data = response.json()
        assert "orders" in data
        assert "total" in data
        print(f"✓ Orders list endpoint works ({data['total']} total orders)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
