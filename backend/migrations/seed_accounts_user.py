"""Seed/upsert the dedicated credit-ops user.

  • email:    creditoperations@locofast.com
  • password: Accounts@123 (must be changed by user first login)
  • role:     accounts (restricted feature surface)

This user handles vendor payouts and credit-operations work. Login email
was originally `accounts@locofast.com` but that's a distribution list with
no inbox — migrated to `creditoperations@locofast.com` (Feb 2026).
"""
import asyncio, os, uuid
from dotenv import load_dotenv
load_dotenv('/app/backend/.env')
import bcrypt
from motor.motor_asyncio import AsyncIOMotorClient

async def main():
    db = AsyncIOMotorClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
    email = "creditoperations@locofast.com"
    legacy_email = "accounts@locofast.com"
    plain = "Accounts@123"
    pwhash = bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()

    # Idempotent migration: prefer renaming the legacy login if it exists.
    existing = await db.admins.find_one({"email": email})
    legacy = await db.admins.find_one({"email": legacy_email}) if not existing else None
    if existing:
        await db.admins.update_one(
            {"id": existing["id"]},
            {"$set": {
                "role": "accounts",
                "name": existing.get("name") or "Credit Operations (Locofast)",
                "password": pwhash,
            }},
        )
        print(f"Updated existing user: id={existing['id']}")
    elif legacy:
        await db.admins.update_one(
            {"id": legacy["id"]},
            {"$set": {
                "email": email,
                "role": "accounts",
                "name": "Credit Operations (Locofast)",
                "password": pwhash,
            }},
        )
        print(f"Renamed legacy accounts@ → {email} (id={legacy['id']})")
    else:
        doc = {
            "id": str(uuid.uuid4()),
            "email": email,
            "password": pwhash,
            "name": "Credit Operations (Locofast)",
            "role": "accounts",
            "is_account_manager": False,
        }
        await db.admins.insert_one(doc)
        print(f"Created credit-ops user: id={doc['id']}")
    print(f"Credentials → {email} / {plain}")

asyncio.run(main())
