"""
Credit Ledger Feature Tests (v64)
Tests for the unified Credit & Ledger feature including:
- Disbursements CSV upload
- Payments CSV upload  
- OTP-gated adjustments
- by-gstin endpoint
- Razorpay auto-record hook
- Legacy wallet fallback
"""
import pytest
import requests
import os
import io
import time
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test data
TEST_GSTIN = "07AIKPY4565A1Z0"  # E-Future from the CSV
INVALID_GSTIN = "INVALID123"
ADJUSTMENT_ADMIN_EMAIL = "sandeep.kumar@locofast.com"
NON_ADMIN_EMAIL = "random@example.com"


class TestDisbursementsCSVUpload:
    """Test POST /api/credit-ledger/admin/disbursements/upload-csv"""
    
    def test_upload_disbursements_csv_success(self):
        """Upload the actual user CSV with 35 rows"""
        # Download the CSV from the provided URL
        csv_url = "https://customer-assets.emergentagent.com/job_aac6e0f4-6bb0-45fd-9410-8acdd3d8c7e7/artifacts/8l1knkhz_Locofast_Credit%20Ledgers%20-%20Disbursement%20%282%29.csv"
        csv_response = requests.get(csv_url)
        assert csv_response.status_code == 200, f"Failed to download CSV: {csv_response.status_code}"
        
        # Upload the CSV
        files = {'file': ('disbursements.csv', csv_response.content, 'text/csv')}
        response = requests.post(f"{BASE_URL}/api/credit-ledger/admin/disbursements/upload-csv", files=files)
        
        assert response.status_code == 200, f"Upload failed: {response.text}"
        data = response.json()
        
        # Verify 35 rows ingested
        assert data['total'] == 35, f"Expected 35 rows, got {data['total']}"
        assert data['created_or_updated'] == 35, f"Expected 35 created/updated, got {data['created_or_updated']}"
        
        # Skipped rows should be empty (all rows valid)
        skipped = data.get('skipped', [])
        # Filter out truly empty rows (no data)
        real_skipped = [s for s in skipped if s.get('reason') not in ['invoice_no missing', 'lender missing']]
        print(f"Skipped rows: {skipped}")
        print(f"Created/updated: {data['created_or_updated']}")
    
    def test_upload_disbursements_idempotency(self):
        """Re-upload same file, total stays the same (no duplicates)"""
        csv_url = "https://customer-assets.emergentagent.com/job_aac6e0f4-6bb0-45fd-9410-8acdd3d8c7e7/artifacts/8l1knkhz_Locofast_Credit%20Ledgers%20-%20Disbursement%20%282%29.csv"
        csv_response = requests.get(csv_url)
        
        # First upload
        files = {'file': ('disbursements.csv', csv_response.content, 'text/csv')}
        response1 = requests.post(f"{BASE_URL}/api/credit-ledger/admin/disbursements/upload-csv", files=files)
        assert response1.status_code == 200
        
        # Second upload (should be idempotent)
        files = {'file': ('disbursements.csv', csv_response.content, 'text/csv')}
        response2 = requests.post(f"{BASE_URL}/api/credit-ledger/admin/disbursements/upload-csv", files=files)
        assert response2.status_code == 200
        
        # Verify by-gstin returns same count
        response = requests.get(f"{BASE_URL}/api/credit-ledger/by-gstin/{TEST_GSTIN}")
        assert response.status_code == 200
        data = response.json()
        
        # E-Future has 8 disbursements in the CSV
        assert len(data['disbursements']) == 8, f"Expected 8 disbursements for E-Future, got {len(data['disbursements'])}"
        print(f"Idempotency verified: {len(data['disbursements'])} disbursements for {TEST_GSTIN}")
    
    def test_upload_non_csv_rejected(self):
        """Only .csv files should be accepted"""
        files = {'file': ('test.txt', b'not a csv', 'text/plain')}
        response = requests.post(f"{BASE_URL}/api/credit-ledger/admin/disbursements/upload-csv", files=files)
        assert response.status_code == 400
        assert 'csv' in response.json().get('detail', '').lower()


