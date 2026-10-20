from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.api.routes.auth import get_current_user
from app.models.user import User, OAuthAccount
from app.models.email import Email, AIResponse
from app.services.gmail_service import GmailService, get_gmail_service
from pydantic import BaseModel
from typing import Optional
import datetime

router = APIRouter()

def clean_email_content(raw_text: str) -> str:
    if not raw_text:
        return ""
    import re
    # 1. Remove Outlook MSO blocks (e.g. <!--[if mso]>...<![endif]-->)
    text = re.sub(r'<!--\[if\s+(?:gte\s+)?mso[\s\S]*?<!\[endif\]-->', '', raw_text, flags=re.IGNORECASE)
    # 2. Strip standalone conditional comments
    text = re.sub(r'<!--\[if[^>]*-->', '', text, flags=re.IGNORECASE)
    text = re.sub(r'<!--\[if[^\]]*\]>', '', text, flags=re.IGNORECASE)
    text = re.sub(r'<!--<!\[endif\]-->', '', text, flags=re.IGNORECASE)
    text = re.sub(r'<!\[endif\]-->', '', text, flags=re.IGNORECASE)
    # 3. Strip standard HTML comments
    text = re.sub(r'<!--[\s\S]*?-->', '', text)
    # 4. Strip VML and Office XML tags
    text = re.sub(r'<\/?(?:v|w|o|m|x):[^>]*>', '', text, flags=re.IGNORECASE)
    text = re.sub(r'<\?xml[^>]*\?>', '', text, flags=re.IGNORECASE)
    # 5. Clean mangled link artifacts
    text = re.sub(r'<\[([\s\S]*?)\]\((https?:\/\/[^\s)]+)\)>', r'<\2>', text)
    return text.strip()


# Gmail query per inbox tab
TAB_QUERIES = {
    "primary": "in:inbox -category:promotions -category:social -category:updates",
    "unread":   "is:unread",
    "sent":     "in:sent",
    "drafts":   "in:draft",
    "all":      "in:anywhere -in:spam -in:trash",
}

class SendReplyRequest(BaseModel):
    response_id: Optional[int] = None
    edited_text: str
    thread_id: Optional[str] = None


