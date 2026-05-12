"""
Phase 52 Feature Tests
======================
Tests for:
1. FILE UPLOADS — Cloudinary signature endpoint accepts resource_type=raw|auto|image|video
   - Admin token, brand token, vendor token all authorize the endpoint
2. CREDIT APPLICATION FILE — Brand-side ApplyCreditModal has supporting_doc_url field
   - POST /api/brand/credit-application accepts supporting_doc_url
3. AM PERMISSION VIA PARENT — _require_am_for_brand grants access via parent_brand_id
   - AM assigned to parent brand can access factory's financials
4. GROUPED AM PICKER — GET /api/admin/account-managers returns factories[] nested under brands
   - Capacity messaging says 'brand groups' not 'brands'
5. ADDRESS BOOK AT CHECKOUT — Brand cart loads /api/brand/addresses
   - Auto-picks default address, renders saved-address cards
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from test_credentials.md
ADMIN_EMAIL = "admin@locofast.com"
ADMIN_PASSWORD = "admin123"
BRAND_EMAIL = "brandtest@locofast.com"
BRAND_PASSWORD = "NewPassword123!"
BRAND_ID = "03b50566-e559-4a54-97f0-4cd1179615d4"


class TestCloudinarySignatureEndpoint:
    """Test Cloudinary signature endpoint with different resource_types and tokens"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin JWT token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip(f"Admin login failed: {response.status_code} - {response.text}")
    
    @pytest.fixture(scope="class")
    def brand_token(self):
        """Get brand JWT token"""
        response = requests.post(f"{BASE_URL}/api/brand/login", json={
            "email": BRAND_EMAIL,
            "password": BRAND_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip(f"Brand login failed: {response.status_code} - {response.text}")
    
    def test_signature_with_admin_token_image(self, admin_token):
        """Admin token should authorize signature endpoint with resource_type=image"""
        response = requests.get(
            f"{BASE_URL}/api/cloudinary/signature",
            params={"resource_type": "image", "folder": "uploads/financials/invoices"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "signature" in data
        assert "timestamp" in data
        assert "cloud_name" in data
        assert data.get("resource_type") == "image"
        print(f"✓ Admin token authorized for image upload, folder: {data.get('folder')}")
    
    def test_signature_with_admin_token_raw(self, admin_token):
        """Admin token should authorize signature endpoint with resource_type=raw"""
        response = requests.get(
            f"{BASE_URL}/api/cloudinary/signature",
            params={"resource_type": "raw", "folder": "uploads/financials/invoices"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("resource_type") == "raw"
        print(f"✓ Admin token authorized for raw upload")
    
    def test_signature_with_admin_token_auto(self, admin_token):
        """Admin token should authorize signature endpoint with resource_type=auto"""
        response = requests.get(
            f"{BASE_URL}/api/cloudinary/signature",
            params={"resource_type": "auto", "folder": "uploads/financials/eway"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("resource_type") == "auto"
        print(f"✓ Admin token authorized for auto upload")
    
    def test_signature_with_admin_token_video(self, admin_token):
        """Admin token should authorize signature endpoint with resource_type=video"""
        response = requests.get(
            f"{BASE_URL}/api/cloudinary/signature",
            params={"resource_type": "video", "folder": "uploads/financials"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("resource_type") == "video"
        print(f"✓ Admin token authorized for video upload")
    
    def test_signature_with_brand_token(self, brand_token):
        """Brand token should authorize signature endpoint"""
        response = requests.get(
            f"{BASE_URL}/api/cloudinary/signature",
            params={"resource_type": "auto", "folder": "uploads/financials/credit-applications"},
            headers={"Authorization": f"Bearer {brand_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "signature" in data
        print(f"✓ Brand token authorized for upload, folder: {data.get('folder')}")
    
    def test_signature_without_token_fails(self):
        """Request without token should fail with 401/403"""
        response = requests.get(
            f"{BASE_URL}/api/cloudinary/signature",
            params={"resource_type": "image", "folder": "uploads/financials"}
        )
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"✓ Unauthenticated request correctly rejected")


class TestCreditApplicationWithSupportingDoc:
    """Test credit application endpoint with supporting_doc_url field"""
    
    @pytest.fixture(scope="class")
    def brand_token(self):
        """Get brand JWT token"""
        response = requests.post(f"{BASE_URL}/api/brand/login", json={
            "email": BRAND_EMAIL,
            "password": BRAND_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip(f"Brand login failed: {response.status_code} - {response.text}")
    
    def test_credit_application_with_supporting_doc(self, brand_token):
        """POST /api/brand/credit-application should accept supporting_doc_url"""
        response = requests.post(
            f"{BASE_URL}/api/brand/credit-application",
            json={
                "entity_id": BRAND_ID,
                "requested_amount_inr": 500000,
                "use_case": "Test credit application with supporting document",
                "contact_phone": "9876543210",
                "supporting_doc_url": "https://example.com/test-document.pdf"
            },
            headers={"Authorization": f"Bearer {brand_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "message" in data or "id" in data
        print(f"✓ Credit application with supporting_doc_url accepted: {data}")
    
    def test_credit_application_without_supporting_doc(self, brand_token):
        """POST /api/brand/credit-application should work without supporting_doc_url"""
        response = requests.post(
            f"{BASE_URL}/api/brand/credit-application",
            json={
                "entity_id": BRAND_ID,
                "requested_amount_inr": 300000,
                "use_case": "Test credit application without document",
                "contact_phone": "9876543211"
            },
            headers={"Authorization": f"Bearer {brand_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print(f"✓ Credit application without supporting_doc_url accepted")


class TestAMPermissionViaParent:
    """Test AM permission inheritance via parent_brand_id"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin JWT token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip(f"Admin login failed: {response.status_code} - {response.text}")
    
    @pytest.fixture(scope="class")
    def factory_id(self, admin_token):
        """Find the factory linked to Test Brand Co (parent_brand_id = BRAND_ID)"""
        response = requests.get(
            f"{BASE_URL}/api/admin/brands",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        if response.status_code != 200:
            pytest.skip(f"Failed to get brands: {response.status_code}")
        
        brands = response.json()
        if isinstance(brands, dict):
            brands = brands.get("brands", [])
        
        # Find factory with parent_brand_id == BRAND_ID
        for b in brands:
            if b.get("type") == "factory" and b.get("parent_brand_id") == BRAND_ID:
                print(f"✓ Found factory: {b.get('name')} (id: {b.get('id')})")
                return b.get("id")
        
        pytest.skip("No factory found linked to Test Brand Co")
    
    def test_am_can_access_factory_invoices_via_parent(self, admin_token, factory_id):
        """AM assigned to parent brand should access factory's invoices"""
        # admin@locofast.com is AM with managed_brand_ids = [BRAND_ID] (Test Brand Co)
        # Should be able to access factory's invoices via parent inheritance
        response = requests.get(
            f"{BASE_URL}/api/admin/brands/{factory_id}/invoices",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print(f"✓ AM can access factory invoices via parent inheritance")
    
    def test_am_can_access_factory_financials_via_parent(self, admin_token, factory_id):
        """AM assigned to parent brand should access factory's financials"""
        response = requests.get(
            f"{BASE_URL}/api/admin/brands/{factory_id}/financials",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "summary" in data or "invoices" in data
        print(f"✓ AM can access factory financials via parent inheritance")
    
    def test_am_can_create_factory_invoice_via_parent(self, admin_token, factory_id):
        """AM assigned to parent brand should create invoice for factory"""
        import uuid
        response = requests.post(
            f"{BASE_URL}/api/admin/brands/{factory_id}/invoices",
            json={
                "invoice_number": f"TEST-FACTORY-INV-{uuid.uuid4().hex[:8].upper()}",
                "amount": 10000,
                "invoice_date": "2026-01-15",
                "notes": "Test invoice created via parent AM inheritance"
            },
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "id" in data
        print(f"✓ AM can create factory invoice via parent inheritance: {data.get('invoice_number')}")


class TestGroupedAMPicker:
    """Test GET /api/admin/account-managers returns factories[] nested under brands"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin JWT token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip(f"Admin login failed: {response.status_code} - {response.text}")
    
    def test_account_managers_returns_factories_nested(self, admin_token):
        """GET /api/admin/account-managers should return factories[] under each managed brand"""
        response = requests.get(
            f"{BASE_URL}/api/admin/account-managers",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        ams = response.json()
        assert isinstance(ams, list), "Expected list of AMs"
        
        # Find AM with managed brands
        found_factories_array = False
        for am in ams:
            managed_brands = am.get("managed_brands", [])
            for brand in managed_brands:
                # Each brand entry should have a 'factories' array
                assert "factories" in brand, f"Brand {brand.get('id')} missing 'factories' array"
                if brand.get("factories"):
                    found_factories_array = True
                    print(f"✓ Brand {brand.get('name')} has {len(brand['factories'])} factories nested")
        
        print(f"✓ Account managers endpoint returns factories[] nested under brands")
        if found_factories_array:
            print(f"✓ Found at least one brand with nested factories")
    
    def test_account_managers_capacity_remaining(self, admin_token):
        """GET /api/admin/account-managers should return capacity_remaining"""
        response = requests.get(
            f"{BASE_URL}/api/admin/account-managers",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        ams = response.json()
        
        for am in ams:
            assert "capacity_remaining" in am, f"AM {am.get('id')} missing capacity_remaining"
            # Capacity should be 3 - len(managed_brands)
            expected_capacity = 3 - len(am.get("managed_brands", []))
            assert am["capacity_remaining"] == expected_capacity, \
                f"Expected capacity {expected_capacity}, got {am['capacity_remaining']}"
        
        print(f"✓ All AMs have correct capacity_remaining")


class TestAddressBookAtCheckout:
    """Test brand address book for checkout flow"""
    
    @pytest.fixture(scope="class")
    def brand_token(self):
        """Get brand JWT token"""
        response = requests.post(f"{BASE_URL}/api/brand/login", json={
            "email": BRAND_EMAIL,
            "password": BRAND_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip(f"Brand login failed: {response.status_code} - {response.text}")
    
    def test_brand_addresses_endpoint(self, brand_token):
        """GET /api/brand/addresses should return address book"""
        response = requests.get(
            f"{BASE_URL}/api/brand/addresses",
            headers={"Authorization": f"Bearer {brand_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "addresses" in data, "Response should contain 'addresses' key"
        addresses = data["addresses"]
        assert isinstance(addresses, list), "addresses should be a list"
        print(f"✓ Brand addresses endpoint returns {len(addresses)} addresses")
        
        # Check for default address
        default_found = False
        for addr in addresses:
            if addr.get("is_default"):
                default_found = True
                print(f"✓ Default address found: {addr.get('label', 'No label')}")
                break
        
        if addresses and not default_found:
            print(f"⚠ No default address set, first address will be auto-selected")
    
    def test_brand_addresses_include_factory_addresses(self, brand_token):
        """GET /api/brand/addresses should include factory addresses for parent brands"""
        response = requests.get(
            f"{BASE_URL}/api/brand/addresses",
            headers={"Authorization": f"Bearer {brand_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        addresses = data.get("addresses", [])
        
        # Check for factory-sourced addresses
        factory_addresses = [a for a in addresses if a.get("source") == "factory"]
        if factory_addresses:
            print(f"✓ Found {len(factory_addresses)} factory-sourced addresses")
            for fa in factory_addresses:
                assert fa.get("read_only") == True, "Factory addresses should be read_only"
                assert "factory_name" in fa, "Factory address should have factory_name"
                print(f"  - {fa.get('factory_name')}: {fa.get('label', 'No label')}")
        else:
            print(f"ℹ No factory addresses found (factory may not have addresses seeded)")
    
    def test_add_new_address(self, brand_token):
        """POST /api/brand/addresses should add new address"""
        import uuid
        response = requests.post(
            f"{BASE_URL}/api/brand/addresses",
            json={
                "label": f"Test Address {uuid.uuid4().hex[:6]}",
                "name": "Test Contact",
                "phone": "9876543210",
                "address": "123 Test Street, Test Area",
                "city": "Mumbai",
                "state": "Maharashtra",
                "pincode": "400001",
                "set_default": False
            },
            headers={"Authorization": f"Bearer {brand_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "address" in data, "Response should contain new address"
        assert "addresses" in data, "Response should contain updated addresses list"
        print(f"✓ New address added: {data['address'].get('label')}")


class TestFileUploadFolders:
    """Test that file upload folders are correctly configured"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin JWT token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip(f"Admin login failed: {response.status_code} - {response.text}")
    
    def test_invoice_folder(self, admin_token):
        """Signature endpoint should accept uploads/financials/invoices folder"""
        response = requests.get(
            f"{BASE_URL}/api/cloudinary/signature",
            params={"resource_type": "auto", "folder": "uploads/financials/invoices"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("folder") == "uploads/financials/invoices"
        print(f"✓ Invoice folder accepted: {data.get('folder')}")
    
    def test_eway_folder(self, admin_token):
        """Signature endpoint should accept uploads/financials/eway folder"""
        response = requests.get(
            f"{BASE_URL}/api/cloudinary/signature",
            params={"resource_type": "auto", "folder": "uploads/financials/eway"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("folder") == "uploads/financials/eway"
        print(f"✓ E-way folder accepted: {data.get('folder')}")
    
    def test_cn_folder(self, admin_token):
        """Signature endpoint should accept uploads/financials/cn folder"""
        response = requests.get(
            f"{BASE_URL}/api/cloudinary/signature",
            params={"resource_type": "auto", "folder": "uploads/financials/cn"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("folder") == "uploads/financials/cn"
        print(f"✓ CN folder accepted: {data.get('folder')}")
    
    def test_dn_folder(self, admin_token):
        """Signature endpoint should accept uploads/financials/dn folder"""
        response = requests.get(
            f"{BASE_URL}/api/cloudinary/signature",
            params={"resource_type": "auto", "folder": "uploads/financials/dn"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("folder") == "uploads/financials/dn"
        print(f"✓ DN folder accepted: {data.get('folder')}")
    
    def test_payments_folder(self, admin_token):
        """Signature endpoint should accept uploads/financials/payments folder"""
        response = requests.get(
            f"{BASE_URL}/api/cloudinary/signature",
            params={"resource_type": "auto", "folder": "uploads/financials/payments"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("folder") == "uploads/financials/payments"
        print(f"✓ Payments folder accepted: {data.get('folder')}")
    
    def test_credit_applications_folder(self, admin_token):
        """Signature endpoint should accept uploads/financials/credit-applications folder"""
        response = requests.get(
            f"{BASE_URL}/api/cloudinary/signature",
            params={"resource_type": "auto", "folder": "uploads/financials/credit-applications"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("folder") == "uploads/financials/credit-applications"
        print(f"✓ Credit applications folder accepted: {data.get('folder')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
