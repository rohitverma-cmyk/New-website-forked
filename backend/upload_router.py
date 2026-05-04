"""
File upload endpoints (legacy local-disk uploads; Cloudinary routes live in
cloudinary_router.py).
"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from pathlib import Path
import uuid
import shutil
import auth_helpers

router = APIRouter(prefix="/api", tags=["upload"])

ROOT_DIR = Path(__file__).parent
UPLOAD_DIR = ROOT_DIR / 'uploads'
UPLOAD_DIR.mkdir(exist_ok=True)


@router.post("/upload")
async def upload_image(file: UploadFile = File(...), admin=Depends(auth_helpers.get_current_admin)):
    if not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail='File must be an image')

    ext = file.filename.split('.')[-1] if '.' in file.filename else 'jpg'
    filename = f"{uuid.uuid4()}.{ext}"
    filepath = UPLOAD_DIR / filename

    with open(filepath, 'wb') as f:
        shutil.copyfileobj(file.file, f)

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

    return {'url': f'/api/uploads/{filename}', 'filename': filename, 'size': file_size}
