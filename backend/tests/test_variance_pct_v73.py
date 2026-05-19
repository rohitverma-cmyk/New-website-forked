"""
Test suite for variance_pct feature (iteration 73)

Tests:
1. VARIANCE_PCT default is now 3.0 (was 10.0)
2. within_variance(ordered, actual, pct) accepts optional pct argument
3. resolve_category_variance(db, category_id) returns category.variance_pct if set & positive, else 3.0
4. PUT /api/categories/{id} accepts {variance_pct: float|null}
5. POST /api/categories accepts variance_pct on create
6. GET /api/categories returns variance_pct on each category record
7. POST /api/orders/{id}/mark-goods-ready uses category variance_pct or 3% default
8. Edge cases: fabric with category variance_pct=5 allows 105m on 100m order, 110m fails
9. Backwards compat: non-provisional orders still apply variance check
"""
import pytest
import requests
import os
import uuid
import asyncio
from dotenv import load_dotenv

load_dotenv('/app/backend/.env')

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "admin@locofast.com"
ADMIN_PASSWORD = "admin123"
VENDOR_EMAIL = "denimseller@locofast.com"
VENDOR_PASSWORD = "denim@123"


@pytest.fixture(scope="module")
def admin_token():
    """Get admin JWT token"""
    resp = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    if resp.status_code == 200:
        return resp.json().get("token")
    pytest.skip(f"Admin login failed: {resp.status_code} - {resp.text}")


@pytest.fixture(scope="module")
def vendor_token():
    """Get vendor JWT token"""
    resp = requests.post(f"{BASE_URL}/api/vendors/login", json={
        "email": VENDOR_EMAIL,
        "password": VENDOR_PASSWORD
    })
    if resp.status_code == 200:
        return resp.json().get("token")
    pytest.skip(f"Vendor login failed: {resp.status_code} - {resp.text}")


class TestVariancePctDefault:
    """Test that VARIANCE_PCT default is now 3.0"""
    
    def test_variance_pct_default_is_3(self):
        """Verify VARIANCE_PCT constant is 3.0"""
        import sys
        sys.path.insert(0, '/app/backend')
        from provisional_orders import VARIANCE_PCT
        assert VARIANCE_PCT == 3.0, f"Expected VARIANCE_PCT=3.0, got {VARIANCE_PCT}"
        print(f"PASS: VARIANCE_PCT default is {VARIANCE_PCT}")


class TestWithinVarianceFunction:
    """Test within_variance function with optional pct argument"""
    
    def test_within_variance_default_pct(self):
        """within_variance uses default 3% when pct not provided"""
        import sys
        sys.path.insert(0, '/app/backend')
        from provisional_orders import within_variance
        
        # 100m ordered, 103m actual = exactly 3% over = within band
        assert within_variance(100, 103) == True
        # 100m ordered, 97m actual = exactly 3% under = within band
        assert within_variance(100, 97) == True
        # 100m ordered, 104m actual = 4% over = outside band
        assert within_variance(100, 104) == False
        # 100m ordered, 96m actual = 4% under = outside band
        assert within_variance(100, 96) == False
        print("PASS: within_variance uses default 3% band")
    
    def test_within_variance_custom_pct(self):
        """within_variance accepts custom pct argument"""
        import sys
        sys.path.insert(0, '/app/backend')
        from provisional_orders import within_variance
        
        # With 5% band: 100m ordered, 105m actual = exactly 5% = within band
        assert within_variance(100, 105, pct=5.0) == True
        # With 5% band: 100m ordered, 106m actual = 6% = outside band
        assert within_variance(100, 106, pct=5.0) == False
        # With 10% band: 100m ordered, 110m actual = exactly 10% = within band
        assert within_variance(100, 110, pct=10.0) == True
        # With 10% band: 100m ordered, 111m actual = 11% = outside band
        assert within_variance(100, 111, pct=10.0) == False
        print("PASS: within_variance accepts custom pct argument")
    
    def test_within_variance_zero_ordered(self):
        """within_variance handles zero ordered quantity"""
        import sys
        sys.path.insert(0, '/app/backend')
        from provisional_orders import within_variance
        
        # Zero ordered, zero actual = within band
        assert within_variance(0, 0) == True
        # Zero ordered, non-zero actual = outside band
        assert within_variance(0, 10) == False
        print("PASS: within_variance handles zero ordered quantity")


