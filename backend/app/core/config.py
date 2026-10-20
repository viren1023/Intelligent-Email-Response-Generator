from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field

class Settings(BaseSettings):
    app_env: str = Field(default="development", env="APP_ENV")
    app_secret_key: str = Field(default="change_me", env="APP_SECRET_KEY")

    database_url: str = Field(default="postgresql://postgres:root%40123@localhost:5432/email_ai", env="DATABASE_URL")

    google_client_id: str = Field(..., env="GOOGLE_CLIENT_ID")
    google_client_secret: str = Field(..., env="GOOGLE_CLIENT_SECRET")
    google_redirect_uri: str = Field(default="http://localhost:8000/auth/google/callback", env="GOOGLE_REDIRECT_URI")

    frontend_url: str = Field(default="http://localhost:5173", env="FRONTEND_URL")

    ollama_base_url: str = Field(default="http://localhost:11434", env="OLLAMA_BASE_URL")
    ollama_model: str = Field(default="mistral:7b", env="OLLAMA_MODEL")
    ollama_timeout: int = Field(default=120, env="OLLAMA_TIMEOUT")

    gemini_api_key: str = Field(default="", env="GEMINI_API_KEY")
    gemini_models: str = Field(default="gemini-1.5-flash,gemini-1.5-pro,gemini-2.0-flash,gemini-2.0-flash-lite", env="GEMINI_MODELS")
    active_provider: str = Field(default="ollama", env="ACTIVE_PROVIDER")

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

settings = Settings()

