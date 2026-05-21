"""Shared auth helpers for admin authentication across all routers."""
from fastapi import HTTPException, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
import bcrypt
import os
from datetime import datetime, timezone, timedelta

JWT_SECRET = os.environ.get('JWT_SECRET', 'default-secret')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_HOURS = 24

security = HTTPBearer()
optional_security = HTTPBearer(auto_error=False)
db = None

def set_db(database):
    global db
    db = database

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())

def create_token(admin_id: str) -> str:
    payload = {
        'sub': admin_id,
        'exp': datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

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


async def get_optional_admin(credentials: HTTPAuthorizationCredentials = Depends(optional_security)):
    """Return the admin record if a valid Bearer token is present, else None.
    Used by public endpoints (e.g. /api/fabrics) that need to expose extra
    fields (like raw vendor names) when an admin is browsing, but stay
    obfuscated for unauthenticated visitors.

    NOTE: agents are also "internal staff" — they have their own JWT
    (`type: "agent"`) and SHOULD see vendor identity to coordinate with
    sellers. We treat any valid agent token as admin-equivalent for the
    purposes of seller_company / seller_name visibility on listings.
    """
    if not credentials or not credentials.credentials:
        return None
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        # Agent tokens carry `type: "agent"` + `agent_id` — surface them as
        # a synthetic admin-equivalent record so downstream gates open.
        if payload.get('type') == 'agent' and payload.get('agent_id'):
            agent = await db.agents.find_one(
                {'id': payload['agent_id']},
                {'_id': 0, 'id': 1, 'name': 1, 'email': 1},
            )
            if agent:
                # Tag the record so callers can distinguish "agent acting as
                # admin for read-only purposes" from a true platform admin.
                agent['_role'] = 'agent'
                return agent
            return None
        admin_id = payload.get('sub')
        if not admin_id:
            return None
        return await db.admins.find_one({'id': admin_id}, {'_id': 0})
    except jwt.PyJWTError:
        return None
