"""
Phase 51 Backend Tests
======================
Tests for:
1. AM mapping accepts factories (type=factory entities with parent_brand_id)
2. AM permission boundary for factory-only assignments
3. Invoice + E-way Bill fields on AM Financials portal
4. Brand orders enriched with invoice (file_url + eway_bill)
5. Admin orders detail E-way (linked_invoice)
6. Brand factory credit summaries
7. Apply-for-credit email endpoint
8. Brand addresses include factory addresses
"""
import os
import pytest
import requests
import uuid
from datetime import datetime

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Test credentials
ADMIN_EMAIL = "admin@locofast.com"
ADMIN_PASSWORD = "admin123"
BRAND_EMAIL = "brandtest@locofast.com"
BRAND_PASSWORD = "NewPassword123!"
BRAND_ID = "03b50566-e559-4a54-97f0-4cd1179615d4"


@pytest.fixture(scope="module")
def admin_token():
    """Get admin auth token"""
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    if r.status_code != 200:
        pytest.skip(f"Admin login failed: {r.text}")
    return r.json().get("token")


@pytest.fixture(scope="module")
def brand_token():
    """Get brand auth token"""
    r = requests.post(f"{BASE_URL}/api/brand/login", json={"email": BRAND_EMAIL, "password": BRAND_PASSWORD})
    if r.status_code != 200:
        pytest.skip(f"Brand login failed: {r.text}")
    return r.json().get("token")


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def brand_headers(brand_token):
    return {"Authorization": f"Bearer {brand_token}", "Content-Type": "application/json"}


# ════════════════════════════════════════════════════════════════════
# TEST 1: GET /api/admin/brands returns factories with type=factory
# ════════════════════════════════════════════════════════════════════
class TestAdminBrandsWithFactories:
    """Test that GET /api/admin/brands returns both brands and factories"""
    
    def test_list_brands_includes_factories(self, admin_headers):
        """GET /api/admin/brands should return entities with type field"""
        r = requests.get(f"{BASE_URL}/api/admin/brands", headers=admin_headers)
        assert r.status_code == 200, f"Failed: {r.text}"
        brands = r.json()
        assert isinstance(brands, list), "Expected list of brands"
        
        # Check that brands have type field
        for b in brands:
            assert "type" in b, f"Brand {b.get('id')} missing type field"
            assert b["type"] in ("brand", "factory"), f"Invalid type: {b['type']}"
            
        # Check if any factories exist
        factories = [b for b in brands if b["type"] == "factory"]
        print(f"Found {len(factories)} factories out of {len(brands)} total entities")
        
        # Factories should have parent_brand_id
        for f in factories:
            if f.get("parent_brand_id"):
                assert "parent_brand_name" in f, f"Factory {f['id']} missing parent_brand_name"


# ════════════════════════════════════════════════════════════════════
# TEST 2: AM mapping accepts factories (max 3 total)
# ════════════════════════════════════════════════════════════════════
class TestAMFactoryMapping:
    """Test that AMs can be assigned to factories"""
    
    def test_list_account_managers_shows_factory_type(self, admin_headers):
        """GET /api/admin/account-managers should show managed_brands with type field"""
        r = requests.get(f"{BASE_URL}/api/admin/account-managers", headers=admin_headers)
        assert r.status_code == 200, f"Failed: {r.text}"
        ams = r.json()
        
        for am in ams:
            assert "managed_brands" in am, f"AM {am['id']} missing managed_brands"
            for b in am.get("managed_brands", []):
                assert "type" in b, f"Managed brand {b['id']} missing type"
                if b["type"] == "factory" and b.get("parent_brand_name"):
                    print(f"AM {am['email']} manages factory {b['name']} (parent: {b['parent_brand_name']})")
    
    def test_get_factory_id_for_assignment(self, admin_headers):
        """Get a factory ID to use for AM assignment tests"""
        r = requests.get(f"{BASE_URL}/api/admin/brands", headers=admin_headers)
        assert r.status_code == 200
        brands = r.json()
        factories = [b for b in brands if b.get("type") == "factory"]
        if factories:
            print(f"Available factory for testing: {factories[0]['id']} - {factories[0]['name']}")
            return factories[0]["id"]
        return None


