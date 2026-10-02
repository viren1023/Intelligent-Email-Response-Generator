from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc
from app.db.database import get_db
from app.api.routes.auth import get_current_user
from app.models.user import User
from app.models.email import AIResponse, Email
from pydantic import BaseModel
from typing import Optional
import datetime

router = APIRouter()

class AutoSaveDraftRequest(BaseModel):
    edited_text: str

@router.get("/")
async def get_responses(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    responses = db.query(AIResponse).filter(AIResponse.user_id == current_user.id).order_by(desc(AIResponse.created_at)).all()
    
    result = []
    for r in responses:
        email = db.query(Email).filter(Email.id == r.email_id).first()
        result.append({
            "id": r.id,
            "sender": (email.sender_email or email.sender_name) if email else "Unknown",
            "subject": email.subject if email else "No Subject",
            "status": r.status,
            "generated_at": r.created_at,
            "sent_at": r.sent_at
        })
        
    return result

@router.get("/{response_id}")
async def get_response_detail(response_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = db.query(AIResponse).filter(AIResponse.id == response_id, AIResponse.user_id == current_user.id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Response not found")
        
    email = db.query(Email).filter(Email.id == r.email_id).first()
    
    return {
        "id": r.id,
        "email": {
            "sender": (email.sender_email or email.sender_name) if email else "Unknown",
            "subject": email.subject if email else "No Subject",
            "snippet": email.snippet if email else "",
        },
        "generated_text": r.generated_text,
        "edited_text": r.edited_text,
        "model_name": r.model_name,
        "generation_time": r.generation_time,
        "status": r.status,
        "generated_at": r.created_at,
        "sent_at": r.sent_at
    }

@router.patch("/{response_id}")
async def autosave_draft(
    response_id: int,
    req: AutoSaveDraftRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    r = db.query(AIResponse).filter(AIResponse.id == response_id, AIResponse.user_id == current_user.id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Response not found")
        
    r.edited_text = req.edited_text
    if r.status != "SENT":
        r.status = "EDITED"
    db.commit()
    db.refresh(r)
    return {"status": "saved", "id": r.id, "updated_at": datetime.datetime.utcnow().isoformat()}
