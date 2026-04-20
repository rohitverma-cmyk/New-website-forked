from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
from datetime import datetime, timezone
import uuid
import re
import os
import jwt
from motor.motor_asyncio import AsyncIOMotorClient

router = APIRouter(prefix="/api/blog", tags=["blog"])
security = HTTPBearer()

# MongoDB connection
mongo_url = os.environ.get('MONGO_URL')
db_name = os.environ.get('DB_NAME', 'test_database')
if db_name and db_name.startswith('"') and db_name.endswith('"'):
    db_name = db_name[1:-1]
client = AsyncIOMotorClient(mongo_url)
db = client[db_name]

# JWT Config
JWT_SECRET = os.environ.get('JWT_SECRET', 'fallback_secret')
JWT_ALGORITHM = 'HS256'

async def get_current_admin(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        admin_id = payload.get('sub')
        admin = await db.admins.find_one({'id': admin_id}, {'_id': 0})
        if not admin:
            raise HTTPException(status_code=401, detail='Invalid token')
        return admin
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail='Token expired')
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail='Invalid token')

# ==================== MODELS ====================

class BlogCategoryCreate(BaseModel):
    name: str
    slug: Optional[str] = ""
    description: Optional[str] = ""

class BlogCategoryUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    description: Optional[str] = None