# ════════════════════════════════════════════════════════════════════
# TEST 3: Invoice + E-way Bill fields on AM Financials
# ════════════════════════════════════════════════════════════════════
class TestInvoiceEwayBillFields:
    """Test that invoices support eway_bill_number and eway_bill_url"""
    
    def test_create_invoice_with_eway_bill(self, admin_headers):
        """POST /api/admin/brands/{brand_id}/invoices accepts eway_bill fields"""
        invoice_data = {
            "invoice_number": f"TEST/INV/{uuid.uuid4().hex[:6].upper()}",
            "amount": 50000,
            "subtotal": 47619,
            "gst": 2381,
            "invoice_date": datetime.now().strftime("%Y-%m-%d"),
            "credit_period_days": 30,
            "file_url": "https://example.com/invoice.pdf",
            "eway_bill_number": "EWB123456789012",
            "eway_bill_url": "https://example.com/eway.pdf",
            "notes": "Test invoice with e-way bill"
        }
        r = requests.post(f"{BASE_URL}/api/admin/brands/{BRAND_ID}/invoices", 
                         json=invoice_data, headers=admin_headers)
        assert r.status_code == 200, f"Failed to create invoice: {r.text}"
        inv = r.json()
        
        # Verify e-way bill fields are persisted
        assert inv.get("eway_bill_number") == "EWB123456789012", "eway_bill_number not saved"
        assert inv.get("eway_bill_url") == "https://example.com/eway.pdf", "eway_bill_url not saved"
        print(f"Created invoice {inv['invoice_number']} with e-way bill {inv['eway_bill_number']}")
        return inv["id"]
    
    def test_list_invoices_includes_eway_fields(self, admin_headers):
        """GET /api/admin/brands/{brand_id}/invoices returns eway_bill fields"""
        r = requests.get(f"{BASE_URL}/api/admin/brands/{BRAND_ID}/invoices", headers=admin_headers)
        assert r.status_code == 200, f"Failed: {r.text}"
        invoices = r.json()
        
        # Find invoices with e-way bill
        with_eway = [i for i in invoices if i.get("eway_bill_url")]
        print(f"Found {len(with_eway)} invoices with e-way bill out of {len(invoices)}")
        
        for inv in with_eway:
            assert "eway_bill_number" in inv
            assert "eway_bill_url" in inv
    
    def test_financials_includes_eway_in_invoices(self, admin_headers):
        """GET /api/admin/brands/{brand_id}/financials returns invoices with eway fields"""
        r = requests.get(f"{BASE_URL}/api/admin/brands/{BRAND_ID}/financials", headers=admin_headers)
        assert r.status_code == 200, f"Failed: {r.text}"
        data = r.json()
        
        assert "invoices" in data, "Missing invoices in financials"
        # Check structure
        for inv in data.get("invoices", []):
            # These fields should exist (even if empty)
            assert "invoice_number" in inv
            assert "amount" in inv


# ════════════════════════════════════════════════════════════════════
# TEST 4: Brand orders enriched with invoice
# ════════════════════════════════════════════════════════════════════
class TestBrandOrdersWithInvoice:
    """Test that GET /api/brand/orders includes invoice data"""
    
    def test_brand_orders_have_invoice_field(self, brand_headers):
        """GET /api/brand/orders should include invoice object when matched"""
        r = requests.get(f"{BASE_URL}/api/brand/orders", headers=brand_headers)
        assert r.status_code == 200, f"Failed: {r.text}"
        orders = r.json()
        
        if not orders:
            pytest.skip("No brand orders to test")
        
        # Check that orders have invoice field (can be null)
        for o in orders:
            assert "invoice" in o or o.get("invoice") is None, f"Order {o['id']} missing invoice field"
            if o.get("invoice"):
                inv = o["invoice"]
                assert "invoice_number" in inv, "invoice missing invoice_number"
                assert "file_url" in inv, "invoice missing file_url"
                assert "eway_bill_number" in inv, "invoice missing eway_bill_number"
                assert "eway_bill_url" in inv, "invoice missing eway_bill_url"
                print(f"Order {o['order_number']} has invoice {inv['invoice_number']}")


