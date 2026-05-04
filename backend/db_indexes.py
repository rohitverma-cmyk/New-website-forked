"""
One-shot indexes bootstrap — creates the indexes the app's hot queries
actually need. Idempotent (Mongo's create_indexes is a no-op for existing
indexes). Runs on every backend startup — cheap and guarantees correctness
if an index is accidentally dropped via ops work.

Indexes were derived by scanning every `await db.*.find(` call across the
routers and selecting the fields that drive the query, filter, or sort. We
deliberately use simple single/compound B-tree indexes — no text or geo
indexes — to keep memory footprint low.
"""
import logging
from pymongo import ASCENDING, DESCENDING


async def ensure_indexes(db):
    specs = {
        # --- fabrics (biggest collection after seo) ---
        "fabrics": [
            # Primary lookup key used everywhere
            [("id", ASCENDING)],
            # Category / type / status filters on catalog
            [("category_id", ASCENDING), ("status", ASCENDING)],
            [("fabric_type", ASCENDING), ("status", ASCENDING)],
            [("is_bookable", ASCENDING), ("quantity_available", ASCENDING)],
            # SEO / detail page slug lookups
            [("slug", ASCENDING)],
            [("seller_id", ASCENDING)],
            [("seller_sku", ASCENDING)],
            [("article_id", ASCENDING)],
            [("status", ASCENDING), ("created_at", DESCENDING)],
        ],

        # --- categories / sellers / brands (small but hot) ---
        "categories":       [[("id", ASCENDING)], [("slug", ASCENDING)]],
        "sellers":          [[("id", ASCENDING)], [("slug", ASCENDING)]],
        "collections":      [[("id", ASCENDING)], [("slug", ASCENDING)]],
        "articles":         [[("id", ASCENDING)], [("slug", ASCENDING)]],
        "brands":           [
            [("id", ASCENDING)],
            [("type", ASCENDING), ("parent_brand_id", ASCENDING)],
            [("status", ASCENDING)],
        ],

        # --- brand users / auth lookups ---
        "brand_users": [
            [("id", ASCENDING)],
            [("email", ASCENDING)],               # login path
            [("brand_id", ASCENDING), ("status", ASCENDING)],
        ],
        "agents":      [[("id", ASCENDING)], [("email", ASCENDING)]],
        "admins":      [[("email", ASCENDING)]],
        "customers":   [[("id", ASCENDING)], [("email", ASCENDING)]],

        # --- OTPs: need TTL-ish sort on created_at + lookup by email ---
        "customer_otps": [[("email", ASCENDING), ("created_at", DESCENDING)]],
        "agent_otps":    [[("email", ASCENDING), ("created_at", DESCENDING)]],
        "admin_otps":    [[("id", ASCENDING)], [("created_at", DESCENDING)]],

        # --- orders ---
        "orders": [
            [("id", ASCENDING)],
            [("order_number", ASCENDING)],
            [("customer_email", ASCENDING)],
            [("brand_id", ASCENDING), ("created_at", DESCENDING)],
            [("seller_id", ASCENDING)],
            [("shared_cart_token", ASCENDING)],
            [("created_at", DESCENDING)],         # admin dashboard
        ],

        # --- credit / samples ledger ---
        "brand_credit_lines":  [[("brand_id", ASCENDING)], [("id", ASCENDING)]],
        "brand_credit_ledger": [[("brand_id", ASCENDING), ("created_at", DESCENDING)]],
        "credit_wallets":      [[("email", ASCENDING)]],
        "credit_applications": [[("email", ASCENDING)], [("status", ASCENDING)]],

        # --- factory handoffs (new feature) ---
        "factory_handoffs": [
            [("id", ASCENDING)],
            [("brand_id", ASCENDING), ("created_at", DESCENDING)],
            [("factory_id", ASCENDING), ("created_at", DESCENDING)],
            [("status", ASCENDING)],
        ],

        # --- agent-shared carts ---
        "shared_carts": [
            [("id", ASCENDING)],
            [("token", ASCENDING)],
            [("agent_id", ASCENDING), ("created_at", DESCENDING)],
            [("status", ASCENDING)],
        ],

        # --- CMS collections ---
        "blog_posts":      [[("slug", ASCENDING)], [("status", ASCENDING), ("published_at", DESCENDING)]],
        "reviews":         [[("fabric_id", ASCENDING), ("created_at", DESCENDING)]],
        "enquiries":       [[("created_at", DESCENDING)], [("status", ASCENDING)]],
        "rfq_submissions": [[("created_at", DESCENDING)], [("status", ASCENDING)]],
        "coupons":         [[("code", ASCENDING)]],
        "commission_rules":[[("category_id", ASCENDING)]],

        # --- fabric SEO pre-generated content ---
        "fabric_seo":      [[("fabric_id", ASCENDING)]],
    }

    created = 0
    for coll_name, index_list in specs.items():
        for keys in index_list:
            try:
                await db[coll_name].create_index(keys, background=True)
                created += 1
            except Exception as e:
                # Duplicate / already exists is benign
                if "already exists" not in str(e).lower():
                    logging.warning(f"Index creation failed on {coll_name}{keys}: {e}")

    logging.info(f"[db-indexes] ensure_indexes complete · {created} index specs processed")
    return created
