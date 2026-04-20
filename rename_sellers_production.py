#!/usr/bin/env python3
"""
Locofast Seller Rename Script for Production
Run this AFTER deploying the latest code to production.

Usage:
  python3 rename_sellers_production.py

Prerequisites:
  - pip install requests
  - Update PRODUCTION_URL below with your production domain
  - Update ADMIN_EMAIL and ADMIN_PASSWORD if different
"""

import requests
import json
import sys

# ============================================================
# UPDATE THESE VALUES FOR YOUR PRODUCTION ENVIRONMENT
# ============================================================
PRODUCTION_URL = "https://shop.locofast.com"  # Change to your production URL
ADMIN_EMAIL = "admin@locofast.com"
ADMIN_PASSWORD = "admin123"
# ============================================================

API = f"{PRODUCTION_URL}/api"

# Step 1: Login as admin
print("Logging in as admin...")
login_res = requests.post(f"{API}/auth/login", json={
    "email": ADMIN_EMAIL,
    "password": ADMIN_PASSWORD
})

if login_res.status_code != 200:
    print(f"ERROR: Login failed ({login_res.status_code}): {login_res.text}")
    sys.exit(1)

TOKEN = login_res.json()["token"]
HEADERS = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}
print("Login successful.\n")

# Step 2: Fetch all current sellers
print("Fetching sellers...")
sellers_res = requests.get(f"{API}/sellers", headers=HEADERS)
sellers = sellers_res.json()
print(f"Found {len(sellers)} sellers.\n")

# Step 3: Build rename map
# Format: Abbreviation (first letter of each word), Category Manufacturer, City
# Category is determined by the seller's first assigned category, defaulting to "Fabric"

CATEGORY_LABELS = {
    "Cotton Fabrics": "Cotton",
    "Polyester Fabrics": "Polyester",
    "Blended Fabrics": "Blended",
    "Knits": "Knit",
    "Denim": "Denim",
    "Sustainable Fabrics": "Sustainable",
    "Viscose": "Viscose",
    "Greige": "Greige",
}

print("=" * 80)
print(f"{'Current Name':<45} {'New Name':<45} {'Code'}")
print("=" * 80)

renames = []
for s in sellers:
    company = s.get("company_name", "")
    city = s.get("city", "") or "India"
    categories = s.get("category_names", [])

    # Abbreviation: first letter of each word
    words = company.replace(".", "").replace(",", "").split()
    abbr = "".join([w[0].upper() for w in words if w])

    # Primary category label
    primary_cat = "Fabric"  # default
    if categories:
        primary_cat = CATEGORY_LABELS.get(categories[0], categories[0].replace(" Fabrics", ""))

    new_name = f"{abbr}, {primary_cat} Manufacturer, {city}"

    renames.append({
        "id": s["id"],
        "old_name": company,
        "new_name": new_name,
        "seller_code": abbr,
    })

    print(f"{company:<45} {new_name:<45} {abbr}")

print("=" * 80)
print()

# Step 4: Confirm before proceeding
confirm = input("Proceed with renaming? (yes/no): ").strip().lower()
if confirm != "yes":
    print("Aborted.")
    sys.exit(0)

print()

# Step 5: Apply renames
success = 0
failed = 0
for r in renames:
    res = requests.put(f"{API}/sellers/{r['id']}", headers=HEADERS, json={
        "company_name": r["new_name"],
        "seller_code": r["seller_code"],
    })
    if res.status_code == 200:
        print(f"  OK: {r['seller_code']} -> {r['new_name']}")
        success += 1
    else:
        print(f"  FAIL: {r['old_name']} ({res.status_code}: {res.text})")
        failed += 1

print(f"\nDone. {success} renamed, {failed} failed.")

# Step 6: Verify by re-fetching
print("\nVerifying...")
sellers_res = requests.get(f"{API}/sellers", headers=HEADERS)
sellers = sellers_res.json()
print(f"\n{'Seller Code':<12} {'New Name':<50} {'SKUs'}")
print("-" * 70)

# Count SKUs per seller
fabrics_res = requests.get(f"{API}/fabrics?limit=1000&include_pending=true", headers=HEADERS)
fabrics = fabrics_res.json()
sku_counts = {}
for f in fabrics:
    sid = f.get("seller_id", "")
    sku_counts[sid] = sku_counts.get(sid, 0) + 1

for s in sellers:
    code = s.get("seller_code", "-")
    name = s.get("company_name", "")
    count = sku_counts.get(s["id"], 0)
    print(f"{code:<12} {name:<50} {count}")

print("\nAll done! Seller renames applied to production.")