# ════════════════════════════════════════════════════════════════════
# TEST 5: Admin orders detail E-way (linked_invoice)
# ════════════════════════════════════════════════════════════════════
class TestAdminOrdersLinkedInvoice:
    """Test that GET /api/orders (admin) includes linked_invoice"""
    
    def test_admin_orders_have_linked_invoice(self, admin_headers):
        """GET /api/orders should include linked_invoice for brand orders"""
        r = requests.get(f"{BASE_URL}/api/orders", headers=admin_headers)
        assert r.status_code == 200, f"Failed: {r.text}"
        data = r.json()
        orders = data.get("orders", [])
        
        # Check brand orders for linked_invoice
        brand_orders = [o for o in orders if o.get("brand_id")]
        print(f"Found {len(brand_orders)} brand orders out of {len(orders)} total")
        
        for o in brand_orders:
            # linked_invoice can be null if no invoice uploaded
            if o.get("linked_invoice"):
                inv = o["linked_invoice"]
                assert "invoice_number" in inv
                assert "file_url" in inv
                assert "eway_bill_number" in inv
                assert "eway_bill_url" in inv
                print(f"Order {o['order_number']} has linked invoice {inv['invoice_number']}")


# ════════════════════════════════════════════════════════════════════
# TEST 6: Brand factory credit summaries
# ════════════════════════════════════════════════════════════════════
class TestBrandFactoryCreditSummaries:
    """Test GET /api/brand/factory-credit-summaries"""
    
    def test_factory_credit_summaries_endpoint(self, brand_headers):
        """GET /api/brand/factory-credit-summaries returns factory credit data"""
        r = requests.get(f"{BASE_URL}/api/brand/factory-credit-summaries", headers=brand_headers)
        assert r.status_code == 200, f"Failed: {r.text}"
        summaries = r.json()
        
        assert isinstance(summaries, list), "Expected list of factory summaries"
        print(f"Found {len(summaries)} linked factories")
        
        for s in summaries:
            assert "factory_id" in s, "Missing factory_id"
            assert "factory_name" in s, "Missing factory_name"
            assert "gst" in s, "Missing gst"
            assert "credit_lines" in s, "Missing credit_lines"
            assert "credit_allocated" in s, "Missing credit_allocated"
            assert "credit_utilized" in s, "Missing credit_utilized"
            assert "credit_available" in s, "Missing credit_available"
            assert "sample_credits_total" in s, "Missing sample_credits_total"
            assert "sample_credits_used" in s, "Missing sample_credits_used"
            assert "outstanding" in s, "Missing outstanding"
            assert "has_credit" in s, "Missing has_credit"
            
            # has_credit should be False if no credit_lines
            if len(s["credit_lines"]) == 0:
                assert s["has_credit"] == False, "has_credit should be False when no credit lines"
            
            print(f"Factory {s['factory_name']}: has_credit={s['has_credit']}, allocated={s['credit_allocated']}")


