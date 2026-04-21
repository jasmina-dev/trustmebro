"""TrustMeBro Analytics - Flask application factory."""
import os
from flask import Flask, send_from_directory
from flask_cors import CORS

def create_app(config=None):
    app = Flask(__name__, static_folder='dist', static_url_path='/static-files')
    app.config.from_mapping(
        SECRET_KEY=os.environ.get("SECRET_KEY", "dev-secret-change-in-production"),
    )
    if config:
        app.config.update(config)

    CORS(app, origins=os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(","))

    from . import routes
    app.register_blueprint(routes.main_bp)
    app.register_blueprint(routes.bp, url_prefix="/api")

    # Serve React frontend
    @app.route('/', defaults={'path': ''})
    @app.route('/<path:path>')
    def serve_react(path):
        if path.startswith('api/'):
            return {'error': 'not found'}, 404
        full_path = os.path.join(app.static_folder, path)
        if path and os.path.exists(full_path):
            return send_from_directory(app.static_folder, path)
        return send_from_directory(app.static_folder, 'index.html')

    return app