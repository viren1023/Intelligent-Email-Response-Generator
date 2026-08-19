from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from app.models.user import OAuthAccount
from app.core.config import settings
from fastapi import HTTPException
from email.message import EmailMessage
import base64

def get_gmail_service(oauth_account: OAuthAccount):
    if not oauth_account.access_token:
        raise HTTPException(status_code=401, detail="No access token found")
    
    creds = Credentials(
        token=oauth_account.access_token,
        refresh_token=oauth_account.refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret
    )
    
    return build('gmail', 'v1', credentials=creds)

class GmailService:
    @staticmethod
    def get_unread_emails(oauth_account: OAuthAccount, max_results=20):
        service = get_gmail_service(oauth_account)
        results = service.users().messages().list(userId='me', q="is:unread -category:promotions", maxResults=max_results).execute()
        messages = results.get('messages', [])
        
        email_list = []
        for msg in messages:
            msg_detail = service.users().messages().get(userId='me', id=msg['id'], format='metadata', metadataHeaders=['Subject', 'From', 'Date']).execute()
            
            headers = {h['name'].lower(): h['value'] for h in msg_detail['payload']['headers']}
            
            email_list.append({
                'id': msg['id'],
                'threadId': msg['threadId'],
                'snippet': msg_detail.get('snippet', ''),
                'subject': headers.get('subject', ''),
                'from': headers.get('from', ''),
                'date': headers.get('date', '')
            })
            
        return email_list

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
        return send_message
        
    @staticmethod
    def mark_as_read(oauth_account: OAuthAccount, msg_id: str):
        service = get_gmail_service(oauth_account)
        service.users().messages().modify(
            userId='me', 
            id=msg_id, 
            body={'removeLabelIds': ['UNREAD']}
        ).execute()