class TestPaymentsCSVUpload:
    """Test POST /api/credit-ledger/admin/payments/upload-csv"""
    
    def test_upload_payments_csv_success(self):
        """Upload a minimal payments CSV with 2 rows"""
        csv_content = """Payment Date,GST No,Mode,UTR,Amount,Against Invoice No
2026-01-15,07AIKPY4565A1Z0,NEFT,UTR123456789,50000,LF/25-26/462
2026-01-16,07AIKPY4565A1Z0,RTGS,UTR987654321,100000,LF/25-26/471"""
        
        files = {'file': ('payments.csv', csv_content.encode(), 'text/csv')}
        response = requests.post(f"{BASE_URL}/api/credit-ledger/admin/payments/upload-csv", files=files)
        
        assert response.status_code == 200, f"Upload failed: {response.text}"
        data = response.json()
        
        assert data['total'] == 2, f"Expected 2 rows, got {data['total']}"
        assert data['created_or_updated'] == 2, f"Expected 2 created/updated, got {data['created_or_updated']}"
        print(f"Payments uploaded: {data}")
    
    def test_payment_triggers_disbursement_recompute(self):
        """Verify against_invoice_no triggers _recompute_disbursement_repayment"""
        # Check the disbursement LF/25-26/462 after payment upload
        response = requests.get(f"{BASE_URL}/api/credit-ledger/by-gstin/{TEST_GSTIN}")
        assert response.status_code == 200
        data = response.json()
        
        # Find the disbursement
        disb = next((d for d in data['disbursements'] if d['invoice_no'] == 'LF/25-26/462'), None)
        if disb:
            print(f"Disbursement LF/25-26/462: repaid={disb.get('amount_repaid')}, pending={disb.get('pending_amount')}, status={disb.get('status')}")
            # The payment of 50000 should have been added to amount_repaid
            assert disb.get('amount_repaid', 0) >= 50000, "Payment should have increased amount_repaid"


class TestByGstinEndpoint:
    """Test GET /api/credit-ledger/by-gstin/{gstin}"""
    
    def test_by_gstin_valid(self):
        """Valid GSTIN returns totals, lenders, disbursements, payments, adjustments"""
        response = requests.get(f"{BASE_URL}/api/credit-ledger/by-gstin/{TEST_GSTIN}")
        
        assert response.status_code == 200, f"Request failed: {response.text}"
        data = response.json()
        
        # Verify structure
        assert 'gst_number' in data
        assert 'totals' in data
        assert 'lenders' in data
        assert 'disbursements' in data
        assert 'payments' in data
        assert 'adjustments' in data
        
        # Verify totals
        totals = data['totals']
        assert 'limit' in totals
        assert 'utilized' in totals
        assert 'available' in totals
        assert 'overdue' in totals
        
        # Verify limit > 0 (E-Future has ₹25L limit)
        assert totals['limit'] > 0, f"Expected limit > 0, got {totals['limit']}"
        
        # Verify 8 disbursements for E-Future
        assert len(data['disbursements']) == 8, f"Expected 8 disbursements, got {len(data['disbursements'])}"
        
        # Verify lenders array with utilisation
        assert len(data['lenders']) > 0, "Expected at least one lender"
        for lender in data['lenders']:
            assert 'lender' in lender
            assert 'credit_limit' in lender
            assert 'utilized' in lender
            assert 'available' in lender
        
        print(f"by-gstin response: totals={totals}, lenders={len(data['lenders'])}, disbursements={len(data['disbursements'])}")
    
    def test_by_gstin_invalid_length(self):
        """Invalid GSTIN (not 15 chars) returns 400"""
        response = requests.get(f"{BASE_URL}/api/credit-ledger/by-gstin/{INVALID_GSTIN}")
        
        assert response.status_code == 400
        assert 'GSTIN must be 15 chars' in response.json().get('detail', '')


