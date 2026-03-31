"""AI chatbot route - Claude-based, data-aware responses."""
import os

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

MAX_HISTORY_TURNS = 10


def _get_claude_client():
    try:
        import anthropic

        return anthropic.Anthropic()
    except ImportError:
        return None


@bp.route("/chat", methods=["POST"])
def chat():
    """Send a message to the AI chatbot.

    Body:
    {
      "message": "user text",
      "context": "optional dashboard summary",
      "history": [
        {"role": "user", "content": "..."},
        {"role": "assistant", "content": "..."}
      ]
    }
    """
    data = request.get_json() or {}
    message = (data.get("message") or "").strip()
    if not message:
        return jsonify({"error": "message is required"}), 400

    raw_history = data.get("history") or []
    if not isinstance(raw_history, list):
        return jsonify({"error": "history must be an array"}), 400

    context = data.get("context") or ""
    user_content = message
    if context:
        user_content = f"[Current dashboard context]\n{context}\n\n[User question]\n{message}"

    messages = []
    history_offset = max(len(raw_history) - MAX_HISTORY_TURNS, 0)
    for index, turn in enumerate(raw_history[-MAX_HISTORY_TURNS:]):
        real_index = history_offset + index
        if not isinstance(turn, dict):
            return jsonify({"error": f"history[{real_index}] must be an object"}), 400

        role = turn.get("role")
        content = (turn.get("content") or "").strip()
        if role not in {"user", "assistant"}:
            return jsonify(
                {"error": f"history[{real_index}].role must be 'user' or 'assistant'"}
            ), 400
        if not content:
            return jsonify({"error": f"history[{real_index}].content is required"}), 400

        messages.append({"role": role, "content": content})

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return jsonify({"error": "Chatbot not configured (missing ANTHROPIC_API_KEY)"}), 503

    client = _get_claude_client()
    if not client:
        return jsonify({"error": "Chatbot dependency not available"}), 503

    messages.append({"role": "user", "content": user_content})

    try:
        model = os.environ.get("ANTHROPIC_CHAT_MODEL", "claude-sonnet-4-6")
        response = client.messages.create(
            model=model,
            max_tokens=1024,
            system=SYSTEM_PROMPT,
            messages=messages,
        )
        text = ""
        for block in response.content:
            if hasattr(block, "text"):
                text += block.text
        return jsonify({"reply": text.strip()})
    except Exception as e:
        current_app.logger.exception("Chatbot error: %s", e)
        return jsonify({"error": "Chatbot request failed", "reply": ""}), 502