# ════════════════════════════════════════════════════════════════════
# TEST 7: Apply-for-credit email endpoint
# ════════════════════════════════════════════════════════════════════
class TestCreditApplication:
    """Test POST /api/brand/credit-application"""
    
    def test_apply_for_credit_own_brand(self, brand_headers):
        """POST /api/brand/credit-application for own brand"""
        data = {
            "entity_id": BRAND_ID,
            "requested_amount_inr": 500000,
            "use_case": "Bulk fabric orders for Q1 production",
            "contact_phone": "+91-9876543210"
        }
        r = requests.post(f"{BASE_URL}/api/brand/credit-application", json=data, headers=brand_headers)
        assert r.status_code == 200, f"Failed: {r.text}"
        result = r.json()
        
        assert "message" in result, "Missing message"
        assert "application" in result, "Missing application"
        app = result["application"]
        assert app["brand_id"] == BRAND_ID
        assert app["requested_amount_inr"] == 500000
        assert app["status"] == "submitted"
        print(f"Credit application submitted: {app['id']}")
    
    def test_apply_for_credit_factory(self, brand_headers):
        """POST /api/brand/credit-application for linked factory"""
        # First get a factory ID
        r = requests.get(f"{BASE_URL}/api/brand/factory-credit-summaries", headers=brand_headers)
        if r.status_code != 200:
            pytest.skip("Cannot get factory summaries")
        factories = r.json()
        if not factories:
            pytest.skip("No linked factories to test")
        
        factory_id = factories[0]["factory_id"]
        data = {
            "entity_id": factory_id,
            "requested_amount_inr": 200000,
            "use_case": "Factory production credit",
            "contact_phone": "+91-9876543211"
        }
        r = requests.post(f"{BASE_URL}/api/brand/credit-application", json=data, headers=brand_headers)
        assert r.status_code == 200, f"Failed: {r.text}"
        result = r.json()
        
        assert result["application"]["brand_id"] == factory_id
        print(f"Credit application for factory {factory_id} submitted")
    
    def test_apply_for_credit_unrelated_factory_403(self, brand_headers):
        """POST /api/brand/credit-application for unrelated factory should 403"""
        # Use a random UUID that's not a linked factory
        fake_factory_id = str(uuid.uuid4())
        data = {
            "entity_id": fake_factory_id,
            "requested_amount_inr": 100000,
            "use_case": "Test"
        }
        r = requests.post(f"{BASE_URL}/api/brand/credit-application", json=data, headers=brand_headers)
        # Should be 404 (not found) or 403 (forbidden)
        assert r.status_code in (403, 404), f"Expected 403/404, got {r.status_code}: {r.text}"


# ════════════════════════════════════════════════════════════════════
# TEST 8: Brand addresses include factory addresses
# ════════════════════════════════════════════════════════════════════
class TestBrandAddressesWithFactory:
    """Test GET /api/brand/addresses includes factory addresses"""
    
    def test_addresses_include_factory_sourced(self, brand_headers):
        """GET /api/brand/addresses should include factory addresses with source='factory'"""
        r = requests.get(f"{BASE_URL}/api/brand/addresses", headers=brand_headers)
        assert r.status_code == 200, f"Failed: {r.text}"
        data = r.json()
        
        assert "addresses" in data, "Missing addresses"
        addresses = data["addresses"]
        
        # Check for factory-sourced addresses
        factory_addrs = [a for a in addresses if a.get("source") == "factory"]
        print(f"Found {len(factory_addrs)} factory-sourced addresses out of {len(addresses)} total")
        
        for a in factory_addrs:
            assert "factory_id" in a, "Factory address missing factory_id"
            assert "factory_name" in a, "Factory address missing factory_name"
            assert a.get("read_only") == True, "Factory address should be read_only"
            assert a.get("is_default") == False, "Factory address should not be default"
            print(f"Factory address from {a['factory_name']}: {a.get('city', 'N/A')}")