class BlogCategory(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    slug: str
    description: str = ""
    post_count: int = 0
    created_at: str

class BlogTagCreate(BaseModel):
    name: str
    slug: Optional[str] = ""

class BlogTagUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None

class BlogTag(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    slug: str
    post_count: int = 0
    created_at: str

class BlogPostCreate(BaseModel):
    title: str
    slug: Optional[str] = ""
    content: str
    excerpt: Optional[str] = ""
    featured_image: Optional[str] = ""
    category_id: Optional[str] = ""
    tag_ids: List[str] = []
    status: str = "draft"  # draft / published
    # SEO fields
    meta_title: Optional[str] = ""
    meta_description: Optional[str] = ""
    canonical_url: Optional[str] = ""
    og_title: Optional[str] = ""
    og_description: Optional[str] = ""
    og_image: Optional[str] = ""

class BlogPostUpdate(BaseModel):
    title: Optional[str] = None
    slug: Optional[str] = None
    content: Optional[str] = None
    excerpt: Optional[str] = None
    featured_image: Optional[str] = None
    category_id: Optional[str] = None
    tag_ids: Optional[List[str]] = None
    status: Optional[str] = None
    meta_title: Optional[str] = None
    meta_description: Optional[str] = None
    canonical_url: Optional[str] = None
    og_title: Optional[str] = None
    og_description: Optional[str] = None
    og_image: Optional[str] = None

class BlogPost(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    title: str
    slug: str
    content: str
    excerpt: str = ""
    featured_image: str = ""
    category_id: str = ""
    category_name: str = ""
    category_slug: str = ""
    tag_ids: List[str] = []
    tags: List[dict] = []  # [{id, name, slug}]
    status: str = "draft"
    # SEO fields
    meta_title: str = ""
    meta_description: str = ""
    canonical_url: str = ""
    og_title: str = ""
    og_description: str = ""
    og_image: str = ""
    # Timestamps
    created_at: str
    updated_at: str
    published_at: Optional[str] = None

# ==================== HELPERS ====================

def generate_slug(text: str) -> str:
    """Generate URL-friendly slug from text"""
    slug = text.lower()
    slug = re.sub(r'[^a-z0-9\s-]', '', slug)
    slug = re.sub(r'[\s_]+', '-', slug)
    slug = re.sub(r'-+', '-', slug)
    slug = slug.strip('-')
    return slug

def generate_excerpt(content: str, max_length: int = 160) -> str:
    """Generate excerpt from content by stripping HTML and truncating"""
    # Remove HTML tags
    text = re.sub(r'<[^>]+>', '', content)
    # Remove extra whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    # Truncate
    if len(text) > max_length:
        text = text[:max_length].rsplit(' ', 1)[0] + '...'
    return text

# ==================== CATEGORY ROUTES ====================

@router.get("/categories", response_model=List[BlogCategory])
async def get_blog_categories():
    categories = await db.blog_categories.find({}, {'_id': 0}).sort('name', 1).to_list(100)
    
    # Get post counts
    for cat in categories:
        count = await db.blog_posts.count_documents({'category_id': cat['id']})
        cat['post_count'] = count
    
    return categories

@router.get("/categories/{category_id}", response_model=BlogCategory)
async def get_blog_category(category_id: str):
    category = await db.blog_categories.find_one({'id': category_id}, {'_id': 0})
    if not category:
        raise HTTPException(status_code=404, detail='Category not found')
    
    count = await db.blog_posts.count_documents({'category_id': category_id})
    category['post_count'] = count
    return category

@router.get("/categories/slug/{slug}", response_model=BlogCategory)
async def get_blog_category_by_slug(slug: str):
    category = await db.blog_categories.find_one({'slug': slug}, {'_id': 0})
    if not category:
        raise HTTPException(status_code=404, detail='Category not found')
    
    count = await db.blog_posts.count_documents({'category_id': category['id']})
    category['post_count'] = count
    return category

@router.post("/categories", response_model=BlogCategory)
async def create_blog_category(data: BlogCategoryCreate, admin=Depends(get_current_admin)):
    category_id = str(uuid.uuid4())
    slug = data.slug if data.slug else generate_slug(data.name)
    
    # Check for duplicate slug
    existing = await db.blog_categories.find_one({'slug': slug})
    if existing:
        slug = f"{slug}-{category_id[:8]}"
    
    category_doc = {
        'id': category_id,
        'name': data.name,
        'slug': slug,
        'description': data.description or "",
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    await db.blog_categories.insert_one(category_doc)
    return BlogCategory(**category_doc, post_count=0)

@router.put("/categories/{category_id}", response_model=BlogCategory)
async def update_blog_category(category_id: str, data: BlogCategoryUpdate, admin=Depends(get_current_admin)):
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail='No data to update')
    
    # Generate new slug if name changed but slug not provided
    if 'name' in update_data and 'slug' not in update_data:
        update_data['slug'] = generate_slug(update_data['name'])
    
    result = await db.blog_categories.update_one({'id': category_id}, {'$set': update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail='Category not found')
    
    category = await db.blog_categories.find_one({'id': category_id}, {'_id': 0})
    count = await db.blog_posts.count_documents({'category_id': category_id})
    return BlogCategory(**category, post_count=count)

@router.delete("/categories/{category_id}")
async def delete_blog_category(category_id: str, admin=Depends(get_current_admin)):
    # Remove category from posts
    await db.blog_posts.update_many({'category_id': category_id}, {'$set': {'category_id': ''}})
    
    result = await db.blog_categories.delete_one({'id': category_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail='Category not found')
    return {'message': 'Category deleted'}

# ==================== TAG ROUTES ====================

@router.get("/tags", response_model=List[BlogTag])
async def get_blog_tags():
    tags = await db.blog_tags.find({}, {'_id': 0}).sort('name', 1).to_list(500)
    
    # Get post counts
    for tag in tags:
        count = await db.blog_posts.count_documents({'tag_ids': tag['id']})
        tag['post_count'] = count
    
    return tags

@router.get("/tags/{tag_id}", response_model=BlogTag)
async def get_blog_tag(tag_id: str):
    tag = await db.blog_tags.find_one({'id': tag_id}, {'_id': 0})
    if not tag:
        raise HTTPException(status_code=404, detail='Tag not found')
    
    count = await db.blog_posts.count_documents({'tag_ids': tag_id})
    tag['post_count'] = count
    return tag

@router.get("/tags/slug/{slug}", response_model=BlogTag)
async def get_blog_tag_by_slug(slug: str):
    tag = await db.blog_tags.find_one({'slug': slug}, {'_id': 0})
    if not tag:
        raise HTTPException(status_code=404, detail='Tag not found')
    
    count = await db.blog_posts.count_documents({'tag_ids': tag['id']})
    tag['post_count'] = count
    return tag

@router.post("/tags", response_model=BlogTag)
async def create_blog_tag(data: BlogTagCreate, admin=Depends(get_current_admin)):
    tag_id = str(uuid.uuid4())
    slug = data.slug if data.slug else generate_slug(data.name)
    
    # Check for duplicate slug
    existing = await db.blog_tags.find_one({'slug': slug})
    if existing:
        slug = f"{slug}-{tag_id[:8]}"
    
    tag_doc = {
        'id': tag_id,
        'name': data.name,
        'slug': slug,
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    await db.blog_tags.insert_one(tag_doc)
    return BlogTag(**tag_doc, post_count=0)

@router.put("/tags/{tag_id}", response_model=BlogTag)
async def update_blog_tag(tag_id: str, data: BlogTagUpdate, admin=Depends(get_current_admin)):
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail='No data to update')
    
    if 'name' in update_data and 'slug' not in update_data:
        update_data['slug'] = generate_slug(update_data['name'])
    
    result = await db.blog_tags.update_one({'id': tag_id}, {'$set': update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail='Tag not found')
    
    tag = await db.blog_tags.find_one({'id': tag_id}, {'_id': 0})
    count = await db.blog_posts.count_documents({'tag_ids': tag_id})
    return BlogTag(**tag, post_count=count)

@router.delete("/tags/{tag_id}")
async def delete_blog_tag(tag_id: str, admin=Depends(get_current_admin)):
    # Remove tag from posts
    await db.blog_posts.update_many({'tag_ids': tag_id}, {'$pull': {'tag_ids': tag_id}})
    
    result = await db.blog_tags.delete_one({'id': tag_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail='Tag not found')
    return {'message': 'Tag deleted'}

# ==================== POST ROUTES ====================

@router.get("/posts", response_model=List[BlogPost])
async def get_blog_posts(
    status: Optional[str] = Query(None),
    category_id: Optional[str] = Query(None),
    category_slug: Optional[str] = Query(None),
    tag_id: Optional[str] = Query(None),
    tag_slug: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = Query(20, le=100),
    skip: int = Query(0)
):
    query = {}
    
    # Filter by status (default to published for public)
    if status:
        query['status'] = status
    
    # Filter by category
    if category_id:
        query['category_id'] = category_id
    elif category_slug:
        cat = await db.blog_categories.find_one({'slug': category_slug}, {'_id': 0})
        if cat:
            query['category_id'] = cat['id']
    
    # Filter by tag
    if tag_id:
        query['tag_ids'] = tag_id
    elif tag_slug:
        tag = await db.blog_tags.find_one({'slug': tag_slug}, {'_id': 0})
        if tag:
            query['tag_ids'] = tag['id']
    
    # Search
    if search:
        query['$or'] = [
            {'title': {'$regex': search, '$options': 'i'}},
            {'content': {'$regex': search, '$options': 'i'}},
            {'excerpt': {'$regex': search, '$options': 'i'}}
        ]
    
    posts = await db.blog_posts.find(query, {'_id': 0}).sort('created_at', -1).skip(skip).limit(limit).to_list(limit)
    
    # Enrich with category and tag names
    categories = {c['id']: c for c in await db.blog_categories.find({}, {'_id': 0}).to_list(100)}
    tags = {t['id']: t for t in await db.blog_tags.find({}, {'_id': 0}).to_list(500)}
    
    for post in posts:
        if post.get('category_id') and post['category_id'] in categories:
            post['category_name'] = categories[post['category_id']]['name']
            post['category_slug'] = categories[post['category_id']]['slug']
        else:
            post['category_name'] = ""
            post['category_slug'] = ""
        
        post['tags'] = []
        for tag_id in post.get('tag_ids', []):
            if tag_id in tags:
                post['tags'].append({
                    'id': tag_id,
                    'name': tags[tag_id]['name'],
                    'slug': tags[tag_id]['slug']
                })
    
    return posts

@router.get("/posts/count")
async def get_blog_posts_count(
    status: Optional[str] = Query(None),
    category_id: Optional[str] = Query(None),
    tag_id: Optional[str] = Query(None)
):
    query = {}
    if status:
        query['status'] = status
    if category_id:
        query['category_id'] = category_id
    if tag_id:
        query['tag_ids'] = tag_id
    
    count = await db.blog_posts.count_documents(query)
    return {'count': count}

@router.get("/posts/{post_id}", response_model=BlogPost)
async def get_blog_post(post_id: str):
    post = await db.blog_posts.find_one({'id': post_id}, {'_id': 0})
    if not post:
        raise HTTPException(status_code=404, detail='Post not found')
    
    # Enrich with category and tag data
    if post.get('category_id'):
        cat = await db.blog_categories.find_one({'id': post['category_id']}, {'_id': 0})
        if cat:
            post['category_name'] = cat['name']
            post['category_slug'] = cat['slug']
    
    post['tags'] = []
    for tag_id in post.get('tag_ids', []):
        tag = await db.blog_tags.find_one({'id': tag_id}, {'_id': 0})
        if tag:
            post['tags'].append({'id': tag_id, 'name': tag['name'], 'slug': tag['slug']})
    
    return post

@router.get("/posts/slug/{slug}", response_model=BlogPost)
async def get_blog_post_by_slug(slug: str):
    post = await db.blog_posts.find_one({'slug': slug}, {'_id': 0})
    if not post:
        raise HTTPException(status_code=404, detail='Post not found')
    
    # Enrich with category and tag data
    if post.get('category_id'):
        cat = await db.blog_categories.find_one({'id': post['category_id']}, {'_id': 0})
        if cat:
            post['category_name'] = cat['name']
            post['category_slug'] = cat['slug']
    
    post['tags'] = []
    for tag_id in post.get('tag_ids', []):
        tag = await db.blog_tags.find_one({'id': tag_id}, {'_id': 0})
        if tag:
            post['tags'].append({'id': tag_id, 'name': tag['name'], 'slug': tag['slug']})
    
    return post

@router.post("/posts", response_model=BlogPost)
async def create_blog_post(data: BlogPostCreate, admin=Depends(get_current_admin)):
    post_id = str(uuid.uuid4())
    slug = data.slug if data.slug else generate_slug(data.title)
    
    # Check for duplicate slug
    existing = await db.blog_posts.find_one({'slug': slug})
    if existing:
        slug = f"{slug}-{post_id[:8]}"
    
    # Generate excerpt if not provided
    excerpt = data.excerpt if data.excerpt else generate_excerpt(data.content)
    
    # Auto-generate SEO fields if not provided
    meta_title = data.meta_title if data.meta_title else data.title[:60]
    meta_description = data.meta_description if data.meta_description else excerpt[:160]
    og_title = data.og_title if data.og_title else data.title
    og_description = data.og_description if data.og_description else excerpt
    og_image = data.og_image if data.og_image else data.featured_image
    
    now = datetime.now(timezone.utc).isoformat()
    published_at = now if data.status == 'published' else None
    
    post_doc = {
        'id': post_id,
        'title': data.title,
        'slug': slug,
        'content': data.content,
        'excerpt': excerpt,
        'featured_image': data.featured_image or "",
        'category_id': data.category_id or "",
        'tag_ids': data.tag_ids or [],
        'status': data.status,
        'meta_title': meta_title,
        'meta_description': meta_description,
        'canonical_url': data.canonical_url or "",
        'og_title': og_title,
        'og_description': og_description,
        'og_image': og_image,
        'created_at': now,
        'updated_at': now,
        'published_at': published_at
    }
    await db.blog_posts.insert_one(post_doc)
    
    # Return enriched post
    return await get_blog_post(post_id)

@router.put("/posts/{post_id}", response_model=BlogPost)
async def update_blog_post(post_id: str, data: BlogPostUpdate, admin=Depends(get_current_admin)):
    existing = await db.blog_posts.find_one({'id': post_id}, {'_id': 0})
    if not existing:
        raise HTTPException(status_code=404, detail='Post not found')
    
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail='No data to update')
    
    # Generate new slug if title changed but slug not provided
    if 'title' in update_data and 'slug' not in update_data:
        update_data['slug'] = generate_slug(update_data['title'])
        # Check for duplicate
        slug_check = await db.blog_posts.find_one({'slug': update_data['slug'], 'id': {'$ne': post_id}})
        if slug_check:
            update_data['slug'] = f"{update_data['slug']}-{post_id[:8]}"
    
    # Update excerpt if content changed but excerpt not provided
    if 'content' in update_data and 'excerpt' not in update_data:
        update_data['excerpt'] = generate_excerpt(update_data['content'])
    
    # Set published_at if status changed to published
    if 'status' in update_data and update_data['status'] == 'published' and not existing.get('published_at'):
        update_data['published_at'] = datetime.now(timezone.utc).isoformat()
    
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    await db.blog_posts.update_one({'id': post_id}, {'$set': update_data})
    return await get_blog_post(post_id)

@router.delete("/posts/{post_id}")
async def delete_blog_post(post_id: str, admin=Depends(get_current_admin)):
    result = await db.blog_posts.delete_one({'id': post_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail='Post not found')
    return {'message': 'Post deleted'}

# ==================== SITEMAP ROUTE ====================

@router.get("/sitemap")
async def get_blog_sitemap():
    """Generate sitemap data for all published blog posts"""
    posts = await db.blog_posts.find({'status': 'published'}, {'_id': 0, 'slug': 1, 'updated_at': 1}).to_list(1000)
    categories = await db.blog_categories.find({}, {'_id': 0, 'slug': 1}).to_list(100)
    tags = await db.blog_tags.find({}, {'_id': 0, 'slug': 1}).to_list(500)
    
    return {
        'posts': [{'slug': p['slug'], 'updated_at': p['updated_at']} for p in posts],
        'categories': [{'slug': c['slug']} for c in categories],
        'tags': [{'slug': t['slug']} for t in tags]
    }

# ==================== STATS ROUTE ====================

@router.get("/stats")
async def get_blog_stats():
    """Get blog statistics for admin dashboard"""
    total_posts = await db.blog_posts.count_documents({})
    published_posts = await db.blog_posts.count_documents({'status': 'published'})
    draft_posts = await db.blog_posts.count_documents({'status': 'draft'})
    total_categories = await db.blog_categories.count_documents({})
    total_tags = await db.blog_tags.count_documents({})
    
    return {
        'total_posts': total_posts,
        'published_posts': published_posts,
        'draft_posts': draft_posts,
        'total_categories': total_categories,
        'total_tags': total_tags
    }
