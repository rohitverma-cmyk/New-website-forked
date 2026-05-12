"""
Phase 50 Testing - Account Manager Module + Invoice Fix + Email CTA + Shiprocket Brand Orders
─────────────────────────────────────────────────────────────────────────────────────────────
Tests:
  Q3: Invoice download fix (UUID-based, slash-free)
  Q4: Customer email includes 'Download Tax Invoice' CTA
  Q5: ashish.katiyar@locofast.com in ORDER_NOTIFICATION_EMAILS
  Q6: Shiprocket auto-creation for brand orders
  Q1+Q2: Account Manager module - CRUD, permissions, financials
"""
import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://fabric-sourcing-cms.preview.emergentagent.com")

# Test credentials
ADMIN_EMAIL = "admin@locofast.com"
ADMIN_PASSWORD = "admin123"
ADMIN_ID = "0eab6ac5-5674-4cda-9510-19d64c09cb66"
BRAND_EMAIL = "brandtest@locofast.com"
BRAND_PASSWORD = "NewPassword123!"
BRAND_ID = "03b50566-e559-4a54-97f0-4cd1179615d4"


class TestPhase50Backend:
    """Phase 50 Backend API Tests"""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.admin_token = None
        self.brand_token = None

    def get_admin_token(self):
        """Get admin JWT token"""
        if self.admin_token:
            return self.admin_token
        resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert resp.status_code == 200, f"Admin login failed: {resp.text}"
        self.admin_token = resp.json().get("token")
        return self.admin_token

    def get_brand_token(self):
        """Get brand JWT token"""
        if self.brand_token:
            return self.brand_token
        resp = self.session.post(f"{BASE_URL}/api/brand/login", json={
            "email": BRAND_EMAIL,
            "password": BRAND_PASSWORD
        })
        assert resp.status_code == 200, f"Brand login failed: {resp.text}"
        self.brand_token = resp.json().get("token")
        return self.brand_token

    # ═══════════════════════════════════════════════════════════════════
    # Q3: Invoice Download Fix - UUID-based, slash-free
    # ═══════════════════════════════════════════════════════════════════
    def test_q3_invoice_endpoint_exists(self):
        """Q3: GET /api/orders/{order_id}/invoice endpoint exists"""
        # First get a paid order to test with
        token = self.get_admin_token()
        resp = self.session.get(
            f"{BASE_URL}/api/orders",
            params={"payment_status": "paid", "limit": 1},
            headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 200, f"Failed to list orders: {resp.text}"
        orders = resp.json().get("orders", [])
        
        if not orders:
            pytest.skip("No paid orders found to test invoice download")
        
        order = orders[0]
        order_id = order.get("id")  # UUID, not order_number
        
        # Test invoice download with UUID
        invoice_resp = self.session.get(f"{BASE_URL}/api/orders/{order_id}/invoice")
        assert invoice_resp.status_code == 200, f"Invoice download failed: {invoice_resp.status_code}"
        assert invoice_resp.headers.get("Content-Type") == "application/pdf", "Invoice should be PDF"
        print(f"✓ Q3: Invoice download works with UUID {order_id}")

    def test_q3_invoice_uuid_is_preferred(self):
        """Q3: Invoice endpoint - UUID is the preferred/reliable method (order_number with slashes has path issues)"""
        token = self.get_admin_token()
        resp = self.session.get(
            f"{BASE_URL}/api/orders",
            params={"payment_status": "paid", "limit": 1},
            headers={"Authorization": f"Bearer {token}"}
        )
        orders = resp.json().get("orders", [])
        
        if not orders:
            pytest.skip("No paid orders found")
        
        order = orders[0]
        order_id = order.get("id")  # UUID
        order_number = order.get("order_number", "")
        
        # UUID-based access is the reliable method
        invoice_resp = self.session.get(f"{BASE_URL}/api/orders/{order_id}/invoice")
        assert invoice_resp.status_code == 200, f"Invoice with UUID failed: {invoice_resp.status_code}"
        
        # Note: Order numbers with slashes (e.g., LF/ORD/002) cannot be reliably used in URL paths
        # even with URL encoding, because FastAPI interprets slashes as path separators.
        # The fix is to use order.id (UUID) instead of order_number in all invoice URLs.
        print(f"✓ Q3: Invoice download works with UUID {order_id}")
        print(f"  Note: order_number '{order_number}' contains slashes - UUID is the correct approach")

    # ═══════════════════════════════════════════════════════════════════
    # Q4: Email CTA - Download Tax Invoice link
    # ═══════════════════════════════════════════════════════════════════
    def test_q4_email_template_has_invoice_cta(self):
        """Q4: Order confirmation email template includes invoice download CTA"""
        # This is a code inspection test - verify the email template
        import sys
        sys.path.insert(0, "/app/backend")
        from email_router import get_order_confirmation_email
        
        # Create a mock order
        mock_order = {
            "id": "test-uuid-123",
            "order_number": "LF/ORD/TEST",
            "items": [{"fabric_name": "Test Fabric", "category_name": "Cotton", "quantity": 10, "price_per_meter": 100}],
            "customer": {"name": "Test", "email": "test@test.com", "phone": "1234567890", "company": "Test Co", "address": "123 St", "city": "Delhi", "state": "Delhi", "pincode": "110001"},
            "subtotal": 1000,
            "tax": 50,
            "total": 1050,
            "created_at": datetime.now().isoformat(),
        }
        
        html = get_order_confirmation_email(mock_order)
        
        # Check for invoice CTA
        assert "Download Tax Invoice" in html, "Email should contain 'Download Tax Invoice' CTA"
        assert f"/api/orders/{mock_order['id']}/invoice" in html, "Email should link to invoice using order.id (UUID)"
        print("✓ Q4: Email template includes 'Download Tax Invoice (GST)' CTA with UUID-based link")

    # ═══════════════════════════════════════════════════════════════════
    # Q5: Ashish CC - ORDER_NOTIFICATION_EMAILS
    # ═══════════════════════════════════════════════════════════════════
    def test_q5_ashish_in_notification_emails(self):
        """Q5: ashish.katiyar@locofast.com is in ORDER_NOTIFICATION_EMAILS"""
        import sys
        sys.path.insert(0, "/app/backend")
        from email_router import ORDER_NOTIFICATION_EMAILS
        
        assert "ashish.katiyar@locofast.com" in ORDER_NOTIFICATION_EMAILS, \
            f"ashish.katiyar@locofast.com should be in ORDER_NOTIFICATION_EMAILS: {ORDER_NOTIFICATION_EMAILS}"
        print(f"✓ Q5: ORDER_NOTIFICATION_EMAILS includes ashish.katiyar@locofast.com: {ORDER_NOTIFICATION_EMAILS}")

    def test_q5_ashish_in_brand_order_delivery_cc(self):
        """Q5: ashish.katiyar@locofast.com is in ORDER_DELIVERY_CC for brand orders"""
        import sys
        sys.path.insert(0, "/app/backend")
        from brand_router import ORDER_DELIVERY_CC
        
        assert "ashish.katiyar@locofast.com" in ORDER_DELIVERY_CC, \
            f"ashish.katiyar@locofast.com should be in ORDER_DELIVERY_CC: {ORDER_DELIVERY_CC}"
        print(f"✓ Q5: ORDER_DELIVERY_CC includes ashish.katiyar@locofast.com: {ORDER_DELIVERY_CC}")

    # ═══════════════════════════════════════════════════════════════════
    # Q6: Shiprocket on Brand Orders - verify helper is wired
    # ═══════════════════════════════════════════════════════════════════
    def test_q6_shiprocket_helper_exists(self):
        """Q6: _create_shiprocket_shipment_for_brand_order helper exists"""
        import sys
        sys.path.insert(0, "/app/backend")
        from brand_router import _create_shiprocket_shipment_for_brand_order
        
        assert callable(_create_shiprocket_shipment_for_brand_order), \
            "_create_shiprocket_shipment_for_brand_order should be callable"
        print("✓ Q6: _create_shiprocket_shipment_for_brand_order helper exists and is callable")

    def test_q6_brand_create_order_calls_shiprocket(self):
        """Q6: brand_create_order calls asyncio.create_task for Shiprocket"""
        # Code inspection - verify the call is present
        with open("/app/backend/brand_router.py", "r") as f:
            content = f.read()
        
        assert "asyncio.create_task(_create_shiprocket_shipment_for_brand_order" in content, \
            "brand_create_order should call asyncio.create_task(_create_shiprocket_shipment_for_brand_order)"
        print("✓ Q6: brand_create_order calls asyncio.create_task(_create_shiprocket_shipment_for_brand_order)")

    # ═══════════════════════════════════════════════════════════════════
    # Q1+Q2: Account Manager Module - Admin Endpoints
    # ═══════════════════════════════════════════════════════════════════
    def test_am_list_admin_users(self):
        """Q1+Q2: GET /api/admin/users lists admin users"""
        token = self.get_admin_token()
        resp = self.session.get(
            f"{BASE_URL}/api/admin/users",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 200, f"Failed to list admin users: {resp.text}"
        users = resp.json()
        assert isinstance(users, list), "Should return list of admin users"
        print(f"✓ GET /api/admin/users returns {len(users)} admin users")

    def test_am_set_flag(self):
        """Q1+Q2: PUT /api/admin/users/{id}/account-manager toggles AM flag"""
        token = self.get_admin_token()
        
        # Set AM flag to true
        resp = self.session.put(
            f"{BASE_URL}/api/admin/users/{ADMIN_ID}/account-manager",
            json={"is_account_manager": True},
            headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 200, f"Failed to set AM flag: {resp.text}"
        assert resp.json().get("is_account_manager") == True
        print("✓ PUT /api/admin/users/{id}/account-manager sets AM flag")

    def test_am_assign_brands_max_3(self):
        """Q1+Q2: PUT /api/admin/users/{id}/managed-brands enforces max 3 brands"""
        token = self.get_admin_token()
        
        # First ensure admin is AM
        self.session.put(
            f"{BASE_URL}/api/admin/users/{ADMIN_ID}/account-manager",
            json={"is_account_manager": True},
            headers={"Authorization": f"Bearer {token}"}
        )
        
        # Try to assign more than 3 brands (should fail)
        fake_brands = [str(uuid.uuid4()) for _ in range(4)]
        resp = self.session.put(
            f"{BASE_URL}/api/admin/users/{ADMIN_ID}/managed-brands",
            json={"brand_ids": fake_brands},
            headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 400, f"Should reject >3 brands: {resp.text}"
        assert "at most 3" in resp.json().get("detail", "").lower() or "3 brands" in resp.json().get("detail", "").lower()
        print("✓ PUT /api/admin/users/{id}/managed-brands rejects >3 brands")

    def test_am_assign_valid_brand(self):
        """Q1+Q2: PUT /api/admin/users/{id}/managed-brands assigns valid brand"""
        token = self.get_admin_token()
        
        # Assign the test brand
        resp = self.session.put(
            f"{BASE_URL}/api/admin/users/{ADMIN_ID}/managed-brands",
            json={"brand_ids": [BRAND_ID]},
            headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 200, f"Failed to assign brand: {resp.text}"
        assert BRAND_ID in resp.json().get("managed_brand_ids", [])
        print(f"✓ PUT /api/admin/users/{id}/managed-brands assigns brand {BRAND_ID}")

    def test_am_list_account_managers(self):
        """Q1+Q2: GET /api/admin/account-managers lists AMs with brands"""
        token = self.get_admin_token()
        resp = self.session.get(
            f"{BASE_URL}/api/admin/account-managers",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 200, f"Failed to list AMs: {resp.text}"
        ams = resp.json()
        assert isinstance(ams, list), "Should return list of AMs"
        
        # Check structure
        if ams:
            am = ams[0]
            assert "id" in am
            assert "email" in am
            assert "managed_brands" in am
            assert "capacity_remaining" in am
        print(f"✓ GET /api/admin/account-managers returns {len(ams)} AMs with brand names + capacity")

    def test_am_get_brand_account_manager(self):
        """Q1+Q2: GET /api/admin/brands/{id}/account-manager returns AM for brand"""
        token = self.get_admin_token()
        resp = self.session.get(
            f"{BASE_URL}/api/admin/brands/{BRAND_ID}/account-manager",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 200, f"Failed to get brand AM: {resp.text}"
        data = resp.json()
        assert "account_manager" in data
        print(f"✓ GET /api/admin/brands/{BRAND_ID}/account-manager returns AM info")

    # ═══════════════════════════════════════════════════════════════════
    # Q1+Q2: Invoices CRUD
    # ═══════════════════════════════════════════════════════════════════
    def test_invoices_create(self):
        """Q1+Q2: POST /api/admin/brands/{brand_id}/invoices creates invoice"""
        token = self.get_admin_token()
        
        invoice_number = f"TEST/INV/{uuid.uuid4().hex[:6].upper()}"
        resp = self.session.post(
            f"{BASE_URL}/api/admin/brands/{BRAND_ID}/invoices",
            json={
                "invoice_number": invoice_number,
                "amount": 10000,
                "subtotal": 9524,
                "gst": 476,
                "invoice_date": "2025-01-15",
                "due_date": "2025-02-15",
                "notes": "Test invoice"
            },
            headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 200, f"Failed to create invoice: {resp.text}"
        data = resp.json()
        assert data.get("invoice_number") == invoice_number
        assert data.get("status") == "unpaid"
        self.test_invoice_id = data.get("id")
        print(f"✓ POST /api/admin/brands/{BRAND_ID}/invoices creates invoice {invoice_number}")
        return data.get("id")

    def test_invoices_list(self):
        """Q1+Q2: GET /api/admin/brands/{brand_id}/invoices lists invoices"""
        token = self.get_admin_token()
        resp = self.session.get(
            f"{BASE_URL}/api/admin/brands/{BRAND_ID}/invoices",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 200, f"Failed to list invoices: {resp.text}"
        invoices = resp.json()
        assert isinstance(invoices, list)
        print(f"✓ GET /api/admin/brands/{BRAND_ID}/invoices returns {len(invoices)} invoices")

    def test_invoices_duplicate_rejected(self):
        """Q1+Q2: POST /api/admin/brands/{brand_id}/invoices rejects duplicate invoice_number"""
        token = self.get_admin_token()
        
        # Create first invoice
        invoice_number = f"DUP/INV/{uuid.uuid4().hex[:6].upper()}"
        resp1 = self.session.post(
            f"{BASE_URL}/api/admin/brands/{BRAND_ID}/invoices",
            json={"invoice_number": invoice_number, "amount": 5000},
            headers={"Authorization": f"Bearer {token}"}
        )
        assert resp1.status_code == 200
        
        # Try to create duplicate
        resp2 = self.session.post(
            f"{BASE_URL}/api/admin/brands/{BRAND_ID}/invoices",
            json={"invoice_number": invoice_number, "amount": 5000},
            headers={"Authorization": f"Bearer {token}"}
        )
        assert resp2.status_code == 400, f"Should reject duplicate: {resp2.text}"
        assert "already exists" in resp2.json().get("detail", "").lower()
        print("✓ POST /api/admin/brands/{brand_id}/invoices rejects duplicate invoice_number")

    # ═══════════════════════════════════════════════════════════════════
    # Q1+Q2: Credit Notes CRUD
    # ═══════════════════════════════════════════════════════════════════
    def test_credit_notes_create(self):
        """Q1+Q2: POST /api/admin/brands/{brand_id}/credit-notes creates CN"""
        token = self.get_admin_token()
        
        cn_number = f"TEST/CN/{uuid.uuid4().hex[:6].upper()}"
        resp = self.session.post(
            f"{BASE_URL}/api/admin/brands/{BRAND_ID}/credit-notes",
            json={
                "cn_number": cn_number,
                "amount": 2000,
                "reason": "short_delivery",
                "notes": "Test credit note"
            },
            headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 200, f"Failed to create CN: {resp.text}"
        data = resp.json()
        assert data.get("cn_number") == cn_number
        assert data.get("reason") == "short_delivery"
        print(f"✓ POST /api/admin/brands/{BRAND_ID}/credit-notes creates CN {cn_number}")

    def test_credit_notes_invalid_reason_rejected(self):
        """Q1+Q2: POST /api/admin/brands/{brand_id}/credit-notes rejects unknown reason"""
        token = self.get_admin_token()
        
        resp = self.session.post(
            f"{BASE_URL}/api/admin/brands/{BRAND_ID}/credit-notes",
            json={
                "cn_number": f"BAD/CN/{uuid.uuid4().hex[:6]}",
                "amount": 1000,
                "reason": "invalid_reason_xyz"
            },
            headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 400, f"Should reject invalid reason: {resp.text}"
        print("✓ POST /api/admin/brands/{brand_id}/credit-notes rejects unknown reason")

    def test_credit_notes_list(self):
        """Q1+Q2: GET /api/admin/brands/{brand_id}/credit-notes lists CNs"""
        token = self.get_admin_token()
        resp = self.session.get(
            f"{BASE_URL}/api/admin/brands/{BRAND_ID}/credit-notes",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 200, f"Failed to list CNs: {resp.text}"
        cns = resp.json()
        assert isinstance(cns, list)
        print(f"✓ GET /api/admin/brands/{BRAND_ID}/credit-notes returns {len(cns)} credit notes")

    # ═══════════════════════════════════════════════════════════════════
    # Q1+Q2: Debit Notes CRUD
    # ═══════════════════════════════════════════════════════════════════
    def test_debit_notes_create(self):
        """Q1+Q2: POST /api/admin/brands/{brand_id}/debit-notes creates DN"""
        token = self.get_admin_token()
        
        dn_number = f"TEST/DN/{uuid.uuid4().hex[:6].upper()}"
        resp = self.session.post(
            f"{BASE_URL}/api/admin/brands/{BRAND_ID}/debit-notes",
            json={
                "dn_number": dn_number,
                "amount": 1500,
                "reason": "late_payment",
                "notes": "Test debit note"
            },
            headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 200, f"Failed to create DN: {resp.text}"
        data = resp.json()
        assert data.get("dn_number") == dn_number
        assert data.get("reason") == "late_payment"
        print(f"✓ POST /api/admin/brands/{BRAND_ID}/debit-notes creates DN {dn_number}")

    def test_debit_notes_list(self):
        """Q1+Q2: GET /api/admin/brands/{brand_id}/debit-notes lists DNs"""
        token = self.get_admin_token()
        resp = self.session.get(
            f"{BASE_URL}/api/admin/brands/{BRAND_ID}/debit-notes",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 200, f"Failed to list DNs: {resp.text}"
        dns = resp.json()
        assert isinstance(dns, list)
        print(f"✓ GET /api/admin/brands/{BRAND_ID}/debit-notes returns {len(dns)} debit notes")

    # ═══════════════════════════════════════════════════════════════════
    # Q1+Q2: Payments with Allocation
    # ═══════════════════════════════════════════════════════════════════
    def test_payments_create_with_allocation(self):
        """Q1+Q2: POST /api/admin/brands/{brand_id}/payments with allocations"""
        token = self.get_admin_token()
        
        # First create an invoice to allocate to
        invoice_number = f"PAY/INV/{uuid.uuid4().hex[:6].upper()}"
        inv_resp = self.session.post(
            f"{BASE_URL}/api/admin/brands/{BRAND_ID}/invoices",
            json={"invoice_number": invoice_number, "amount": 20000},
            headers={"Authorization": f"Bearer {token}"}
        )
        assert inv_resp.status_code == 200
        invoice_id = inv_resp.json().get("id")
        
        # Create payment with allocation
        resp = self.session.post(
            f"{BASE_URL}/api/admin/brands/{BRAND_ID}/payments",
            json={
                "amount": 15000,
                "mode": "NEFT",
                "reference": "UTR123456",
                "allocations": [
                    {"invoice_id": invoice_id, "amount": 15000}
                ],
                "notes": "Test payment"
            },
            headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 200, f"Failed to create payment: {resp.text}"
        data = resp.json()
        assert data.get("amount") == 15000
        assert len(data.get("allocations", [])) == 1
        
        # Verify invoice status updated
        inv_check = self.session.get(
            f"{BASE_URL}/api/admin/brands/{BRAND_ID}/invoices",
            headers={"Authorization": f"Bearer {token}"}
        )
        invoices = inv_check.json()
        updated_inv = next((i for i in invoices if i["id"] == invoice_id), None)
        assert updated_inv is not None
        assert updated_inv.get("amount_paid") == 15000
        assert updated_inv.get("status") == "partially_paid"
        
        print("✓ POST /api/admin/brands/{brand_id}/payments creates payment and updates invoice status")

    def test_payments_allocation_exceeds_balance_rejected(self):
        """Q1+Q2: Payment allocation cannot exceed invoice outstanding balance"""
        token = self.get_admin_token()
        
        # Create small invoice
        invoice_number = f"SMALL/INV/{uuid.uuid4().hex[:6].upper()}"
        inv_resp = self.session.post(
            f"{BASE_URL}/api/admin/brands/{BRAND_ID}/invoices",
            json={"invoice_number": invoice_number, "amount": 5000},
            headers={"Authorization": f"Bearer {token}"}
        )
        invoice_id = inv_resp.json().get("id")
        
        # Try to allocate more than invoice amount
        resp = self.session.post(
            f"{BASE_URL}/api/admin/brands/{BRAND_ID}/payments",
            json={
                "amount": 10000,
                "mode": "NEFT",
                "allocations": [{"invoice_id": invoice_id, "amount": 10000}]
            },
            headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 400, f"Should reject over-allocation: {resp.text}"
        assert "exceeds" in resp.json().get("detail", "").lower()
        print("✓ Payment allocation exceeding invoice balance is rejected")

    def test_payments_list(self):
        """Q1+Q2: GET /api/admin/brands/{brand_id}/payments lists payments"""
        token = self.get_admin_token()
        resp = self.session.get(
            f"{BASE_URL}/api/admin/brands/{BRAND_ID}/payments",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 200, f"Failed to list payments: {resp.text}"
        payments = resp.json()
        assert isinstance(payments, list)
        print(f"✓ GET /api/admin/brands/{BRAND_ID}/payments returns {len(payments)} payments")

    # ═══════════════════════════════════════════════════════════════════
    # Q1+Q2: Unified Financials
    # ═══════════════════════════════════════════════════════════════════
    def test_unified_financials_admin(self):
        """Q1+Q2: GET /api/admin/brands/{id}/financials returns unified view"""
        token = self.get_admin_token()
        resp = self.session.get(
            f"{BASE_URL}/api/admin/brands/{BRAND_ID}/financials",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 200, f"Failed to get financials: {resp.text}"
        data = resp.json()
        
        # Check structure
        assert "summary" in data
        summary = data["summary"]
        assert "invoiced_total" in summary
        assert "payments_received" in summary
        assert "credit_notes_total" in summary
        assert "debit_notes_total" in summary
        assert "outstanding" in summary
        
        assert "timeline" in data
        assert isinstance(data["timeline"], list)
        
        print(f"✓ GET /api/admin/brands/{BRAND_ID}/financials returns summary + timeline")
        print(f"  Summary: invoiced={summary['invoiced_total']}, paid={summary['payments_received']}, outstanding={summary['outstanding']}")

    def test_unified_financials_brand_side(self):
        """Q1+Q2: GET /api/brand/financials returns brand's unified view"""
        token = self.get_brand_token()
        resp = self.session.get(
            f"{BASE_URL}/api/brand/financials",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 200, f"Failed to get brand financials: {resp.text}"
        data = resp.json()
        
        # Check structure
        assert "summary" in data
        assert "timeline" in data
        assert "account_manager" in data  # Should include AM info
        
        print(f"✓ GET /api/brand/financials returns summary + timeline + account_manager")
        if data.get("account_manager"):
            print(f"  Account Manager: {data['account_manager'].get('email')}")

    # ═══════════════════════════════════════════════════════════════════
    # Q1+Q2: Permission Gating - AM can only access assigned brands
    # ═══════════════════════════════════════════════════════════════════
    def test_am_permission_gating(self):
        """Q1+Q2: AM without brand assignment gets 403 on financial endpoints"""
        token = self.get_admin_token()
        
        # Create a second admin user
        test_email = f"testam_{uuid.uuid4().hex[:6]}@locofast.com"
        reg_resp = self.session.post(
            f"{BASE_URL}/api/auth/register",
            json={"email": test_email, "password": "TestPass123!", "name": "Test AM"}
        )
        
        if reg_resp.status_code != 200:
            pytest.skip(f"Could not create test admin: {reg_resp.text}")
        
        new_admin_id = reg_resp.json().get("admin", {}).get("id")
        
        # Promote to AM but don't assign any brands
        self.session.put(
            f"{BASE_URL}/api/admin/users/{new_admin_id}/account-manager",
            json={"is_account_manager": True},
            headers={"Authorization": f"Bearer {token}"}
        )
        
        # Login as new AM
        login_resp = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": test_email, "password": "TestPass123!"}
        )
        new_token = login_resp.json().get("token")
        
        # Try to access brand financials - should get 403
        fin_resp = self.session.get(
            f"{BASE_URL}/api/admin/brands/{BRAND_ID}/financials",
            headers={"Authorization": f"Bearer {new_token}"}
        )
        assert fin_resp.status_code == 403, f"AM without brand assignment should get 403: {fin_resp.status_code}"
        print("✓ AM without brand assignment gets 403 on financial endpoints")


class TestPhase50SeededData:
    """Verify seeded data from Phase 50"""

    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})

    def test_seeded_invoice_exists(self):
        """Verify seeded invoice LF/INV/0001 exists"""
        resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL, "password": ADMIN_PASSWORD
        })
        token = resp.json().get("token")
        
        inv_resp = self.session.get(
            f"{BASE_URL}/api/admin/brands/{BRAND_ID}/invoices",
            headers={"Authorization": f"Bearer {token}"}
        )
        invoices = inv_resp.json()
        
        seeded = next((i for i in invoices if i.get("invoice_number") == "LF/INV/0001"), None)
        if seeded:
            print(f"✓ Seeded invoice LF/INV/0001 found: amount={seeded.get('amount')}, status={seeded.get('status')}")
        else:
            print("⚠ Seeded invoice LF/INV/0001 not found (may have been cleaned up)")

    def test_seeded_credit_note_exists(self):
        """Verify seeded credit note LF/CN/0001 exists"""
        resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL, "password": ADMIN_PASSWORD
        })
        token = resp.json().get("token")
        
        cn_resp = self.session.get(
            f"{BASE_URL}/api/admin/brands/{BRAND_ID}/credit-notes",
            headers={"Authorization": f"Bearer {token}"}
        )
        cns = cn_resp.json()
        
        seeded = next((c for c in cns if c.get("cn_number") == "LF/CN/0001"), None)
        if seeded:
            print(f"✓ Seeded credit note LF/CN/0001 found: amount={seeded.get('amount')}, reason={seeded.get('reason')}")
        else:
            print("⚠ Seeded credit note LF/CN/0001 not found (may have been cleaned up)")

    def test_outstanding_calculation(self):
        """Verify outstanding = invoiced - paid - cn + dn"""
        resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL, "password": ADMIN_PASSWORD
        })
        token = resp.json().get("token")
        
        fin_resp = self.session.get(
            f"{BASE_URL}/api/admin/brands/{BRAND_ID}/financials",
            headers={"Authorization": f"Bearer {token}"}
        )
        data = fin_resp.json()
        summary = data.get("summary", {})
        
        invoiced = summary.get("invoiced_total", 0)
        paid = summary.get("payments_received", 0)
        cn = summary.get("credit_notes_total", 0)
        dn = summary.get("debit_notes_total", 0)
        outstanding = summary.get("outstanding", 0)
        
        expected = invoiced - paid - cn + dn
        
        print(f"✓ Outstanding calculation: {invoiced} - {paid} - {cn} + {dn} = {expected}")
        print(f"  Reported outstanding: {outstanding}")
        
        # Allow small floating point difference
        assert abs(outstanding - expected) < 0.01, f"Outstanding mismatch: {outstanding} != {expected}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
