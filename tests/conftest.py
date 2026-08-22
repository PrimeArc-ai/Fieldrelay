import json
import os

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("SUPPORTED_ZIPS", "560001,560002,560003,560004")

import pytest
from fastapi.testclient import TestClient

from app.db import Base, engine, init_db
from app.main import app
from app.services.service_area import service_area_service


@pytest.fixture(autouse=True)
def reset_state():
    Base.metadata.drop_all(bind=engine)
    init_db()
    service_area_service.reset()
    yield
    service_area_service.reset()


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client
