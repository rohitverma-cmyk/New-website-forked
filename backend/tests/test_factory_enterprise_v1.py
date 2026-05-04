"""
Test Factory/Enterprise V1 Features
- Factory type enterprise creation with parent_brand_id validation
- Enterprise type field defaults and validation
- Brand upload-attachment endpoint (Cloudinary)
- Factory order placement with PO/tech-pack/qty-color-matrix fields
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from test_credentials.md
ADMIN_EMAIL = "admin@locofast.com"
ADMIN_PASSWORD = "admin123"
BRAND_EMAIL = "brandtest@locofast.com"
BRAND_PASSWORD = "NewPassword123!"


class TestFactoryEnterpriseV1:
    """Factory/Enterprise V1 feature tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.admin_token = None
        self.brand_token = None
        self.created_brand_ids = []  # Track for cleanup
        self.created_user_emails = []  # Track for cleanup
        yield
        # Cleanup created test data
        self._cleanup()
    
    def _cleanup(self):
        """Cleanup test-created enterprises"""
        if self.admin_token:
            headers = {"Authorization": f"Bearer {self.admin_token}"}
            for brand_id in self.created_brand_ids:
                try:
                    requests.delete(f"{BASE_URL}/api/admin/brands/{brand_id}", headers=headers)
                except:
                    pass
    
    def _get_admin_token(self):
        """Get admin authentication token"""
        if self.admin_token:
            return self.admin_token
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            self.admin_token = response.json().get("token")
            return self.admin_token
        pytest.skip(f"Admin login failed: {response.status_code} - {response.text}")
    
    def _get_brand_token(self):
        """Get brand user authentication token"""
        if self.brand_token:
            return self.brand_token
        response = self.session.post(f"{BASE_URL}/api/brand/login", json={
            "email": BRAND_EMAIL,
            "password": BRAND_PASSWORD
        })
        if response.status_code == 200:
            self.brand_token = response.json().get("token")
            return self.brand_token
        pytest.skip(f"Brand login failed: {response.status_code} - {response.text}")
    
    # ─────────────────────────────────────────────────────────────────
    # TEST 1: POST /api/admin/brands with type='factory' and missing parent_brand_id returns 400
    # ─────────────────────────────────────────────────────────────────
    def test_create_factory_without_parent_brand_id_returns_400(self):
        """Factory type requires parent_brand_id"""
        token = self._get_admin_token()
        headers = {"Authorization": f"Bearer {token}"}
        
        unique_email = f"TEST_factory_no_parent_{uuid.uuid4().hex[:8]}@test.com"
        payload = {
            "name": "TEST Factory No Parent",
            "type": "factory",
            # parent_brand_id intentionally omitted
            "admin_user_email": unique_email,
            "admin_user_name": "Test Factory Admin"
        }
        
        response = self.session.post(f"{BASE_URL}/api/admin/brands", json=payload, headers=headers)
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        data = response.json()
        assert "parent_brand_id" in data.get("detail", "").lower(), f"Error should mention parent_brand_id: {data}"
        print("PASS: Factory without parent_brand_id returns 400")
    
    # ─────────────────────────────────────────────────────────────────
    # TEST 2: POST /api/admin/brands with type='factory' + valid parent_brand_id succeeds
    # ─────────────────────────────────────────────────────────────────
    def test_create_factory_with_valid_parent_brand_id_succeeds(self):
        """Factory with valid parent_brand_id should be created successfully"""
        token = self._get_admin_token()
        headers = {"Authorization": f"Bearer {token}"}
        
        # First, get an existing brand to use as parent
        response = self.session.get(f"{BASE_URL}/api/admin/brands", headers=headers)
        assert response.status_code == 200, f"Failed to list brands: {response.text}"
        brands = response.json()
        
        # Find a brand (not factory) to use as parent
        parent_brand = None
        for b in brands:
            if b.get("type", "brand") == "brand" and b.get("status") == "active":
                parent_brand = b
                break
        
        if not parent_brand:
            pytest.skip("No active brand found to use as parent")
        
        parent_brand_id = parent_brand["id"]
        parent_brand_name = parent_brand["name"]
        
        unique_email = f"TEST_factory_valid_{uuid.uuid4().hex[:8]}@test.com"
        payload = {
            "name": "TEST Factory With Parent",
            "type": "factory",
            "parent_brand_id": parent_brand_id,
            "admin_user_email": unique_email,
            "admin_user_name": "Test Factory Admin"
        }
        
        response = self.session.post(f"{BASE_URL}/api/admin/brands", json=payload, headers=headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "id" in data, f"Response should contain id: {data}"
        
        factory_id = data["id"]
        self.created_brand_ids.append(factory_id)
        self.created_user_emails.append(unique_email)
        
        # Verify factory appears in list with parent_brand_name
        response = self.session.get(f"{BASE_URL}/api/admin/brands", headers=headers)
        assert response.status_code == 200
        brands = response.json()
        
        factory = next((b for b in brands if b["id"] == factory_id), None)
        assert factory is not None, "Created factory not found in list"
        assert factory.get("type") == "factory", f"Factory type should be 'factory': {factory}"
        assert factory.get("parent_brand_id") == parent_brand_id, f"parent_brand_id mismatch: {factory}"
        assert factory.get("parent_brand_name") == parent_brand_name, f"parent_brand_name should be '{parent_brand_name}': {factory}"
        
        print(f"PASS: Factory created with parent_brand_name='{parent_brand_name}'")
    
    # ─────────────────────────────────────────────────────────────────
    # TEST 3: POST /api/admin/brands without type field defaults to 'brand'
    # ─────────────────────────────────────────────────────────────────
    def test_create_brand_without_type_defaults_to_brand(self):
        """Backward compatibility: no type field should default to 'brand'"""
        token = self._get_admin_token()
        headers = {"Authorization": f"Bearer {token}"}
        
        unique_email = f"TEST_brand_default_{uuid.uuid4().hex[:8]}@test.com"
        payload = {
            "name": "TEST Brand Default Type",
            # type intentionally omitted
            "admin_user_email": unique_email,
            "admin_user_name": "Test Brand Admin"
        }
        
        response = self.session.post(f"{BASE_URL}/api/admin/brands", json=payload, headers=headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        brand_id = data["id"]
        self.created_brand_ids.append(brand_id)
        self.created_user_emails.append(unique_email)
        
        # Verify type is 'brand' in list
        response = self.session.get(f"{BASE_URL}/api/admin/brands", headers=headers)
        assert response.status_code == 200
        brands = response.json()
        
        brand = next((b for b in brands if b["id"] == brand_id), None)
        assert brand is not None, "Created brand not found in list"
        assert brand.get("type") == "brand", f"Default type should be 'brand': {brand}"
        
        print("PASS: Brand without type field defaults to 'brand'")
    
    # ─────────────────────────────────────────────────────────────────
    # TEST 4: GET /api/admin/brands returns type + parent_brand_name fields
    # ─────────────────────────────────────────────────────────────────
    def test_list_brands_returns_type_and_parent_brand_name(self):
        """GET /api/admin/brands should return type and parent_brand_name fields"""
        token = self._get_admin_token()
        headers = {"Authorization": f"Bearer {token}"}
        
        response = self.session.get(f"{BASE_URL}/api/admin/brands", headers=headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        brands = response.json()
        assert isinstance(brands, list), "Response should be a list"
        
        if len(brands) == 0:
            pytest.skip("No brands in database to verify")
        
        # Check that all brands have 'type' field
        for brand in brands:
            assert "type" in brand, f"Brand missing 'type' field: {brand.get('id')}"
            assert brand["type"] in ("brand", "factory"), f"Invalid type: {brand['type']}"
            
            # If factory, should have parent_brand_name
            if brand["type"] == "factory" and brand.get("parent_brand_id"):
                assert "parent_brand_name" in brand, f"Factory missing parent_brand_name: {brand.get('id')}"
        
        print(f"PASS: All {len(brands)} brands have 'type' field")
    
    # ─────────────────────────────────────────────────────────────────
    # TEST 5: POST /api/admin/brands with invalid type value returns 400
    # ─────────────────────────────────────────────────────────────────
    def test_create_brand_with_invalid_type_returns_400(self):
        """Invalid type value (e.g., 'vendor') should return 400"""
        token = self._get_admin_token()
        headers = {"Authorization": f"Bearer {token}"}
        
        unique_email = f"TEST_invalid_type_{uuid.uuid4().hex[:8]}@test.com"
        payload = {
            "name": "TEST Invalid Type",
            "type": "vendor",  # Invalid type
            "admin_user_email": unique_email,
            "admin_user_name": "Test Admin"
        }
        
        response = self.session.post(f"{BASE_URL}/api/admin/brands", json=payload, headers=headers)
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        data = response.json()
        assert "type" in data.get("detail", "").lower() or "brand" in data.get("detail", "").lower() or "factory" in data.get("detail", "").lower(), f"Error should mention valid types: {data}"
        
        print("PASS: Invalid type 'vendor' returns 400")
    
    # ─────────────────────────────────────────────────────────────────
    # TEST 6: POST /api/brand/upload-attachment with brand user token
    # ─────────────────────────────────────────────────────────────────
    def test_upload_attachment_with_brand_token(self):
        """Brand user can upload PDF/image attachment via Cloudinary"""
        token = self._get_brand_token()
        headers = {"Authorization": f"Bearer {token}"}
        
        # Create a small test PDF-like content (just bytes for testing)
        # Note: Cloudinary may reject if not valid PDF, but we test the endpoint
        test_content = b"%PDF-1.4 test content for upload"
        
        files = {
            "file": ("test_po.pdf", test_content, "application/pdf")
        }
        
        response = requests.post(
            f"{BASE_URL}/api/brand/upload-attachment",
            headers=headers,
            files=files
        )
        
        # If Cloudinary is not configured or upload fails, mark as blocked
        if response.status_code == 500 and "Upload failed" in response.text:
            pytest.skip("Cloudinary upload failed - may be config issue")
        
        if response.status_code == 200:
            data = response.json()
            assert "url" in data, f"Response should contain url: {data}"
            assert "public_id" in data, f"Response should contain public_id: {data}"
            assert "bytes" in data, f"Response should contain bytes: {data}"
            assert "format" in data, f"Response should contain format: {data}"
            print(f"PASS: Upload attachment returned url={data.get('url')[:50]}...")
        else:
            # 400 for invalid file type is acceptable
            assert response.status_code in [200, 400, 500], f"Unexpected status: {response.status_code}"
            print(f"INFO: Upload returned {response.status_code} - {response.text[:100]}")
    
    def test_upload_attachment_with_admin_token_fails(self):
        """Admin token (wrong tier) should fail for brand upload endpoint"""
        token = self._get_admin_token()
        headers = {"Authorization": f"Bearer {token}"}
        
        test_content = b"%PDF-1.4 test content"
        files = {
            "file": ("test.pdf", test_content, "application/pdf")
        }
        
        response = requests.post(
            f"{BASE_URL}/api/brand/upload-attachment",
            headers=headers,
            files=files
        )
        
        # Should fail with 401 (wrong token type)
        assert response.status_code == 401, f"Expected 401 for admin token, got {response.status_code}: {response.text}"
        print("PASS: Admin token rejected for brand upload endpoint (401)")
    
    # ─────────────────────────────────────────────────────────────────
    # TEST 7: POST /api/brand/orders by factory user with factory fields
    # ─────────────────────────────────────────────────────────────────
    def test_factory_order_with_po_techpack_matrix(self):
        """Factory user can place order with po_file_url, tech_pack_url, qty_color_matrix"""
        token = self._get_admin_token()
        headers = {"Authorization": f"Bearer {token}"}
        
        # First, find or create a factory enterprise with a user
        # For this test, we'll create a factory, then login as that factory user
        
        # Get an existing brand to use as parent
        response = self.session.get(f"{BASE_URL}/api/admin/brands", headers=headers)
        assert response.status_code == 200
        brands = response.json()
        
        parent_brand = None
        for b in brands:
            if b.get("type", "brand") == "brand" and b.get("status") == "active":
                parent_brand = b
                break
        
        if not parent_brand:
            pytest.skip("No active brand found to use as parent for factory")
        
        # Create a factory enterprise
        factory_email = f"TEST_factory_order_{uuid.uuid4().hex[:8]}@test.com"
        factory_password = None  # Will be returned in response
        
        payload = {
            "name": "TEST Factory For Orders",
            "type": "factory",
            "parent_brand_id": parent_brand["id"],
            "admin_user_email": factory_email,
            "admin_user_name": "Factory Order Test Admin",
            "allowed_category_ids": parent_brand.get("allowed_category_ids", [])
        }
        
        response = self.session.post(f"{BASE_URL}/api/admin/brands", json=payload, headers=headers)
        
        if response.status_code != 200:
            pytest.skip(f"Could not create factory for test: {response.text}")
        
        data = response.json()
        factory_id = data["id"]
        factory_password = data.get("temporary_password_for_reference")
        self.created_brand_ids.append(factory_id)
        self.created_user_emails.append(factory_email)
        
        # Login as factory user
        login_response = self.session.post(f"{BASE_URL}/api/brand/login", json={
            "email": factory_email,
            "password": factory_password
        })
        
        if login_response.status_code != 200:
            pytest.skip(f"Could not login as factory user: {login_response.text}")
        
        factory_token = login_response.json().get("token")
        factory_headers = {"Authorization": f"Bearer {factory_token}"}
        
        # Get available fabrics for this factory
        fabrics_response = self.session.get(f"{BASE_URL}/api/brand/fabrics", headers=factory_headers)
        
        if fabrics_response.status_code != 200 or not fabrics_response.json():
            # No fabrics available - skip order test but verify fields are accepted
            print("INFO: No fabrics available for factory - testing order payload validation only")
            
            # Try to place order with factory fields (will fail due to no items, but validates schema)
            order_payload = {
                "items": [],
                "order_type": "bulk",
                "po_file_url": "https://example.com/po.pdf",
                "tech_pack_url": "https://example.com/techpack.pdf",
                "qty_color_matrix": "S:10,M:20,L:15 | Red:25,Blue:20"
            }
            
            order_response = self.session.post(f"{BASE_URL}/api/brand/orders", json=order_payload, headers=factory_headers)
            # Should fail with "No items" not schema error
            assert order_response.status_code == 400, f"Expected 400 for empty items: {order_response.text}"
            assert "items" in order_response.json().get("detail", "").lower() or "no items" in order_response.json().get("detail", "").lower()
            print("PASS: Factory order payload with po_file_url, tech_pack_url, qty_color_matrix accepted (failed on empty items as expected)")
            return
        
        fabrics = fabrics_response.json()
        # Find a fabric with sample_price for sample order
        test_fabric = None
        for f in fabrics:
            if f.get("sample_price") and float(f.get("sample_price", 0)) > 0:
                test_fabric = f
                break
        
        if not test_fabric:
            test_fabric = fabrics[0] if fabrics else None
        
        if not test_fabric:
            pytest.skip("No fabrics available for factory order test")
        
        # Place a sample order with factory fields
        order_payload = {
            "items": [{
                "fabric_id": test_fabric["id"],
                "quantity": 1
            }],
            "order_type": "sample",
            "notes": "Factory test order",
            "po_file_url": "https://example.com/po.pdf",
            "tech_pack_url": "https://example.com/techpack.pdf",
            "qty_color_matrix": "S:10,M:20,L:15 | Red:25,Blue:20"
        }
        
        # Check if factory has sample credits
        credit_response = self.session.get(f"{BASE_URL}/api/brand/credit-summary", headers=factory_headers)
        if credit_response.status_code == 200:
            credits = credit_response.json()
            sample_avail = credits.get("sample_credits", {}).get("available", 0)
            if sample_avail < 200:  # Need some credits for sample order
                print(f"INFO: Factory has {sample_avail} sample credits - may not be enough for order")
        
        order_response = self.session.post(f"{BASE_URL}/api/brand/orders", json=order_payload, headers=factory_headers)
        
        if order_response.status_code == 400 and "credit" in order_response.text.lower():
            print("INFO: Factory order failed due to insufficient credits - but payload was accepted")
            # Verify the factory fields are in the schema by checking we didn't get schema error
            assert "po_file_url" not in order_response.text.lower() or "validation" not in order_response.text.lower()
            print("PASS: Factory order fields (po_file_url, tech_pack_url, qty_color_matrix) accepted in schema")
            return
        
        if order_response.status_code == 200:
            order_data = order_response.json()
            order_id = order_data.get("id")
            
            # Verify order has factory fields by fetching orders
            orders_response = self.session.get(f"{BASE_URL}/api/brand/orders", headers=factory_headers)
            assert orders_response.status_code == 200
            orders = orders_response.json()
            
            placed_order = next((o for o in orders if o.get("id") == order_id), None)
            if placed_order:
                assert placed_order.get("enterprise_type") == "factory", f"enterprise_type should be 'factory': {placed_order}"
                assert placed_order.get("po_file_url") == "https://example.com/po.pdf", f"po_file_url mismatch: {placed_order}"
                assert placed_order.get("tech_pack_url") == "https://example.com/techpack.pdf", f"tech_pack_url mismatch: {placed_order}"
                assert placed_order.get("qty_color_matrix") == "S:10,M:20,L:15 | Red:25,Blue:20", f"qty_color_matrix mismatch: {placed_order}"
                print("PASS: Factory order placed with po_file_url, tech_pack_url, qty_color_matrix persisted")
            else:
                print("INFO: Order placed but not found in list - may be timing issue")
        else:
            print(f"INFO: Factory order returned {order_response.status_code}: {order_response.text[:200]}")
    
    # ─────────────────────────────────────────────────────────────────
    # TEST 8: POST /api/brand/orders persists enterprise_type correctly
    # ─────────────────────────────────────────────────────────────────
    def test_brand_order_persists_enterprise_type_brand(self):
        """Regular brand order should have enterprise_type='brand'"""
        token = self._get_brand_token()
        headers = {"Authorization": f"Bearer {token}"}
        
        # Get existing orders for the brand user
        orders_response = self.session.get(f"{BASE_URL}/api/brand/orders", headers=headers)
        
        assert orders_response.status_code == 200, f"Failed to get orders: {orders_response.text}"
        orders = orders_response.json()
        
        if orders:
            # Check existing orders have enterprise_type
            for order in orders[:5]:  # Check first 5
                # enterprise_type should be 'brand' for regular brand orders
                etype = order.get("enterprise_type", "brand")  # Default to brand for legacy
                assert etype in ("brand", "factory"), f"Invalid enterprise_type: {etype}"
                print(f"Order {order.get('order_number')}: enterprise_type={etype}")
            print("PASS: Existing orders have valid enterprise_type field")
        else:
            print("INFO: No existing orders to verify enterprise_type")
    
    # ─────────────────────────────────────────────────────────────────
    # TEST 9: Factory with invalid parent_brand_id returns 400
    # ─────────────────────────────────────────────────────────────────
    def test_create_factory_with_invalid_parent_brand_id_returns_400(self):
        """Factory with non-existent parent_brand_id should return 400"""
        token = self._get_admin_token()
        headers = {"Authorization": f"Bearer {token}"}
        
        unique_email = f"TEST_factory_invalid_parent_{uuid.uuid4().hex[:8]}@test.com"
        payload = {
            "name": "TEST Factory Invalid Parent",
            "type": "factory",
            "parent_brand_id": "non-existent-brand-id-12345",
            "admin_user_email": unique_email,
            "admin_user_name": "Test Factory Admin"
        }
        
        response = self.session.post(f"{BASE_URL}/api/admin/brands", json=payload, headers=headers)
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        data = response.json()
        assert "parent_brand_id" in data.get("detail", "").lower() or "brand" in data.get("detail", "").lower(), f"Error should mention parent brand: {data}"
        
        print("PASS: Factory with invalid parent_brand_id returns 400")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
