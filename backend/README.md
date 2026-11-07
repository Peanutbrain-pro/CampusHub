# CampusHub Backend (FastAPI)

FastAPI service powering AI operations and technical features for CampusHub.

---

## 1. Directory Structure

```text
backend/
├── core/                       # Server runtime configuration
│   ├── config.py               # Settings & environment variables
│   ├── rate_limit.py           # In-memory sliding window rate limiter
│   └── security.py             # JWT bearer auth & Supabase token validation
├── features/                   # 1:1 Matching Feature Modules
│   └── subjects_ai/            # router.py, schemas.py, service.py
├── scripts/                    # Maintenance & utility scripts
│   └── generate_quiz_questions.py # AI generation script for daily quiz questions
├── shared/                     # Health check endpoint
│   └── health.py
├── main.py                     # Registers routers under /api/v1/...
└── requirements.txt
```

---

## 2. Feature Workspaces & Data Flow

| Feature Module | Serves Frontend | Data & API Flow |
| :--- | :--- | :--- |
| **`features/subjects_ai/`** | `features/subject-ai-panel/` | **FastAPI** (`/api/v1/subjects-ai/*`) |
| **Daily Quiz Engine** | `features/daily-quiz/` | **Supabase RPCs** (`get_today_quiz`, `submit_daily_quiz`, `user_streaks`) |

---

## 3. Environment Configuration (`.env`)

Create `.env` by copying `.env.example`:

```bash
cp .env.example .env
```

| Variable | Description | Default |
| :--- | :--- | :--- |
| `SUPABASE_URL` | Supabase project URL | `https://your-project.supabase.co` |
| `SUPABASE_ANON_KEY` | Supabase anon key for client requests | `placeholder-anon-key` |
| `ALLOW_MOCK_TOKENS` | Enable mock authentication tokens for offline testing | `false` |
| `GEMINI_API_KEY` | Google Gemini API key (from [AI Studio](https://aistudio.google.com)) | `""` |
| `GEMINI_MODEL` | Gemini model for generation | `gemini-3.8-flash` |
| `ALLOWED_ORIGINS` | Permitted frontend origins for CORS | `["http://localhost:5173"]` |

---

## 4. Local Development

```bash
cd backend
python -m venv .venv

# Windows (PowerShell):
.venv\Scripts\Activate.ps1
# Linux/macOS:
source .venv/bin/activate

pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Health check:
```bash
curl http://localhost:8000/api/v1/health
# {"status":"ok","version":"0.1.0"}
```

---

## 5. Scripts

### Daily Quiz Question Generator
To generate and stage AI-generated questions into the Supabase question pool:
```bash
python scripts/generate_quiz_questions.py --count 10
```
*(Requires `GEMINI_API_KEY`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` in `.env`)*
