"""Pipeline data manager for the Hermes Workspace Bridge.

Handles CRUD operations for accounts, activities, and action cards
persisted to ~/.hermes/bd/pipeline.json.
"""
from __future__ import annotations

import json
import os
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

PIPELINE_DIR = Path(os.path.expanduser("~/.hermes/bd")).resolve()
PIPELINE_FILE = PIPELINE_DIR / "pipeline.json"
PIPELINE_BACKUP = PIPELINE_DIR / "pipeline.json.bak"

_REQUIRED_KEYS = {"accounts", "activities", "action_cards"}


def ensure_data_dir() -> Path:
    """Ensure the pipeline data directory exists. Returns the directory path."""
    if not PIPELINE_DIR.exists():
        PIPELINE_DIR.mkdir(parents=True, exist_ok=True)
    return PIPELINE_DIR


def _empty_data() -> dict[str, list]:
    return {"accounts": [], "activities": [], "action_cards": []}


def load_data() -> dict[str, list]:
    """Load pipeline data from JSON file with schema validation.

    Returns the default empty schema if the file does not exist or
    is missing expected keys.
    """
    ensure_data_dir()
    if not PIPELINE_FILE.exists():
        return _empty_data()

    try:
        raw = PIPELINE_FILE.read_text(encoding="utf-8")
        data = json.loads(raw)
    except (json.JSONDecodeError, OSError):
        return _empty_data()

    # Schema validation: ensure all expected keys exist
    if not isinstance(data, dict) or not _REQUIRED_KEYS.issubset(data.keys()):
        # Corrupted or wrong-schema data -- reset but keep backup
        return _empty_data()

    # Ensure each key is a list
    for key in _REQUIRED_KEYS:
        if not isinstance(data[key], list):
            data[key] = []

    return data


def save_data(data: dict[str, list]) -> None:
    """Save pipeline data to JSON file with backup-on-write."""
    ensure_data_dir()

    # Backup existing file before overwriting
    if PIPELINE_FILE.exists():
        try:
            shutil.copy2(str(PIPELINE_FILE), str(PIPELINE_BACKUP))
        except OSError:
            pass  # Non-critical: continue without backup

    PIPELINE_FILE.write_text(
        json.dumps(data, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# -- Account CRUD --

def list_accounts() -> list[dict[str, Any]]:
    data = load_data()
    return data["accounts"]


def create_account(name: str, industry: str = "", description: str = "",
                   deal_value: float = 0, currency: str = "USD",
                   probability: float = 0, stage: str = "prospecting",
                   close_date: str | None = None, champion: str = "",
                   economic_buyer: str = "", next_step: str = "",
                   next_step_date: str | None = None) -> dict[str, Any]:
    data = load_data()
    now = _now_iso()
    account: dict[str, Any] = {
        "id": str(uuid.uuid4()),
        "name": name,
        "industry": industry,
        "description": description,
        "deal_value": deal_value,
        "currency": currency,
        "probability": probability,
        "stage": stage,
        "close_date": close_date,
        "champion": champion,
        "economic_buyer": economic_buyer,
        "next_step": next_step,
        "next_step_date": next_step_date,
        "created_at": now,
        "updated_at": now,
    }
    data["accounts"].append(account)
    save_data(data)
    return account


def update_account(account_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
    data = load_data()
    for i, acct in enumerate(data["accounts"]):
        if acct["id"] == account_id:
            data["accounts"][i] = {**acct, **updates, "id": account_id, "updated_at": _now_iso()}
            save_data(data)
            return data["accounts"][i]
    return None


def delete_account(account_id: str) -> bool:
    data = load_data()
    original_len = len(data["accounts"])
    data["accounts"] = [a for a in data["accounts"] if a["id"] != account_id]
    if len(data["accounts"]) < original_len:
        save_data(data)
        return True
    return False


# -- Activity CRUD --

def list_activities() -> list[dict[str, Any]]:
    data = load_data()
    return data["activities"]


def create_activity(account_id: str, account_name: str,
                    activity_type: str, brief: str, date: str,
                    analyzed: bool = False, action_card_id: str | None = None) -> dict[str, Any]:
    data = load_data()
    now = _now_iso()
    activity: dict[str, Any] = {
        "id": str(uuid.uuid4()),
        "account_id": account_id,
        "account_name": account_name,
        "type": activity_type,
        "brief": brief,
        "date": date,
        "analyzed": analyzed,
        "action_card_id": action_card_id,
        "created_at": now,
        "updated_at": now,
    }
    data["activities"].append(activity)
    save_data(data)
    return activity


def update_activity(activity_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
    data = load_data()
    for i, act in enumerate(data["activities"]):
        if act["id"] == activity_id:
            data["activities"][i] = {**act, **updates, "id": activity_id, "updated_at": _now_iso()}
            save_data(data)
            return data["activities"][i]
    return None


def delete_activity(activity_id: str) -> bool:
    data = load_data()
    original_len = len(data["activities"])
    data["activities"] = [a for a in data["activities"] if a["id"] != activity_id]
    if len(data["activities"]) < original_len:
        save_data(data)
        return True
    return False


# -- Action Card CRUD --

def list_action_cards() -> list[dict[str, Any]]:
    data = load_data()
    return data["action_cards"]


def create_action_card(account_id: str, account_name: str, activity_id: str,
                       recommendations: dict[str, Any],
                       status: str = "active") -> dict[str, Any]:
    data = load_data()
    now = _now_iso()
    card: dict[str, Any] = {
        "id": str(uuid.uuid4()),
        "account_id": account_id,
        "account_name": account_name,
        "activity_id": activity_id,
        "generated_at": now,
        "status": status,
        "recommendations": recommendations,
        "created_at": now,
        "updated_at": now,
    }
    data["action_cards"].append(card)
    save_data(data)
    return card


def update_action_card(card_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
    data = load_data()
    for i, card in enumerate(data["action_cards"]):
        if card["id"] == card_id:
            data["action_cards"][i] = {**card, **updates, "id": card_id, "updated_at": _now_iso()}
            save_data(data)
            return data["action_cards"][i]
    return None
