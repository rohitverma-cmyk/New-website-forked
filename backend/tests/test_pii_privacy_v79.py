"""
Test PII Privacy Hardening - Iteration 79
Tests that customer PII is NOT visible to vendors and vendor details are NOT visible to customers.

Test Cases:
1. GET /api/vendor/orders - customer object must ONLY contain {city, state, pincode}
2. Vendor email template - must NOT contain customer name/company/email/phone/address
3. Customer order confirmation email - must NOT contain seller_company/vendor names
"""
import pytest
import requests
import os
import re

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://fabric-sourcing-cms.preview.emergentagent.com').rstrip('/')

# Test credentials from test_credentials.md
VENDOR_EMAIL = "bhuvnesh.sharma@nsltextiles.com"
VENDOR_PASSWORD = "Vendor@2026"
ADMIN_EMAIL = "admin@locofast.com"
ADMIN_PASSWORD = "admin123"


class TestVendorPIIPrivacy:
    """Test that customer PII is stripped from vendor-facing APIs and emails"""
    
    @pytest.fixture(scope="class")
    def vendor_token(self):
        """Get vendor authentication token"""
        response = requests.post(f"{BASE_URL}/api/vendor/login", json={
            "email": VENDOR_EMAIL,
            "password": VENDOR_PASSWORD
        })
        assert response.status_code == 200, f"Vendor login failed: {response.text}"
        data = response.json()
        assert "token" in data, "No token in vendor login response"
        return data["token"]
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert "token" in data, "No token in admin login response"
        return data["token"]
    
    def test_vendor_orders_customer_pii_stripped(self, vendor_token):
        """
        TEST 1: GET /api/vendor/orders - customer object must ONLY contain {city, state, pincode}
        Must NOT contain: name, company, address, phone, email, gst_number
        """
        response = requests.get(
            f"{BASE_URL}/api/vendor/orders",
            headers={"Authorization": f"Bearer {vendor_token}"}
        )
        assert response.status_code == 200, f"Failed to get vendor orders: {response.text}"
        
        orders = response.json()
        print(f"Found {len(orders)} orders for vendor")
        
        # PII fields that must NOT be present in customer object
        forbidden_pii_fields = ['name', 'company', 'address', 'phone', 'email', 'gst_number']
        # Allowed fields in customer object
        allowed_fields = ['city', 'state', 'pincode']
        
        pii_violations = []
        
        for order in orders:
            customer = order.get('customer', {})
            if not customer:
                continue
                
            order_num = order.get('order_number', order.get('id', 'unknown'))
            
            # Check for forbidden PII fields
            for field in forbidden_pii_fields:
                if field in customer and customer[field]:
                    pii_violations.append(f"Order {order_num}: customer.{field} = '{customer[field]}'")
            
            # Verify only allowed fields are present
            for key in customer.keys():
                if key not in allowed_fields:
                    pii_violations.append(f"Order {order_num}: unexpected field customer.{key}")
        
        if pii_violations:
            print("PII VIOLATIONS FOUND:")
            for v in pii_violations[:10]:  # Show first 10
                print(f"  - {v}")
        
        assert len(pii_violations) == 0, f"Customer PII leaked to vendor: {pii_violations[:5]}"
        print("PASS: No customer PII found in vendor orders API response")
    
    def test_vendor_orders_has_shipping_zone(self, vendor_token):
        """
        TEST 2: Verify vendor orders DO contain shipping zone (city/state/pincode)
        """
        response = requests.get(
            f"{BASE_URL}/api/vendor/orders",
            headers={"Authorization": f"Bearer {vendor_token}"}
        )
        assert response.status_code == 200
        
        orders = response.json()
        
        orders_with_zone = 0
        for order in orders:
            customer = order.get('customer', {})
            if customer.get('city') or customer.get('state') or customer.get('pincode'):
                orders_with_zone += 1
        
        print(f"Orders with shipping zone data: {orders_with_zone}/{len(orders)}")
        
        # At least some orders should have zone data (if there are orders)
        if len(orders) > 0:
            assert orders_with_zone > 0, "No orders have shipping zone data"
        
        print("PASS: Vendor orders contain shipping zone (city/state/pincode)")


