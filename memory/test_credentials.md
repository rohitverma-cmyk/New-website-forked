# Test Credentials

## Admin
- Email: admin@locofast.com
- Password: admin123
- Login URL: /admin/login

## Credit Operations (Vendor Payouts panel)
- Email: creditoperations@locofast.com
- Password: Accounts@123
- Login URL: /admin/login
- Role: `accounts` — focused nav (Payouts · Orders read · Vendors)
- Permissions: read all orders/sellers/payouts, mark payouts paid, edit ONLY bank/PAN/payment_terms on vendors
- Note: previously seeded as `accounts@locofast.com`, renamed Feb 2026 because that DL has no inbox.

## Vendor
- Email: vendor@test.com
- Password: vendor123
- Login URL: /vendor/login

## Denim-Specialist Vendor (Bluerock Denim Mills)
- Email: denimseller@locofast.com
- Password: denim@123
- Login URL: /vendor/login
- Seller code: LS-EIOY3
- Categories: Denim
- GST: 24AABCB1234C1Z5 (verified seed)
- Use this account to test denim-specific RFQ fan-out, weave taxonomy and quote flows.

## Alternate Vendor
- Email: info@palimills.com
- Password: admin@123

## Vendor — Cotton Manufacturer (for Payout Invoice test)
- Email: bhuvnesh.sharma@nsltextiles.com
- Password: vendor123
- Login URL: /vendor/login
- Used to test the "Vendor uploads invoice → Accounts mark paid" flow.

## Agent
- Email: agent@locofast.com
- Auth: OTP-based (code sent via Resend email)
- Login URL: /agent/login

## Customer
- Auth: OTP-based via Resend email
- Login URL: Account icon in navbar

## Brand Portal (Test Brand Co)
- Email: brandtest@locofast.com
- Password: NewPassword123!
- Login URL: /brand/login
- Brand ID: 03b50566-e559-4a54-97f0-4cd1179615d4
- Role: brand_admin · Designation: Management
- Allowed categories: Denim, Cotton
- Credit lines pre-seeded: Stride ₹100,000 (fully utilised), Muthoot ₹500,000 (₹3.86L available)
- Sample credits pre-seeded: 500 total, 190 available

## Brand OTP Testing (bypass email)
Credit-line + sample-credit upload/adjust requires OTP emailed to admin. In tests, rehash directly:
```python
import pymongo, os, bcrypt
from dotenv import load_dotenv
load_dotenv('/app/backend/.env')
c = pymongo.MongoClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
c.admin_otps.update_one({'id': '<otp_request_id>'}, {'$set': {'code_hash': bcrypt.hashpw(b'123456', bcrypt.gensalt()).decode()}})
```
Then use `123456` as the OTP. Applies to `purpose`: `brand_credit_upload` AND `brand_sample_credit_adjust`.

## Locofast Support Placeholder
- Email: support@locofast.com (env: `LOCOFAST_SUPPORT_EMAIL`)
- Phone: +91 120 4938200 (env: `LOCOFAST_SUPPORT_PHONE`)
- Ops inbox: orders@locofast.com (env: `LOCOFAST_OPS_INBOX`) — brand order notifications go here
- Endpoint: `GET /api/brand/support`
