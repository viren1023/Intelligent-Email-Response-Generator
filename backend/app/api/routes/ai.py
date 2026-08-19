from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.api.routes.auth import get_current_user
from app.models.user import User, OAuthAccount
from app.models.email import Email, AIResponse
from app.services.gmail_service import GmailService
from app.services.ai_service import AIService
from app.core.config import settings
from pydantic import BaseModel
import time

router = APIRouter()

class GenerateRequest(BaseModel):
    thread_id: str
    custom_instruction: str = None

@router.post("/{email_id}/generate-reply")
async def generate_reply(
    email_id: str,
    request: GenerateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    oauth_acc = db.query(OAuthAccount).filter(OAuthAccount.user_id == current_user.id, OAuthAccount.provider == "google").first()
    if not oauth_acc:
        raise HTTPException(status_code=400, detail="Google account not connected")
        
    try:
        thread = GmailService.get_thread(oauth_acc, request.thread_id)
        
        conversation_text = ""
        for msg in thread.get('messages', []):
            headers = {h['name'].lower(): h['value'] for h in msg['payload']['headers']}
            from_header = headers.get('from', 'Unknown')
            
            body = ""
            if 'parts' in msg['payload']:
                for part in msg['payload']['parts']:
                    if part['mimeType'] == 'text/plain' and 'data' in part['body']:
                        import base64
                        body += base64.urlsafe_b64decode(part['body']['data']).decode()
            elif 'body' in msg['payload'] and 'data' in msg['payload']['body']:
                import base64
                body = base64.urlsafe_b64decode(msg['payload']['body']['data']).decode()
                
            conversation_text += f"\nFrom: {from_header}\n{body}\n{'-'*20}\n"
            
        start_time = time.time()
        reply_text = await AIService.generate_reply(conversation_text, request.custom_instruction)
        generation_time = int((time.time() - start_time) * 1000)
        
        email = db.query(Email).filter(Email.gmail_message_id == email_id).first()
        if not email:
            email = Email(user_id=current_user.id, gmail_message_id=email_id, gmail_thread_id=request.thread_id)
            db.add(email)
            db.commit()
            db.refresh(email)
            
        ai_response = AIResponse(
            user_id=current_user.id,
            email_id=email.id,
            generated_text=reply_text,
            model_name=settings.ollama_model,
            generation_time=generation_time,
            status="GENERATED"
        )
        db.add(ai_response)
        db.commit()
        db.refresh(ai_response)
        
        return {"response_id": ai_response.id, "generated_text": reply_text}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Generation failed: {str(e)}")