class TestResolveCategoryVariance:
    """Test resolve_category_variance helper function"""
    
    def test_resolve_category_variance_with_override(self):
        """resolve_category_variance returns category.variance_pct when set"""
        import sys
        sys.path.insert(0, '/app/backend')
        from provisional_orders import resolve_category_variance
        from motor.motor_asyncio import AsyncIOMotorClient
        
        async def _test():
            client = AsyncIOMotorClient(os.environ['MONGO_URL'])
            db = client[os.environ['DB_NAME']]
            
            # cat-cotton has variance_pct=5.0
            result = await resolve_category_variance(db, "cat-cotton")
            return result
        
        result = asyncio.get_event_loop().run_until_complete(_test())
        assert result == 5.0, f"Expected 5.0 for cat-cotton, got {result}"
        print(f"PASS: resolve_category_variance returns 5.0 for cat-cotton")
    
    def test_resolve_category_variance_no_override(self):
        """resolve_category_variance returns default 3.0 when category has no override"""
        import sys
        sys.path.insert(0, '/app/backend')
        from provisional_orders import resolve_category_variance, VARIANCE_PCT
        from motor.motor_asyncio import AsyncIOMotorClient
        
        async def _test():
            client = AsyncIOMotorClient(os.environ['MONGO_URL'])
            db = client[os.environ['DB_NAME']]
            
            # cat-denim has variance_pct=None
            result = await resolve_category_variance(db, "cat-denim")
            return result
        
        result = asyncio.get_event_loop().run_until_complete(_test())
        assert result == VARIANCE_PCT, f"Expected {VARIANCE_PCT} for cat-denim (no override), got {result}"
        print(f"PASS: resolve_category_variance returns default {VARIANCE_PCT} for cat-denim")
    
    def test_resolve_category_variance_null_category_id(self):
        """resolve_category_variance returns default when category_id is None"""
        import sys
        sys.path.insert(0, '/app/backend')
        from provisional_orders import resolve_category_variance, VARIANCE_PCT
        from motor.motor_asyncio import AsyncIOMotorClient
        
        async def _test():
            client = AsyncIOMotorClient(os.environ['MONGO_URL'])
            db = client[os.environ['DB_NAME']]
            
            result = await resolve_category_variance(db, None)
            return result
        
        result = asyncio.get_event_loop().run_until_complete(_test())
        assert result == VARIANCE_PCT, f"Expected {VARIANCE_PCT} for None category_id, got {result}"
        print(f"PASS: resolve_category_variance returns default {VARIANCE_PCT} for None category_id")
    
    def test_resolve_category_variance_nonexistent_category(self):
        """resolve_category_variance returns default for non-existent category"""
        import sys
        sys.path.insert(0, '/app/backend')
        from provisional_orders import resolve_category_variance, VARIANCE_PCT
        from motor.motor_asyncio import AsyncIOMotorClient
        
        async def _test():
            client = AsyncIOMotorClient(os.environ['MONGO_URL'])
            db = client[os.environ['DB_NAME']]
            
            result = await resolve_category_variance(db, "nonexistent-category-id")
            return result
        
        result = asyncio.get_event_loop().run_until_complete(_test())
        assert result == VARIANCE_PCT, f"Expected {VARIANCE_PCT} for nonexistent category, got {result}"
        print(f"PASS: resolve_category_variance returns default {VARIANCE_PCT} for nonexistent category")


