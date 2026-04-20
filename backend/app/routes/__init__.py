from flask import Blueprint

bp = Blueprint("api", __name__)
main_bp = Blueprint("main", __name__)

@main_bp.route("/")
def home():
	return "Backend is alive"

from . import markets, chatbot
