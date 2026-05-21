"""
Test suite for Vendor Invoice Upload for Payouts feature (v58)

Tests:
1. GET /api/vendor/payouts - vendor JWT returns calling vendor's own payouts list
2. POST /api/vendor/payouts/{payout_id}/upload-invoice - vendor uploads invoice
3. Second upload attempt while status='uploaded' must FAIL with HTTP 400
4. Cross-vendor security - uploading to another vendor's payout returns 403
5. POST /api/payouts/{payout_id}/mark-paid MUST return HTTP 400 when vendor_invoice_status != 'uploaded'
6. POST /api/payouts/{payout_id}/reject-invoice - accounts JWT - requires reason >=3 chars
7. After rejection, vendor can re-upload (status flips back to 'uploaded')
"""

import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from test_credentials.md
VENDOR_EMAIL = "bhuvnesh.sharma@nsltextiles.com"
VENDOR_PASSWORD = "vendor123"
ADMIN_EMAIL = "admin@locofast.com"
ADMIN_PASSWORD = "admin123"
ACCOUNTS_EMAIL = "accounts@locofast.com"
ACCOUNTS_PASSWORD = "Accounts@123"

# Known payout IDs for this vendor (from review_request)
PAYOUT_ID_1 = "6d0108c0-83ae-42b5-9fbb-452c5feec3e1"  # LF/ORD/001 - ₹188,100
PAYOUT_ID_2 = "e5e06bde-8dd4-4eec-bf0a-55f0d853c52c"  # LF/ORD/002 - ₹190


