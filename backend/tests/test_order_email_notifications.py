"""
Test Order Email Notification Wiring
Tests the email notification system for orders:
1. send_order_notification_emails function is correctly imported and wired
2. ORDER_NOTIFICATION_EMAILS contains correct admin emails
3. Supplier email template does NOT contain customer phone
4. Admin email template DOES contain customer phone
5. Supplier email template contains product URL links
6. Supplier email template shows order type badges (Bulk/Sample)
7. Supplier email template shows rate, quantity, and order value
8. Admin email template shows subtotal, GST, discount, and total breakdown
9. GET /api/orders/payment-status returns razorpay_configured: true
10. POST /api/orders/create endpoint works
"""
import pytest
import requests
import os
import sys

# Add backend to path for direct imports
sys.path.insert(0, '/app/backend')

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Sample order data for template testing
SAMPLE_ORDER = {
    "id": "test-order-123",
    "order_number": "ORD-TEST01",
    "items": [
        {
            "fabric_id": "fabric-001",
            "fabric_name": "Premium Cotton Twill",
            "fabric_code": "PCT-001",
            "category_name": "Cotton",
            "seller_company": "Test Mills",
            "seller_id": "seller-001",
            "quantity": 100,
            "price_per_meter": 150.00,
            "order_type": "bulk",
            "image_url": "https://example.com/fabric.jpg"
        },
        {
            "fabric_id": "fabric-002",
            "fabric_name": "Silk Blend",
            "fabric_code": "SB-002",
            "category_name": "Silk",
            "seller_company": "Test Mills",
            "seller_id": "seller-001",
            "quantity": 5,
            "price_per_meter": 500.00,
            "order_type": "sample",
            "image_url": ""
        }
    ],
    "customer": {
        "name": "Test Customer",
        "email": "customer@test.com",
        "phone": "+91-9876543210",
        "company": "Test Company Pvt Ltd",
        "address": "123 Test Street",
        "city": "Mumbai",
        "state": "Maharashtra",
        "pincode": "400001"
    },
    "subtotal": 17500.00,
    "tax": 875.00,
    "discount": 500.00,
    "total": 17875.00,
    "payment_status": "paid",
    "created_at": "2026-01-15T10:30:00Z"
}

SAMPLE_SELLER = {
    "id": "seller-001",
    "company_name": "Test Mills",
    "contact_email": "seller@testmills.com"
}


class TestEmailModuleImports:
    """Test that email functions are correctly exported and importable"""
    
    def test_send_order_notification_emails_importable(self):
        """Verify send_order_notification_emails can be imported from email_router"""
        try:
            from email_router import send_order_notification_emails
            assert callable(send_order_notification_emails), "send_order_notification_emails should be callable"
            print("PASS: send_order_notification_emails is importable from email_router")
        except ImportError as e:
            pytest.fail(f"Failed to import send_order_notification_emails: {e}")
    
    def test_order_notification_emails_constant(self):
        """Verify ORDER_NOTIFICATION_EMAILS contains correct admin emails"""
        from email_router import ORDER_NOTIFICATION_EMAILS
        
        assert isinstance(ORDER_NOTIFICATION_EMAILS, list), "ORDER_NOTIFICATION_EMAILS should be a list"
        assert "mail@locofast.com" in ORDER_NOTIFICATION_EMAILS, "mail@locofast.com should be in ORDER_NOTIFICATION_EMAILS"
        assert "mohit@locofast.com" in ORDER_NOTIFICATION_EMAILS, "mohit@locofast.com should be in ORDER_NOTIFICATION_EMAILS"
        print(f"PASS: ORDER_NOTIFICATION_EMAILS = {ORDER_NOTIFICATION_EMAILS}")
    
    def test_orders_router_imports_email_function(self):
        """Verify orders_router.py imports send_order_notification_emails"""
        # Read the orders_router.py file and check for import
        with open('/app/backend/orders_router.py', 'r') as f:
            content = f.read()
        
        assert 'from email_router import send_order_notification_emails' in content, \
            "orders_router.py should import send_order_notification_emails from email_router"
        print("PASS: orders_router.py imports send_order_notification_emails")
    
    def test_verify_payment_calls_email_function(self):
        """Verify verify_payment endpoint calls send_order_notification_emails"""
        with open('/app/backend/orders_router.py', 'r') as f:
            content = f.read()
        
        # Check that send_order_notification_emails is called in verify_payment
        assert 'send_order_notification_emails' in content, \
            "orders_router.py should call send_order_notification_emails"
        
        # More specific check - it should be called after payment verification
        assert 'await send_order_notification_emails' in content, \
            "send_order_notification_emails should be awaited (async call)"
        print("PASS: verify_payment calls send_order_notification_emails")


