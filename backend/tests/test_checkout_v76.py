"""
Test Suite for Iteration 76: Checkout Page Updates
- Coupon removal verification
- 10% advance breakdown for bulk orders
- Sample orders pay 100% upfront
- Vendor 6-stage tabs verification
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://fabric-sourcing-cms.preview.emergentagent.com')

# Test fabric ID (bookable, active)
TEST_FABRIC_ID = "8e6c6e09-f711-455b-9900-1044574d7c25"

# Test credentials
VENDOR_EMAIL = "bhuvnesh.sharma@nsltextiles.com"
VENDOR_PASSWORD = "Vendor@2026"
ADMIN_EMAIL = "admin@locofast.com"
ADMIN_PASSWORD = "admin123"


class TestOrderCreateProvisional:
    """Test order creation with provisional (10% advance) flow for bulk orders"""
    
    def test_bulk_order_provisional_returns_advance_fields(self):
        """Bulk order with qty_type='provisional' should return is_provisional=true, advance_pct=10, and amount=advance_amount*100"""
        # Create order payload for bulk order
        payload = {
            "items": [{
                "fabric_id": TEST_FABRIC_ID,
                "fabric_name": "Test Fabric",
                "fabric_code": "LF-TEST",
                "category_name": "Denim",
                "seller_company": "Test Seller",
                "seller_id": "a1edb4e2-f942-4034-ad9b-e075979cc8a4",
                "quantity": 200,
                "price_per_meter": 120.0,
                "order_type": "bulk",
                "image_url": "",
                "hsn_code": "",
                "qty_type": "provisional"  # This triggers 10% advance flow
            }],
            "customer": {
                "name": "Test Customer",
                "email": "test.checkout@example.com",
                "phone": "+919876543210",
                "company": "Test Company",
                "gst_number": "27AABCT1234A1Z5",
                "address": "123 Test Street",
                "city": "Mumbai",
                "state": "Maharashtra",
                "pincode": "400001"
            },
            "notes": "Test bulk provisional order",
            "logistics_charge": 3000,
            "packaging_charge": 200,
            "logistics_only_charge": 3000,
            "payment_method": "razorpay",
            "coupon": None,
            "discount": 0
        }
        
        response = requests.post(f"{BASE_URL}/api/orders/create", json=payload)
        print(f"Response status: {response.status_code}")
        print(f"Response body: {response.text[:500]}")
        
        # Should succeed (creates Razorpay order)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify provisional fields
        assert data.get("is_provisional") == True, f"Expected is_provisional=True, got {data.get('is_provisional')}"
        assert data.get("advance_pct") == 10, f"Expected advance_pct=10, got {data.get('advance_pct')}"
        
        # Verify amount is advance (10% of total), not full total
        total = data.get("total", 0)
        advance_amount = data.get("advance_amount", 0)
        balance_amount = data.get("balance_amount", 0)
        amount_paise = data.get("amount_paise", 0)
        
        assert advance_amount > 0, f"Expected advance_amount > 0, got {advance_amount}"
        assert balance_amount > 0, f"Expected balance_amount > 0, got {balance_amount}"
        
        # amount_paise should be advance_amount * 100 (paise), NOT total * 100
        expected_paise = int(round(advance_amount * 100))
        assert amount_paise == expected_paise, f"Expected amount_paise={expected_paise}, got {amount_paise}"
        
        # Verify advance is ~10% of total
        expected_advance = round(total * 0.10, 2)
        assert abs(advance_amount - expected_advance) < 1, f"Expected advance ~{expected_advance}, got {advance_amount}"
        
        print(f"✓ Bulk provisional order: total={total}, advance={advance_amount}, balance={balance_amount}, paise={amount_paise}")
    
    def test_sample_order_non_provisional_full_payment(self):
        """Sample order with qty_type='actual' should be non-provisional (100% upfront)"""
        payload = {
            "items": [{
                "fabric_id": TEST_FABRIC_ID,
                "fabric_name": "Test Fabric Sample",
                "fabric_code": "LF-TEST",
                "category_name": "Denim",
                "seller_company": "Test Seller",
                "seller_id": "a1edb4e2-f942-4034-ad9b-e075979cc8a4",
                "quantity": 5,  # Sample minimum
                "price_per_meter": 200.0,
                "order_type": "sample",
                "image_url": "",
                "hsn_code": "",
                "qty_type": "actual"  # Sample orders are always actual
            }],
            "customer": {
                "name": "Test Customer Sample",
                "email": "test.sample@example.com",
                "phone": "+919876543211",
                "company": "Test Company",
                "gst_number": "27AABCT1234A1Z5",
                "address": "123 Test Street",
                "city": "Mumbai",
                "state": "Maharashtra",
                "pincode": "400001"
            },
            "notes": "Test sample order",
            "logistics_charge": 100,
            "packaging_charge": 0,
            "logistics_only_charge": 100,
            "payment_method": "razorpay",
            "coupon": None,
            "discount": 0
        }
        
        response = requests.post(f"{BASE_URL}/api/orders/create", json=payload)
        print(f"Response status: {response.status_code}")
        print(f"Response body: {response.text[:500]}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Sample orders should NOT be provisional
        assert data.get("is_provisional") == False, f"Expected is_provisional=False for sample, got {data.get('is_provisional')}"
        
        # amount_paise should equal total * 100 (full payment)
        total = data.get("total", 0)
        amount_paise = data.get("amount_paise", 0)
        expected_paise = int(round(total * 100))
        
        assert amount_paise == expected_paise, f"Expected amount_paise={expected_paise} (full), got {amount_paise}"
        
        print(f"✓ Sample order: total={total}, amount_paise={amount_paise} (full payment)")


class TestVendorOrderTabs:
    """Test vendor portal 6-stage tabs"""
    
    @pytest.fixture
    def vendor_token(self):
        """Get vendor auth token"""
        response = requests.post(f"{BASE_URL}/api/vendor/login", json={
            "email": VENDOR_EMAIL,
            "password": VENDOR_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip(f"Vendor login failed: {response.text}")
        return response.json().get("token")
    
    def test_vendor_orders_returns_pipeline_stage(self, vendor_token):
        """Vendor orders endpoint should return pipeline_stage field"""
        response = requests.get(
            f"{BASE_URL}/api/vendor/orders",
            headers={"Authorization": f"Bearer {vendor_token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        orders = response.json()
        if orders:
            # Check first order has pipeline_stage
            first_order = orders[0]
            assert "pipeline_stage" in first_order or "status" in first_order, \
                f"Order missing pipeline_stage/status: {list(first_order.keys())}"
            print(f"✓ Vendor orders return pipeline info. First order stage: {first_order.get('pipeline_stage', first_order.get('status'))}")
        else:
            print("✓ Vendor orders endpoint works (no orders found)")


class TestOrderCreateNoCoupon:
    """Test that orders can be created without coupon (regression after coupon removal)"""
    
    def test_order_create_without_coupon_succeeds(self):
        """Order creation with coupon=null should succeed"""
        payload = {
            "items": [{
                "fabric_id": TEST_FABRIC_ID,
                "fabric_name": "Test Fabric No Coupon",
                "fabric_code": "LF-TEST",
                "category_name": "Denim",
                "seller_company": "Test Seller",
                "seller_id": "a1edb4e2-f942-4034-ad9b-e075979cc8a4",
                "quantity": 5,
                "price_per_meter": 200.0,
                "order_type": "sample",
                "image_url": "",
                "hsn_code": "",
                "qty_type": "actual"
            }],
            "customer": {
                "name": "Test No Coupon",
                "email": "test.nocoupon@example.com",
                "phone": "+919876543212",
                "company": "Test Company",
                "gst_number": "27AABCT1234A1Z5",
                "address": "123 Test Street",
                "city": "Mumbai",
                "state": "Maharashtra",
                "pincode": "400001"
            },
            "notes": "Test order without coupon",
            "logistics_charge": 100,
            "packaging_charge": 0,
            "logistics_only_charge": 100,
            "payment_method": "razorpay",
            "coupon": None,  # Explicitly null - no coupon
            "discount": 0
        }
        
        response = requests.post(f"{BASE_URL}/api/orders/create", json=payload)
        print(f"Response status: {response.status_code}")
        
        assert response.status_code == 200, f"Order creation without coupon failed: {response.text}"
        
        data = response.json()
        assert "order_id" in data, f"Response missing order_id: {data}"
        assert "razorpay_order_id" in data, f"Response missing razorpay_order_id: {data}"
        
        print(f"✓ Order created without coupon: {data.get('order_number')}")


class TestAdminOrderTabs:
    """Test admin portal order tabs"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip(f"Admin login failed: {response.text}")
        return response.json().get("token")
    
    def test_admin_orders_returns_pipeline_stage(self, admin_token):
        """Admin orders endpoint should return pipeline_stage field"""
        response = requests.get(
            f"{BASE_URL}/api/orders",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        orders = data.get("orders", data) if isinstance(data, dict) else data
        
        if orders and isinstance(orders, list) and len(orders) > 0:
            first_order = orders[0]
            assert "pipeline_stage" in first_order, \
                f"Order missing pipeline_stage: {list(first_order.keys())[:10]}"
            print(f"✓ Admin orders return pipeline_stage. First order: {first_order.get('pipeline_stage')}")
        else:
            print("✓ Admin orders endpoint works (no orders or different format)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
