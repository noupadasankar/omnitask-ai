"""Express equivalent of apps/backend/src/core/http/auth.middleware.ts, ported
to a FastAPI dependency. Same contract: Bearer token in the Authorization
header, same JWT_SECRET (HS256), same payload shape ({sub, email, role}),
same 401 on missing/invalid/expired token or unknown user.
"""

import os
from dataclasses import dataclass

import jwt
from fastapi import HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from db.session_db import find_user_by_id

_bearer_scheme = HTTPBearer(auto_error=False)

_AUTH_ERROR = HTTPException(status_code=401, detail="Authentication required or token invalid")


@dataclass(frozen=True)
class AuthedUser:
    id: str
    email: str
    role: str


async def require_user(
    credentials: HTTPAuthorizationCredentials | None = Security(_bearer_scheme),
) -> AuthedUser:
    if credentials is None or not credentials.credentials:
        raise _AUTH_ERROR

    secret = os.environ.get("JWT_SECRET")
    if not secret:
        raise RuntimeError("JWT_SECRET is not defined in environment")

    try:
        payload = jwt.decode(credentials.credentials, secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise _AUTH_ERROR

    user_id = payload.get("sub")
    user = await find_user_by_id(user_id) if user_id else None
    if not user:
        raise _AUTH_ERROR

    return AuthedUser(id=user["id"], email=user["email"], role=user["role"])
