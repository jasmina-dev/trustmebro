from flask import Blueprint

bp = Blueprint("api", __name__)
main_bp = Blueprint("main", __name__)

from . import markets, chatbot