"""
Test suite for Provisional Bulk Orders - Invoice & Payout Extensions (Iteration 69)

Tests:
1. POST /api/orders/{order_id}/mark-goods-ready — vendor_invoice required for vendor caller
2. POST /api/orders/{order_id}/mark-goods-ready — admin can skip vendor_invoice (override path)
3. vendor_invoices array persisted on order with correct structure
4. materialize_payouts_for_order uses actual_quantity (not ordered quantity)
5. Payout doc carries vendor_invoice_* fields when order has vendor_invoices entry
6. Non-provisional orders: no actual_quantity → qty falls back to ordered quantity
7. Legacy upload via /api/vendor/payouts/{id}/upload-invoice still functional
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


class TestVendorInvoiceRequirement:
    """Test that vendor_invoice is required for vendor caller on mark-goods-ready"""
    
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
    def test_order_for_invoice(self, admin_token, vendor_data):
        """Create a test provisional order for invoice testing"""
        import pymongo
        from dotenv import load_dotenv
        load_dotenv('/app/backend/.env')
        
        client = pymongo.MongoClient(os.environ['MONGO_URL'])
        db = client[os.environ['DB_NAME']]
        
        seller_id = vendor_data.get('seller_id') or vendor_data.get('id')
        seller_company = vendor_data.get('company_name', 'Bluerock Denim Mills')
        
        fabric = db.fabrics.find_one({}, {'_id': 0, 'id': 1, 'name': 1, 'price_per_meter': 1, 'fabric_code': 1})
        if not fabric:
            fabric = {
                'id': str(uuid.uuid4()),
                'name': 'TEST_Invoice_Fabric',
                'fabric_code': 'TEST-INV-001',
                'price_per_meter': 200.0,
                'seller_id': seller_id,
                'seller_company': seller_company,
                'status': 'approved',
                'created_at': datetime.now(timezone.utc).isoformat()
            }
            db.fabrics.insert_one(fabric)
        
        order_id = str(uuid.uuid4())
        order_number = f"LF/TEST/INV-{datetime.now().strftime('%H%M%S')}"
        total = 20000.0  # 100m @ 200/m
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
                "price_per_meter": 200.0,
                "order_type": "bulk"
            }],
            "customer": {
                "name": "Test Invoice Customer",
                "email": "test.invoice@locofast.com",
                "phone": "9999900010",
                "company": "Test Invoice Co",
                "gst_number": "07AABCT1234A1Z5",
                "address": "123 Invoice Street",
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
        
        db.orders.insert_one(order_doc)
        print(f"✓ Created test order for invoice testing: {order_number}")
        
        yield order_doc
        
        # Cleanup
        db.orders.delete_one({"id": order_id})
        db.vendor_payouts.delete_many({"order_id": order_id})
        print(f"✓ Cleaned up test order: {order_number}")
    
    def test_vendor_mark_ready_without_invoice_fails(self, vendor_token, test_order_for_invoice):
        """Test that vendor cannot mark goods ready without invoice"""
        order_id = test_order_for_invoice['id']
        fabric_id = test_order_for_invoice['items'][0]['fabric_id']
        
        # Try to submit WITHOUT vendor_invoice
        response = requests.post(
            f"{BASE_URL}/api/orders/{order_id}/mark-goods-ready",
            headers={"Authorization": f"Bearer {vendor_token}"},
            json={
                "items": [{
                    "fabric_id": fabric_id,
                    "actual_quantity": 100,
                    "rolls": [{"count": 4, "length": 25}]
                }]
                # No vendor_invoice!
            }
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        assert "invoice" in response.text.lower(), f"Error should mention invoice: {response.text}"
        print("✓ Vendor rejected when no invoice provided")
    
    def test_vendor_mark_ready_missing_invoice_number_fails(self, vendor_token, test_order_for_invoice):
        """Test that vendor cannot mark goods ready with incomplete invoice (missing invoice_number)"""
        order_id = test_order_for_invoice['id']
        fabric_id = test_order_for_invoice['items'][0]['fabric_id']
        
        response = requests.post(
            f"{BASE_URL}/api/orders/{order_id}/mark-goods-ready",
            headers={"Authorization": f"Bearer {vendor_token}"},
            json={
                "items": [{
                    "fabric_id": fabric_id,
                    "actual_quantity": 100,
                    "rolls": [{"count": 4, "length": 25}]
                }],
                "vendor_invoice": {
                    "url": "https://res.cloudinary.com/test/raw/upload/invoice.pdf",
                    # Missing invoice_number
                    "invoice_date": "2026-01-15"
                }
            }
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        assert "invoice" in response.text.lower(), f"Error should mention invoice: {response.text}"
        print("✓ Vendor rejected when invoice_number missing")
    
    def test_vendor_mark_ready_missing_invoice_date_fails(self, vendor_token, test_order_for_invoice):
        """Test that vendor cannot mark goods ready with incomplete invoice (missing invoice_date)"""
        order_id = test_order_for_invoice['id']
        fabric_id = test_order_for_invoice['items'][0]['fabric_id']
        
        response = requests.post(
            f"{BASE_URL}/api/orders/{order_id}/mark-goods-ready",
            headers={"Authorization": f"Bearer {vendor_token}"},
            json={
                "items": [{
                    "fabric_id": fabric_id,
                    "actual_quantity": 100,
                    "rolls": [{"count": 4, "length": 25}]
                }],
                "vendor_invoice": {
                    "url": "https://res.cloudinary.com/test/raw/upload/invoice.pdf",
                    "invoice_number": "INV-2026-001",
                    # Missing invoice_date
                }
            }
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        assert "invoice" in response.text.lower(), f"Error should mention invoice: {response.text}"
        print("✓ Vendor rejected when invoice_date missing")
    
    def test_vendor_mark_ready_missing_url_fails(self, vendor_token, test_order_for_invoice):
        """Test that vendor cannot mark goods ready with incomplete invoice (missing url)"""
        order_id = test_order_for_invoice['id']
        fabric_id = test_order_for_invoice['items'][0]['fabric_id']
        
        response = requests.post(
            f"{BASE_URL}/api/orders/{order_id}/mark-goods-ready",
            headers={"Authorization": f"Bearer {vendor_token}"},
            json={
                "items": [{
                    "fabric_id": fabric_id,
                    "actual_quantity": 100,
                    "rolls": [{"count": 4, "length": 25}]
                }],
                "vendor_invoice": {
                    # Missing url
                    "invoice_number": "INV-2026-001",
                    "invoice_date": "2026-01-15"
                }
            }
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        assert "invoice" in response.text.lower(), f"Error should mention invoice: {response.text}"
        print("✓ Vendor rejected when invoice url missing")


class TestAdminOverridePath:
    """Test that admin can mark goods ready without invoice (override path)"""
    
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
    
    @pytest.fixture(scope="class")
    def vendor_data(self, vendor_token):
        response = requests.get(f"{BASE_URL}/api/vendor/me", headers={
            "Authorization": f"Bearer {vendor_token}"
        })
        if response.status_code != 200:
            pytest.skip("Failed to get vendor profile")
        return response.json()
    
    def test_admin_can_mark_ready_without_invoice(self, admin_token, vendor_data):
        """Test that admin can mark goods ready without providing invoice"""
        import pymongo
        from dotenv import load_dotenv
        load_dotenv('/app/backend/.env')
        
        client = pymongo.MongoClient(os.environ['MONGO_URL'])
        db = client[os.environ['DB_NAME']]
        
        seller_id = vendor_data.get('seller_id') or vendor_data.get('id')
        fabric = db.fabrics.find_one({}, {'_id': 0, 'id': 1, 'name': 1})
        
        order_id = str(uuid.uuid4())
        order_number = f"LF/TEST/ADM-{datetime.now().strftime('%H%M%S')}"
        
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
            "customer": {"name": "Test", "email": "test@test.com", "phone": "9999900011"},
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
            # Admin submits WITHOUT vendor_invoice
            response = requests.post(
                f"{BASE_URL}/api/orders/{order_id}/mark-goods-ready",
                headers={"Authorization": f"Bearer {admin_token}"},
                json={
                    "items": [{
                        "fabric_id": fabric['id'],
                        "actual_quantity": 100,
                        "rolls": [{"count": 4, "length": 25}]
                    }]
                    # No vendor_invoice - admin override
                }
            )
            
            assert response.status_code == 200, f"Admin should succeed without invoice: {response.text}"
            data = response.json()
            assert data.get("success") is True
            print("✓ Admin can mark goods ready without invoice (override path)")
            
        finally:
            db.orders.delete_one({"id": order_id})


class TestVendorInvoicePersistence:
    """Test that vendor_invoices array is correctly persisted on order"""
    
    @pytest.fixture(scope="class")
    def vendor_token(self):
        response = requests.post(f"{BASE_URL}/api/vendor/login", json={
            "email": VENDOR_EMAIL,
            "password": VENDOR_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip("Vendor login failed")
        return response.json().get("token")
    
    @pytest.fixture(scope="class")
    def vendor_data(self, vendor_token):
        response = requests.get(f"{BASE_URL}/api/vendor/me", headers={
            "Authorization": f"Bearer {vendor_token}"
        })
        if response.status_code != 200:
            pytest.skip("Failed to get vendor profile")
        return response.json()
    
    def test_vendor_invoice_persisted_on_order(self, vendor_token, vendor_data):
        """Test that vendor_invoices array is persisted with correct structure"""
        import pymongo
        from dotenv import load_dotenv
        load_dotenv('/app/backend/.env')
        
        client = pymongo.MongoClient(os.environ['MONGO_URL'])
        db = client[os.environ['DB_NAME']]
        
        seller_id = vendor_data.get('seller_id') or vendor_data.get('id')
        fabric = db.fabrics.find_one({}, {'_id': 0, 'id': 1, 'name': 1})
        
        order_id = str(uuid.uuid4())
        order_number = f"LF/TEST/INVP-{datetime.now().strftime('%H%M%S')}"
        
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
            "customer": {"name": "Test", "email": "test@test.com", "phone": "9999900012"},
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
            # Vendor submits with complete invoice
            test_invoice = {
                "url": "https://res.cloudinary.com/test/raw/upload/v1234/invoice_test.pdf",
                "filename": "invoice_test.pdf",
                "invoice_number": "INV-2026-TEST-001",
                "invoice_date": "2026-01-15",
                "amount": 15750.0
            }
            
            response = requests.post(
                f"{BASE_URL}/api/orders/{order_id}/mark-goods-ready",
                headers={"Authorization": f"Bearer {vendor_token}"},
                json={
                    "items": [{
                        "fabric_id": fabric['id'],
                        "actual_quantity": 100,
                        "rolls": [{"count": 4, "length": 25}]
                    }],
                    "vendor_invoice": test_invoice
                }
            )
            
            assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
            
            # Verify the order has vendor_invoices array
            updated_order = db.orders.find_one({"id": order_id}, {"_id": 0})
            assert "vendor_invoices" in updated_order, "vendor_invoices should be on order"
            
            invoices = updated_order["vendor_invoices"]
            assert len(invoices) == 1, f"Should have 1 invoice, got {len(invoices)}"
            
            inv = invoices[0]
            assert inv["seller_id"] == seller_id, f"seller_id mismatch: {inv['seller_id']} != {seller_id}"
            assert inv["url"] == test_invoice["url"], "url mismatch"
            assert inv["filename"] == test_invoice["filename"], "filename mismatch"
            assert inv["invoice_number"] == test_invoice["invoice_number"], "invoice_number mismatch"
            assert inv["invoice_date"] == test_invoice["invoice_date"], "invoice_date mismatch"
            assert inv["amount"] == test_invoice["amount"], "amount mismatch"
            assert "uploaded_at" in inv, "uploaded_at should be present"
            
            print(f"✓ vendor_invoices persisted correctly: {inv}")
            
        finally:
            db.orders.delete_one({"id": order_id})


class TestPayoutActualQuantity:
    """Test that materialize_payouts uses actual_quantity for gross/commission calculation"""
    
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
    
    @pytest.fixture(scope="class")
    def vendor_data(self, vendor_token):
        response = requests.get(f"{BASE_URL}/api/vendor/me", headers={
            "Authorization": f"Bearer {vendor_token}"
        })
        if response.status_code != 200:
            pytest.skip("Failed to get vendor profile")
        return response.json()
    
    def test_payout_uses_actual_quantity(self, admin_token, vendor_token, vendor_data):
        """Test that payout gross = actual_quantity × rate (not ordered quantity)"""
        import pymongo
        from dotenv import load_dotenv
        load_dotenv('/app/backend/.env')
        
        client = pymongo.MongoClient(os.environ['MONGO_URL'])
        db = client[os.environ['DB_NAME']]
        
        seller_id = vendor_data.get('seller_id') or vendor_data.get('id')
        fabric = db.fabrics.find_one({}, {'_id': 0, 'id': 1, 'name': 1})
        
        order_id = str(uuid.uuid4())
        order_number = f"LF/TEST/AQ-{datetime.now().strftime('%H%M%S')}"
        
        # Order 100m @ 150/m
        ordered_qty = 100
        rate = 150.0
        
        order_doc = {
            "id": order_id,
            "order_number": order_number,
            "items": [{
                "fabric_id": fabric['id'],
                "fabric_name": fabric.get('name', 'Test Fabric'),
                "seller_id": seller_id,
                "quantity": ordered_qty,
                "price_per_meter": rate,
                "order_type": "bulk"
            }],
            "customer": {"name": "Test", "email": "test@test.com", "phone": "9999900013"},
            "subtotal": ordered_qty * rate,
            "tax": round(ordered_qty * rate * 0.05, 2),
            "total": round(ordered_qty * rate * 1.05, 2),
            "status": "provisional",
            "payment_status": "advance_paid",
            "is_provisional": True,
            "advance_pct": 10.0,
            "advance_amount": round(ordered_qty * rate * 1.05 * 0.1, 2),
            "balance_amount": round(ordered_qty * rate * 1.05 * 0.9, 2),
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        db.orders.insert_one(order_doc)
        
        try:
            # Vendor marks goods ready with actual_quantity = 92 (within ±10% variance of 100)
            # 92 is 8% less than 100, which is within the allowed ±10% variance
            actual_qty = 92
            
            response = requests.post(
                f"{BASE_URL}/api/orders/{order_id}/mark-goods-ready",
                headers={"Authorization": f"Bearer {vendor_token}"},
                json={
                    "items": [{
                        "fabric_id": fabric['id'],
                        "actual_quantity": actual_qty,
                        "rolls": [{"count": 4, "length": 23}]  # 4 × 23 = 92m
                    }],
                    "vendor_invoice": {
                        "url": "https://res.cloudinary.com/test/raw/upload/invoice_aq.pdf",
                        "invoice_number": "INV-AQ-001",
                        "invoice_date": "2026-01-15",
                        "amount": actual_qty * rate * 1.05
                    }
                }
            )
            
            assert response.status_code == 200, f"Mark goods ready failed: {response.text}"
            
            # Now admin marks balance paid to trigger payout materialization
            response = requests.post(
                f"{BASE_URL}/api/orders/{order_id}/mark-balance-paid",
                headers={"Authorization": f"Bearer {admin_token}"}
            )
            
            assert response.status_code == 200, f"Mark balance paid failed: {response.text}"
            
            # Check the payout
            payout = db.vendor_payouts.find_one({"order_id": order_id}, {"_id": 0})
            assert payout is not None, "Payout should be materialized"
            
            # Verify payout uses actual_quantity
            items = payout.get("items", [])
            assert len(items) == 1, f"Should have 1 item, got {len(items)}"
            
            payout_item = items[0]
            assert payout_item["quantity"] == actual_qty, f"Payout qty should be {actual_qty}, got {payout_item['quantity']}"
            
            expected_gross = actual_qty * rate
            assert payout_item["gross"] == expected_gross, f"Payout gross should be {expected_gross}, got {payout_item['gross']}"
            
            # Verify gross_subtotal on payout doc
            assert payout["gross_subtotal"] == expected_gross, f"gross_subtotal should be {expected_gross}, got {payout['gross_subtotal']}"
            
            print(f"✓ Payout uses actual_quantity: qty={payout_item['quantity']}, gross={payout_item['gross']}")
            print(f"  (ordered={ordered_qty}, actual={actual_qty}, rate={rate})")
            print(f"  Note: actual_qty=92 is within ±10% variance of ordered_qty=100")
            
        finally:
            db.orders.delete_one({"id": order_id})
            db.vendor_payouts.delete_many({"order_id": order_id})


class TestPayoutVendorInvoiceFields:
    """Test that payout doc carries vendor_invoice_* fields from order.vendor_invoices"""
    
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
    
    @pytest.fixture(scope="class")
    def vendor_data(self, vendor_token):
        response = requests.get(f"{BASE_URL}/api/vendor/me", headers={
            "Authorization": f"Bearer {vendor_token}"
        })
        if response.status_code != 200:
            pytest.skip("Failed to get vendor profile")
        return response.json()
    
    def test_payout_carries_vendor_invoice_fields(self, admin_token, vendor_token, vendor_data):
        """Test that payout doc has vendor_invoice_* fields when order has vendor_invoices"""
        import pymongo
        from dotenv import load_dotenv
        load_dotenv('/app/backend/.env')
        
        client = pymongo.MongoClient(os.environ['MONGO_URL'])
        db = client[os.environ['DB_NAME']]
        
        seller_id = vendor_data.get('seller_id') or vendor_data.get('id')
        fabric = db.fabrics.find_one({}, {'_id': 0, 'id': 1, 'name': 1})
        
        order_id = str(uuid.uuid4())
        order_number = f"LF/TEST/PINV-{datetime.now().strftime('%H%M%S')}"
        
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
            "customer": {"name": "Test", "email": "test@test.com", "phone": "9999900014"},
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
            # Vendor marks goods ready with invoice
            test_invoice = {
                "url": "https://res.cloudinary.com/test/raw/upload/payout_invoice.pdf",
                "filename": "payout_invoice.pdf",
                "invoice_number": "INV-PAYOUT-001",
                "invoice_date": "2026-01-15",
                "amount": 15750.0
            }
            
            response = requests.post(
                f"{BASE_URL}/api/orders/{order_id}/mark-goods-ready",
                headers={"Authorization": f"Bearer {vendor_token}"},
                json={
                    "items": [{
                        "fabric_id": fabric['id'],
                        "actual_quantity": 100,
                        "rolls": [{"count": 4, "length": 25}]
                    }],
                    "vendor_invoice": test_invoice
                }
            )
            
            assert response.status_code == 200, f"Mark goods ready failed: {response.text}"
            
            # Admin marks balance paid to trigger payout materialization
            response = requests.post(
                f"{BASE_URL}/api/orders/{order_id}/mark-balance-paid",
                headers={"Authorization": f"Bearer {admin_token}"}
            )
            
            assert response.status_code == 200, f"Mark balance paid failed: {response.text}"
            
            # Check the payout has vendor_invoice_* fields
            payout = db.vendor_payouts.find_one({"order_id": order_id}, {"_id": 0})
            assert payout is not None, "Payout should be materialized"
            
            # Verify vendor_invoice_* fields
            assert payout.get("vendor_invoice_url") == test_invoice["url"], f"vendor_invoice_url mismatch"
            assert payout.get("vendor_invoice_filename") == test_invoice["filename"], f"vendor_invoice_filename mismatch"
            assert payout.get("vendor_invoice_number") == test_invoice["invoice_number"], f"vendor_invoice_number mismatch"
            assert payout.get("vendor_invoice_date") == test_invoice["invoice_date"], f"vendor_invoice_date mismatch"
            assert payout.get("vendor_invoice_amount") == test_invoice["amount"], f"vendor_invoice_amount mismatch"
            assert payout.get("vendor_invoice_status") == "uploaded", f"vendor_invoice_status should be 'uploaded'"
            assert payout.get("vendor_invoice_source") == "mark_goods_ready", f"vendor_invoice_source should be 'mark_goods_ready'"
            assert "vendor_invoice_uploaded_at" in payout, "vendor_invoice_uploaded_at should be present"
            
            print(f"✓ Payout carries vendor_invoice_* fields:")
            print(f"  - vendor_invoice_url: {payout.get('vendor_invoice_url')}")
            print(f"  - vendor_invoice_number: {payout.get('vendor_invoice_number')}")
            print(f"  - vendor_invoice_status: {payout.get('vendor_invoice_status')}")
            print(f"  - vendor_invoice_source: {payout.get('vendor_invoice_source')}")
            
        finally:
            db.orders.delete_one({"id": order_id})
            db.vendor_payouts.delete_many({"order_id": order_id})


class TestNonProvisionalFallback:
    """Test that non-provisional orders fall back to ordered quantity"""
    
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
    
    @pytest.fixture(scope="class")
    def vendor_data(self, vendor_token):
        response = requests.get(f"{BASE_URL}/api/vendor/me", headers={
            "Authorization": f"Bearer {vendor_token}"
        })
        if response.status_code != 200:
            pytest.skip("Failed to get vendor profile")
        return response.json()
    
    def test_non_provisional_uses_ordered_quantity(self, admin_token, vendor_data):
        """Test that non-provisional orders use ordered quantity (no actual_quantity)"""
        import pymongo
        from dotenv import load_dotenv
        load_dotenv('/app/backend/.env')
        
        client = pymongo.MongoClient(os.environ['MONGO_URL'])
        db = client[os.environ['DB_NAME']]
        
        seller_id = vendor_data.get('seller_id') or vendor_data.get('id')
        fabric = db.fabrics.find_one({}, {'_id': 0, 'id': 1, 'name': 1})
        
        order_id = str(uuid.uuid4())
        order_number = f"LF/TEST/NP-{datetime.now().strftime('%H%M%S')}"
        
        ordered_qty = 100
        rate = 150.0
        
        # Non-provisional order (is_provisional=False, payment_status=paid)
        order_doc = {
            "id": order_id,
            "order_number": order_number,
            "items": [{
                "fabric_id": fabric['id'],
                "fabric_name": fabric.get('name', 'Test Fabric'),
                "seller_id": seller_id,
                "quantity": ordered_qty,
                # No actual_quantity - this is a non-provisional order
                "price_per_meter": rate,
                "order_type": "bulk"
            }],
            "customer": {"name": "Test", "email": "test@test.com", "phone": "9999900015"},
            "subtotal": ordered_qty * rate,
            "tax": round(ordered_qty * rate * 0.05, 2),
            "total": round(ordered_qty * rate * 1.05, 2),
            "status": "confirmed",
            "payment_status": "paid",  # Fully paid, not provisional
            "is_provisional": False,
            "paid_at": datetime.now(timezone.utc).isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        db.orders.insert_one(order_doc)
        
        try:
            # Trigger payout materialization via the materialize-all endpoint
            response = requests.post(
                f"{BASE_URL}/api/payouts/materialize-all",
                headers={"Authorization": f"Bearer {admin_token}"}
            )
            
            assert response.status_code == 200, f"Materialize failed: {response.text}"
            
            # Check the payout
            payout = db.vendor_payouts.find_one({"order_id": order_id}, {"_id": 0})
            assert payout is not None, "Payout should be materialized"
            
            # Verify payout uses ordered quantity (no actual_quantity)
            items = payout.get("items", [])
            assert len(items) == 1, f"Should have 1 item, got {len(items)}"
            
            payout_item = items[0]
            assert payout_item["quantity"] == ordered_qty, f"Payout qty should be {ordered_qty}, got {payout_item['quantity']}"
            
            expected_gross = ordered_qty * rate
            assert payout_item["gross"] == expected_gross, f"Payout gross should be {expected_gross}, got {payout_item['gross']}"
            
            # Verify no vendor_invoice_* fields (or null)
            assert not payout.get("vendor_invoice_url"), "Non-provisional should not have vendor_invoice_url"
            
            print(f"✓ Non-provisional order uses ordered quantity: qty={payout_item['quantity']}, gross={payout_item['gross']}")
            
        finally:
            db.orders.delete_one({"id": order_id})
            db.vendor_payouts.delete_many({"order_id": order_id})


class TestLegacyInvoiceUpload:
    """Test that legacy upload via /api/vendor/payouts/{id}/upload-invoice still works"""
    
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
    
    @pytest.fixture(scope="class")
    def vendor_data(self, vendor_token):
        response = requests.get(f"{BASE_URL}/api/vendor/me", headers={
            "Authorization": f"Bearer {vendor_token}"
        })
        if response.status_code != 200:
            pytest.skip("Failed to get vendor profile")
        return response.json()
    
    def test_legacy_invoice_upload_still_works(self, admin_token, vendor_token, vendor_data):
        """Test that vendor can still upload invoice via legacy endpoint"""
        import pymongo
        from dotenv import load_dotenv
        load_dotenv('/app/backend/.env')
        
        client = pymongo.MongoClient(os.environ['MONGO_URL'])
        db = client[os.environ['DB_NAME']]
        
        seller_id = vendor_data.get('seller_id') or vendor_data.get('id')
        fabric = db.fabrics.find_one({}, {'_id': 0, 'id': 1, 'name': 1})
        
        order_id = str(uuid.uuid4())
        order_number = f"LF/TEST/LEG-{datetime.now().strftime('%H%M%S')}"
        
        # Create a paid order (non-provisional) with a payout that has no invoice
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
            "customer": {"name": "Test", "email": "test@test.com", "phone": "9999900016"},
            "subtotal": 15000.0,
            "tax": 750.0,
            "total": 15750.0,
            "status": "confirmed",
            "payment_status": "paid",
            "is_provisional": False,
            "paid_at": datetime.now(timezone.utc).isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        db.orders.insert_one(order_doc)
        
        try:
            # Materialize payout
            response = requests.post(
                f"{BASE_URL}/api/payouts/materialize-all",
                headers={"Authorization": f"Bearer {admin_token}"}
            )
            assert response.status_code == 200
            
            # Get the payout
            payout = db.vendor_payouts.find_one({"order_id": order_id}, {"_id": 0})
            assert payout is not None, "Payout should exist"
            payout_id = payout["id"]
            
            # Verify no invoice yet
            assert not payout.get("vendor_invoice_url"), "Should not have invoice yet"
            
            # Use legacy upload endpoint
            response = requests.post(
                f"{BASE_URL}/api/vendor/payouts/{payout_id}/upload-invoice",
                headers={"Authorization": f"Bearer {vendor_token}"},
                json={
                    "invoice_url": "https://res.cloudinary.com/test/raw/upload/legacy_invoice.pdf",
                    "filename": "legacy_invoice.pdf",
                    "invoice_number": "INV-LEGACY-001",
                    "invoice_date": "2026-01-15",
                    "amount": 15750.0
                }
            )
            
            assert response.status_code == 200, f"Legacy upload failed: {response.text}"
            
            # Verify invoice was uploaded
            updated_payout = db.vendor_payouts.find_one({"id": payout_id}, {"_id": 0})
            assert updated_payout.get("vendor_invoice_url") == "https://res.cloudinary.com/test/raw/upload/legacy_invoice.pdf"
            assert updated_payout.get("vendor_invoice_status") == "uploaded"
            
            print(f"✓ Legacy invoice upload still works")
            print(f"  - vendor_invoice_url: {updated_payout.get('vendor_invoice_url')}")
            print(f"  - vendor_invoice_status: {updated_payout.get('vendor_invoice_status')}")
            
        finally:
            db.orders.delete_one({"id": order_id})
            db.vendor_payouts.delete_many({"order_id": order_id})


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