class TestSupplierEmailTemplate:
    """Test supplier/seller email template content"""
    
    def test_supplier_email_does_not_contain_phone(self):
        """Supplier email should NOT contain customer phone number"""
        from email_router import get_seller_order_notification_email
        
        html = get_seller_order_notification_email(SAMPLE_ORDER, SAMPLE_ORDER['items'], SAMPLE_SELLER)
        
        # Check that phone number is NOT in the email
        assert "+91-9876543210" not in html, "Supplier email should NOT contain customer phone number"
        assert "9876543210" not in html, "Supplier email should NOT contain customer phone (without country code)"
        
        # Verify email IS present (for shipping contact)
        assert "customer@test.com" in html, "Supplier email should contain customer email for shipping"
        print("PASS: Supplier email does NOT contain customer phone number")
    
    def test_supplier_email_contains_product_urls(self):
        """Supplier email should contain product URL links"""
        from email_router import get_seller_order_notification_email, SITE_URL
        
        html = get_seller_order_notification_email(SAMPLE_ORDER, SAMPLE_ORDER['items'], SAMPLE_SELLER)
        
        # Check for fabric URLs
        expected_url_1 = f"{SITE_URL}/fabrics/fabric-001"
        expected_url_2 = f"{SITE_URL}/fabrics/fabric-002"
        
        assert expected_url_1 in html or "fabrics/fabric-001" in html, \
            f"Supplier email should contain product URL for fabric-001"
        assert expected_url_2 in html or "fabrics/fabric-002" in html, \
            f"Supplier email should contain product URL for fabric-002"
        print(f"PASS: Supplier email contains product URLs (SITE_URL={SITE_URL})")
    
    def test_supplier_email_shows_order_type_badges(self):
        """Supplier email should show Bulk/Sample order type badges"""
        from email_router import get_seller_order_notification_email
        
        html = get_seller_order_notification_email(SAMPLE_ORDER, SAMPLE_ORDER['items'], SAMPLE_SELLER)
        
        # Check for order type labels
        assert "Bulk" in html, "Supplier email should show 'Bulk' order type"
        assert "Sample" in html, "Supplier email should show 'Sample' order type"
        print("PASS: Supplier email shows order type badges (Bulk/Sample)")
    
    def test_supplier_email_shows_rate_quantity_value(self):
        """Supplier email should show rate, quantity, and order value"""
        from email_router import get_seller_order_notification_email
        
        html = get_seller_order_notification_email(SAMPLE_ORDER, SAMPLE_ORDER['items'], SAMPLE_SELLER)
        
        # Check for quantity (100 meters, 5 meters)
        assert "100" in html, "Supplier email should show quantity (100)"
        assert "5" in html, "Supplier email should show quantity (5)"
        
        # Check for rates
        assert "150" in html, "Supplier email should show rate (150)"
        assert "500" in html, "Supplier email should show rate (500)"
        
        # Check for order value display
        assert "Order Value" in html or "Amount" in html, "Supplier email should show order value section"
        print("PASS: Supplier email shows rate, quantity, and order value")
    
    def test_supplier_email_shows_payment_status(self):
        """Supplier email should show payment status"""
        from email_router import get_seller_order_notification_email
        
        html = get_seller_order_notification_email(SAMPLE_ORDER, SAMPLE_ORDER['items'], SAMPLE_SELLER)
        
        assert "PAID" in html or "Payment" in html, "Supplier email should show payment status"
        print("PASS: Supplier email shows payment status")
    
    def test_supplier_email_shows_dispatch_info(self):
        """Supplier email should show dispatch information"""
        from email_router import get_seller_order_notification_email
        
        html = get_seller_order_notification_email(SAMPLE_ORDER, SAMPLE_ORDER['items'], SAMPLE_SELLER)
        
        assert "Dispatch" in html or "dispatch" in html, "Supplier email should mention dispatch"
        assert "Prepare" in html or "prepare" in html or "pickup" in html, \
            "Supplier email should mention preparation for pickup"
        print("PASS: Supplier email shows dispatch information")


