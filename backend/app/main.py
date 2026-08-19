from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
from app.api.routes import auth, emails, ai, responses
from app.core.config import settings

app = FastAPI(title="Intelligent Email Assistant API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(SessionMiddleware, secret_key=settings.app_secret_key)

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(emails.router, prefix="/api/emails", tags=["emails"])
app.include_router(ai.router, prefix="/api/emails", tags=["ai"])
app.include_router(responses.router, prefix="/api/responses", tags=["responses"])

@app.get("/")
def read_root():
    return {"status": "ok"}