@router.get("/unread-count")
def get_unread_count(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    oauth_acc = db.query(OAuthAccount).filter(OAuthAccount.user_id == current_user.id, OAuthAccount.provider == "google").first()
    if not oauth_acc:
        return {"count": 0}
    try:
        count = GmailService.get_unread_count(oauth_acc)
        return {"count": count}
    except Exception:
        return {"count": 0}



@router.get("/unread")
def get_unread_emails(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    oauth_acc = db.query(OAuthAccount).filter(OAuthAccount.user_id == current_user.id, OAuthAccount.provider == "google").first()
    if not oauth_acc:
        raise HTTPException(status_code=400, detail="Google account not connected")
        
    try:
        emails = GmailService.get_unread_emails(oauth_acc)
        return {"emails": emails}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch emails: {str(e)}")

@router.get("/all")
def get_all_emails(
    tab: str = Query(default="primary", pattern="^(primary|unread|sent|all|drafts)$"),
    page_token: Optional[str] = Query(default=None),
    max_results: int = Query(default=20, ge=1, le=50),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Paginated full inbox — supports primary/unread/sent/all tabs."""
    oauth_acc = db.query(OAuthAccount).filter(
        OAuthAccount.user_id == current_user.id,
        OAuthAccount.provider == "google"
    ).first()
    if not oauth_acc:
        raise HTTPException(status_code=400, detail="Google account not connected")

    query = TAB_QUERIES.get(tab, TAB_QUERIES["primary"])

    try:
        emails, next_page_token = GmailService.list_emails(
            oauth_acc, query=query, page_token=page_token, max_results=max_results
        )
        db.commit()  # persist any refreshed token

        # Annotate with AI-replied badge from local DB
        sent_gmail_ids = {
            row.gmail_message_id
            for row in db.query(Email).filter(Email.user_id == current_user.id).all()
            if any(r.status == "SENT" for r in row.ai_responses)
        }
        for email in emails:
            email["ai_replied"] = email["id"] in sent_gmail_ids

        return {
            "emails": emails,
            "next_page_token": next_page_token,
            "tab": tab,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch emails: {str(e)}")


@router.get("/{email_id}/thread")
def get_email_thread(
    email_id: str,
    thread_id: Optional[str] = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    oauth_acc = db.query(OAuthAccount).filter(OAuthAccount.user_id == current_user.id, OAuthAccount.provider == "google").first()
    if not oauth_acc:
        raise HTTPException(status_code=400, detail="Google account not connected")
        
    target_thread_id = thread_id or email_id
    try:
        thread = GmailService.get_thread(oauth_acc, target_thread_id)
        
        # Parse thread messages
        messages = []
        for msg in thread.get('messages', []):
            headers = {h['name'].lower(): h['value'] for h in msg['payload']['headers']}
            
            # Recursive robust body extraction (handles text/plain, nested multipart, and fallback to text/html)
            def extract_body(payload_node: dict) -> str:
                import base64
                text_plain = ""
                text_html = ""

                def walk(parts):
                    nonlocal text_plain, text_html
                    for p in parts:
                        mime = p.get('mimeType', '')
                        data = p.get('body', {}).get('data')
                        if mime == 'text/plain' and data and not text_plain:
                            try:
                                text_plain = base64.urlsafe_b64decode(data).decode('utf-8', errors='replace')
                            except Exception:
                                pass
                        elif mime == 'text/html' and data and not text_html:
                            try:
                                text_html = base64.urlsafe_b64decode(data).decode('utf-8', errors='replace')
                            except Exception:
                                pass
                        if 'parts' in p:
                            walk(p['parts'])

                if 'parts' in payload_node:
                    walk(payload_node['parts'])
                elif 'body' in payload_node and payload_node['body'].get('data'):
                    try:
                        decoded = base64.urlsafe_b64decode(payload_node['body']['data']).decode('utf-8', errors='replace')
                        if payload_node.get('mimeType') == 'text/html':
                            text_html = decoded
                        else:
                            text_plain = decoded
                    except Exception:
                        pass
                return text_plain or text_html

            body = clean_email_content(extract_body(msg['payload']))
                
            messages.append({
                'id': msg['id'],
                'from': headers.get('from', ''),
                'to': headers.get('to', ''),
                'date': headers.get('date', ''),
                'subject': headers.get('subject', ''),
                'body': body
            })
            
        return {"thread_id": thread_id, "messages": messages}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch thread: {str(e)}")

@router.post("/{email_id}/reply")
def send_reply(
    email_id: str,
    request: SendReplyRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    oauth_acc = db.query(OAuthAccount).filter(OAuthAccount.user_id == current_user.id, OAuthAccount.provider == "google").first()
    if not oauth_acc:
        raise HTTPException(status_code=400, detail="Google account not connected")
        
    email = db.query(Email).filter(Email.gmail_message_id == email_id, Email.user_id == current_user.id).first()
    if not email:
        email = Email(user_id=current_user.id, gmail_message_id=email_id, gmail_thread_id=request.thread_id or email_id)
        db.add(email)
        db.commit()
        db.refresh(email)

    ai_response = None
    if request.response_id:
        ai_response = db.query(AIResponse).filter(AIResponse.id == request.response_id, AIResponse.user_id == current_user.id).first()
    
    if not ai_response:
        ai_response = AIResponse(
            user_id=current_user.id,
            email_id=email.id,
            generated_text=request.edited_text,
            status="GENERATED"
        )
        db.add(ai_response)
        db.commit()
        db.refresh(ai_response)
        
    try:
        thread_id = email.gmail_thread_id or request.thread_id or email_id
        thread = GmailService.get_thread(oauth_acc, thread_id)
        latest_msg_id = thread['messages'][-1]['id']
        
        service = get_gmail_service(oauth_acc)
        msg_detail = service.users().messages().get(userId='me', id=latest_msg_id, format='metadata', metadataHeaders=['Message-ID', 'Subject', 'From']).execute()
        headers = {h['name'].lower(): h['value'] for h in msg_detail['payload']['headers']}
        
        message_id_header = headers.get('message-id', '')
        subject = headers.get('subject', 'Re: ')
        if not subject.lower().startswith('re:'):
            subject = 'Re: ' + subject
            
        # Reply to whoever sent the last message
        to = headers.get('from', '')
            
        GmailService.send_reply(
            oauth_acc,
            to=to,
            subject=subject,
            message_text=request.edited_text,
            thread_id=thread_id,
            message_id=message_id_header
        )
        
        GmailService.mark_as_read(oauth_acc, email.gmail_message_id)
        GmailService.clear_cache(current_user.id)
        
        email.is_read = True
        ai_response.edited_text = request.edited_text
        ai_response.status = "SENT"
        ai_response.sent_at = datetime.datetime.utcnow()
        
        db.commit()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send reply: {str(e)}")


class ComposeEmailRequest(BaseModel):
    to: str
    subject: str
    body: str


@router.post("/compose")
def compose_email(
    request: ComposeEmailRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    oauth_acc = db.query(OAuthAccount).filter(OAuthAccount.user_id == current_user.id, OAuthAccount.provider == "google").first()
    if not oauth_acc:
        raise HTTPException(status_code=400, detail="Google account not connected")

    if not request.to.strip() or not request.subject.strip() or not request.body.strip():
        raise HTTPException(status_code=400, detail="Recipient, subject, and body are required")

    try:
        sent_msg = GmailService.send_new_email(
            oauth_acc,
            to=request.to.strip(),
            subject=request.subject.strip(),
            message_text=request.body.strip()
        )
        GmailService.clear_cache(current_user.id)
        return {"status": "success", "id": sent_msg.get("id")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send email: {str(e)}")


class SaveDraftRequest(BaseModel):
    to: Optional[str] = ""
    subject: Optional[str] = ""
    body: str


@router.post("/draft")
def save_google_draft(
    request: SaveDraftRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    oauth_acc = db.query(OAuthAccount).filter(OAuthAccount.user_id == current_user.id, OAuthAccount.provider == "google").first()
    if not oauth_acc:
        raise HTTPException(status_code=400, detail="Google account not connected")

    if not request.body.strip() and not (request.subject and request.subject.strip()):
        raise HTTPException(status_code=400, detail="Cannot save an empty draft")

    try:
        draft_obj = GmailService.create_draft(
            oauth_acc,
            to=request.to.strip() if request.to else "",
            subject=request.subject.strip() if request.subject else "Untitled Draft",
            message_text=request.body.strip() if request.body else ""
        )
        GmailService.clear_cache(current_user.id)
        return {"status": "success", "id": draft_obj.get("id")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save draft to Google: {str(e)}")


@router.post("/{email_id}/mark-read")
def mark_email_read(
    email_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    oauth_acc = db.query(OAuthAccount).filter(OAuthAccount.user_id == current_user.id, OAuthAccount.provider == "google").first()
    if not oauth_acc:
        raise HTTPException(status_code=400, detail="Google account not connected")
    try:
        GmailService.mark_as_read(oauth_acc, email_id)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to mark as read: {str(e)}")


@router.post("/{email_id}/mark-unread")
def mark_email_unread(
    email_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    oauth_acc = db.query(OAuthAccount).filter(OAuthAccount.user_id == current_user.id, OAuthAccount.provider == "google").first()
    if not oauth_acc:
        raise HTTPException(status_code=400, detail="Google account not connected")
    try:
        GmailService.mark_as_unread(oauth_acc, email_id)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to mark as unread: {str(e)}")


@router.delete("/{email_id}")
def delete_email(
    email_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    oauth_acc = db.query(OAuthAccount).filter(OAuthAccount.user_id == current_user.id, OAuthAccount.provider == "google").first()
    if not oauth_acc:
        raise HTTPException(status_code=400, detail="Google account not connected")
    try:
        GmailService.trash_message(oauth_acc, email_id)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete email: {str(e)}")


