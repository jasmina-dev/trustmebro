"""Run the TrustMeBro Analytics Flask API."""
import os
from pathlib import Path

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover - optional local dependency
    load_dotenv = None

# Load backend/.env regardless of current working directory (IDE, tests, etc.)
_backend_dir = Path(__file__).resolve().parent
if load_dotenv is not None:
    load_dotenv(_backend_dir / ".env")

from app import create_app

app = create_app()

if __name__ == "__main__":
    port_value = os.environ.get("API_PORT") or os.environ.get("PORT") or "5001"
    try:
        port = int(port_value)
    except (TypeError, ValueError):
        port = 5001
    app.run(host="0.0.0.0", port=port, debug=os.environ.get("FLASK_ENV") == "development")
