"""
One-time migration: backfill `gst_number` on existing `credit_wallets`
documents using the GSTIN captured on the matching `credit_applications`
row. Run AFTER the orders→credit module is migrated to GST-only.

Usage:
    python /app/backend/migrations/backfill_credit_wallet_gst.py [--apply]

Without `--apply` it runs in dry-run mode and prints what *would* change.
"""
import asyncio
import os
import sys
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

APPLY = "--apply" in sys.argv


async def main() -> int:
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]

    total = 0
    matched = 0
    skipped_no_gst = 0
    already_set = 0
    duplicates = 0

    async for wallet in db.credit_wallets.find({}, {"_id": 0}):
        total += 1
        if (wallet.get("gst_number") or "").strip():
            already_set += 1
            continue

        # Find the credit application this wallet was approved from
        app = await db.credit_applications.find_one(
            {"email": wallet.get("email", ""), "status": "approved"},
            sort=[("approved_at", -1)],
        )
        if not app or not (app.get("gst_number") or "").strip():
            skipped_no_gst += 1
            continue

        gstin = app["gst_number"].strip().upper()

        # Check for duplicate — another wallet already on this GSTIN
        dup = await db.credit_wallets.find_one({"gst_number": gstin})
        if dup:
            duplicates += 1
            print(f"DUP   {wallet.get('email')} → {gstin} already on {dup.get('email')}")
            continue

        matched += 1
        if APPLY:
            await db.credit_wallets.update_one(
                {"email": wallet["email"]},
                {"$set": {"gst_number": gstin, "gst_backfilled_at": app.get("approved_at", "")}},
            )
        print(f"{'SET ' if APPLY else 'WOULD'} {wallet.get('email'):<40} → {gstin}  ({wallet.get('company','')})")

    print("\n=== Summary ===")
    print(f"Total wallets:        {total}")
    print(f"Already had GST:      {already_set}")
    print(f"Backfilled:           {matched} {'(applied)' if APPLY else '(dry-run)'}")
    print(f"No GST in app:        {skipped_no_gst}")
    print(f"Duplicate GST:        {duplicates}")
    if not APPLY and matched:
        print("\nRe-run with --apply to commit changes.")
    return 0


if __name__ == "__main__":
    asyncio.run(main())
