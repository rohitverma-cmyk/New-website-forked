# Test Credentials

## Admin
- Email: admin@locofast.com
- Password: admin123
- Login URL: /admin/login

## Locofast Agent (Sourcing / Sales Team)
- Email: agent@locofast.com (or deepak.wadhwa@locofast.com for Sujata)
- Auth: **Email OTP only** — no password
- Login URL: /agent/login (preview: https://fabric-sourcing-cms.preview.emergentagent.com/agent/login · prod: https://locofast.com/agent/login)
- Flow: enter email → 6-digit OTP arrives in inbox (Resend) → enter OTP → land on agent dashboard
- Dev OTP retrieval (no inbox in preview): `db.agent_otps` collection, latest `used=false` row for that email
- What an agent can do:
  - **AI Sourcing Search** (Claude) — natural-language fabric discovery
  - **Build catalogues** — curated shareable URLs from search results (PublicCataloguePage)
  - **Create shared carts** — agent-assisted curated carts with custom pricing, generates `/shared-cart/{token}` for the buyer
  - **View orders** — all orders, with the new "Invoice Value (all-incl.)" breakdown column (Goods · Pkg · Logs · GST)
  - **View RFQs assigned to them** — quote management
- Rate limit: 3 OTP requests per 10 minutes per email
- Note: Use OTP login from `/admin` won't work — `/agent/login` is a separate auth surface.

## Credit Operations / Finance & Accounts (Vendor Payouts + Credit Ledger)
- Email: creditoperations@locofast.com
- Password: accounts@2026
- Login URL: /admin/login (preview: https://fabric-sourcing-cms.preview.emergentagent.com/admin/login · prod: https://locofast.com/admin/login)
- Role: `accounts` — focused nav for finance users:
  - **Vendor Payouts** — mark vendor invoices paid, generate UTRs
  - **Credit Adjustments** — OTP-gated CN/DN entry (gated to `sandeep.kumar@locofast.com` only, even within accounts role)
  - **Credit Limits** — view & update buyer credit limits
  - **Orders (read)** — read-only order audit
  - **Vendors** — edit bank/PAN/payment_terms only (no other fields)
- Permissions: read all orders/sellers/payouts, mark payouts paid, post CN/DN with OTP, edit credit limits, upload disbursement/payment CSVs.
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

## Vendor — Cotton Manufacturer (for Payout Invoice test + order LF/ORD/057)
- Email: bhuvnesh.sharma@nsltextiles.com
- Password: Vendor@2026
- Login URL: /vendor/login
- Seller code: LS-OFUCT
- Seller ID: a1edb4e2-f942-4034-ad9b-e075979cc8a4
- Company: NT, Cotton Manufacturer, Hyderabad
- Used to test the "Vendor uploads invoice → Accounts mark paid" flow. Also the seller for order LF/ORD/057.

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

## Credit Adjustments (OTP-gated)
- Authorised email: sandeep.kumar@locofast.com (env: `CREDIT_ADJUSTMENT_ADMIN_EMAIL`)
- Auth: OTP via Resend → exchange for 4h JWT scoped `credit_adjustment`
- Admin URL: /admin/credit-adjustments
- Test customer with seeded ledger data: test.ledger@locofast.com (OTP login via /api/customer/send-otp), GSTIN 07AIKPY4565A1Z0
- OTP retrieval for tests: `db.credit_adjustment_otps` collection (most recent unused row)

