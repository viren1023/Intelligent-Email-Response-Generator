from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from app.models.user import OAuthAccount
from app.core.config import settings
from fastapi import HTTPException
from email.message import EmailMessage
import base64
import time
import concurrent.futures

# In-memory TTL cache for email list queries
_EMAIL_CACHE = {}  # key -> (timestamp, email_list, next_page_token)
CACHE_TTL_SECONDS = 45

def get_gmail_service(oauth_account: OAuthAccount):
    if not oauth_account.access_token:
        raise HTTPException(status_code=401, detail="No access token found")
    
    import datetime
    from google.auth.transport.requests import Request

    expiry = oauth_account.token_expiry
    # google-auth expects a naive UTC datetime
    if expiry and expiry.tzinfo is not None:
        expiry = expiry.replace(tzinfo=None)

    creds = Credentials(
        token=oauth_account.access_token,
        refresh_token=oauth_account.refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
        expiry=expiry,
    )

    # Auto-refresh if expired or about to expire
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        # Persist new token back to DB so the next call doesn't re-refresh
        oauth_account.access_token = creds.token
        if creds.expiry:
            oauth_account.token_expiry = creds.expiry
        # Caller must commit the session — we don't have it here;
        # the route layer commits after this call anyway via db.commit()

    return build('gmail', 'v1', credentials=creds)


class GmailService:
    @staticmethod
    def list_emails(oauth_account: OAuthAccount, query: str, page_token: str = None, max_results: int = 20):
        """Generic paginated email list with parallel fetching & caching."""
        cache_key = (oauth_account.user_id, query, page_token or "", max_results)
        now = time.time()
        
        if cache_key in _EMAIL_CACHE:
            ts, cached_list, cached_next_token = _EMAIL_CACHE[cache_key]
            if now - ts < CACHE_TTL_SECONDS:
                return cached_list, cached_next_token

        service = get_gmail_service(oauth_account)
        
        params = {"userId": "me", "q": query, "maxResults": max_results}
        if page_token:
            params["pageToken"] = page_token
            
        results = service.users().messages().list(**params).execute()
        messages = results.get('messages', [])
        next_page_token = results.get('nextPageToken')
        
        if not messages:
            _EMAIL_CACHE[cache_key] = (now, [], next_page_token)
            return [], next_page_token

        def fetch_single_msg(msg_item):
            try:
                # google-api-python-client is NOT thread-safe!
                # We MUST build a new service instance for each thread to prevent deadlocks/hangs
                thread_service = get_gmail_service(oauth_account)
                
                msg_detail = thread_service.users().messages().get(
                    userId='me', id=msg_item['id'], format='metadata',
                    metadataHeaders=['Subject', 'From', 'To', 'Date']
                ).execute()
                
                headers = {h['name'].lower(): h['value'] for h in msg_detail.get('payload', {}).get('headers', [])}
                label_ids = msg_detail.get('labelIds', [])
                
                return {
                    'id': msg_item['id'],
                    'threadId': msg_item['threadId'],
                    'snippet': msg_detail.get('snippet', ''),
                    'subject': headers.get('subject', ''),
                    'from': headers.get('from', ''),
                    'to': headers.get('to', ''),
                    'date': headers.get('date', ''),
                    'is_unread': 'UNREAD' in label_ids,
                    'is_sent': 'SENT' in label_ids,
                }
            except Exception:
                return None

        # Execute message metadata queries concurrently across 10 worker threads
        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
            email_list = list(executor.map(fetch_single_msg, messages))

        email_list = [e for e in email_list if e is not None]
        _EMAIL_CACHE[cache_key] = (now, email_list, next_page_token)
        return email_list, next_page_token

    @staticmethod
    def get_unread_count(oauth_account: OAuthAccount) -> int:
        service = get_gmail_service(oauth_account)
        try:
            res = service.users().labels().get(userId='me', id='INBOX').execute()
            return res.get('messagesUnread', 0)
        except Exception:
            return 0

    @staticmethod
    def get_unread_emails(oauth_account: OAuthAccount, max_results=20):
        emails, _ = GmailService.list_emails(
            oauth_account,
            query="is:unread -category:promotions",
            max_results=max_results
        )
        return emails

    @staticmethod
    def get_thread(oauth_account: OAuthAccount, thread_id: str):
        service = get_gmail_service(oauth_account)
        thread = service.users().threads().get(userId='me', id=thread_id).execute()
        return thread
        
    @staticmethod
    def send_reply(oauth_account: OAuthAccount, to: str, subject: str, message_text: str, thread_id: str, message_id: str):
        service = get_gmail_service(oauth_account)
        
        message = EmailMessage()
        message.set_content(message_text)
        message['To'] = to
        message['Subject'] = subject
        message['In-Reply-To'] = message_id
        message['References'] = message_id
        
        encoded_message = base64.urlsafe_b64encode(message.as_bytes()).decode()
        
        create_message = {
            'raw': encoded_message,
            'threadId': thread_id
        }
        
        send_message = service.users().messages().send(userId='me', body=create_message).execute()
        GmailService.clear_cache(oauth_account.user_id)
        return send_message

    @staticmethod
    def send_new_email(oauth_account: OAuthAccount, to: str, subject: str, message_text: str):
        service = get_gmail_service(oauth_account)
        
        message = EmailMessage()
        message.set_content(message_text)
        message['To'] = to
        message['Subject'] = subject
        
        encoded_message = base64.urlsafe_b64encode(message.as_bytes()).decode()
        create_message = {'raw': encoded_message}
        
        send_message = service.users().messages().send(userId='me', body=create_message).execute()
        GmailService.clear_cache(oauth_account.user_id)
        return send_message

    @staticmethod
    def create_draft(oauth_account: OAuthAccount, to: str, subject: str, message_text: str):
        service = get_gmail_service(oauth_account)
        message = EmailMessage()
        message.set_content(message_text)
        if to:
            message['To'] = to
        message['Subject'] = subject or ""
        encoded_message = base64.urlsafe_b64encode(message.as_bytes()).decode()
        create_draft_body = {'message': {'raw': encoded_message}}
        draft = service.users().drafts().create(userId='me', body=create_draft_body).execute()
        GmailService.clear_cache(oauth_account.user_id)
        return draft
        
    @staticmethod
    def mark_as_read(oauth_account: OAuthAccount, msg_id: str):
        service = get_gmail_service(oauth_account)
        service.users().messages().modify(
            userId='me', 
            id=msg_id, 
            body={'removeLabelIds': ['UNREAD']}
        ).execute()
        GmailService.clear_cache(oauth_account.user_id)

    @staticmethod
    def mark_as_unread(oauth_account: OAuthAccount, msg_id: str):
        service = get_gmail_service(oauth_account)
        service.users().messages().modify(
            userId='me', 
            id=msg_id, 
            body={'addLabelIds': ['UNREAD']}
        ).execute()
        GmailService.clear_cache(oauth_account.user_id)

    @staticmethod
    def trash_message(oauth_account: OAuthAccount, msg_id: str):
        service = get_gmail_service(oauth_account)
        service.users().messages().trash(
            userId='me',
            id=msg_id
        ).execute()
        GmailService.clear_cache(oauth_account.user_id)

    @staticmethod
    def clear_cache(user_id: int):
        keys_to_del = [k for k in _EMAIL_CACHE if k[0] == user_id]
        for k in keys_to_del:
            _EMAIL_CACHE.pop(k, None)
