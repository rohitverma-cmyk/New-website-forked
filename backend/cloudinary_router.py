"""
Cloudinary Router - Handles cloud image/video upload and management
Provides signed upload signatures for frontend direct upload to Cloudinary
"""
from fastapi import APIRouter, HTTPException, Query, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import cloudinary
import cloudinary.utils
import cloudinary.uploader
import os
import time
import logging
import jwt

# Configure logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/cloudinary", tags=["cloudinary"])
security = HTTPBearer()

# JWT Config
JWT_SECRET = os.environ.get('JWT_SECRET')
JWT_ALGORITHM = 'HS256'

# MongoDB reference (will be set from main server)
db = None

def set_db(database):
    """Set database reference from main server"""
    global db
    db = database

def init_cloudinary():
    """Initialize Cloudinary with credentials"""
    cloud_name = os.environ.get('CLOUDINARY_CLOUD_NAME')
    api_key = os.environ.get('CLOUDINARY_API_KEY')
    api_secret = os.environ.get('CLOUDINARY_API_SECRET')
    
    if cloud_name and api_key and api_secret:
        cloudinary.config(
            cloud_name=cloud_name,
            api_key=api_key,
            api_secret=api_secret,
            secure=True
        )
        logger.info(f"Cloudinary initialized with cloud: {cloud_name}")
        return True
    else:
        logger.warning("Cloudinary credentials not found - cloud uploads disabled")
        return False

# Allowed folders for uploads
ALLOWED_FOLDERS = ("fabrics/", "sellers/", "categories/", "collections/", "uploads/")

async def verify_admin(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Verify admin or vendor token for protected endpoints (uploads)"""
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        # Accept vendor tokens for upload access
        if payload.get('type') == 'vendor':
            return {'id': payload.get('seller_id'), 'type': 'vendor'}
        admin_id = payload.get('sub')
        if db is not None:
            admin = await db.admins.find_one({'id': admin_id}, {'_id': 0})
            if not admin:
                raise HTTPException(status_code=401, detail='Invalid token')
            return admin
        return {'id': admin_id}
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail='Token expired')
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail='Invalid token')

@router.get("/signature")
async def generate_signature(
    resource_type: str = Query("image", enum=["image", "video"]),
    folder: str = Query("fabrics"),
    admin = Depends(verify_admin)
):
    """
    Generate a signed upload signature for direct frontend upload to Cloudinary.
    This keeps the API secret safe on the backend while allowing direct uploads.
    """
    api_secret = os.environ.get('CLOUDINARY_API_SECRET')
    if not api_secret:
        raise HTTPException(status_code=503, detail="Cloudinary not configured")
    
    # Validate folder path
    folder_with_slash = folder if folder.endswith('/') else folder + '/'
    if not any(folder_with_slash.startswith(allowed) for allowed in ALLOWED_FOLDERS):
        # Default to fabrics folder if invalid
        folder = "fabrics"
    
    timestamp = int(time.time())
    params = {
        "timestamp": timestamp,
        "folder": folder,
    }
    
    # Generate signature
    signature = cloudinary.utils.api_sign_request(params, api_secret)
    
    return {
        "signature": signature,
        "timestamp": timestamp,
        "cloud_name": os.environ.get('CLOUDINARY_CLOUD_NAME'),
        "api_key": os.environ.get('CLOUDINARY_API_KEY'),
        "folder": folder,
        "resource_type": resource_type
    }

@router.get("/config")
async def get_cloudinary_config(admin = Depends(verify_admin)):
    """Get Cloudinary configuration for frontend (public info only)"""
    cloud_name = os.environ.get('CLOUDINARY_CLOUD_NAME')
    if not cloud_name:
        raise HTTPException(status_code=503, detail="Cloudinary not configured")
    
    return {
        "cloud_name": cloud_name,
        "api_key": os.environ.get('CLOUDINARY_API_KEY'),
        "enabled": True
    }

@router.delete("/delete")
async def delete_asset(
    public_id: str = Query(..., description="Public ID of the asset to delete"),
    resource_type: str = Query("image", enum=["image", "video"]),
    admin = Depends(verify_admin)
):
    """Delete an asset from Cloudinary (admin only)"""
    try:
        result = cloudinary.uploader.destroy(
            public_id,
            resource_type=resource_type,
            invalidate=True
        )
        if result.get('result') == 'ok':
            logger.info(f"Deleted Cloudinary asset: {public_id}")
            return {"success": True, "message": "Asset deleted"}
        else:
            return {"success": False, "message": "Asset not found or already deleted"}
    except Exception as e:
        logger.error(f"Failed to delete Cloudinary asset: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to delete asset: {str(e)}")

@router.post("/upload-url")
async def upload_from_url(
    url: str = Query(..., description="URL of the image to upload"),
    folder: str = Query("fabrics"),
    admin = Depends(verify_admin)
):
    """Upload an image from URL directly to Cloudinary (for migration)"""
    try:
        result = cloudinary.uploader.upload(
            url,
            folder=folder,
            resource_type="auto"
        )
        return {
            "success": True,
            "url": result.get('secure_url'),
            "public_id": result.get('public_id'),
            "format": result.get('format'),
            "width": result.get('width'),
            "height": result.get('height')
        }
    except Exception as e:
        logger.error(f"Failed to upload from URL: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")
