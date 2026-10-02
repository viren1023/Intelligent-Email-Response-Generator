from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.database import Base

class Email(Base):
    __tablename__ = "emails"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    gmail_message_id = Column(String, unique=True, index=True)
    gmail_thread_id = Column(String, index=True)
    sender_email = Column(String)
    sender_name = Column(String)
    subject = Column(String)
    snippet = Column(String)
    received_at = Column(DateTime(timezone=True), index=True)
    is_read = Column(Boolean, default=False, index=True)
    urgency = Column(String, nullable=True)          # URGENT | IMPORTANT | NORMAL
    quick_replies = Column(JSONB, nullable=True)     # cached ["...", "...", "..."]
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    user = relationship("User", back_populates="emails")
    ai_responses = relationship("AIResponse", back_populates="email")

class AIResponse(Base):
    __tablename__ = "ai_responses"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    email_id = Column(Integer, ForeignKey("emails.id", ondelete="CASCADE"))
    generated_text = Column(Text)
    edited_text = Column(Text, nullable=True)
    model_name = Column(String)
    tone = Column(String, nullable=True)             # professional | friendly | concise | formal | custom
    generation_metadata = Column(JSONB, nullable=True)
    generation_time = Column(Integer, nullable=True)
    status = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    sent_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="ai_responses")
    email = relationship("Email", back_populates="ai_responses")

