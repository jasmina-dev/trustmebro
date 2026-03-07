"""Run the TrustMeBro Analytics Flask API."""
import os
from dotenv import load_dotenv  # type: ignore[import]

load_dotenv()

from app import create_app

app = create_app()

if __name__ == "__main__":
    raw_port = os.environ.get("PORT") or os.environ.get("API_PORT") or "5000"
    port = int(raw_port)
    app.run(host="0.0.0.0", port=port, debug=os.environ.get("FLASK_ENV") == "development")
