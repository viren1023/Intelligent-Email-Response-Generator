from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.api.routes.auth import get_current_user
from app.models.user import User
from app.core.config import settings
from pydantic import BaseModel
from typing import Optional, Dict, Any
import httpx
import os

router = APIRouter()

class PreferencesUpdateRequest(BaseModel):
    active_provider: Optional[str] = "ollama"
    ollama_model: Optional[str] = "mistral:7b"
    gemini_model: Optional[str] = "gemini-1.5-flash"
    default_tone: Optional[str] = "professional"
    custom_tone_prompt: Optional[str] = ""

class GeminiKeyUpdateRequest(BaseModel):
    api_key: str

@router.get("/preferences")
async def get_preferences(current_user: User = Depends(get_current_user)):
    user_prefs = current_user.preferences or {}
    # Mask backend gemini key if present
    has_key = bool(settings.gemini_api_key)
    masked_key = f"••••••••••••{settings.gemini_api_key[-4:]}" if (has_key and len(settings.gemini_api_key) >= 4) else ("••••••••" if has_key else "")
    
    g_model = user_prefs.get("gemini_model", "gemini-1.5-flash")
    if not g_model or not g_model.startswith("gemini-1."):
        g_model = "gemini-1.5-flash"

    return {
        "preferences": {
            "active_provider": user_prefs.get("active_provider", settings.active_provider),
            "ollama_model": user_prefs.get("ollama_model", settings.ollama_model),
            "gemini_model": g_model,
            "default_tone": user_prefs.get("default_tone", "professional"),
            "custom_tone_prompt": user_prefs.get("custom_tone_prompt", ""),
        },
        "has_gemini_key": has_key,
        "masked_gemini_key": masked_key,
    }

@router.patch("/preferences")
async def update_preferences(
    req: PreferencesUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    current_prefs = dict(current_user.preferences or {})
    current_prefs.update({k: v for k, v in req.model_dump().items() if v is not None})
    
    current_user.preferences = current_prefs
    db.commit()
    db.refresh(current_user)
    return {"status": "success", "preferences": current_user.preferences}

@router.get("/models/ollama")
async def get_ollama_models():
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            res = await client.get(f"{settings.ollama_base_url}/api/tags")
            if res.status_code == 200:
                data = res.json()
                raw_models = data.get("models", [])
                
                filtered_models = []
                seen_digests = {}
                
                for m in raw_models:
                    name = m.get("name", "")
                    caps = m.get("capabilities", [])
                    # Skip embedding-only models
                    if "embedding" in caps and "completion" not in caps:
                        continue
                    if any(term in name.lower() for term in ["embed", "nomic", "bge", "minilm", "rerank"]):
                        continue
                    
                    digest = m.get("digest")
                    # If this digest was already seen, prefer specific tag (e.g. :7b) over :latest
                    if digest in seen_digests:
                        existing_idx = seen_digests[digest]
                        existing_name = filtered_models[existing_idx]["name"]
                        if ":latest" in existing_name and ":latest" not in name:
                            filtered_models[existing_idx] = {"name": name, "size": m.get("size", 0)}
                        continue

                    seen_digests[digest] = len(filtered_models)
                    filtered_models.append({"name": name, "size": m.get("size", 0)})

                return {"models": filtered_models}
    except Exception:
        pass
    # Fallback to current configured model
    return {"models": [{"name": settings.ollama_model, "size": 0}]}

@router.get("/models/ollama/test")
async def test_ollama_connection():
    try:
        async with httpx.AsyncClient(timeout=4) as client:
            res = await client.get(f"{settings.ollama_base_url}/api/tags")
            if res.status_code == 200:
                models = [m["name"] for m in res.json().get("models", [])]
                return {"status": "connected", "models_count": len(models)}
    except Exception as e:
        return {"status": "error", "detail": str(e)}
    return {"status": "error", "detail": "Ollama server unreachable"}

@router.get("/models/gemini")
async def get_gemini_models():
    raw = settings.gemini_models.split(",")
    models = [{"name": m.strip()} for m in raw if m.strip()]
    return {"models": models}

@router.patch("/gemini-key")
async def set_gemini_key(
    req: GeminiKeyUpdateRequest,
    current_user: User = Depends(get_current_user)
):
    key = req.api_key.strip()
    settings.gemini_api_key = key
    masked = f"••••••••••••{key[-4:]}" if len(key) >= 4 else "••••••••"
    return {"status": "saved", "masked_key": masked}
