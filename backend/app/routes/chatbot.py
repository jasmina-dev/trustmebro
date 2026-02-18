"""AI chatbot route - Claude-based, data-aware responses."""
import os
import json
from flask import current_app, jsonify, request

from . import bp

# Guardrails: decline financial advice, betting placement, out-of-scope
SYSTEM_PROMPT = """You are TrustMeBro Analytics' assistant. You help users understand prediction market data (e.g., Polymarket, Kalshi), trends, and possible inefficiencies. You are educational only.

Rules:
- Do NOT give direct financial advice or tell users to place specific bets.
- Do NOT offer to place bets or execute trades.
- Do NOT guarantee outcomes or returns.
- You MAY explain data, trends, large bets, cross-market consistency, and point to possible inefficiencies for research.
- If the user asks for financial advice, betting recommendations, or anything outside education and data explanation, politely decline and redirect to general education.
- Keep responses concise and cite that insights are for research/education only."""


def _get_claude_client():
    try:
        import anthropic
        return anthropic.Anthropic()
    except ImportError:
        return None


@bp.route("/chat", methods=["POST"])
def chat():
    """Send a message to the AI chatbot. Body: { "message": "user text" }. Optional: "context" with market summary."""
    data = request.get_json() or {}
    message = (data.get("message") or "").strip()
    if not message:
        return jsonify({"error": "message is required"}), 400

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return jsonify({"error": "Chatbot not configured (missing ANTHROPIC_API_KEY)"}), 503

    client = _get_claude_client()
    if not client:
        return jsonify({"error": "Chatbot dependency not available"}), 503

    context = data.get("context") or ""
    user_content = message
    if context:
        user_content = f"[Current dashboard context]\n{context}\n\n[User question]\n{message}"

    try:
        response = client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=1024,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_content}],
        )
        text = ""
        for block in response.content:
            if hasattr(block, "text"):
                text += block.text
        return jsonify({"reply": text.strip()})
    except Exception as e:
        current_app.logger.exception("Chatbot error: %s", e)
        return jsonify({"error": "Chatbot request failed", "reply": ""}), 502