class TestEmailTemplates:
    """Test email templates for PII privacy"""
    
    def test_seller_order_notification_email_no_customer_pii(self):
        """
        TEST 3: get_seller_order_notification_email must NOT contain customer PII
        """
        # Import the email template function
        import sys
        sys.path.insert(0, '/app/backend')
        from email_router import get_seller_order_notification_email
        
        # Create a mock order with full customer data
        mock_order = {
            'order_number': 'LF/ORD/TEST001',
            'created_at': '2026-01-15T10:00:00Z',
            'payment_status': 'paid',
            'total': 50000,
            'customer': {
                'name': 'Test Customer Name',
                'company': 'Test Company Pvt Ltd',
                'email': 'testcustomer@example.com',
                'phone': '+919876543210',
                'address': '123 Test Street, Test Area',
                'city': 'Mumbai',
                'state': 'Maharashtra',
                'pincode': '400001',
                'gst_number': '27AABCT1234A1Z5'
            }
        }
        
        mock_items = [{
            'fabric_name': 'Test Fabric',
            'fabric_code': 'TF001',
            'quantity': 100,
            'price_per_meter': 500,
            'order_type': 'bulk',
            'category_name': 'Cotton'
        }]
        
        mock_seller = {
            'company_name': 'Test Seller Mills',
            'contact_name': 'Seller Contact'
        }
        
        # Generate the email HTML
        html = get_seller_order_notification_email(mock_order, mock_items, mock_seller)
        
        # PII that must NOT appear in the email
        forbidden_content = [
            'Test Customer Name',
            'Test Company Pvt Ltd',
            'testcustomer@example.com',
            '+919876543210',
            '9876543210',
            '123 Test Street',
            'Test Area',
            '27AABCT1234A1Z5',  # GST number
        ]
        
        pii_found = []
        for content in forbidden_content:
            if content in html:
                pii_found.append(content)
        
        if pii_found:
            print("PII FOUND IN SELLER EMAIL:")
            for p in pii_found:
                print(f"  - {p}")
        
        assert len(pii_found) == 0, f"Customer PII found in seller email: {pii_found}"
        
        # Verify shipping zone IS present
        assert 'Mumbai' in html, "City should be in seller email"
        assert 'Maharashtra' in html, "State should be in seller email"
        assert '400001' in html, "Pincode should be in seller email"
        
        # Verify "Ship-To Zone" header is present
        assert 'Ship-To Zone' in html, "Ship-To Zone header should be in seller email"
        
        print("PASS: Seller order notification email contains only shipping zone, no customer PII")
    
    def test_order_confirmation_email_no_vendor_details(self):
        """
        TEST 4: get_order_confirmation_email must NOT contain seller_company/vendor names
        """
        import sys
        sys.path.insert(0, '/app/backend')
        from email_router import get_order_confirmation_email
        
        # Create a mock order with vendor details in items
        mock_order = {
            'order_number': 'LF/ORD/TEST002',
            'created_at': '2026-01-15T10:00:00Z',
            'subtotal': 45000,
            'tax': 2250,
            'total': 47250,
            'id': 'test-order-id',
            'customer': {
                'name': 'Customer Name',
                'company': 'Customer Company',
                'email': 'customer@example.com',
                'phone': '+919876543210',
                'address': '456 Customer Street',
                'city': 'Delhi',
                'state': 'Delhi',
                'pincode': '110001'
            },
            'items': [{
                'fabric_name': 'Premium Cotton Fabric',
                'fabric_code': 'PCF001',
                'quantity': 100,
                'price_per_meter': 450,
                'category_name': 'Cotton',
                'seller_company': 'NSL Textiles Private Limited',
                'seller_name': 'Bhuvnesh Sharma',
                'vendor_name': 'NSL Textiles'
            }]
        }
        
        # Generate the email HTML
        html = get_order_confirmation_email(mock_order)
        
        # Vendor details that must NOT appear in customer email
        forbidden_vendor_content = [
            'NSL Textiles Private Limited',
            'NSL Textiles',
            'Bhuvnesh Sharma',
            'seller_company',
            'vendor_name',
        ]
        
        vendor_found = []
        for content in forbidden_vendor_content:
            if content.lower() in html.lower():
                vendor_found.append(content)
        
        if vendor_found:
            print("VENDOR DETAILS FOUND IN CUSTOMER EMAIL:")
            for v in vendor_found:
                print(f"  - {v}")
        
        assert len(vendor_found) == 0, f"Vendor details found in customer email: {vendor_found}"
        
        # Verify fabric name IS present (product info is OK)
        assert 'Premium Cotton Fabric' in html, "Fabric name should be in customer email"
        
        print("PASS: Order confirmation email does not contain vendor/seller details")


class TestAdminOrdersHaveFullData:
    """Verify admin APIs still have full customer data (sanity check)"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        return response.json()["token"]
    
    def test_admin_orders_have_full_customer_data(self, admin_token):
        """
        TEST 5: Admin orders API should still have full customer data
        (This is a sanity check - admin needs full data for operations)
        """
        response = requests.get(
            f"{BASE_URL}/api/orders?limit=5",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Failed to get admin orders: {response.text}"
        
        data = response.json()
        orders = data.get('orders', data) if isinstance(data, dict) else data
        
        if len(orders) == 0:
            pytest.skip("No orders found for admin sanity check")
        
        # Check that admin orders have full customer data
        orders_with_full_data = 0
        for order in orders[:5]:
            customer = order.get('customer', {})
            if customer.get('name') or customer.get('email') or customer.get('phone'):
                orders_with_full_data += 1
        
        print(f"Admin orders with full customer data: {orders_with_full_data}/{min(5, len(orders))}")
        
        # Admin should have access to full customer data
        assert orders_with_full_data > 0, "Admin orders should have full customer data"
        
        print("PASS: Admin orders API returns full customer data (as expected)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