class TestVendorInvoicePayoutFlow:
    """Test the complete vendor invoice upload and payout flow"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
    def get_vendor_token(self):
        """Get vendor JWT token"""
        res = self.session.post(f"{BASE_URL}/api/vendor/login", json={
            "email": VENDOR_EMAIL,
            "password": VENDOR_PASSWORD
        })
        if res.status_code == 200:
            return res.json().get("token")
        pytest.skip(f"Vendor login failed: {res.status_code} - {res.text}")
        
    def get_admin_token(self):
        """Get admin JWT token"""
        res = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if res.status_code == 200:
            return res.json().get("token")
        pytest.skip(f"Admin login failed: {res.status_code} - {res.text}")
        
    def get_accounts_token(self):
        """Get accounts JWT token"""
        res = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ACCOUNTS_EMAIL,
            "password": ACCOUNTS_PASSWORD
        })
        if res.status_code == 200:
            return res.json().get("token")
        pytest.skip(f"Accounts login failed: {res.status_code} - {res.text}")
        
    def reset_payout_invoice_status(self, payout_id: str, admin_token: str):
        """Reset payout invoice status to not_uploaded for clean test state"""
        # Use direct MongoDB update via a helper endpoint or just proceed with tests
        # For now, we'll work with whatever state the payout is in
        pass
        
    # ─── Test 1: GET /api/vendor/payouts returns vendor's own payouts ───
    def test_vendor_list_my_payouts(self):
        """Vendor can list their own payouts with all invoice fields"""
        token = self.get_vendor_token()
        
        res = self.session.get(
            f"{BASE_URL}/api/vendor/payouts",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        
        # Verify response structure
        assert "payouts" in data, "Response should contain 'payouts' key"
        assert "total" in data, "Response should contain 'total' key"
        assert isinstance(data["payouts"], list), "payouts should be a list"
        
        # Verify we have payouts for this vendor
        print(f"Found {data['total']} payouts for vendor")
        
        if data["total"] > 0:
            payout = data["payouts"][0]
            # Check for new vendor_invoice_* fields
            expected_fields = [
                "id", "order_id", "order_number", "seller_id", "seller_company",
                "gross_subtotal", "commission_total", "net_payable", "status"
            ]
            for field in expected_fields:
                assert field in payout, f"Payout should have '{field}' field"
            print(f"Sample payout: {payout.get('order_number')} - status: {payout.get('status')}, invoice_status: {payout.get('vendor_invoice_status', 'not_uploaded')}")
            
    # ─── Test 2: POST /api/vendor/payouts/{id}/upload-invoice ───
    def test_vendor_upload_invoice_success(self):
        """Vendor can upload invoice with URL, invoice_number, amount"""
        token = self.get_vendor_token()
        
        # First get the vendor's payouts to find one to test with
        res = self.session.get(
            f"{BASE_URL}/api/vendor/payouts",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert res.status_code == 200
        payouts = res.json().get("payouts", [])
        
        # Find a payout that's not paid and either not_uploaded or rejected
        test_payout = None
        for p in payouts:
            if p.get("status") != "paid":
                inv_status = p.get("vendor_invoice_status", "not_uploaded")
                if inv_status in ["not_uploaded", "rejected"]:
                    test_payout = p
                    break
                    
        if not test_payout:
            # Try to find any non-paid payout
            for p in payouts:
                if p.get("status") != "paid":
                    test_payout = p
                    break
                    
        if not test_payout:
            pytest.skip("No suitable payout found for upload test")
            
        payout_id = test_payout["id"]
        current_status = test_payout.get("vendor_invoice_status", "not_uploaded")
        print(f"Testing upload on payout {payout_id}, current invoice status: {current_status}")
        
        # If already uploaded, this should fail (tested in test 3)
        if current_status == "uploaded":
            pytest.skip("Payout already has uploaded invoice - see test_second_upload_fails")
            
        # Upload invoice
        upload_payload = {
            "invoice_url": "https://res.cloudinary.com/test/invoice_test_v58.pdf",
            "filename": "invoice_test_v58.pdf",
            "invoice_number": f"INV-TEST-{datetime.now().strftime('%Y%m%d%H%M%S')}",
            "invoice_date": datetime.now().strftime("%Y-%m-%d"),
            "amount": test_payout.get("net_payable", 1000)
        }
        
        res = self.session.post(
            f"{BASE_URL}/api/vendor/payouts/{payout_id}/upload-invoice",
            headers={"Authorization": f"Bearer {token}"},
            json=upload_payload
        )
        
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        
        assert data.get("success") == True, "Response should indicate success"
        assert "payout" in data, "Response should contain updated payout"
        
        updated_payout = data["payout"]
        assert updated_payout.get("vendor_invoice_status") == "uploaded", "Status should be 'uploaded'"
        assert updated_payout.get("vendor_invoice_url") == upload_payload["invoice_url"], "URL should match"
        assert updated_payout.get("vendor_invoice_number") == upload_payload["invoice_number"], "Invoice number should match"
        assert updated_payout.get("vendor_invoice_rejection_reason") == "", "Rejection reason should be cleared"
        assert updated_payout.get("vendor_invoice_uploaded_at"), "Should have uploaded_at timestamp"
        
        print(f"✓ Invoice uploaded successfully for payout {payout_id}")
        
    # ─── Test 3: Second upload while status='uploaded' must FAIL ───
    def test_second_upload_fails_when_already_uploaded(self):
        """Second upload attempt while status='uploaded' must return HTTP 400"""
        token = self.get_vendor_token()
        
        # Get payouts and find one with status='uploaded'
        res = self.session.get(
            f"{BASE_URL}/api/vendor/payouts",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert res.status_code == 200
        payouts = res.json().get("payouts", [])
        
        uploaded_payout = None
        for p in payouts:
            if p.get("vendor_invoice_status") == "uploaded" and p.get("status") != "paid":
                uploaded_payout = p
                break
                
        if not uploaded_payout:
            pytest.skip("No payout with uploaded invoice found - run test_vendor_upload_invoice_success first")
            
        payout_id = uploaded_payout["id"]
        print(f"Testing duplicate upload on payout {payout_id} (already uploaded)")
        
        # Try to upload again - should fail
        upload_payload = {
            "invoice_url": "https://res.cloudinary.com/test/duplicate_invoice.pdf",
            "filename": "duplicate_invoice.pdf",
            "invoice_number": "INV-DUPLICATE-001",
            "invoice_date": datetime.now().strftime("%Y-%m-%d"),
            "amount": 1000
        }
        
        res = self.session.post(
            f"{BASE_URL}/api/vendor/payouts/{payout_id}/upload-invoice",
            headers={"Authorization": f"Bearer {token}"},
            json=upload_payload
        )
        
        assert res.status_code == 400, f"Expected 400, got {res.status_code}: {res.text}"
        data = res.json()
        assert "already submitted" in data.get("detail", "").lower() or "reject" in data.get("detail", "").lower(), \
            f"Error message should mention invoice already submitted: {data.get('detail')}"
        print(f"✓ Duplicate upload correctly rejected with 400")
        
    # ─── Test 4: Cross-vendor security - 403 for other vendor's payout ───
    def test_cross_vendor_upload_returns_403(self):
        """Uploading to another vendor's payout returns 403"""
        token = self.get_vendor_token()
        admin_token = self.get_admin_token()
        
        # Get all payouts from admin dashboard to find one NOT belonging to our vendor
        res = self.session.get(
            f"{BASE_URL}/api/payouts/dashboard?status=all",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert res.status_code == 200
        all_payouts = res.json().get("rows", [])
        
        # Get our vendor's seller_id
        vendor_res = self.session.get(
            f"{BASE_URL}/api/vendor/payouts",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert vendor_res.status_code == 200
        vendor_payouts = vendor_res.json().get("payouts", [])
        
        if not vendor_payouts:
            pytest.skip("No vendor payouts to determine seller_id")
            
        our_seller_id = vendor_payouts[0].get("seller_id")
        
        # Find a payout belonging to a different vendor
        other_payout = None
        for p in all_payouts:
            if p.get("seller_id") != our_seller_id:
                other_payout = p
                break
                
        if not other_payout:
            pytest.skip("No payout from another vendor found for cross-vendor test")
            
        other_payout_id = other_payout["id"]
        print(f"Testing cross-vendor upload: our seller={our_seller_id}, target payout seller={other_payout.get('seller_id')}")
        
        # Try to upload to another vendor's payout
        upload_payload = {
            "invoice_url": "https://res.cloudinary.com/test/malicious_invoice.pdf",
            "filename": "malicious_invoice.pdf",
            "invoice_number": "INV-MALICIOUS-001",
            "invoice_date": datetime.now().strftime("%Y-%m-%d"),
            "amount": 1000
        }
        
        res = self.session.post(
            f"{BASE_URL}/api/vendor/payouts/{other_payout_id}/upload-invoice",
            headers={"Authorization": f"Bearer {token}"},
            json=upload_payload
        )
        
        assert res.status_code == 403, f"Expected 403, got {res.status_code}: {res.text}"
        print(f"✓ Cross-vendor upload correctly rejected with 403")
        
    # ─── Test 5: mark-paid fails when invoice not uploaded ───
    def test_mark_paid_fails_without_invoice(self):
        """POST /api/payouts/{id}/mark-paid returns 400 when vendor_invoice_status != 'uploaded'"""
        admin_token = self.get_admin_token()
        
        # Get payouts and find one without uploaded invoice
        res = self.session.get(
            f"{BASE_URL}/api/payouts/dashboard?status=pending",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert res.status_code == 200
        payouts = res.json().get("rows", [])
        
        no_invoice_payout = None
        for p in payouts:
            inv_status = p.get("vendor_invoice_status", "not_uploaded")
            if inv_status != "uploaded" and p.get("status") != "paid":
                no_invoice_payout = p
                break
                
        if not no_invoice_payout:
            pytest.skip("No payout without uploaded invoice found")
            
        payout_id = no_invoice_payout["id"]
        print(f"Testing mark-paid on payout {payout_id} (invoice status: {no_invoice_payout.get('vendor_invoice_status', 'not_uploaded')})")
        
        # Try to mark paid without invoice
        res = self.session.post(
            f"{BASE_URL}/api/payouts/{payout_id}/mark-paid",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "utr": "TEST123456789",
                "paid_via": "NEFT",
                "notes": "Test payment"
            }
        )
        
        assert res.status_code == 400, f"Expected 400, got {res.status_code}: {res.text}"
        data = res.json()
        assert "invoice" in data.get("detail", "").lower(), \
            f"Error should mention invoice requirement: {data.get('detail')}"
        print(f"✓ Mark-paid correctly rejected without invoice (400)")
        
    # ─── Test 6: mark-paid succeeds when invoice is uploaded ───
    def test_mark_paid_succeeds_with_invoice(self):
        """POST /api/payouts/{id}/mark-paid succeeds when vendor_invoice_status == 'uploaded'"""
        admin_token = self.get_admin_token()
        
        # Get payouts and find one with uploaded invoice
        res = self.session.get(
            f"{BASE_URL}/api/payouts/dashboard?status=pending",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert res.status_code == 200
        payouts = res.json().get("rows", [])
        
        uploaded_payout = None
        for p in payouts:
            if p.get("vendor_invoice_status") == "uploaded" and p.get("vendor_invoice_url"):
                uploaded_payout = p
                break
                
        if not uploaded_payout:
            pytest.skip("No payout with uploaded invoice found - run upload test first")
            
        payout_id = uploaded_payout["id"]
        print(f"Testing mark-paid on payout {payout_id} (has uploaded invoice)")
        
        # Mark paid
        res = self.session.post(
            f"{BASE_URL}/api/payouts/{payout_id}/mark-paid",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "utr": f"UTR-TEST-{datetime.now().strftime('%Y%m%d%H%M%S')}",
                "paid_via": "NEFT",
                "notes": "Test payment with invoice"
            }
        )
        
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        assert data.get("success") == True, "Response should indicate success"
        assert data.get("payout", {}).get("status") == "paid", "Payout status should be 'paid'"
        print(f"✓ Mark-paid succeeded with uploaded invoice")
        
    # ─── Test 7: reject-invoice endpoint ───
    def test_reject_invoice_requires_reason(self):
        """POST /api/payouts/{id}/reject-invoice requires reason >= 3 chars"""
        admin_token = self.get_admin_token()
        vendor_token = self.get_vendor_token()
        
        # First, find or create a payout with uploaded invoice
        res = self.session.get(
            f"{BASE_URL}/api/vendor/payouts",
            headers={"Authorization": f"Bearer {vendor_token}"}
        )
        assert res.status_code == 200
        payouts = res.json().get("payouts", [])
        
        uploaded_payout = None
        for p in payouts:
            if p.get("vendor_invoice_status") == "uploaded" and p.get("status") != "paid":
                uploaded_payout = p
                break
                
        if not uploaded_payout:
            pytest.skip("No payout with uploaded invoice found for rejection test")
            
        payout_id = uploaded_payout["id"]
        
        # Test with short reason (should fail)
        res = self.session.post(
            f"{BASE_URL}/api/payouts/{payout_id}/reject-invoice",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"reason": "ab"}  # Too short
        )
        
        assert res.status_code == 422, f"Expected 422 for short reason, got {res.status_code}: {res.text}"
        print(f"✓ Short reason correctly rejected with 422")
        
    def test_reject_invoice_success(self):
        """POST /api/payouts/{id}/reject-invoice sets status='rejected' and clears URL"""
        admin_token = self.get_admin_token()
        vendor_token = self.get_vendor_token()
        
        # Find a payout with uploaded invoice
        res = self.session.get(
            f"{BASE_URL}/api/vendor/payouts",
            headers={"Authorization": f"Bearer {vendor_token}"}
        )
        assert res.status_code == 200
        payouts = res.json().get("payouts", [])
        
        uploaded_payout = None
        for p in payouts:
            if p.get("vendor_invoice_status") == "uploaded" and p.get("status") != "paid":
                uploaded_payout = p
                break
                
        if not uploaded_payout:
            pytest.skip("No payout with uploaded invoice found for rejection test")
            
        payout_id = uploaded_payout["id"]
        print(f"Testing reject-invoice on payout {payout_id}")
        
        # Reject with valid reason
        rejection_reason = "Invoice amount does not match net payable - please correct"
        res = self.session.post(
            f"{BASE_URL}/api/payouts/{payout_id}/reject-invoice",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"reason": rejection_reason}
        )
        
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        
        assert data.get("success") == True, "Response should indicate success"
        updated_payout = data.get("payout", {})
        assert updated_payout.get("vendor_invoice_status") == "rejected", "Status should be 'rejected'"
        assert updated_payout.get("vendor_invoice_url") == "", "URL should be cleared"
        assert updated_payout.get("vendor_invoice_rejection_reason") == rejection_reason, "Reason should be stored"
        assert updated_payout.get("vendor_invoice_rejected_by"), "Should have rejected_by"
        assert updated_payout.get("vendor_invoice_rejected_at"), "Should have rejected_at"
        print(f"✓ Invoice rejected successfully")
        
    # ─── Test 8: After rejection, vendor can re-upload ───
    def test_reupload_after_rejection(self):
        """After rejection, vendor can re-upload (status flips back to 'uploaded')"""
        vendor_token = self.get_vendor_token()
        
        # Find a rejected payout
        res = self.session.get(
            f"{BASE_URL}/api/vendor/payouts",
            headers={"Authorization": f"Bearer {vendor_token}"}
        )
        assert res.status_code == 200
        payouts = res.json().get("payouts", [])
        
        rejected_payout = None
        for p in payouts:
            if p.get("vendor_invoice_status") == "rejected" and p.get("status") != "paid":
                rejected_payout = p
                break
                
        if not rejected_payout:
            pytest.skip("No rejected payout found - run reject test first")
            
        payout_id = rejected_payout["id"]
        print(f"Testing re-upload on rejected payout {payout_id}")
        
        # Re-upload invoice
        upload_payload = {
            "invoice_url": "https://res.cloudinary.com/test/corrected_invoice_v58.pdf",
            "filename": "corrected_invoice_v58.pdf",
            "invoice_number": f"INV-CORRECTED-{datetime.now().strftime('%Y%m%d%H%M%S')}",
            "invoice_date": datetime.now().strftime("%Y-%m-%d"),
            "amount": rejected_payout.get("net_payable", 1000)
        }
        
        res = self.session.post(
            f"{BASE_URL}/api/vendor/payouts/{payout_id}/upload-invoice",
            headers={"Authorization": f"Bearer {vendor_token}"},
            json=upload_payload
        )
        
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        
        assert data.get("success") == True, "Response should indicate success"
        updated_payout = data.get("payout", {})
        assert updated_payout.get("vendor_invoice_status") == "uploaded", "Status should flip back to 'uploaded'"
        assert updated_payout.get("vendor_invoice_url") == upload_payload["invoice_url"], "New URL should be stored"
        assert updated_payout.get("vendor_invoice_rejection_reason") == "", "Rejection reason should be cleared"
        print(f"✓ Re-upload after rejection succeeded")
        
    # ─── Test 9: reject-invoice fails if no invoice uploaded ───
    def test_reject_fails_without_uploaded_invoice(self):
        """reject-invoice fails if no invoice is uploaded"""
        admin_token = self.get_admin_token()
        
        # Get payouts and find one without uploaded invoice
        res = self.session.get(
            f"{BASE_URL}/api/payouts/dashboard?status=pending",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert res.status_code == 200
        payouts = res.json().get("rows", [])
        
        no_invoice_payout = None
        for p in payouts:
            inv_status = p.get("vendor_invoice_status", "not_uploaded")
            if inv_status != "uploaded" and p.get("status") != "paid":
                no_invoice_payout = p
                break
                
        if not no_invoice_payout:
            pytest.skip("No payout without uploaded invoice found")
            
        payout_id = no_invoice_payout["id"]
        
        # Try to reject when no invoice uploaded
        res = self.session.post(
            f"{BASE_URL}/api/payouts/{payout_id}/reject-invoice",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"reason": "Test rejection without invoice"}
        )
        
        assert res.status_code == 400, f"Expected 400, got {res.status_code}: {res.text}"
        print(f"✓ Reject correctly fails when no invoice uploaded (400)")
        
    # ─── Test 10: reject-invoice fails if payout already paid ───
    def test_reject_fails_if_payout_paid(self):
        """reject-invoice fails if payout is already paid"""
        admin_token = self.get_admin_token()
        
        # Get paid payouts
        res = self.session.get(
            f"{BASE_URL}/api/payouts/dashboard?status=paid",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert res.status_code == 200
        payouts = res.json().get("rows", [])
        
        if not payouts:
            pytest.skip("No paid payouts found")
            
        paid_payout = payouts[0]
        payout_id = paid_payout["id"]
        
        # Try to reject a paid payout
        res = self.session.post(
            f"{BASE_URL}/api/payouts/{payout_id}/reject-invoice",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"reason": "Test rejection on paid payout"}
        )
        
        assert res.status_code == 400, f"Expected 400, got {res.status_code}: {res.text}"
        data = res.json()
        assert "paid" in data.get("detail", "").lower(), \
            f"Error should mention payout is paid: {data.get('detail')}"
        print(f"✓ Reject correctly fails on paid payout (400)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
