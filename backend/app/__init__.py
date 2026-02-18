"""TrustMeBro Analytics - Flask application factory."""
import os
from flask import Flask
from flask_cors import CORS


def create_app(config=None):
    app = Flask(__name__)
    app.config.from_mapping(
        SECRET_KEY=os.environ.get("SECRET_KEY", "dev-secret-change-in-production"),
    )
    if config:
        app.config.update(config)
    CORS(app, origins=os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(","))
    from . import routes
    app.register_blueprint(routes.bp, url_prefix="/api")
    return app
