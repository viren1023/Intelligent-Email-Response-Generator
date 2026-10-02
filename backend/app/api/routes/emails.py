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

# Gmail query per inbox tab
TAB_QUERIES = {
    "primary": "in:inbox -category:promotions -category:social -category:updates",
    "unread":   "is:unread",
    "sent":     "in:sent",
    "all":      "in:anywhere -in:spam -in:trash",
}

class SendReplyRequest(BaseModel):
    response_id: int
    edited_text: str


@router.get("/unread")
async def get_unread_emails(
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
async def get_all_emails(
    tab: str = Query(default="primary", pattern="^(primary|unread|sent|all)$"),
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
async def get_email_thread(
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
        
        # Parse thread messages
        messages = []
        for msg in thread.get('messages', []):
            headers = {h['name'].lower(): h['value'] for h in msg['payload']['headers']}
            
            # Simple body extraction
            body = ""
            if 'parts' in msg['payload']:
                for part in msg['payload']['parts']:
                    if part['mimeType'] == 'text/plain' and 'data' in part['body']:
                        import base64
                        body += base64.urlsafe_b64decode(part['body']['data']).decode()
            elif 'body' in msg['payload'] and 'data' in msg['payload']['body']:
                import base64
                body = base64.urlsafe_b64decode(msg['payload']['body']['data']).decode()
                
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
async def send_reply(
    email_id: str,
    request: SendReplyRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    oauth_acc = db.query(OAuthAccount).filter(OAuthAccount.user_id == current_user.id, OAuthAccount.provider == "google").first()
    if not oauth_acc:
        raise HTTPException(status_code=400, detail="Google account not connected")
        
    ai_response = db.query(AIResponse).filter(AIResponse.id == request.response_id, AIResponse.user_id == current_user.id).first()
    if not ai_response:
        raise HTTPException(status_code=404, detail="Response not found")
        
    email = db.query(Email).filter(Email.id == ai_response.email_id, Email.user_id == current_user.id).first()
    if not email:
        raise HTTPException(status_code=404, detail="Email not found")
        
    try:
        thread = GmailService.get_thread(oauth_acc, email.gmail_thread_id)
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
            thread_id=email.gmail_thread_id,
            message_id=message_id_header
        )
        
        GmailService.mark_as_read(oauth_acc, email.gmail_message_id)
        
        email.is_read = True
        ai_response.edited_text = request.edited_text
        ai_response.status = "SENT"
        ai_response.sent_at = datetime.datetime.utcnow()
        
        db.commit()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send reply: {str(e)}")
