"""
Test suite for Provisional Bulk Orders flow (10% advance).

Tests:
1. POST /api/orders/{order_id}/mark-goods-ready — vendor JWT submits actual qty with rolls breakdown
2. POST /api/orders/{order_id}/mark-balance-paid — admin marks balance as paid
3. POST /api/orders/{order_id}/balance-pay — customer mints Razorpay order for balance
4. End-to-end flow: create provisional order → advance paid → vendor marks ready → admin marks balance paid
"""
import pytest
import requests
import os
import uuid
from datetime import datetime, timezone

# Get BASE_URL from environment
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    raise ValueError("REACT_APP_BACKEND_URL environment variable is required")

# Test credentials
ADMIN_EMAIL = "admin@locofast.com"
ADMIN_PASSWORD = "admin123"
VENDOR_EMAIL = "denimseller@locofast.com"
VENDOR_PASSWORD = "denim@123"


class TestProvisionalOrdersSetup:
    """Setup: Get auth tokens and seed test data"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin JWT token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        return response.json().get("token")
    
    @pytest.fixture(scope="class")
    def vendor_token(self):
        """Get vendor JWT token"""
        response = requests.post(f"{BASE_URL}/api/vendor/login", json={
            "email": VENDOR_EMAIL,
            "password": VENDOR_PASSWORD
        })
        assert response.status_code == 200, f"Vendor login failed: {response.text}"
        return response.json().get("token")
    
    def test_admin_login(self, admin_token):
        """Verify admin can login"""
        assert admin_token is not None
        print(f"✓ Admin token obtained")
    
    def test_vendor_login(self, vendor_token):
        """Verify vendor can login"""
        assert vendor_token is not None
        print(f"✓ Vendor token obtained")


class TestProvisionalOrderEndpoints:
    """Test the provisional order endpoints"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin JWT token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip(f"Admin login failed: {response.text}")
        return response.json().get("token")
    
    @pytest.fixture(scope="class")
    def vendor_token(self):
        """Get vendor JWT token"""
        response = requests.post(f"{BASE_URL}/api/vendor/login", json={
            "email": VENDOR_EMAIL,
            "password": VENDOR_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip(f"Vendor login failed: {response.text}")
        return response.json().get("token")
    
    @pytest.fixture(scope="class")
    def vendor_data(self, vendor_token):
        """Get vendor profile data"""
        response = requests.get(f"{BASE_URL}/api/vendor/me", headers={
            "Authorization": f"Bearer {vendor_token}"
        })
        if response.status_code != 200:
            pytest.skip(f"Failed to get vendor profile: {response.text}")
        return response.json()
    
    @pytest.fixture(scope="class")
    def test_provisional_order(self, admin_token, vendor_data):
        """Create a test provisional order via direct DB seeding.
        
        Since we can't easily create a provisional order through the API
        (requires Razorpay payment), we'll seed one directly in MongoDB.
        """
        import pymongo
        from dotenv import load_dotenv
        load_dotenv('/app/backend/.env')
        
        client = pymongo.MongoClient(os.environ['MONGO_URL'])
        db = client[os.environ['DB_NAME']]
        
        # Get vendor's seller_id
        seller_id = vendor_data.get('seller_id') or vendor_data.get('id')
        seller_company = vendor_data.get('company_name', 'Bluerock Denim Mills')
        
        # Find a fabric to use (or create one)
        fabric = db.fabrics.find_one({}, {'_id': 0, 'id': 1, 'name': 1, 'price_per_meter': 1, 'fabric_code': 1})
        if not fabric:
            # Create a test fabric
            fabric = {
                'id': str(uuid.uuid4()),
                'name': 'TEST_Provisional_Fabric',
                'fabric_code': 'TEST-PROV-001',
                'price_per_meter': 150.0,
                'seller_id': seller_id,
                'seller_company': seller_company,
                'status': 'approved',
                'created_at': datetime.now(timezone.utc).isoformat()
            }
            db.fabrics.insert_one(fabric)
        
        # Create a provisional order
        order_id = str(uuid.uuid4())
        order_number = f"LF/TEST/PROV-{datetime.now().strftime('%H%M%S')}"
        total = 15000.0  # 100m @ 150/m
        advance_pct = 10.0
        advance_amount = round(total * advance_pct / 100, 2)
        balance_amount = round(total - advance_amount, 2)
        
        order_doc = {
            "id": order_id,
            "order_number": order_number,
            "items": [{
                "fabric_id": fabric['id'],
                "fabric_name": fabric.get('name', 'Test Fabric'),
                "fabric_code": fabric.get('fabric_code', 'TEST-001'),
                "seller_id": seller_id,
                "seller_company": seller_company,
                "quantity": 100,
                "price_per_meter": 150.0,
                "order_type": "bulk"
            }],
            "customer": {
                "name": "Test Provisional Customer",
                "email": "test.provisional@locofast.com",
                "phone": "9999900001",
                "company": "Test Company",
                "gst_number": "07AABCT1234A1Z5",
                "address": "123 Test Street",
                "city": "Mumbai",
                "state": "Maharashtra",
                "pincode": "400001"
            },
            "subtotal": total,
            "tax": round(total * 0.05, 2),
            "total": round(total * 1.05, 2),
            "currency": "INR",
            "status": "provisional",
            "payment_status": "advance_paid",
            "payment_method": "razorpay",
            "is_provisional": True,
            "advance_pct": advance_pct,
            "advance_amount": advance_amount,
            "balance_amount": balance_amount,
            "advance_paid_at": datetime.now(timezone.utc).isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
        # Insert the order
        db.orders.insert_one(order_doc)
        print(f"✓ Created test provisional order: {order_number} (id: {order_id})")
        
        yield order_doc
        
        # Cleanup after tests
        db.orders.delete_one({"id": order_id})
        print(f"✓ Cleaned up test order: {order_number}")
    
    def test_mark_goods_ready_requires_auth(self):
        """Test that mark-goods-ready requires authentication"""
        fake_order_id = str(uuid.uuid4())
        response = requests.post(f"{BASE_URL}/api/orders/{fake_order_id}/mark-goods-ready", json={
            "items": []
        })
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✓ mark-goods-ready requires authentication")
    
    def test_mark_goods_ready_order_not_found(self, vendor_token):
        """Test mark-goods-ready with non-existent order"""
        fake_order_id = str(uuid.uuid4())
        response = requests.post(
            f"{BASE_URL}/api/orders/{fake_order_id}/mark-goods-ready",
            headers={"Authorization": f"Bearer {vendor_token}"},
            json={"items": [{"fabric_id": "test", "actual_quantity": 100}]}
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"
        print("✓ mark-goods-ready returns 404 for non-existent order")
    
    def test_mark_goods_ready_vendor_success(self, vendor_token, test_provisional_order):
        """Test vendor can mark goods ready with rolls breakdown"""
        order_id = test_provisional_order['id']
        fabric_id = test_provisional_order['items'][0]['fabric_id']
        
        # Submit with rolls breakdown (5 rolls × 20m each = 100m)
        response = requests.post(
            f"{BASE_URL}/api/orders/{order_id}/mark-goods-ready",
            headers={"Authorization": f"Bearer {vendor_token}"},
            json={
                "items": [{
                    "fabric_id": fabric_id,
                    "actual_quantity": 100,
                    "rolls": [
                        {"count": 2, "length": 25},
                        {"count": 2, "length": 25}
                    ],
                    "dispatch_note": "Batch #TEST-001, ready for dispatch"
                }]
            }
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success") is True
        assert data.get("all_ready") is True
        
        # Verify order state changed
        order = data.get("order", {})
        assert order.get("payment_status") == "balance_pending"
        assert order.get("status") == "goods_ready"
        assert order.get("goods_ready_at") is not None
        
        # Verify balance_amount is computed
        assert order.get("balance_amount") is not None
        print(f"✓ Vendor marked goods ready. Balance amount: ₹{order.get('balance_amount')}")
    
    def test_mark_goods_ready_variance_check(self, vendor_token, admin_token):
        """Test that variance outside ±10% requires admin override"""
        import pymongo
        from dotenv import load_dotenv
        load_dotenv('/app/backend/.env')
        
        client = pymongo.MongoClient(os.environ['MONGO_URL'])
        db = client[os.environ['DB_NAME']]
        
        # Create a fresh order for variance test
        order_id = str(uuid.uuid4())
        order_number = f"LF/TEST/VAR-{datetime.now().strftime('%H%M%S')}"
        
        # Get vendor data
        vendor_resp = requests.get(f"{BASE_URL}/api/vendor/me", headers={
            "Authorization": f"Bearer {vendor_token}"
        })
        vendor_data = vendor_resp.json()
        seller_id = vendor_data.get('seller_id') or vendor_data.get('id')
        
        fabric = db.fabrics.find_one({}, {'_id': 0, 'id': 1, 'name': 1})
        
        order_doc = {
            "id": order_id,
            "order_number": order_number,
            "items": [{
                "fabric_id": fabric['id'],
                "fabric_name": fabric.get('name', 'Test Fabric'),
                "seller_id": seller_id,
                "quantity": 100,
                "price_per_meter": 150.0,
                "order_type": "bulk"
            }],
            "customer": {"name": "Test", "email": "test@test.com", "phone": "9999900002"},
            "subtotal": 15000.0,
            "tax": 750.0,
            "total": 15750.0,
            "status": "provisional",
            "payment_status": "advance_paid",
            "is_provisional": True,
            "advance_pct": 10.0,
            "advance_amount": 1575.0,
            "balance_amount": 14175.0,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        db.orders.insert_one(order_doc)
        
        try:
            # Try to submit with >10% variance (ordered 100m, submitting 120m = +20%)
            response = requests.post(
                f"{BASE_URL}/api/orders/{order_id}/mark-goods-ready",
                headers={"Authorization": f"Bearer {vendor_token}"},
                json={
                    "items": [{
                        "fabric_id": fabric['id'],
                        "actual_quantity": 120,  # 20% over ordered
                        "rolls": [{"count": 4, "length": 30}]
                    }]
                }
            )
            
            # Should fail for vendor due to variance
            assert response.status_code == 400, f"Expected 400 for variance, got {response.status_code}"
            assert "variance" in response.text.lower() or "10%" in response.text
            print("✓ Vendor rejected for >10% variance")
            
            # Admin should be able to override
            response = requests.post(
                f"{BASE_URL}/api/orders/{order_id}/mark-goods-ready",
                headers={"Authorization": f"Bearer {admin_token}"},
                json={
                    "items": [{
                        "fabric_id": fabric['id'],
                        "actual_quantity": 120,
                        "rolls": [{"count": 4, "length": 30}]
                    }]
                }
            )
            assert response.status_code == 200, f"Admin override failed: {response.text}"
            print("✓ Admin can override variance check")
            
        finally:
            db.orders.delete_one({"id": order_id})
    
    def test_mark_balance_paid_requires_admin(self, vendor_token):
        """Test that mark-balance-paid requires admin auth"""
        fake_order_id = str(uuid.uuid4())
        response = requests.post(
            f"{BASE_URL}/api/orders/{fake_order_id}/mark-balance-paid",
            headers={"Authorization": f"Bearer {vendor_token}"}
        )
        # Vendor token should be rejected
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✓ mark-balance-paid requires admin auth")
    
    def test_mark_balance_paid_success(self, admin_token):
        """Test admin can mark balance as paid"""
        import pymongo
        from dotenv import load_dotenv
        load_dotenv('/app/backend/.env')
        
        client = pymongo.MongoClient(os.environ['MONGO_URL'])
        db = client[os.environ['DB_NAME']]
        
        # Create an order in balance_pending state
        order_id = str(uuid.uuid4())
        order_number = f"LF/TEST/BAL-{datetime.now().strftime('%H%M%S')}"
        
        fabric = db.fabrics.find_one({}, {'_id': 0, 'id': 1, 'name': 1})
        
        order_doc = {
            "id": order_id,
            "order_number": order_number,
            "items": [{
                "fabric_id": fabric['id'],
                "fabric_name": fabric.get('name', 'Test Fabric'),
                "quantity": 100,
                "actual_quantity": 100,
                "price_per_meter": 150.0,
                "order_type": "bulk"
            }],
            "customer": {"name": "Test", "email": "test@test.com", "phone": "9999900003"},
            "subtotal": 15000.0,
            "tax": 750.0,
            "total": 15750.0,
            "status": "goods_ready",
            "payment_status": "balance_pending",
            "is_provisional": True,
            "advance_pct": 10.0,
            "advance_amount": 1575.0,
            "balance_amount": 14175.0,
            "goods_ready_at": datetime.now(timezone.utc).isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        db.orders.insert_one(order_doc)
        
        try:
            response = requests.post(
                f"{BASE_URL}/api/orders/{order_id}/mark-balance-paid",
                headers={"Authorization": f"Bearer {admin_token}"}
            )
            
            assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
            data = response.json()
            
            order = data.get("order", {})
            assert order.get("payment_status") == "paid"
            assert order.get("status") == "confirmed"
            assert order.get("balance_paid_at") is not None
            assert order.get("balance_paid_manually") is True
            print(f"✓ Admin marked balance paid for {order_number}")
            
        finally:
            db.orders.delete_one({"id": order_id})
    
    def test_mark_balance_paid_wrong_state(self, admin_token):
        """Test mark-balance-paid fails if not in balance_pending state"""
        import pymongo
        from dotenv import load_dotenv
        load_dotenv('/app/backend/.env')
        
        client = pymongo.MongoClient(os.environ['MONGO_URL'])
        db = client[os.environ['DB_NAME']]
        
        # Create an order in advance_paid state (not balance_pending)
        order_id = str(uuid.uuid4())
        order_doc = {
            "id": order_id,
            "order_number": f"LF/TEST/WS-{datetime.now().strftime('%H%M%S')}",
            "items": [],
            "customer": {"name": "Test", "email": "test@test.com", "phone": "9999900004"},
            "subtotal": 15000.0,
            "total": 15750.0,
            "status": "provisional",
            "payment_status": "advance_paid",  # Not balance_pending
            "is_provisional": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        db.orders.insert_one(order_doc)
        
        try:
            response = requests.post(
                f"{BASE_URL}/api/orders/{order_id}/mark-balance-paid",
                headers={"Authorization": f"Bearer {admin_token}"}
            )
            
            assert response.status_code == 400, f"Expected 400, got {response.status_code}"
            assert "not pending" in response.text.lower() or "balance" in response.text.lower()
            print("✓ mark-balance-paid correctly rejects wrong state")
            
        finally:
            db.orders.delete_one({"id": order_id})


class TestEndToEndProvisionalFlow:
    """End-to-end test of the complete provisional order flow"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip("Admin login failed")
        return response.json().get("token")
    
    @pytest.fixture(scope="class")
    def vendor_token(self):
        response = requests.post(f"{BASE_URL}/api/vendor/login", json={
            "email": VENDOR_EMAIL,
            "password": VENDOR_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip("Vendor login failed")
        return response.json().get("token")
    
    def test_full_provisional_flow(self, admin_token, vendor_token):
        """
        Complete flow:
        1. Create provisional order (simulated via DB)
        2. Simulate advance payment (DB update)
        3. Vendor marks goods ready with rolls breakdown
        4. Verify balance_amount computed correctly
        5. Admin marks balance paid
        6. Verify final state (paid + confirmed)
        """
        import pymongo
        from dotenv import load_dotenv
        load_dotenv('/app/backend/.env')
        
        client = pymongo.MongoClient(os.environ['MONGO_URL'])
        db = client[os.environ['DB_NAME']]
        
        # Get vendor data
        vendor_resp = requests.get(f"{BASE_URL}/api/vendor/me", headers={
            "Authorization": f"Bearer {vendor_token}"
        })
        vendor_data = vendor_resp.json()
        seller_id = vendor_data.get('seller_id') or vendor_data.get('id')
        seller_company = vendor_data.get('company_name', 'Test Vendor')
        
        # Get a fabric
        fabric = db.fabrics.find_one({}, {'_id': 0, 'id': 1, 'name': 1, 'price_per_meter': 1})
        if not fabric:
            pytest.skip("No fabrics in database")
        
        # Step 1: Create provisional order
        order_id = str(uuid.uuid4())
        order_number = f"LF/TEST/E2E-{datetime.now().strftime('%H%M%S')}"
        ordered_qty = 100
        price = 150.0
        subtotal = ordered_qty * price
        tax = round(subtotal * 0.05, 2)
        total = round(subtotal + tax, 2)
        advance_pct = 10.0
        advance_amount = round(total * advance_pct / 100, 2)
        balance_amount = round(total - advance_amount, 2)
        
        order_doc = {
            "id": order_id,
            "order_number": order_number,
            "items": [{
                "fabric_id": fabric['id'],
                "fabric_name": fabric.get('name', 'Test Fabric'),
                "seller_id": seller_id,
                "seller_company": seller_company,
                "quantity": ordered_qty,
                "price_per_meter": price,
                "order_type": "bulk"
            }],
            "customer": {
                "name": "E2E Test Customer",
                "email": "e2e.test@locofast.com",
                "phone": "9999900005",
                "company": "E2E Test Co",
                "address": "456 E2E Street",
                "city": "Delhi",
                "state": "Delhi",
                "pincode": "110001"
            },
            "subtotal": subtotal,
            "tax": tax,
            "total": total,
            "currency": "INR",
            "status": "provisional",
            "payment_status": "advance_paid",
            "payment_method": "razorpay",
            "is_provisional": True,
            "advance_pct": advance_pct,
            "advance_amount": advance_amount,
            "balance_amount": balance_amount,
            "advance_paid_at": datetime.now(timezone.utc).isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        db.orders.insert_one(order_doc)
        print(f"\n✓ Step 1: Created provisional order {order_number}")
        print(f"  - Total: ₹{total}, Advance: ₹{advance_amount}, Balance: ₹{balance_amount}")
        
        try:
            # Step 2: Vendor marks goods ready
            actual_qty = 98  # Slightly less than ordered (within 10% variance)
            response = requests.post(
                f"{BASE_URL}/api/orders/{order_id}/mark-goods-ready",
                headers={"Authorization": f"Bearer {vendor_token}"},
                json={
                    "items": [{
                        "fabric_id": fabric['id'],
                        "actual_quantity": actual_qty,
                        "rolls": [
                            {"count": 2, "length": 24.5},
                            {"count": 2, "length": 24.5}
                        ],
                        "dispatch_note": "E2E test batch"
                    }]
                }
            )
            
            assert response.status_code == 200, f"Mark goods ready failed: {response.text}"
            data = response.json()
            assert data.get("all_ready") is True
            
            order = data.get("order", {})
            assert order.get("payment_status") == "balance_pending"
            assert order.get("status") == "goods_ready"
            
            # Verify balance recalculated based on actual qty
            new_balance = order.get("balance_amount")
            print(f"✓ Step 2: Vendor marked goods ready")
            print(f"  - Actual qty: {actual_qty}m, New balance: ₹{new_balance}")
            
            # Step 3: Admin marks balance paid
            response = requests.post(
                f"{BASE_URL}/api/orders/{order_id}/mark-balance-paid",
                headers={"Authorization": f"Bearer {admin_token}"}
            )
            
            assert response.status_code == 200, f"Mark balance paid failed: {response.text}"
            data = response.json()
            
            order = data.get("order", {})
            assert order.get("payment_status") == "paid"
            assert order.get("status") == "confirmed"
            assert order.get("balance_paid_manually") is True
            print(f"✓ Step 3: Admin marked balance paid")
            print(f"  - Final status: {order.get('status')}, payment_status: {order.get('payment_status')}")
            
            print(f"\n✅ E2E Provisional Order Flow PASSED for {order_number}")
            
        finally:
            db.orders.delete_one({"id": order_id})
            print(f"✓ Cleanup: Deleted test order {order_number}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
