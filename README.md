# Intelligent Email Response Generator

A full-stack web application that allows users to securely log in using their Google account, view unread emails from Gmail, and generate AI-powered replies using a locally running Ollama LLM.

## Project Architecture

- **Frontend**: React, Vite, TypeScript, Tailwind CSS
- **Backend**: Python, FastAPI, Uvicorn, SQLAlchemy, Alembic
- **Database**: PostgreSQL
- **AI Integration**: Ollama (Running locally)
- **Authentication**: Google OAuth 2.0 (Authlib)

## Prerequisites

1. Python 3.10+
2. Node.js 18+
3. Docker & Docker Compose (for PostgreSQL)
4. [Ollama](https://ollama.com/) installed locally.

## Gmail API Setup

Before running the application, you need to configure a Google Cloud project to use the Gmail API and OAuth.

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project.
3. Navigate to **APIs & Services > Library** and enable the **Gmail API**.
4. Navigate to **APIs & Services > OAuth consent screen**.
   - Choose User Type (External or Internal).
   - Fill in the required app details.
   - Add the following scopes:
     - `.../auth/userinfo.email`
     - `.../auth/userinfo.profile`
     - `.../auth/gmail.readonly`
     - `.../auth/gmail.modify`
     - `.../auth/gmail.send`
5. Navigate to **APIs & Services > Credentials**.
   - Click **Create Credentials > OAuth client ID**.
   - Application type: Web application.
   - Authorized redirect URIs: `http://localhost:8000/auth/google/callback`
6. Copy the **Client ID** and **Client Secret**.

## Local Setup Instructions

### 1. Database Setup

Ensure Docker is running, then start the PostgreSQL database:
```bash
docker compose up -d
```

### 2. Backend Setup

```bash
cd backend
python -m venv venv

# Windows
.\venv\Scripts\Activate.ps1
# Linux/Mac
source venv/bin/activate

pip install -r requirements.txt
```

Create a `.env` file in the `backend/` directory (you can copy `.env.example`):
```env
APP_ENV=development
APP_SECRET_KEY=some_secure_random_string

DATABASE_URL=postgresql://postgres:postgres@localhost:5432/email_ai

GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here
GOOGLE_REDIRECT_URI=http://localhost:8000/auth/google/callback

FRONTEND_URL=http://localhost:5173

OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2
OLLAMA_TIMEOUT=120
```

Run database migrations:
```bash
alembic upgrade head
```

Start the FastAPI server:
```bash
uvicorn app.main:app --reload --port 8000
```

### 3. Frontend Setup

```bash
cd frontend
npm install
```

Create a `.env` file in the `frontend/` directory (you can copy `.env.example`):
```env
VITE_API_BASE_URL=http://localhost:8000
```

Start the React development server:
```bash
npm run dev
```

### 4. Ollama Setup

Ensure Ollama is running and pull the configured model:
```bash
ollama pull llama3.2
```

## Usage
- Open `http://localhost:5173` in your browser.
- Log in with Google and grant the requested permissions.
- You will see your unread inbox.
- Click on any email to view the conversation.
- Click **✨ AI Reply** to generate a contextual response using Ollama.
- Edit the response if needed, then click **Send Reply**.