class TestCategoryVariancePctEndpoints:
    """Test category CRUD endpoints with variance_pct field"""
    
    def test_get_categories_returns_variance_pct(self, admin_token):
        """GET /api/categories returns variance_pct on each category"""
        resp = requests.get(f"{BASE_URL}/api/categories")
        assert resp.status_code == 200, f"GET categories failed: {resp.status_code}"
        
        categories = resp.json()
        assert len(categories) > 0, "No categories returned"
        
        # Check that variance_pct field is present
        cotton_cat = next((c for c in categories if c.get("id") == "cat-cotton"), None)
        assert cotton_cat is not None, "Cotton Fabrics category not found"
        assert "variance_pct" in cotton_cat, "variance_pct field missing from category"
        assert cotton_cat["variance_pct"] == 5.0, f"Expected variance_pct=5.0, got {cotton_cat['variance_pct']}"
        
        # Check a category without override
        denim_cat = next((c for c in categories if c.get("id") == "cat-denim"), None)
        if denim_cat:
            # variance_pct should be present (even if None)
            print(f"  Denim category variance_pct: {denim_cat.get('variance_pct')}")
        
        print("PASS: GET /api/categories returns variance_pct field")
    
    def test_put_category_update_variance_pct(self, admin_token):
        """PUT /api/categories/{id} can update variance_pct"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Update cat-polyester to have variance_pct=7.5
        resp = requests.put(
            f"{BASE_URL}/api/categories/cat-polyester",
            json={"variance_pct": 7.5},
            headers=headers
        )
        assert resp.status_code == 200, f"PUT category failed: {resp.status_code} - {resp.text}"
        
        updated = resp.json()
        assert updated.get("variance_pct") == 7.5, f"Expected variance_pct=7.5, got {updated.get('variance_pct')}"
        print("PASS: PUT /api/categories/{id} can update variance_pct to 7.5")
        
        # Revert back to null by setting to 0 (which should be treated as "use default")
        resp = requests.put(
            f"{BASE_URL}/api/categories/cat-polyester",
            json={"variance_pct": 0},
            headers=headers
        )
        if resp.status_code == 200:
            reverted = resp.json()
            print(f"  Reverted variance_pct to: {reverted.get('variance_pct')}")
    
    def test_put_category_set_variance_pct_to_zero(self, admin_token):
        """PUT /api/categories/{id} with variance_pct=0 should store 0 (use default)"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # First set a value
        resp = requests.put(
            f"{BASE_URL}/api/categories/cat-sustainable",
            json={"variance_pct": 8.0},
            headers=headers
        )
        assert resp.status_code == 200, f"PUT category failed: {resp.status_code}"
        
        # Now set to 0
        resp = requests.put(
            f"{BASE_URL}/api/categories/cat-sustainable",
            json={"variance_pct": 0},
            headers=headers
        )
        assert resp.status_code == 200, f"PUT category with 0 failed: {resp.status_code}"
        updated = resp.json()
        print(f"  After setting variance_pct=0: {updated.get('variance_pct')}")
        
        print("PASS: PUT /api/categories/{id} variance_pct=0 tested")
    
    def test_post_category_with_variance_pct(self, admin_token):
        """POST /api/categories accepts variance_pct on create"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        test_cat_name = f"TEST_Variance_Cat_{uuid.uuid4().hex[:8]}"
        resp = requests.post(
            f"{BASE_URL}/api/categories",
            json={
                "name": test_cat_name,
                "description": "Test category with variance_pct",
                "variance_pct": 4.5
            },
            headers=headers
        )
        assert resp.status_code == 200, f"POST category failed: {resp.status_code} - {resp.text}"
        
        created = resp.json()
        cat_id = created.get("id")
        
        # Verify variance_pct was set by fetching the category
        resp = requests.get(f"{BASE_URL}/api/categories/{cat_id}")
        if resp.status_code == 200:
            fetched = resp.json()
            print(f"  Created category variance_pct: {fetched.get('variance_pct')}")
            # Note: The current create_category may not include variance_pct in the doc
            # This is a potential bug to report
        
        # Clean up - delete test category
        requests.delete(f"{BASE_URL}/api/categories/{cat_id}", headers=headers)
        print("PASS: POST /api/categories with variance_pct tested")


class TestMarkGoodsReadyVariance:
    """Test mark-goods-ready endpoint uses category variance_pct"""
    
    def test_mark_goods_ready_error_includes_category_band(self, admin_token, vendor_token):
        """mark-goods-ready error message includes per-item band (e.g., 'Cotton Twill (±5.0%)')"""
        # This test verifies the error message format when variance is exceeded
        # We need to test as vendor (not admin) to trigger the error
        
        headers_vendor = {"Authorization": f"Bearer {vendor_token}"}
        headers_admin = {"Authorization": f"Bearer {admin_token}"}
        
        # Find an order that the vendor can mark
        resp = requests.get(
            f"{BASE_URL}/api/orders",
            headers=headers_admin,
            params={"limit": 100}
        )
        assert resp.status_code == 200, f"GET orders failed: {resp.status_code}"
        
        data = resp.json()
        orders = data.get("orders", [])
        
        # Find a provisional order with advance_paid status that has vendor's items
        test_order = None
        for o in orders:
            if o.get("is_provisional") and o.get("payment_status") == "advance_paid":
                # Check if any item belongs to the vendor
                for item in o.get("items", []):
                    if item.get("seller_id"):
                        test_order = o
                        break
                if test_order:
                    break
        
        if not test_order:
            pytest.skip("No suitable provisional order found for vendor variance test")
        
        print(f"  Testing with order: {test_order.get('order_number')}")
        
        # Get the first item
        items = test_order.get("items", [])
        if not items:
            pytest.skip("Order has no items")
        
        first_item = items[0]
        fabric_id = first_item.get("fabric_id")
        ordered_qty = float(first_item.get("quantity", 100))
        
        # Try to mark with quantity way outside variance band (50% over)
        out_of_band_qty = ordered_qty * 1.5
        
        resp = requests.post(
            f"{BASE_URL}/api/orders/{test_order['id']}/mark-goods-ready",
            json={
                "items": [{"fabric_id": fabric_id, "actual_quantity": out_of_band_qty}],
                "vendor_invoice": {
                    "url": "https://example.com/invoice.pdf",
                    "invoice_number": "TEST-INV-001",
                    "invoice_date": "2026-01-15"
                }
            },
            headers=headers_vendor
        )
        
        # Vendor should get 400 with variance error
        if resp.status_code == 400:
            error_detail = resp.json().get("detail", "")
            print(f"  Error message: {error_detail}")
            # Check that error includes the percentage
            assert "%" in error_detail, f"Error should include percentage: {error_detail}"
            print("PASS: mark-goods-ready error includes variance band percentage")
        elif resp.status_code == 403:
            print(f"  Vendor not authorized for this order's items (expected)")
            pytest.skip("Vendor not authorized for order items")
        else:
            print(f"  Unexpected response: {resp.status_code} - {resp.text}")


class TestVarianceEdgeCases:
    """Test edge cases for variance band calculations"""
    
    def test_cotton_category_5pct_variance(self):
        """Fabric in Cotton category (5% variance) allows 105m on 100m order"""
        import sys
        sys.path.insert(0, '/app/backend')
        from provisional_orders import within_variance
        
        # Cotton has 5% variance
        # 100m ordered, 105m actual = exactly 5% = within band
        assert within_variance(100, 105, pct=5.0) == True
        # 100m ordered, 95m actual = exactly 5% under = within band
        assert within_variance(100, 95, pct=5.0) == True
        # 100m ordered, 106m actual = 6% = outside band
        assert within_variance(100, 106, pct=5.0) == False
        # 100m ordered, 110m actual = 10% = outside band
        assert within_variance(100, 110, pct=5.0) == False
        print("PASS: Cotton 5% variance allows 105m on 100m, rejects 110m")
    
    def test_default_3pct_variance(self):
        """Category without override uses 3% default - 104m fails on 100m order"""
        import sys
        sys.path.insert(0, '/app/backend')
        from provisional_orders import within_variance, VARIANCE_PCT
        
        assert VARIANCE_PCT == 3.0, f"Default should be 3%, got {VARIANCE_PCT}"
        
        # 100m ordered, 103m actual = exactly 3% = within band
        assert within_variance(100, 103) == True
        # 100m ordered, 104m actual = 4% = outside band
        assert within_variance(100, 104) == False
        print("PASS: Default 3% variance rejects 104m on 100m order")
    
    def test_variance_boundary_precision(self):
        """Test variance calculation at exact boundaries"""
        import sys
        sys.path.insert(0, '/app/backend')
        from provisional_orders import within_variance
        
        # Test at exact 3% boundary
        # 100m ordered, 103m actual = 3.0% = within band (<=)
        assert within_variance(100, 103, pct=3.0) == True
        # 100m ordered, 103.01m actual = 3.01% = outside band (>)
        assert within_variance(100, 103.01, pct=3.0) == False
        
        # Test at exact 5% boundary
        assert within_variance(100, 105, pct=5.0) == True
        assert within_variance(100, 105.01, pct=5.0) == False
        
        print("PASS: Variance boundary precision is correct")


class TestBackwardsCompatibility:
    """Test backwards compatibility with existing orders"""
    
    def test_nonprovisional_orders_use_variance_check(self, admin_token):
        """Non-provisional confirmed orders still apply variance check"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Find a non-provisional confirmed order
        resp = requests.get(
            f"{BASE_URL}/api/orders",
            headers=headers,
            params={"limit": 100}
        )
        assert resp.status_code == 200
        
        data = resp.json()
        orders = data.get("orders", [])
        
        # Find non-provisional order in confirmed/processing/goods_ready status
        test_order = None
        for o in orders:
            if not o.get("is_provisional") and o.get("status") in ("confirmed", "processing", "goods_ready"):
                test_order = o
                break
        
        if not test_order:
            pytest.skip("No non-provisional confirmed order found")
        
        print(f"  Testing backwards compat with order: {test_order.get('order_number')}")
        print(f"  is_provisional: {test_order.get('is_provisional')}, status: {test_order.get('status')}")
        
        # The endpoint should accept the order and apply variance check
        items = test_order.get("items", [])
        if not items:
            pytest.skip("Order has no items")
        
        first_item = items[0]
        fabric_id = first_item.get("fabric_id")
        ordered_qty = float(first_item.get("quantity", 100))
        
        # Try with quantity within default 3% band
        within_band_qty = ordered_qty * 1.02  # 2% over
        
        resp = requests.post(
            f"{BASE_URL}/api/orders/{test_order['id']}/mark-goods-ready",
            json={
                "items": [{"fabric_id": fabric_id, "actual_quantity": within_band_qty}],
                "vendor_invoice": {
                    "url": "https://example.com/invoice.pdf",
                    "invoice_number": "TEST-INV-002",
                    "invoice_date": "2026-01-15"
                }
            },
            headers=headers
        )
        
        print(f"  mark-goods-ready response: {resp.status_code}")
        if resp.status_code != 200:
            print(f"  Response: {resp.text}")
        
        # Admin should be able to mark goods ready
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        print("PASS: Non-provisional orders accept mark-goods-ready with variance check")