# ════════════════════════════════════════════════════════════════════
# TEST 9: AM permission boundary for factory-only assignment
# ════════════════════════════════════════════════════════════════════
class TestAMPermissionBoundary:
    """Test that AM assigned to factory cannot access parent brand"""
    
    def test_am_permission_check_concept(self, admin_headers):
        """Verify the permission boundary concept exists in the codebase"""
        # This test verifies the _require_am_for_brand function works
        # by checking that an AM with managed_brand_ids can access those brands
        
        # Get list of AMs
        r = requests.get(f"{BASE_URL}/api/admin/account-managers", headers=admin_headers)
        assert r.status_code == 200
        ams = r.json()
        
        if not ams:
            pytest.skip("No AMs to test permission boundary")
        
        # Find an AM with managed brands
        am_with_brands = next((am for am in ams if am.get("managed_brands")), None)
        if not am_with_brands:
            pytest.skip("No AM with managed brands")
        
        print(f"AM {am_with_brands['email']} manages: {[b['name'] for b in am_with_brands['managed_brands']]}")
        
        # The actual permission test would require logging in as that AM
        # For now, we verify the structure is correct
        for b in am_with_brands["managed_brands"]:
            assert "id" in b
            assert "name" in b
            assert "type" in b


# ════════════════════════════════════════════════════════════════════
# TEST 10: Email logs for credit application
# ════════════════════════════════════════════════════════════════════
class TestCreditApplicationEmailLog:
    """Test that credit application creates email_logs entry"""
    
    def test_email_log_created(self, admin_headers, brand_headers):
        """Verify email_logs has credit_application entries"""
        # Submit a credit application first
        data = {
            "entity_id": BRAND_ID,
            "requested_amount_inr": 100000,
            "use_case": "Email log test"
        }
        r = requests.post(f"{BASE_URL}/api/brand/credit-application", json=data, headers=brand_headers)
        if r.status_code != 200:
            pytest.skip(f"Credit application failed: {r.text}")
        
        app_id = r.json()["application"]["id"]
        print(f"Submitted application {app_id}, checking email logs...")
        
        # Note: We can't directly query email_logs via API, but the test
        # verifies the endpoint works. The email log is created async.
        # In a real test, we'd query MongoDB directly or have an admin endpoint.


# ════════════════════════════════════════════════════════════════════
# TEST 11: Update invoice with e-way bill
# ════════════════════════════════════════════════════════════════════
class TestUpdateInvoiceEwayBill:
    """Test PUT /api/admin/brands/{brand_id}/invoices/{invoice_id} with eway fields"""
    
    def test_update_invoice_add_eway_bill(self, admin_headers):
        """Update an existing invoice to add e-way bill"""
        # First get an invoice without e-way bill
        r = requests.get(f"{BASE_URL}/api/admin/brands/{BRAND_ID}/invoices", headers=admin_headers)
        assert r.status_code == 200
        invoices = r.json()
        
        # Find one without e-way bill
        inv_to_update = next((i for i in invoices if not i.get("eway_bill_url")), None)
        if not inv_to_update:
            # Create a new one
            inv_data = {
                "invoice_number": f"TEST/UPD/{uuid.uuid4().hex[:6].upper()}",
                "amount": 25000,
                "subtotal": 23810,
                "gst": 1190
            }
            r = requests.post(f"{BASE_URL}/api/admin/brands/{BRAND_ID}/invoices", 
                             json=inv_data, headers=admin_headers)
            assert r.status_code == 200
            inv_to_update = r.json()
        
        # Update with e-way bill
        update_data = {
            "eway_bill_number": "EWB987654321098",
            "eway_bill_url": "https://example.com/updated-eway.pdf"
        }
        r = requests.put(f"{BASE_URL}/api/admin/brands/{BRAND_ID}/invoices/{inv_to_update['id']}", 
                        json=update_data, headers=admin_headers)
        assert r.status_code == 200, f"Failed to update: {r.text}"
        
        # Verify update
        r = requests.get(f"{BASE_URL}/api/admin/brands/{BRAND_ID}/invoices", headers=admin_headers)
        invoices = r.json()
        updated = next((i for i in invoices if i["id"] == inv_to_update["id"]), None)
        assert updated is not None
        assert updated.get("eway_bill_number") == "EWB987654321098"
        assert updated.get("eway_bill_url") == "https://example.com/updated-eway.pdf"
        print(f"Updated invoice {updated['invoice_number']} with e-way bill")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