class TestAdminEmailTemplate:
    """Test admin email template content"""
    
    def test_admin_email_contains_customer_phone(self):
        """Admin email SHOULD contain customer phone number"""
        from email_router import get_order_received_admin_email
        
        html = get_order_received_admin_email(SAMPLE_ORDER)
        
        # Check that phone number IS in the email
        assert "+91-9876543210" in html or "9876543210" in html, \
            "Admin email SHOULD contain customer phone number"
        print("PASS: Admin email contains customer phone number")
    
    def test_admin_email_contains_all_customer_info(self):
        """Admin email should contain ALL customer information"""
        from email_router import get_order_received_admin_email
        
        html = get_order_received_admin_email(SAMPLE_ORDER)
        
        # Check all customer fields
        assert "Test Customer" in html, "Admin email should contain customer name"
        assert "customer@test.com" in html, "Admin email should contain customer email"
        assert "Test Company Pvt Ltd" in html, "Admin email should contain company name"
        assert "123 Test Street" in html, "Admin email should contain address"
        assert "Mumbai" in html, "Admin email should contain city"
        assert "Maharashtra" in html, "Admin email should contain state"
        assert "400001" in html, "Admin email should contain pincode"
        print("PASS: Admin email contains all customer information")
    
    def test_admin_email_shows_subtotal_gst_discount_total(self):
        """Admin email should show subtotal, GST, discount, and total breakdown"""
        from email_router import get_order_received_admin_email
        
        html = get_order_received_admin_email(SAMPLE_ORDER)
        
        # Check for financial breakdown
        assert "Subtotal" in html or "subtotal" in html, "Admin email should show subtotal"
        assert "GST" in html or "Tax" in html, "Admin email should show GST/Tax"
        assert "17,875" in html or "17875" in html, "Admin email should show total amount"
        
        # Check for discount if present
        if SAMPLE_ORDER.get('discount', 0) > 0:
            assert "Discount" in html or "discount" in html or "500" in html, \
                "Admin email should show discount when present"
        print("PASS: Admin email shows subtotal, GST, discount, and total breakdown")
    
    def test_admin_email_shows_order_items(self):
        """Admin email should show order items with details"""
        from email_router import get_order_received_admin_email
        
        html = get_order_received_admin_email(SAMPLE_ORDER)
        
        # Check for item names
        assert "Premium Cotton Twill" in html, "Admin email should show fabric name"
        assert "Silk Blend" in html, "Admin email should show fabric name"
        
        # Check for order types
        assert "Bulk" in html or "bulk" in html, "Admin email should show bulk order type"
        assert "Sample" in html or "sample" in html, "Admin email should show sample order type"
        print("PASS: Admin email shows order items with details")


