import pytest

from app import create_app
from app.routes import markets


@pytest.fixture()
def app():
    app = create_app({"TESTING": True})
    yield app


@pytest.fixture(autouse=True)
def clear_upstream_cache():
    markets._UPSTREAM_LIST_CACHE.clear()
    yield
    markets._UPSTREAM_LIST_CACHE.clear()


@pytest.fixture()
def client(app):
    return app.test_client()
