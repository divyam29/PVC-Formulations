import os
from functools import lru_cache
from pathlib import Path
from urllib.parse import quote_plus

from pymongo import MongoClient
from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


def build_mongodb_uri() -> str:
    direct_uri = os.getenv("MONGODB_URI", "").strip()
    if direct_uri:
        return direct_uri

    username = os.getenv("MONGODB_USERNAME", "").strip()
    password = os.getenv("MONGODB_PASSWORD", "").strip()
    host = os.getenv("MONGODB_HOST", "").strip()
    params = os.getenv("MONGODB_PARAMS", "").strip()

    if not host:
        return "mongodb://localhost:27017"

    credentials = ""
    if username or password:
        credentials = f"{quote_plus(username)}:{quote_plus(password)}@"

    scheme = "mongodb+srv" if not host.startswith("mongodb") else ""
    prefix = f"{scheme}://" if scheme else ""
    suffix = f"/?{params}" if params else ""
    return f"{prefix}{credentials}{host}{suffix}"


MONGODB_URI = build_mongodb_uri()
MONGODB_DB = os.getenv("MONGODB_DB", "pvc_formulations")


@lru_cache
def get_client() -> MongoClient:
    return MongoClient(MONGODB_URI)


def get_database():
    return get_client()[MONGODB_DB]


def get_materials_collection():
    return get_database()["materials"]


def get_formulations_collection():
    return get_database()["formulations"]