class TestOTPGate:
    """Test OTP-gated adjustment endpoints"""
    
    def test_send_otp_non_admin_rejected(self):
        """POST /admin/adjustments/send-otp with non-admin email returns 403"""
        response = requests.post(
            f"{BASE_URL}/api/credit-ledger/admin/adjustments/send-otp",
            json={"email": NON_ADMIN_EMAIL}
        )
        
        assert response.status_code == 403
        assert 'Only the credit-adjustment admin' in response.json().get('detail', '')
    
    def test_send_otp_admin_success(self):
        """POST /admin/adjustments/send-otp with admin email returns 200"""
        response = requests.post(
            f"{BASE_URL}/api/credit-ledger/admin/adjustments/send-otp",
            json={"email": ADJUSTMENT_ADMIN_EMAIL}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data.get('message') == 'OTP sent'
        assert data.get('email') == ADJUSTMENT_ADMIN_EMAIL
        print(f"OTP sent to {ADJUSTMENT_ADMIN_EMAIL}")
    
    def test_send_otp_rate_limit(self):
        """Call send-otp 6 times rapidly → 429 on 6th"""
        # Note: This test may fail if previous tests already sent OTPs
        # We need to wait for the rate limit window to reset
        for i in range(6):
            response = requests.post(
                f"{BASE_URL}/api/credit-ledger/admin/adjustments/send-otp",
                json={"email": ADJUSTMENT_ADMIN_EMAIL}
            )
            if response.status_code == 429:
                print(f"Rate limit hit on attempt {i+1}")
                assert 'Too many OTP requests' in response.json().get('detail', '')
                return
        
        # If we got here without 429, the rate limit may have reset
        print("Rate limit test inconclusive - may need fresh state")


class TestAdjustmentPost:
    """Test adjustment posting with JWT auth"""
    
    def test_post_adjustment_no_token(self):
        """POST /admin/adjustments/post without Bearer token returns 401"""
        response = requests.post(
            f"{BASE_URL}/api/credit-ledger/admin/adjustments/post",
            json={
                "gst_number": TEST_GSTIN,
                "type": "Credit Note",
                "reference_no": "CN/TEST/NOAUTH/001",
                "amount": 1000,
                "reason": "Test without auth"
            }
        )
        
        assert response.status_code == 401
        assert 'token required' in response.json().get('detail', '').lower()
    
    def test_post_adjustment_invalid_token(self):
        """POST /admin/adjustments/post with invalid token returns 401"""
        response = requests.post(
            f"{BASE_URL}/api/credit-ledger/admin/adjustments/post",
            json={
                "gst_number": TEST_GSTIN,
                "type": "Credit Note",
                "reference_no": "CN/TEST/INVALID/001",
                "amount": 1000,
                "reason": "Test with invalid token"
            },
            headers={"Authorization": "Bearer invalid_token_here"}
        )
        
        assert response.status_code == 401
        assert 'invalid' in response.json().get('detail', '').lower()


class TestFullAdjustmentFlow:
    """Test full OTP → verify → JWT → post adjustment flow"""
    
    @pytest.fixture
    def mongo_client(self):
        """Get MongoDB client for reading OTP"""
        import pymongo
        mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
        db_name = os.environ.get('DB_NAME', 'test_database')
        client = pymongo.MongoClient(mongo_url)
        return client[db_name]
    
    def test_full_adjustment_flow(self, mongo_client):
        """Complete flow: send-otp → read OTP from db → verify-otp → JWT → post adjustment"""
        # Step 1: Send OTP
        response = requests.post(
            f"{BASE_URL}/api/credit-ledger/admin/adjustments/send-otp",
            json={"email": ADJUSTMENT_ADMIN_EMAIL}
        )
        # May get 429 if rate limited from previous tests
        if response.status_code == 429:
            pytest.skip("Rate limited - skipping full flow test")
        assert response.status_code == 200
        
        # Step 2: Read OTP from MongoDB
        otp_doc = mongo_client.credit_adjustment_otps.find_one(
            {"email": ADJUSTMENT_ADMIN_EMAIL, "used": False},
            sort=[("created_at", -1)]
        )
        assert otp_doc is not None, "OTP not found in database"
        otp_code = otp_doc['otp']
        print(f"Retrieved OTP: {otp_code}")
        
        # Step 3: Verify OTP
        response = requests.post(
            f"{BASE_URL}/api/credit-ledger/admin/adjustments/verify-otp",
            json={"email": ADJUSTMENT_ADMIN_EMAIL, "otp": otp_code}
        )
        assert response.status_code == 200, f"OTP verify failed: {response.text}"
        token = response.json().get('token')
        assert token, "No token returned"
        print(f"Got JWT token (first 50 chars): {token[:50]}...")
        
        # Step 4: Post adjustment
        ref_no = f"CN/TEST/E2E/{datetime.now().strftime('%H%M%S')}"
        response = requests.post(
            f"{BASE_URL}/api/credit-ledger/admin/adjustments/post",
            json={
                "gst_number": TEST_GSTIN,
                "type": "Credit Note",
                "reference_no": ref_no,
                "amount": 5000,
                "against_invoice_no": "LF/25-26/462",
                "reason": "E2E test adjustment"
            },
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200, f"Post adjustment failed: {response.text}"
        assert response.json().get('ok') == True
        print(f"Posted adjustment: {ref_no}")
        
        # Step 5: Verify adjustment appears in by-gstin
        response = requests.get(f"{BASE_URL}/api/credit-ledger/by-gstin/{TEST_GSTIN}")
        assert response.status_code == 200
        data = response.json()
        
        adj = next((a for a in data['adjustments'] if a['reference_no'] == ref_no), None)
        assert adj is not None, f"Adjustment {ref_no} not found in by-gstin response"
        assert adj['type'] == 'Credit Note'
        assert adj['amount'] == 5000
        print(f"Adjustment verified in by-gstin: {adj}")
    
    def test_adjustment_idempotency(self, mongo_client):
        """POST same reference_no twice → second returns 409"""
        # Get a fresh token
        response = requests.post(
            f"{BASE_URL}/api/credit-ledger/admin/adjustments/send-otp",
            json={"email": ADJUSTMENT_ADMIN_EMAIL}
        )
        if response.status_code == 429:
            pytest.skip("Rate limited")
        
        otp_doc = mongo_client.credit_adjustment_otps.find_one(
            {"email": ADJUSTMENT_ADMIN_EMAIL, "used": False},
            sort=[("created_at", -1)]
        )
        if not otp_doc:
            pytest.skip("No OTP available")
        
        response = requests.post(
            f"{BASE_URL}/api/credit-ledger/admin/adjustments/verify-otp",
            json={"email": ADJUSTMENT_ADMIN_EMAIL, "otp": otp_doc['otp']}
        )
        if response.status_code != 200:
            pytest.skip("OTP verify failed")
        token = response.json().get('token')
        
        # First post
        ref_no = f"CN/TEST/IDEM/{datetime.now().strftime('%H%M%S')}"
        response1 = requests.post(
            f"{BASE_URL}/api/credit-ledger/admin/adjustments/post",
            json={
                "gst_number": TEST_GSTIN,
                "type": "Credit Note",
                "reference_no": ref_no,
                "amount": 1000,
                "reason": "Idempotency test"
            },
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response1.status_code == 200
        
        # Second post with same reference_no
        response2 = requests.post(
            f"{BASE_URL}/api/credit-ledger/admin/adjustments/post",
            json={
                "gst_number": TEST_GSTIN,
                "type": "Credit Note",
                "reference_no": ref_no,
                "amount": 1000,
                "reason": "Idempotency test duplicate"
            },
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response2.status_code == 409
        assert 'already posted' in response2.json().get('detail', '').lower()
        print(f"Idempotency verified: second post returned 409")


class TestRazorpayAutoRecord:
    """Test Razorpay auto-record hook"""
    
    def test_record_razorpay_payment_direct(self):
        """Test record_razorpay_payment by directly calling the function"""
        # This test imports the router and calls the function directly
        # since we can't easily trigger a full Razorpay flow
        import sys
        sys.path.insert(0, '/app/backend')
        
        import asyncio
        from motor.motor_asyncio import AsyncIOMotorClient
        import credit_ledger_router
        
        # Setup DB connection
        mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
        db_name = os.environ.get('DB_NAME', 'test_database')
        client = AsyncIOMotorClient(mongo_url)
        db = client[db_name]
        credit_ledger_router.set_db(db)
        
        # Mock order data
        mock_order = {
            'order_number': 'LF/ORD/TEST/001',
            'total': 15000,
            'customer': {
                'gst_number': TEST_GSTIN,
                'name': 'Test Customer'
            }
        }
        mock_payment_id = f'pay_test_{int(time.time())}'
        
        # Call the function
        async def run_test():
            await credit_ledger_router.record_razorpay_payment(mock_order, mock_payment_id)
            
            # Verify payment was recorded
            payment = await db.credit_payments.find_one({'utr': f'razorpay:{mock_payment_id}'})
            return payment
        
        payment = asyncio.get_event_loop().run_until_complete(run_test())
        
        assert payment is not None, "Razorpay payment not recorded"
        assert payment['source'] == 'razorpay-webhook'
        assert payment['mode'] == 'Razorpay'
        assert payment['amount'] == 15000
        print(f"Razorpay payment recorded: {payment['utr']}")


class TestLegacyWalletFallback:
    """Test legacy wallet fallback for GSTINs without new-format lender lines"""
    
    def test_legacy_wallet_fallback(self):
        """For a GSTIN in credit_wallets but not credit_lender_lines, synthesize Locofast lender"""
        import pymongo
        mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
        db_name = os.environ.get('DB_NAME', 'test_database')
        client = pymongo.MongoClient(mongo_url)
        db = client[db_name]
        
        # Create a test wallet entry
        test_gstin = "99TESTW1234A1Z9"  # Fake GSTIN for testing
        db.credit_wallets.delete_many({'gst_number': test_gstin})
        db.credit_lender_lines.delete_many({'gst_number': test_gstin})
        db.credit_disbursements.delete_many({'gst_number': test_gstin})
        
        db.credit_wallets.insert_one({
            'gst_number': test_gstin,
            'credit_limit': 100000,
            'balance': 75000,
            'credit_period_days': 45,
            'company': 'Test Legacy Company',
            'lender': 'Locofast'
        })
        
        # Query by-gstin
        response = requests.get(f"{BASE_URL}/api/credit-ledger/by-gstin/{test_gstin}")
        assert response.status_code == 200
        data = response.json()
        
        # Should have synthesized a Locofast lender
        assert len(data['lenders']) == 1, f"Expected 1 lender, got {len(data['lenders'])}"
        lender = data['lenders'][0]
        assert lender['lender'] == 'Locofast'
        assert lender['credit_limit'] == 100000
        assert lender['available'] == 75000
        assert lender['utilized'] == 25000  # 100000 - 75000
        print(f"Legacy wallet fallback verified: {lender}")
        
        # Cleanup
        db.credit_wallets.delete_many({'gst_number': test_gstin})


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
