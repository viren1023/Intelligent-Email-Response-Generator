from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    app_env: str = "development"
    app_secret_key: str = "change_me"

    database_url: str = "postgresql://postgres:root%40123@localhost:5432/email_ai"

    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8000/auth/google/callback"

    frontend_url: str = "http://localhost:5173"

    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.2"
    ollama_timeout: int = 120

    gemini_api_key: str = ""
    gemini_models: str = "gemini-1.5-flash,gemini-1.5-pro,gemini-2.0-flash,gemini-2.0-flash-lite"
    active_provider: str = "ollama"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

settings = Settings()

