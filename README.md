# TrustMeBro Analytics

**Betting Markets Dashboard and Chatbot** — A data-driven dashboard and AI assistant for Polymarket and Kalshi prediction markets. Built for the Lafayette College Policy Studies Department (client: Christo Maheras).

## Overview

- **Dashboard**: Live and historical views of top Polymarket events/markets, with category filters (Politics, Economy, Entertainment, etc.) and volume charts.
- **AI Chatbot**: Integrated assistant (Claude) that explains trends and possible inefficiencies. Educational only — no financial advice or bet placement.
- **Stack**: React + TypeScript (Vite) frontend, Flask backend, Polymarket Gamma API, optional Kalshi and Anthropic Claude.

## Quick Start

### Backend (Flask)

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate   # Windows
# source .venv/bin/activate  # macOS/Linux
pip install -r requirements.txt
cp .env.example .env      # Edit .env and add ANTHROPIC_API_KEY for chatbot
python run.py
```

API runs at **http://localhost:5000**. Endpoints:

- `GET /api/markets/events` — Polymarket events
- `GET /api/markets/markets` — Polymarket markets  
- `POST /api/chat` — Chatbot (body: `{ "message": "..." }`)

### Frontend (React + Vite)

```bash
cd frontend
npm install
npm run dev
```

App runs at **http://localhost:5173** and proxies `/api` to the backend.

### Environment (backend)

| Variable | Description |
|----------|-------------|
| `POLYMARKET_GAMMA_URL` | Gamma API base (default: https://gamma-api.polymarket.com) |
| `KALSHI_API_URL` | Kalshi API base |
| `KALSHI_API_KEY` | Required for Kalshi endpoints |
| `ANTHROPIC_API_KEY` | Required for chatbot |
| `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` | Optional, for future storage |

## Project Structure

```
trustmebro/
├── proposal/           # Project proposal (PDF)
├── backend/
│   ├── app/
│   │   ├── routes/     # markets, chatbot
│   │   └── __init__.py
│   ├── run.py
│   └── requirements.txt
└── frontend/
    ├── src/
    │   ├── api/        # API client
    │   ├── components/ # Dashboard, Chatbot, MarketList, TrendChart
    │   ├── App.tsx
    │   └── main.tsx
    └── package.json
```

## Goals (from proposal)

1. Website with data visualizations for top Polymarket events/markets.
2. Dashboard with prediction market trends over time.
3. AI chatbot for real-time, educational Q&A.
4. Filter by category (politics, economy, entertainment).
5. Educate users on data trends; no direct financial advice or autonomous betting.

## Non-Goals

- No sports betting data.
- Chatbot does not place bets or give direct financial advice.

## License

Internal use; Lafayette College Policy Studies Department.
