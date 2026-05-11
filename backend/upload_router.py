"""
File upload endpoints. Uses Cloudinary when CLOUDINARY_* env vars are set;
otherwise saves under backend/uploads (legacy local disk).
"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from pathlib import Path
import uuid
import shutil
import os
import logging

import auth_helpers

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["upload"])

ROOT_DIR = Path(__file__).parent
UPLOAD_DIR = ROOT_DIR / 'uploads'
UPLOAD_DIR.mkdir(exist_ok=True)


def _cloudinary_configured() -> bool:
    return bool(
        os.environ.get("CLOUDINARY_CLOUD_NAME")
        and os.environ.get("CLOUDINARY_API_KEY")
        and os.environ.get("CLOUDINARY_API_SECRET")
    )


def _ensure_cloudinary():
    """Lazy import so servers without cloudinary package still run disk-only."""
    import cloudinary

    cloudinary.config(
        cloud_name=os.environ["CLOUDINARY_CLOUD_NAME"],
        api_key=os.environ["CLOUDINARY_API_KEY"],
        api_secret=os.environ["CLOUDINARY_API_SECRET"],
        secure=True,
    )
    return cloudinary


@router.post("/upload")
async def upload_image(file: UploadFile = File(...), admin=Depends(auth_helpers.get_current_admin)):
    if not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail='File must be an image')

    ext = file.filename.split('.')[-1] if '.' in file.filename else 'jpg'
    filename = f"{uuid.uuid4()}.{ext}"
    filepath = UPLOAD_DIR / filename

    with open(filepath, 'wb') as f:
        shutil.copyfileobj(file.file, f)

    if _cloudinary_configured():
        try:
            cloudinary = _ensure_cloudinary()
            result = cloudinary.uploader.upload(
                str(filepath),
                folder="locofast/uploads",
                resource_type="image",
                use_filename=False,
                unique_filename=True,
            )
            try:
                filepath.unlink(missing_ok=True)
            except OSError:
                pass
            secure = result.get("secure_url")
            if secure:
                logger.info("Uploaded image to Cloudinary")
                return {
                    "url": secure,
                    "public_id": result.get("public_id"),
                    "bytes": result.get("bytes"),
                }
        except Exception as e:
            logger.exception("Cloudinary upload failed, falling back to local URL: %s", e)

    return {'url': f'/api/uploads/{filename}'}


@router.post("/upload/video")
async def upload_video(file: UploadFile = File(...), admin=Depends(auth_helpers.get_current_admin)):
    """Upload video files up to 150MB."""
    allowed = ['video/mp4', 'video/webm', 'video/quicktime',
               'video/x-msvideo', 'video/mpeg']
    if file.content_type not in allowed:
        raise HTTPException(status_code=400, detail='File must be a video (MP4, WebM, MOV, AVI, MPEG)')

    file.file.seek(0, 2)
    file_size = file.file.tell()
    file.file.seek(0)

    max_size = 150 * 1024 * 1024
    if file_size > max_size:
        raise HTTPException(status_code=400, detail='Video file too large. Maximum size is 150MB')

    ext = file.filename.split('.')[-1] if '.' in file.filename else 'mp4'
    filename = f"video_{uuid.uuid4()}.{ext}"
    filepath = UPLOAD_DIR / filename

    chunk_size = 1024 * 1024
    with open(filepath, 'wb') as f:
        while True:
            chunk = await file.read(chunk_size)
            if not chunk:
                break
            f.write(chunk)

    if _cloudinary_configured():
        try:
            cloudinary = _ensure_cloudinary()
            result = cloudinary.uploader.upload(
                str(filepath),
                folder="locofast/videos",
                resource_type="video",
                use_filename=False,
                unique_filename=True,
            )
            try:
                filepath.unlink(missing_ok=True)
            except OSError:
                pass
            secure = result.get("secure_url")
            if secure:
                logger.info("Uploaded video to Cloudinary")
                return {
                    'url': secure,
                    'public_id': result.get("public_id"),
                    'filename': filename,
                    'size': file_size,
                }
        except Exception as e:
            logger.exception("Cloudinary video upload failed, falling back to local URL: %s", e)

    return {'url': f'/api/uploads/{filename}', 'filename': filename, 'size': file_size}
