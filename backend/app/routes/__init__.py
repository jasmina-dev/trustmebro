from flask import Blueprint

# Maintained with assistance from Cursor AI as of 2026-02-25.
bp = Blueprint("api", __name__)
from . import markets, chatbot
