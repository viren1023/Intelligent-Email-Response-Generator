from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.api.routes.auth import get_current_user
from app.models.user import User, OAuthAccount
from app.models.email import Email, AIResponse
from app.services.gmail_service import GmailService
from app.services.ai_service import AIService
from app.db.chat_db import ChatDB
from app.core.config import settings
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import time
import json
import base64

router = APIRouter()

class GenerateRequest(BaseModel):
    thread_id: str
    custom_instruction: Optional[str] = None
    tone: Optional[str] = "professional"

class ChatRequest(BaseModel):
    thread_id: str
    message: str

class UrgencyBatchRequest(BaseModel):
    emails: List[Dict[str, Any]] # id, subject, snippet

def extract_thread_text(thread: dict) -> str:
    conversation_text = ""
    for msg in thread.get('messages', []):
        headers = {h['name'].lower(): h['value'] for h in msg.get('payload', {}).get('headers', [])}
        from_header = headers.get('from', 'Unknown')
        
        body = ""
        payload = msg.get('payload', {})
        if 'parts' in payload:
            for part in payload['parts']:
                if part.get('mimeType') == 'text/plain' and 'data' in part.get('body', {}):
                    try:
                        body += base64.urlsafe_b64decode(part['body']['data']).decode('utf-8', errors='replace')
                    except Exception:
                        pass
        elif 'body' in payload and 'data' in payload['body']:
            try:
                body = base64.urlsafe_b64decode(payload['body']['data']).decode('utf-8', errors='replace')
            except Exception:
                pass
            
        conversation_text += f"\nFrom: {from_header}\n{body}\n{'-'*20}\n"
    return conversation_text

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
        conversation_text = extract_thread_text(thread)
            
        model_name = (current_user.preferences or {}).get("ollama_model", settings.ollama_model)
        start_time = time.time()
        reply_text = await AIService.generate_reply(
            conversation_text=conversation_text,
            custom_instruction=request.custom_instruction,
            tone=request.tone,
            model_name=model_name
        )
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
            model_name=model_name,
            tone=request.tone,
            generation_time=generation_time,
            status="GENERATED"
        )
        db.add(ai_response)
        db.commit()
        db.refresh(ai_response)
        
        return {"response_id": ai_response.id, "generated_text": reply_text}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Generation failed: {str(e)}")


