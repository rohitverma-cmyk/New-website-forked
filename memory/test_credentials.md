# Test Credentials

## Admin
- Email: admin@locofast.com
- Password: admin123
- Login URL: /admin/login

## Vendor
- Email: vendor@test.com
- Password: vendor123
- Login URL: /vendor/login

## Alternate Vendor
- Email: info@palimills.com
- Password: admin@123

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
