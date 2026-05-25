"""One-shot SKU export utility. Generates a CSV of every fabric in the
catalog with seller metadata and inventory flags. Output written to
/app/frontend/public/locofast-fabric-sku-export.csv so the user can
download it from a public URL."""
import os
import asyncio
import csv
from dotenv import load_dotenv

load_dotenv('/app/backend/.env')

from motor.motor_asyncio import AsyncIOMotorClient


async def main():
    db = AsyncIOMotorClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
    fabrics = await db.fabrics.find({}, {'_id': 0}).to_list(10000)
    print(f"Found {len(fabrics)} fabrics")
    if not fabrics:
        return
    sellers = {}
    async for s in db.sellers.find({}, {'_id': 0, 'id': 1, 'company': 1,
                                        'seller_code': 1, 'city': 1, 'state': 1}):
        sellers[s.get('id', '')] = s
    cols = [
        'id', 'fabric_code', 'name', 'category_name', 'composition',
        'weight_gsm', 'width_inches', 'construction', 'finish',
        'color', 'price_per_meter', 'currency',
        'moq_meters', 'lead_time_days', 'sample_price', 'sample_length_meters',
        'status', 'visibility', 'created_at', 'updated_at',
        'seller_id', 'seller_company', 'seller_code', 'seller_city', 'seller_state',
        'tags', 'certifications', 'description', 'image_count', 'primary_image_url',
        'is_in_stock', 'available_quantity_meters', 'article_id',
    ]
    out = '/app/frontend/public/locofast-fabric-sku-export.csv'
    with open(out, 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        w.writerow(cols)
        for fab in fabrics:
            s = sellers.get(fab.get('seller_id', ''), {}) or {}
            imgs = fab.get('images') or fab.get('image_urls') or []
            primary_img = ''
            if isinstance(imgs, list) and imgs:
                first = imgs[0]
                primary_img = first.get('url', '') if isinstance(first, dict) else first
            elif fab.get('image_url'):
                primary_img = fab.get('image_url')
            tags = fab.get('tags') or []
            certs = fab.get('certifications') or []
            w.writerow([
                fab.get('id', ''),
                fab.get('fabric_code') or fab.get('code') or '',
                fab.get('name', ''),
                fab.get('category_name') or fab.get('category', ''),
                fab.get('composition', ''),
                fab.get('weight_gsm') or fab.get('gsm', ''),
                fab.get('width_inches') or fab.get('width', ''),
                fab.get('construction', ''),
                fab.get('finish', ''),
                fab.get('color', ''),
                fab.get('price_per_meter') or fab.get('price', ''),
                fab.get('currency', 'INR'),
                fab.get('moq_meters') or fab.get('moq', ''),
                fab.get('lead_time_days', ''),
                fab.get('sample_price', ''),
                fab.get('sample_length_meters') or fab.get('sample_qty', ''),
                fab.get('status', ''),
                fab.get('visibility', ''),
                fab.get('created_at', ''),
                fab.get('updated_at', ''),
                fab.get('seller_id', ''),
                s.get('company', ''),
                s.get('seller_code', ''),
                s.get('city', ''),
                s.get('state', ''),
                '; '.join(tags) if isinstance(tags, list) else str(tags),
                '; '.join(certs) if isinstance(certs, list) else str(certs),
                (fab.get('description') or '')[:500].replace('\n', ' '),
                len(imgs) if isinstance(imgs, list) else 0,
                primary_img,
                fab.get('is_in_stock', ''),
                fab.get('available_quantity_meters', ''),
                fab.get('article_id', ''),
            ])
    print(f"Wrote {out} ({os.path.getsize(out)} bytes)")


if __name__ == '__main__':
    asyncio.run(main())