class TestPaymentStatusEndpoint:
    """Test /api/orders/payment-status endpoint"""
    
    def test_payment_status_returns_razorpay_configured(self):
        """GET /api/orders/payment-status should return razorpay_configured: true"""
        response = requests.get(f"{BASE_URL}/api/orders/payment-status")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "razorpay_configured" in data, "Response should contain razorpay_configured field"
        assert data["razorpay_configured"] == True, "razorpay_configured should be True"
        assert data.get("key_id_present") == True, "key_id_present should be True"
        assert data.get("secret_present") == True, "secret_present should be True"
        print(f"PASS: /api/orders/payment-status returns razorpay_configured=True, key_id_prefix={data.get('key_id_prefix')}")


class TestOrderCreateEndpoint:
    """Test /api/orders/create endpoint"""
    
    def test_order_create_endpoint_exists(self):
        """POST /api/orders/create endpoint should exist and accept order data"""
        # Create a minimal test order
        order_payload = {
            "items": [
                {
                    "fabric_id": "test-fabric-001",
                    "fabric_name": "Test Fabric",
                    "fabric_code": "TF-001",
                    "category_name": "Cotton",
                    "seller_company": "Test Seller",
                    "seller_id": "test-seller-001",
                    "quantity": 10,
                    "price_per_meter": 100.0,
                    "order_type": "sample",
                    "image_url": ""
                }
            ],
            "customer": {
                "name": "TEST_Order_Customer",
                "email": "test_order@example.com",
                "phone": "+91-9999999999",
                "company": "Test Company",
                "address": "Test Address",
                "city": "Test City",
                "state": "Test State",
                "pincode": "123456"
            },
            "notes": "Test order from automated testing"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/orders/create",
            json=order_payload,
            headers={"Content-Type": "application/json"}
        )
        
        # Should return 200 with Razorpay order details
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "order_id" in data, "Response should contain order_id"
        assert "order_number" in data, "Response should contain order_number"
        assert "razorpay_order_id" in data, "Response should contain razorpay_order_id"
        assert "razorpay_key_id" in data, "Response should contain razorpay_key_id"
        assert "amount" in data, "Response should contain amount"
        assert data["amount"] > 0, "Amount should be greater than 0"
        
        print(f"PASS: /api/orders/create works - order_number={data['order_number']}, razorpay_order_id={data['razorpay_order_id']}")
        
        # Return order details for potential cleanup
        return data
    
    def test_order_create_validates_empty_items(self):
        """POST /api/orders/create should reject empty items"""
        order_payload = {
            "items": [],
            "customer": {
                "name": "Test",
                "email": "test@test.com",
                "phone": "1234567890"
            }
        }
        
        response = requests.post(
            f"{BASE_URL}/api/orders/create",
            json=order_payload,
            headers={"Content-Type": "application/json"}
        )
        
        assert response.status_code == 400, f"Expected 400 for empty items, got {response.status_code}"
        print("PASS: /api/orders/create rejects empty items with 400")


class TestEmailTemplateStructure:
    """Test email template HTML structure"""
    
    def test_supplier_email_has_proper_html_structure(self):
        """Supplier email should have proper HTML structure"""
        from email_router import get_seller_order_notification_email
        
        html = get_seller_order_notification_email(SAMPLE_ORDER, SAMPLE_ORDER['items'], SAMPLE_SELLER)
        
        assert "<!DOCTYPE html>" in html, "Email should have DOCTYPE"
        assert "<html>" in html, "Email should have html tag"
        assert "<body" in html, "Email should have body tag"
        assert "</html>" in html, "Email should close html tag"
        print("PASS: Supplier email has proper HTML structure")
    
    def test_admin_email_has_proper_html_structure(self):
        """Admin email should have proper HTML structure"""
        from email_router import get_order_received_admin_email
        
        html = get_order_received_admin_email(SAMPLE_ORDER)
        
        assert "<!DOCTYPE html>" in html, "Email should have DOCTYPE"
        assert "<html>" in html, "Email should have html tag"
        assert "<body" in html, "Email should have body tag"
        assert "</html>" in html, "Email should close html tag"
        print("PASS: Admin email has proper HTML structure")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