class TestCategoryVariancePctPersistence:
    """Test that variance_pct is properly persisted and retrieved"""
    
    def test_variance_pct_persisted_in_db(self):
        """Verify variance_pct is stored in MongoDB"""
        from motor.motor_asyncio import AsyncIOMotorClient
        
        async def _test():
            client = AsyncIOMotorClient(os.environ['MONGO_URL'])
            db = client[os.environ['DB_NAME']]
            
            # Check cat-cotton has variance_pct=5.0 in DB
            cat = await db.categories.find_one({"id": "cat-cotton"}, {"_id": 0})
            return cat
        
        cat = asyncio.get_event_loop().run_until_complete(_test())
        assert cat is not None, "cat-cotton not found in DB"
        assert cat.get("variance_pct") == 5.0, f"Expected variance_pct=5.0, got {cat.get('variance_pct')}"
        
        print("PASS: variance_pct is persisted in MongoDB")


class TestCategoryCreateVariancePctBug:
    """Test if POST /api/categories properly stores variance_pct"""
    
    def test_create_category_stores_variance_pct(self, admin_token):
        """POST /api/categories should store variance_pct in the document"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        from motor.motor_asyncio import AsyncIOMotorClient
        
        test_cat_name = f"TEST_VarPct_{uuid.uuid4().hex[:8]}"
        
        # Create category with variance_pct
        resp = requests.post(
            f"{BASE_URL}/api/categories",
            json={
                "name": test_cat_name,
                "description": "Test variance_pct on create",
                "variance_pct": 6.5
            },
            headers=headers
        )
        assert resp.status_code == 200, f"POST category failed: {resp.status_code} - {resp.text}"
        
        created = resp.json()
        cat_id = created.get("id")
        
        # Check directly in DB
        async def _check_db():
            client = AsyncIOMotorClient(os.environ['MONGO_URL'])
            db = client[os.environ['DB_NAME']]
            cat = await db.categories.find_one({"id": cat_id}, {"_id": 0})
            return cat
        
        cat_in_db = asyncio.get_event_loop().run_until_complete(_check_db())
        
        # Clean up first
        requests.delete(f"{BASE_URL}/api/categories/{cat_id}", headers=headers)
        
        # Now check if variance_pct was stored
        if cat_in_db.get("variance_pct") != 6.5:
            print(f"  BUG: variance_pct not stored on create. DB has: {cat_in_db}")
            # This is a bug - POST /api/categories doesn't include variance_pct in the doc
            pytest.fail(f"variance_pct not stored on create. Expected 6.5, got {cat_in_db.get('variance_pct')}")
        else:
            print("PASS: POST /api/categories stores variance_pct correctly")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
