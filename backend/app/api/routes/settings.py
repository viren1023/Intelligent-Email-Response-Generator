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
    gemini_model: Optional[str] = "gemini-2.5-flash"
    default_tone: Optional[str] = "professional"
    custom_tone_prompt: Optional[str] = ""

class GeminiKeyUpdateRequest(BaseModel):
    api_key: str

class GeminiTestRequest(BaseModel):
    api_key: Optional[str] = None

@router.get("/preferences")
async def get_preferences(current_user: User = Depends(get_current_user)):
    user_prefs = current_user.preferences or {}
    gemini_key = (user_prefs.get("gemini_api_key") or settings.gemini_api_key or "").strip()
    has_key = bool(gemini_key)
    masked_key = f"••••••••••••{gemini_key[-4:]}" if (has_key and len(gemini_key) >= 4) else ("••••••••" if has_key else "")
    
    g_model = user_prefs.get("gemini_model", "gemini-2.5-flash")
    if not g_model or "gemini-1." in g_model or "gemini-2.0" in g_model:
        g_model = "gemini-2.5-flash"

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
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    key = req.api_key.strip()
    if not key:
        raise HTTPException(status_code=400, detail="API key cannot be empty")

    current_prefs = dict(current_user.preferences or {})
    current_prefs["gemini_api_key"] = key
    current_user.preferences = current_prefs
    db.commit()
    db.refresh(current_user)

    settings.gemini_api_key = key
    masked = f"••••••••••••{key[-4:]}" if len(key) >= 4 else "••••••••"
    return {"status": "saved", "masked_key": masked}

@router.delete("/gemini-key")
async def delete_gemini_key(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    current_prefs = dict(current_user.preferences or {})
    if "gemini_api_key" in current_prefs:
        del current_prefs["gemini_api_key"]
    if current_prefs.get("active_provider") == "gemini":
        current_prefs["active_provider"] = "ollama"
    current_user.preferences = current_prefs
    db.commit()
    db.refresh(current_user)

    settings.gemini_api_key = ""
    return {"status": "deleted"}

@router.post("/gemini-key/test")
async def test_gemini_key(
    req: Optional[GeminiTestRequest] = None,
    current_user: User = Depends(get_current_user)
):
    key = ""
    if req and req.api_key and req.api_key.strip():
        key = req.api_key.strip()
    else:
        user_prefs = current_user.preferences or {}
        key = (user_prefs.get("gemini_api_key") or settings.gemini_api_key or "").strip()

    if not key:
        raise HTTPException(status_code=400, detail="No Gemini API key configured to test.")

    url = f"https://generativelanguage.googleapis.com/v1beta/models?key={key}"
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            res = await client.get(url)
            if res.status_code == 200:
                data = res.json()
                models = [m.get("name") for m in data.get("models", []) if "generateContent" in m.get("supportedGenerationMethods", [])]
                return {"status": "valid", "models_count": len(models)}
            elif res.status_code in (400, 403):
                return {"status": "error", "detail": "Invalid API key or unauthorized permissions."}
            elif res.status_code == 429:
                return {"status": "error", "detail": "API key usage / quota limit reached."}
            return {"status": "error", "detail": f"Gemini returned HTTP {res.status_code}"}
    except Exception as e:
        return {"status": "error", "detail": f"Connection error: {str(e)}"}