@router.post("/{email_id}/stream-reply")
async def stream_reply(
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
        conversation_text = extract_thread_text(thread)
        model_name = (current_user.preferences or {}).get("ollama_model", settings.ollama_model)

        email = db.query(Email).filter(Email.gmail_message_id == email_id).first()
        if not email:
            email = Email(user_id=current_user.id, gmail_message_id=email_id, gmail_thread_id=request.thread_id)
            db.add(email)
            db.commit()
            db.refresh(email)

        # Create response record initially
        ai_response = AIResponse(
            user_id=current_user.id,
            email_id=email.id,
            generated_text="",
            model_name=model_name,
            tone=request.tone,
            status="GENERATING"
        )
        db.add(ai_response)
        db.commit()
        db.refresh(ai_response)
        response_id = ai_response.id

        async def event_generator():
            accumulated = []
            start_t = time.time()
            # Send initial metadata chunk with response_id
            yield f"data: {json.dumps({'response_id': response_id, 'status': 'start'})}\n\n"
            
            try:
                async for token in AIService.generate_reply_stream(
                    conversation_text=conversation_text,
                    custom_instruction=request.custom_instruction,
                    tone=request.tone,
                    model_name=model_name
                ):
                    accumulated.append(token)
                    yield f"data: {json.dumps({'token': token})}\n\n"
            except Exception as ex:
                yield f"data: {json.dumps({'error': str(ex)})}\n\n"

            full_text = "".join(accumulated).strip()
            gen_time = int((time.time() - start_t) * 1000)

            # Persist finished text in background session
            try:
                from app.db.database import SessionLocal
                with SessionLocal() as db_session:
                    rec = db_session.query(AIResponse).filter(AIResponse.id == response_id).first()
                    if rec:
                        rec.generated_text = full_text
                        rec.generation_time = gen_time
                        rec.status = "GENERATED"
                        db_session.commit()
            except Exception:
                pass

            yield f"data: {json.dumps({'status': 'done', 'full_text': full_text, 'response_id': response_id})}\n\n"

        return StreamingResponse(event_generator(), media_type="text/event-stream")

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Stream failed: {str(e)}")


@router.get("/{email_id}/quick-replies")
async def get_quick_replies(
    email_id: str,
    thread_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    email = db.query(Email).filter(Email.gmail_message_id == email_id).first()
    if email and email.quick_replies:
        return {"suggestions": email.quick_replies}

    oauth_acc = db.query(OAuthAccount).filter(OAuthAccount.user_id == current_user.id, OAuthAccount.provider == "google").first()
    if not oauth_acc:
        raise HTTPException(status_code=400, detail="Google account not connected")

    try:
        thread = GmailService.get_thread(oauth_acc, thread_id)
        conversation_text = extract_thread_text(thread)
        model_name = (current_user.preferences or {}).get("ollama_model", settings.ollama_model)
        
        suggestions = await AIService.generate_quick_replies(conversation_text, model_name=model_name)
        
        if not email:
            email = Email(user_id=current_user.id, gmail_message_id=email_id, gmail_thread_id=thread_id)
            db.add(email)
        email.quick_replies = suggestions
        db.commit()

        return {"suggestions": suggestions}
    except Exception as e:
        return {"suggestions": ["Sounds good!", "Let's schedule a call.", "Could you provide more details?"]}


@router.post("/{email_id}/chat")
async def chat_with_email(
    email_id: str,
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    oauth_acc = db.query(OAuthAccount).filter(OAuthAccount.user_id == current_user.id, OAuthAccount.provider == "google").first()
    if not oauth_acc:
        raise HTTPException(status_code=400, detail="Google account not connected")

    try:
        thread = GmailService.get_thread(oauth_acc, request.thread_id)
        conversation_text = extract_thread_text(thread)
        model_name = (current_user.preferences or {}).get("ollama_model", settings.ollama_model)

        history = ChatDB.get_session(email_id, current_user.id)
        user_msg = {"role": "user", "content": request.message, "timestamp": time.time()}
        history.append(user_msg)

        async def chat_event_generator():
            accumulated = []
            try:
                async for token in AIService.chat_stream(
                    email_context=conversation_text,
                    messages=history,
                    model_name=model_name
                ):
                    accumulated.append(token)
                    yield f"data: {json.dumps({'token': token})}\n\n"
            except Exception as ex:
                yield f"data: {json.dumps({'error': str(ex)})}\n\n"

            ai_content = "".join(accumulated).strip()
            history.append({"role": "assistant", "content": ai_content, "timestamp": time.time()})
            ChatDB.save_session(email_id, current_user.id, history)

            yield f"data: {json.dumps({'status': 'done', 'content': ai_content})}\n\n"

        return StreamingResponse(chat_event_generator(), media_type="text/event-stream")

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat failed: {str(e)}")


@router.get("/{email_id}/chat-history")
async def get_chat_history(
    email_id: str,
    current_user: User = Depends(get_current_user)
):
    history = ChatDB.get_session(email_id, current_user.id)
    return {"messages": history}


@router.delete("/{email_id}/chat-history")
async def delete_chat_history(
    email_id: str,
    current_user: User = Depends(get_current_user)
):
    ChatDB.clear_session(email_id, current_user.id)
    return {"status": "cleared"}


@router.post("/batch-urgency")
async def batch_urgency(
    req: UrgencyBatchRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    results = {}
    model_name = (current_user.preferences or {}).get("ollama_model", settings.ollama_model)
    for item in req.emails[:15]:  # limit batch size
        email_id = item.get("id")
        subject = item.get("subject", "")
        snippet = item.get("snippet", "")
        if not email_id:
            continue
        
        # Check if already cached in DB
        db_email = db.query(Email).filter(Email.gmail_message_id == email_id).first()
        if db_email and db_email.urgency:
            results[email_id] = db_email.urgency
        else:
            urg = await AIService.classify_urgency(subject, snippet, model_name=model_name)
            results[email_id] = urg
            if not db_email:
                db_email = Email(user_id=current_user.id, gmail_message_id=email_id, urgency=urg)
                db.add(db_email)
            else:
                db_email.urgency = urg
            db.commit()
            
    return {"urgencies": results}
