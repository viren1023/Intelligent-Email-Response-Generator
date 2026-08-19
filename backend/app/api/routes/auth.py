from fastapi import APIRouter, Request, Depends, HTTPException, Response
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.services.google_oauth_service import oauth
from app.models.user import User, OAuthAccount
from app.schemas.auth import UserResponse
from app.core.config import settings
import datetime

router = APIRouter()

@router.get("/google")
async def login_google(request: Request):
    redirect_uri = settings.google_redirect_uri
    return await oauth.google.authorize_redirect(
        request, 
        redirect_uri,
        prompt='consent',
        access_type='offline'
    )

@router.get("/google/callback")
async def auth_google_callback(request: Request, response: Response, db: Session = Depends(get_db)):
    try:
        token = await oauth.google.authorize_access_token(request)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Authentication failed: {str(e)}")
    
    user_info = token.get('userinfo')
    if not user_info:
        raise HTTPException(status_code=400, detail="Missing user info")
        
    google_user_id = user_info.get("sub")
    email = user_info.get("email")
    name = user_info.get("name")
    picture = user_info.get("picture")
    
    user = db.query(User).filter(User.google_user_id == google_user_id).first()
    if not user:
        user = User(google_user_id=google_user_id, email=email, name=name, picture=picture)
        db.add(user)
        db.commit()
        db.refresh(user)
        
    oauth_acc = db.query(OAuthAccount).filter(OAuthAccount.user_id == user.id, OAuthAccount.provider == "google").first()
    if not oauth_acc:
        oauth_acc = OAuthAccount(user_id=user.id, provider="google")
        db.add(oauth_acc)
        
    oauth_acc.access_token = token.get("access_token")
    oauth_acc.refresh_token = token.get("refresh_token") or oauth_acc.refresh_token
    expires_in = token.get("expires_in")
    if expires_in:
        oauth_acc.token_expiry = datetime.datetime.utcnow() + datetime.timedelta(seconds=expires_in)
    
    db.commit()
    
    from fastapi.responses import RedirectResponse
    redirect_res = RedirectResponse(url=f"{settings.frontend_url}/dashboard")
    redirect_res.set_cookie(
        key="session_token",
        value=str(user.id),
        httponly=True,
        max_age=86400,
        samesite="lax"
    )
    
    return redirect_res

def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    session_token = request.cookies.get("session_token")
    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    user = db.query(User).filter(User.id == int(session_token)).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user

@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("session_token")
    return {"message": "Logged out successfully"}
