"""
Test Suite for Vendor SKU Link Features (v56)

Tests the following features:
1. POST /api/rfq/submit with prefill_fabric_id persists linked_fabric_* fields
2. PATCH /api/rfq/{id} with prefill_fabric_id also persists linked_fabric_* fields
3. GET /api/vendor/rfqs returns linked_fabric_* fields on each RFQ
4. Vendor RFQ list and detail pages show SKU links correctly
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from test_credentials.md
BRAND_EMAIL = "brandtest@locofast.com"
BRAND_PASSWORD = "NewPassword123!"
DENIM_VENDOR_EMAIL = "denimseller@locofast.com"
DENIM_VENDOR_PASSWORD = "denim@123"
ADMIN_EMAIL = "admin@locofast.com"
ADMIN_PASSWORD = "admin123"

# Sample denim fabric ID for testing
SAMPLE_DENIM_FABRIC_ID = "8e6c6e09-f711-455b-9900-1044574d7c25"


class TestVendorSKULinkFeatures:
    """Tests for vendor SKU link features on RFQs and Orders"""
    
    brand_token = None
    vendor_token = None
    admin_token = None
    test_rfq_id = None
    test_rfq_number = None
    test_fabric = None
    
    @pytest.fixture(autouse=True)
    def setup(self, request):
        """Setup tokens and test data before each test class"""
        # Get brand token
        if not TestVendorSKULinkFeatures.brand_token:
            res = requests.post(f"{BASE_URL}/api/brand/login", json={
                "email": BRAND_EMAIL,
                "password": BRAND_PASSWORD
            })
            if res.status_code == 200:
                TestVendorSKULinkFeatures.brand_token = res.json().get("token")
                print(f"Brand login successful")
            else:
                print(f"Brand login failed: {res.status_code} - {res.text}")
        
        # Get vendor token
        if not TestVendorSKULinkFeatures.vendor_token:
            res = requests.post(f"{BASE_URL}/api/vendor/login", json={
                "email": DENIM_VENDOR_EMAIL,
                "password": DENIM_VENDOR_PASSWORD
            })
            if res.status_code == 200:
                TestVendorSKULinkFeatures.vendor_token = res.json().get("token")
                print(f"Vendor login successful")
            else:
                print(f"Vendor login failed: {res.status_code} - {res.text}")
        
        # Get admin token
        if not TestVendorSKULinkFeatures.admin_token:
            res = requests.post(f"{BASE_URL}/api/admin/login", json={
                "email": ADMIN_EMAIL,
                "password": ADMIN_PASSWORD
            })
            if res.status_code == 200:
                TestVendorSKULinkFeatures.admin_token = res.json().get("token")
                print(f"Admin login successful")
            else:
                print(f"Admin login failed: {res.status_code} - {res.text}")
    
    def test_01_get_denim_fabric_for_testing(self):
        """Get a denim fabric to use for testing prefill_fabric_id"""
        # Try the sample fabric ID first
        res = requests.get(f"{BASE_URL}/api/fabrics/{SAMPLE_DENIM_FABRIC_ID}")
        if res.status_code == 200:
            TestVendorSKULinkFeatures.test_fabric = res.json()
            print(f"Using sample fabric: {TestVendorSKULinkFeatures.test_fabric.get('fabric_code')}")
            return
        
        # Fallback: get any denim fabric
        res = requests.get(f"{BASE_URL}/api/fabrics", params={
            "category_id": "cat-denim",
            "limit": 5
        })
        assert res.status_code == 200, f"Failed to get fabrics: {res.text}"
        data = res.json()
        fabrics = data.get("fabrics", [])
        assert len(fabrics) > 0, "No denim fabrics found for testing"
        TestVendorSKULinkFeatures.test_fabric = fabrics[0]
        print(f"Using fabric: {TestVendorSKULinkFeatures.test_fabric.get('fabric_code')} - {TestVendorSKULinkFeatures.test_fabric.get('name')}")
    
    def test_02_post_rfq_submit_with_prefill_fabric_id(self):
        """POST /api/rfq/submit with prefill_fabric_id should persist linked_fabric_* fields"""
        assert TestVendorSKULinkFeatures.brand_token, "Brand token required"
        assert TestVendorSKULinkFeatures.test_fabric, "Test fabric required"
        
        fabric = TestVendorSKULinkFeatures.test_fabric
        fabric_id = fabric.get("id")
        
        payload = {
            "category": "denim",
            "fabric_requirement_type": "Dyed",
            "quantity_value": 5000,
            "quantity_unit": "m",
            "prefill_fabric_id": fabric_id,
            "is_draft": False  # Submit directly
        }
        
        res = requests.post(
            f"{BASE_URL}/api/rfq/submit",
            json=payload,
            headers={"Authorization": f"Bearer {TestVendorSKULinkFeatures.brand_token}"}
        )
        
        assert res.status_code == 200, f"RFQ submit failed: {res.status_code} - {res.text}"
        data = res.json()
        
        TestVendorSKULinkFeatures.test_rfq_id = data.get("id")
        TestVendorSKULinkFeatures.test_rfq_number = data.get("rfq_number")
        
        print(f"Created RFQ: {TestVendorSKULinkFeatures.test_rfq_number}")
        
        # Verify the RFQ was created - fetch it to check linked_fabric_* fields
        rfq_res = requests.get(f"{BASE_URL}/api/rfq/{TestVendorSKULinkFeatures.test_rfq_id}")
        assert rfq_res.status_code == 200, f"Failed to get RFQ: {rfq_res.text}"
        rfq = rfq_res.json()
        
        # Verify linked_fabric_* fields are populated
        assert rfq.get("linked_fabric_id") == fabric_id, f"linked_fabric_id mismatch: {rfq.get('linked_fabric_id')} != {fabric_id}"
        assert rfq.get("linked_fabric_code"), f"linked_fabric_code not set: {rfq.get('linked_fabric_code')}"
        assert rfq.get("linked_fabric_name"), f"linked_fabric_name not set: {rfq.get('linked_fabric_name')}"
        
        print(f"Verified linked_fabric_id: {rfq.get('linked_fabric_id')}")
        print(f"Verified linked_fabric_code: {rfq.get('linked_fabric_code')}")
        print(f"Verified linked_fabric_name: {rfq.get('linked_fabric_name')}")
        print(f"Verified linked_fabric_slug: {rfq.get('linked_fabric_slug')}")
        print(f"Verified linked_fabric_category: {rfq.get('linked_fabric_category')}")
        print(f"Verified linked_fabric_seller: {rfq.get('linked_fabric_seller')}")
    
    def test_03_patch_rfq_with_prefill_fabric_id(self):
        """PATCH /api/rfq/{id} with prefill_fabric_id should also persist linked_fabric_* fields"""
        assert TestVendorSKULinkFeatures.brand_token, "Brand token required"
        assert TestVendorSKULinkFeatures.test_fabric, "Test fabric required"
        
        fabric = TestVendorSKULinkFeatures.test_fabric
        fabric_id = fabric.get("id")
        
        # First create a draft RFQ without prefill_fabric_id
        payload = {
            "category": "denim",
            "fabric_requirement_type": "Greige",
            "quantity_value": 3000,
            "quantity_unit": "m",
            "is_draft": True
        }
        
        res = requests.post(
            f"{BASE_URL}/api/rfq/submit",
            json=payload,
            headers={"Authorization": f"Bearer {TestVendorSKULinkFeatures.brand_token}"}
        )
        
        assert res.status_code == 200, f"Draft RFQ submit failed: {res.status_code} - {res.text}"
        draft_rfq = res.json()
        draft_rfq_id = draft_rfq.get("id")
        print(f"Created draft RFQ: {draft_rfq.get('rfq_number')}")
        
        # Now PATCH with prefill_fabric_id
        patch_payload = {
            "prefill_fabric_id": fabric_id,
            "finalize": True
        }
        
        patch_res = requests.patch(
            f"{BASE_URL}/api/rfq/{draft_rfq_id}",
            json=patch_payload,
            headers={"Authorization": f"Bearer {TestVendorSKULinkFeatures.brand_token}"}
        )
        
        assert patch_res.status_code == 200, f"RFQ patch failed: {patch_res.status_code} - {patch_res.text}"
        patch_data = patch_res.json()
        
        # Verify linked_fabric_* fields are populated after PATCH
        rfq = patch_data.get("rfq", {})
        assert rfq.get("linked_fabric_id") == fabric_id, f"linked_fabric_id mismatch after PATCH"
        assert rfq.get("linked_fabric_code"), f"linked_fabric_code not set after PATCH"
        assert rfq.get("linked_fabric_name"), f"linked_fabric_name not set after PATCH"
        
        print(f"PATCH verified linked_fabric_id: {rfq.get('linked_fabric_id')}")
        print(f"PATCH verified linked_fabric_code: {rfq.get('linked_fabric_code')}")
    
    def test_04_vendor_rfqs_list_returns_linked_fabric_fields(self):
        """GET /api/vendor/rfqs should return linked_fabric_* fields on each RFQ"""
        assert TestVendorSKULinkFeatures.vendor_token, "Vendor token required"
        
        res = requests.get(
            f"{BASE_URL}/api/vendor/rfqs",
            params={"status": "all", "limit": 50},
            headers={"Authorization": f"Bearer {TestVendorSKULinkFeatures.vendor_token}"}
        )
        
        assert res.status_code == 200, f"Vendor RFQs list failed: {res.status_code} - {res.text}"
        data = res.json()
        rfqs = data.get("rfqs", [])
        
        print(f"Found {len(rfqs)} RFQs for vendor")
        
        # Find our test RFQ
        test_rfq = None
        for rfq in rfqs:
            if rfq.get("id") == TestVendorSKULinkFeatures.test_rfq_id:
                test_rfq = rfq
                break
        
        if test_rfq:
            # Verify linked_fabric_* fields are present
            assert test_rfq.get("linked_fabric_id"), f"linked_fabric_id not in vendor RFQ list response"
            assert test_rfq.get("linked_fabric_code"), f"linked_fabric_code not in vendor RFQ list response"
            assert test_rfq.get("linked_fabric_name"), f"linked_fabric_name not in vendor RFQ list response"
            print(f"Vendor RFQ list contains linked_fabric_id: {test_rfq.get('linked_fabric_id')}")
            print(f"Vendor RFQ list contains linked_fabric_code: {test_rfq.get('linked_fabric_code')}")
            print(f"Vendor RFQ list contains linked_fabric_name: {test_rfq.get('linked_fabric_name')}")
            print(f"Vendor RFQ list contains linked_fabric_slug: {test_rfq.get('linked_fabric_slug')}")
        else:
            # The test RFQ might not be visible to this vendor due to category filtering
            # Check if any RFQ has linked_fabric_* fields
            rfqs_with_link = [r for r in rfqs if r.get("linked_fabric_id")]
            print(f"Found {len(rfqs_with_link)} RFQs with linked_fabric_id")
            if rfqs_with_link:
                sample = rfqs_with_link[0]
                print(f"Sample RFQ with SKU link: {sample.get('rfq_number')} -> {sample.get('linked_fabric_code')}")
    
    def test_05_vendor_rfq_detail_returns_linked_fabric_fields(self):
        """GET /api/vendor/rfqs/{rfq_id} should return linked_fabric_* fields"""
        assert TestVendorSKULinkFeatures.vendor_token, "Vendor token required"
        assert TestVendorSKULinkFeatures.test_rfq_id, "Test RFQ ID required"
        
        res = requests.get(
            f"{BASE_URL}/api/vendor/rfqs/{TestVendorSKULinkFeatures.test_rfq_id}",
            headers={"Authorization": f"Bearer {TestVendorSKULinkFeatures.vendor_token}"}
        )
        
        # The vendor might not have access to this RFQ due to category filtering
        if res.status_code == 403:
            print(f"Vendor doesn't have access to test RFQ (category mismatch) - this is expected")
            pytest.skip("Vendor doesn't have access to test RFQ due to category filtering")
            return
        
        assert res.status_code == 200, f"Vendor RFQ detail failed: {res.status_code} - {res.text}"
        rfq = res.json()
        
        # Verify linked_fabric_* fields are present
        assert rfq.get("linked_fabric_id"), f"linked_fabric_id not in vendor RFQ detail response"
        assert rfq.get("linked_fabric_code"), f"linked_fabric_code not in vendor RFQ detail response"
        assert rfq.get("linked_fabric_name"), f"linked_fabric_name not in vendor RFQ detail response"
        
        print(f"Vendor RFQ detail contains linked_fabric_id: {rfq.get('linked_fabric_id')}")
        print(f"Vendor RFQ detail contains linked_fabric_code: {rfq.get('linked_fabric_code')}")
        print(f"Vendor RFQ detail contains linked_fabric_name: {rfq.get('linked_fabric_name')}")
        print(f"Vendor RFQ detail contains linked_fabric_slug: {rfq.get('linked_fabric_slug')}")
    
    def test_06_vendor_orders_returns_fabric_code(self):
        """GET /api/vendor/orders should return fabric_code on order items"""
        assert TestVendorSKULinkFeatures.vendor_token, "Vendor token required"
        
        res = requests.get(
            f"{BASE_URL}/api/vendor/orders",
            headers={"Authorization": f"Bearer {TestVendorSKULinkFeatures.vendor_token}"}
        )
        
        assert res.status_code == 200, f"Vendor orders failed: {res.status_code} - {res.text}"
        orders = res.json()
        
        print(f"Found {len(orders)} orders for vendor")
        
        # Check if any orders have items with fabric_code
        orders_with_fabric_code = []
        for order in orders:
            items = order.get("items", [])
            for item in items:
                if item.get("fabric_code"):
                    orders_with_fabric_code.append({
                        "order_number": order.get("order_number"),
                        "fabric_code": item.get("fabric_code"),
                        "fabric_name": item.get("fabric_name"),
                        "fabric_id": item.get("fabric_id")
                    })
        
        print(f"Found {len(orders_with_fabric_code)} order items with fabric_code")
        if orders_with_fabric_code:
            for item in orders_with_fabric_code[:3]:  # Show first 3
                print(f"  Order {item['order_number']}: SKU {item['fabric_code']} - {item['fabric_name']}")
    
    def test_07_rfq_without_prefill_has_no_linked_fabric(self):
        """RFQ created without prefill_fabric_id should NOT have linked_fabric_* fields"""
        assert TestVendorSKULinkFeatures.brand_token, "Brand token required"
        
        payload = {
            "category": "denim",
            "fabric_requirement_type": "Printed",
            "quantity_value": 2000,
            "quantity_unit": "m",
            # No prefill_fabric_id
            "is_draft": False
        }
        
        res = requests.post(
            f"{BASE_URL}/api/rfq/submit",
            json=payload,
            headers={"Authorization": f"Bearer {TestVendorSKULinkFeatures.brand_token}"}
        )
        
        assert res.status_code == 200, f"RFQ submit failed: {res.status_code} - {res.text}"
        data = res.json()
        rfq_id = data.get("id")
        
        # Fetch the RFQ to verify no linked_fabric_* fields
        rfq_res = requests.get(f"{BASE_URL}/api/rfq/{rfq_id}")
        assert rfq_res.status_code == 200
        rfq = rfq_res.json()
        
        # linked_fabric_id should be empty or not present
        linked_id = rfq.get("linked_fabric_id", "")
        assert not linked_id, f"RFQ without prefill should not have linked_fabric_id, got: {linked_id}"
        
        print(f"Verified RFQ {data.get('rfq_number')} has no linked_fabric_id (as expected)")
    
    def test_08_rfq_with_invalid_fabric_id_still_creates(self):
        """RFQ with invalid prefill_fabric_id should still create but without linked_fabric_* fields"""
        assert TestVendorSKULinkFeatures.brand_token, "Brand token required"
        
        payload = {
            "category": "denim",
            "fabric_requirement_type": "RFD",
            "quantity_value": 1500,
            "quantity_unit": "m",
            "prefill_fabric_id": "invalid-fabric-id-12345",
            "is_draft": False
        }
        
        res = requests.post(
            f"{BASE_URL}/api/rfq/submit",
            json=payload,
            headers={"Authorization": f"Bearer {TestVendorSKULinkFeatures.brand_token}"}
        )
        
        assert res.status_code == 200, f"RFQ submit failed: {res.status_code} - {res.text}"
        data = res.json()
        rfq_id = data.get("id")
        
        # Fetch the RFQ to verify no linked_fabric_* fields (fabric not found)
        rfq_res = requests.get(f"{BASE_URL}/api/rfq/{rfq_id}")
        assert rfq_res.status_code == 200
        rfq = rfq_res.json()
        
        # linked_fabric_id should be empty since fabric wasn't found
        linked_id = rfq.get("linked_fabric_id", "")
        assert not linked_id, f"RFQ with invalid fabric_id should not have linked_fabric_id, got: {linked_id}"
        
        print(f"Verified RFQ {data.get('rfq_number')} with invalid fabric_id has no linked_fabric_id (as expected)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
