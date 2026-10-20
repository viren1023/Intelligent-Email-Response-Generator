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
        if body:
            conversation_text += f"From: {from_header}\n\n{body}\n\n{'='*40}\n\n"
    
    return conversation_text.strip()
def get_user_llm_config(current_user: User):
    prefs = current_user.preferences or {}
    provider = prefs.get("active_provider", settings.active_provider)
    gemini_key = (prefs.get("gemini_api_key") or settings.gemini_api_key or "").strip()
    if provider == "gemini":
        model_name = prefs.get("gemini_model", "gemini-2.5-flash")
        if not model_name or "gemini-1." in model_name or "gemini-2.0" in model_name:
            model_name = "gemini-2.5-flash"
    else:
        model_name = prefs.get("ollama_model", settings.ollama_model)
    return provider, model_name, gemini_key


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
            
        provider, model_name, gemini_key = get_user_llm_config(current_user)
        start_time = time.time()
        reply_text = await AIService.generate_reply(
            conversation_text=conversation_text,
            custom_instruction=request.custom_instruction,
            tone=request.tone,
            user_name=current_user.name or "User",
            user_email=current_user.email or "",
            model_name=model_name,
            provider=provider,
            api_key=gemini_key
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
        provider, model_name, gemini_key = get_user_llm_config(current_user)

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
                    user_name=current_user.name or "User",
                    user_email=current_user.email or "",
                    model_name=model_name,
                    provider=provider,
                    api_key=gemini_key
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


STATIC_FALLBACKS = {
    "Sounds good!", "Let's schedule a call.", "Could you provide more details?",
    "Could you share more details?", "Sounds good to me!", "Thanks for reaching out!",
    "I will review this and follow up shortly.", "Could you provide additional details?"
}

@router.get("/{email_id}/quick-replies")
async def get_quick_replies(
    email_id: str,
    thread_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    email = db.query(Email).filter(Email.gmail_message_id == email_id).first()
    if email and email.quick_replies:
        cached_set = set(email.quick_replies)
        if not cached_set.issubset(STATIC_FALLBACKS):
            return {"suggestions": email.quick_replies}

    oauth_acc = db.query(OAuthAccount).filter(OAuthAccount.user_id == current_user.id, OAuthAccount.provider == "google").first()
    if not oauth_acc:
        raise HTTPException(status_code=400, detail="Google account not connected")

    try:
        thread = GmailService.get_thread(oauth_acc, thread_id)
        conversation_text = extract_thread_text(thread)
        provider, model_name, gemini_key = get_user_llm_config(current_user)
        
        suggestions = await AIService.generate_quick_replies(
            conversation_text, 
            user_name=current_user.name or "User",
            model_name=model_name, 
            provider=provider,
            api_key=gemini_key
        )
        
        if not email:
            email = Email(user_id=current_user.id, gmail_message_id=email_id, gmail_thread_id=thread_id)
            db.add(email)
        email.quick_replies = suggestions
        db.commit()

        return {"suggestions": suggestions}
    except Exception as e:
        return {"suggestions": ["Thanks for reaching out!", "I will review this and follow up shortly.", "Could you provide additional details?"]}


@router.get("/{email_id}/analysis")
async def get_email_analysis(
    email_id: str,
    thread_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    oauth_acc = db.query(OAuthAccount).filter(OAuthAccount.user_id == current_user.id, OAuthAccount.provider == "google").first()
    if not oauth_acc:
        raise HTTPException(status_code=400, detail="Google account not connected")

    try:
        thread = GmailService.get_thread(oauth_acc, thread_id)
        conversation_text = extract_thread_text(thread)
        provider, model_name, gemini_key = get_user_llm_config(current_user)

        analysis = await AIService.analyze_thread(
            conversation_text,
            user_name=current_user.name or "User",
            model_name=model_name,
            provider=provider,
            api_key=gemini_key
        )
        return analysis
    except Exception:
        return {
            "summary": "Sender sent a communication in this thread.",
            "sentiment": "Action Item",
            "scenarios": [
                "Acknowledge and confirm availability",
                "Request clarification on open items",
                "Provide formal follow-up"
            ],
            "quick_chip": "Review and confirm next steps"
        }


@router.get("/{email_id}/chat-prompts")
async def get_chat_prompts(
    email_id: str,
    thread_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    oauth_acc = db.query(OAuthAccount).filter(OAuthAccount.user_id == current_user.id, OAuthAccount.provider == "google").first()
    if not oauth_acc:
        raise HTTPException(status_code=400, detail="Google account not connected")

    try:
        thread = GmailService.get_thread(oauth_acc, thread_id)
        conversation_text = extract_thread_text(thread)
        provider, model_name, gemini_key = get_user_llm_config(current_user)

        prompts = await AIService.generate_chat_prompts(
            conversation_text, 
            user_name=current_user.name or "User",
            model_name=model_name, 
            provider=provider,
            api_key=gemini_key
        )
        return {"prompts": prompts}
    except Exception:
        return {"prompts": [
            "Summarize the key action items in this email thread.",
            "What specific questions or deadlines require my attention?",
            "Draft a comprehensive response addressing all open items."
        ]}


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
        provider, model_name, gemini_key = get_user_llm_config(current_user)

        history = ChatDB.get_session(email_id, current_user.id)
        user_msg = {"role": "user", "content": request.message, "timestamp": time.time()}
        history.append(user_msg)

        async def chat_event_generator():
            accumulated = []
            try:
                async for token in AIService.chat_stream(
                    email_context=conversation_text,
                    messages=history,
                    user_name=current_user.name or "User",
                    user_email=current_user.email or "",
                    model_name=model_name,
                    provider=provider,
                    api_key=gemini_key
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
    provider, model_name, gemini_key = get_user_llm_config(current_user)
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
            urg = await AIService.classify_urgency(subject, snippet, model_name=model_name, provider=provider, api_key=gemini_key)
            results[email_id] = urg
            if not db_email:
                db_email = Email(user_id=current_user.id, gmail_message_id=email_id, urgency=urg)
                db.add(db_email)
            else:
                db_email.urgency = urg
            db.commit()
            
    return {"urgencies": results}


class ComposeDraftRequest(BaseModel):
    prompt: str
    recipient: Optional[str] = None
    subject: Optional[str] = None
    current_body: Optional[str] = None
    tone: Optional[str] = "professional"
    model_name: Optional[str] = None
    provider: Optional[str] = None
    chat_history: Optional[List[Dict[str, str]]] = None
    image_names: Optional[List[str]] = None


@router.post("/compose-draft")
async def compose_draft(
    request: ComposeDraftRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        user_provider, user_model, gemini_key = get_user_llm_config(current_user)
        provider = request.provider or user_provider
        model_name = request.model_name or user_model

        result = await AIService.generate_compose_chat(
            prompt_text=request.prompt,
            current_subject=request.subject or "",
            current_body=request.current_body or "",
            recipient=request.recipient,
            tone=request.tone,
            chat_history=request.chat_history,
            image_names=request.image_names,
            user_name=current_user.name or "User",
            user_email=current_user.email or "",
            model_name=model_name,
            provider=provider,
            api_key=gemini_key
        )
        return {
            "subject": result.get("subject", request.subject or ""),
            "draft": result.get("body", ""),
            "reply": result.get("reply", "Draft updated.")
        }
    except Exception as e:
        status_code = 400 if ("API key is not configured" in str(e) or "not found" in str(e).lower()) else 500
        raise HTTPException(status_code=status_code, detail=f"{str(e)}")

