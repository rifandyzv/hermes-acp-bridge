"""Pipeline data manager for the Hermes Workspace Bridge.

Handles CRUD operations for accounts, activities, and action cards
persisted to ~/.hermes/bd/pipeline.json.
"""
from __future__ import annotations

import json
import os
import shutil
import sys
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


# -- Hermes Analysis --

_ANALYSIS_TIMEOUT = 60  # seconds

ANALYSIS_SYSTEM_PROMPT = """You are a Business Development co-pilot specializing in enterprise cloud sales.
Your role is to analyze meeting briefs and generate structured Action Cards that help BD reps advance deals.

Use the MEDDIC framework to evaluate deal health:
- Metrics: Quantifiable business value / ROI
- Economic Buyer: Person with budget authority
- Decision Criteria: How the customer evaluates vendors
- Decision Process: Steps to reach a purchasing decision
- Identify Pain: Customer problems the solution addresses
- Champion: Internal advocate pushing the deal forward

Also analyze:
- Stakeholder mapping: Identify stakeholders by power/interest, suggest engagement actions
- Risk flags: Competitors, timeline pressure, budget concerns, technical blockers
- Concrete next actions: Specific, actionable items with rationale and priority

You MUST output ONLY valid JSON matching this exact schema. Wrap the JSON in a markdown code block (```json ... ```).

```json
{
  "immediate_actions": [
    {"text": "...", "priority": "high|medium|low", "rationale": "...", "deadline": null}
  ],
  "meddic_gaps": [
    {"element": "Metrics|Economic Buyer|Decision Criteria|Decision Process|Identify Pain|Champion", "status": "...", "next_step": "..."}
  ],
  "stakeholder_actions": [
    {"stakeholder": "...", "role": "...", "action": "...", "framing": "..."}
  ],
  "next_meeting_agenda": ["item 1", "item 2"],
  "risk_flags": [
    {"flag": "...", "severity": "high|medium|low", "mitigation": "..."}
  ]
}
```

Rules:
- Be specific and actionable. Avoid generic advice.
- Prioritize based on deal stage, urgency, and impact.
- For MEDDIC gaps, state current status and a concrete next step.
- For stakeholder actions, include the framing -- how to position the conversation.
- For risk flags, include mitigation strategies.
- Return 2-5 immediate actions, 1-6 MEDDIC gaps, 1-4 stakeholder actions, 2-5 agenda items, and 1-3 risk flags.
- Do NOT include any text before or after the JSON code block."""


def _extract_json_from_response(text: str) -> dict[str, Any]:
    """Extract JSON from Hermes response, handling markdown code blocks."""
    # Try direct JSON parse first
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Try to extract from markdown code block
    import re
    match = re.search(r"```(?:json)?\s*\n(.*?)\n```", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            pass

    # Try to find any JSON object in the text
    # Look for the outermost { ... } that contains expected keys
    brace_start = text.find("{")
    brace_end = text.rfind("}")
    if brace_start != -1 and brace_end != -1 and brace_end > brace_start:
        try:
            return json.loads(text[brace_start:brace_end + 1])
        except json.JSONDecodeError:
            pass

    raise ValueError(f"Could not extract valid JSON from Hermes response (length={len(text)})")


def _validate_analysis_json(data: dict[str, Any]) -> dict[str, Any]:
    """Ensure the parsed JSON has all required fields with correct types."""
    result: dict[str, Any] = {
        "immediate_actions": [],
        "meddic_gaps": [],
        "stakeholder_actions": [],
        "next_meeting_agenda": [],
        "risk_flags": [],
    }

    if isinstance(data.get("immediate_actions"), list):
        for item in data["immediate_actions"]:
            if isinstance(item, dict):
                result["immediate_actions"].append({
                    "text": str(item.get("text", "")),
                    "priority": str(item.get("priority", "medium")) if str(item.get("priority", "")) in ("high", "medium", "low") else "medium",
                    "rationale": str(item.get("rationale", "")),
                    "deadline": item.get("deadline", None),
                    "completed": False,
                })

    if isinstance(data.get("meddic_gaps"), list):
        for item in data["meddic_gaps"]:
            if isinstance(item, dict):
                result["meddic_gaps"].append({
                    "element": str(item.get("element", "")),
                    "status": str(item.get("status", "")),
                    "next_step": str(item.get("next_step", "")),
                })

    if isinstance(data.get("stakeholder_actions"), list):
        for item in data["stakeholder_actions"]:
            if isinstance(item, dict):
                result["stakeholder_actions"].append({
                    "stakeholder": str(item.get("stakeholder", "")),
                    "role": str(item.get("role", "")),
                    "action": str(item.get("action", "")),
                    "framing": str(item.get("framing", "")),
                })

    if isinstance(data.get("next_meeting_agenda"), list):
        result["next_meeting_agenda"] = [str(item) for item in data["next_meeting_agenda"] if item]

    if isinstance(data.get("risk_flags"), list):
        for item in data["risk_flags"]:
            if isinstance(item, dict):
                result["risk_flags"].append({
                    "flag": str(item.get("flag", "")),
                    "severity": str(item.get("severity", "medium")) if str(item.get("severity", "")) in ("high", "medium", "low") else "medium",
                    "mitigation": str(item.get("mitigation", "")),
                })

    return result


def analyze_activity(activity_id: str) -> dict[str, Any]:
    """Analyze an activity using Hermes and return a generated ActionCard.

    Steps:
    1. Load pipeline data and find the activity
    2. Load account context and prior activities
    3. Build analysis prompt with BD/MEDDIC framework
    4. Call Hermes subprocess for analysis
    5. Parse JSON response and create ActionCard
    6. Save to pipeline.json and return the card
    """
    data = load_data()

    # Find the activity
    activity = None
    for act in data["activities"]:
        if act["id"] == activity_id:
            activity = act
            break

    if activity is None:
        raise ValueError(f"Activity {activity_id} not found")

    # Load account context
    account = None
    for acct in data["accounts"]:
        if acct["id"] == activity["account_id"]:
            account = acct
            break

    # Build account context string
    account_context = ""
    if account:
        account_context = f"""Account: {account.get('name', activity['account_name'])}
Industry: {account.get('industry', 'N/A')}
Deal Value: {account.get('deal_value', 0)} {account.get('currency', 'USD')}
Stage: {account.get('stage', 'N/A')}
Probability: {account.get('probability', 0)}%
Champion: {account.get('champion', 'Not identified')}
Economic Buyer: {account.get('economic_buyer', 'Not identified')}
Next Step: {account.get('next_step', 'N/A')}
Close Date: {account.get('close_date', 'N/A')}"""

    # Load prior activities for same account (last 5)
    prior_activities = [
        a for a in data["activities"]
        if a["account_id"] == activity["account_id"] and a["id"] != activity_id
    ]
    prior_activities.sort(key=lambda a: a.get("date", ""), reverse=True)
    prior_activities = prior_activities[:5]

    prior_context = ""
    if prior_activities:
        prior_lines = ["\nPrior activities (most recent first):"]
        for pa in prior_activities:
            prior_lines.append(
                f"- [{pa.get('date', 'unknown')}] {pa.get('type', 'unknown')}: {pa.get('brief', '')[:150]}"
            )
        prior_context = "\n".join(prior_lines)

    # Build user prompt
    user_prompt = f"""Analyze this BD meeting brief and generate a structured Action Card.

{account_context}

{prior_context}

Current Activity:
Type: {activity.get('type', 'unknown')}
Date: {activity.get('date', 'unknown')}
Brief: {activity.get('brief', '')}

Generate the Action Card now."""

    # Build the context for the subprocess
    context = {
        "system_prompt": ANALYSIS_SYSTEM_PROMPT,
        "user_prompt": user_prompt,
    }

    # Call Hermes via subprocess
    import subprocess
    import shlex

    analyzer_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_hermes_analyzer.py")

    try:
        proc = subprocess.run(
            [sys.executable, analyzer_path],
            input=json.dumps(context),
            capture_output=True,
            text=True,
            timeout=_ANALYSIS_TIMEOUT,
        )
    except subprocess.TimeoutExpired:
        raise RuntimeError(
            f"Hermes analysis timed out after {_ANALYSIS_TIMEOUT}s. "
            "The model is taking longer than expected to respond."
        )
    except FileNotFoundError:
        raise RuntimeError(
            "Hermes is not available. Ensure hermes-agent is installed and accessible."
        )

    # Check for subprocess errors
    if proc.returncode != 0:
        stderr_msg = proc.stderr.strip()[:500] if proc.stderr else "Unknown error"
        raise RuntimeError(f"Hermes analysis failed (exit code {proc.returncode}): {stderr_msg}")

    response_text = proc.stdout.strip()
    if not response_text:
        stderr_msg = proc.stderr.strip()[:500] if proc.stderr else "Empty response"
        raise RuntimeError(f"Hermes returned empty response: {stderr_msg}")

    # Parse JSON from response
    try:
        parsed = _extract_json_from_response(response_text)
    except ValueError as exc:
        raise RuntimeError(f"Failed to parse Hermes JSON response: {exc}")

    # Validate and normalize
    recommendations = _validate_analysis_json(parsed)

    # Create the ActionCard
    card = create_action_card(
        account_id=activity["account_id"],
        account_name=activity["account_name"],
        activity_id=activity_id,
        recommendations=recommendations,
        status="active",
    )

    # Mark activity as analyzed
    update_activity(activity_id, {"analyzed": True, "action_card_id": card["id"]})

    return card


# -- Health Score & MEDDIC Tracking --

_MEDDIC_ELEMENTS = [
    "Metrics",
    "Economic Buyer",
    "Decision Criteria",
    "Decision Process",
    "Identify Pain",
    "Champion",
]

_STAGE_POINTS = {
    "prospecting": 0,
    "discovery": 5,
    "solution-design": 15,
    "proposal": 20,
    "negotiation": 25,
    "closed-won": 30,
    "closed-lost": 0,
}


def compute_meddic_status(account_id: str) -> dict[str, dict[str, str]]:
    """Compute MEDDIC element status from action cards for an account.

    Returns a dict mapping each MEDDIC element to its status:
    - element: the MEDDIC element name
    - status: "Complete", "Filled", or "Needs Discovery"
    - gaps: list of gap descriptions from active action cards
    """
    data = load_data()

    # Get all active action cards for this account
    account_cards = [
        c for c in data["action_cards"]
        if c["account_id"] == account_id and c["status"] == "active"
    ]

    # Initialize all elements as "Needs Discovery"
    result: dict[str, dict[str, str]] = {}
    for elem in _MEDDIC_ELEMENTS:
        result[elem] = {
            "status": "Needs Discovery",
            "gaps": [],
        }

    # Parse action cards to update status
    for card in account_cards:
        recs = card.get("recommendations", {})
        meddic_gaps = recs.get("meddic_gaps", [])
        for gap in meddic_gaps:
            elem = gap.get("element", "")
            gap_status = gap.get("status", "")
            next_step = gap.get("next_step", "")

            # Check if this element matches any MEDDIC element
            for meddic_elem in _MEDDIC_ELEMENTS:
                if elem.lower() == meddic_elem.lower():
                    if gap_status in ("Complete", "Filled"):
                        result[meddic_elem]["status"] = gap_status
                    elif gap_status == "Needs Discovery":
                        # Only mark as Needs Discovery if not already Complete/Filled
                        if result[meddic_elem]["status"] != "Complete":
                            result[meddic_elem]["status"] = "Needs Discovery"
                        if next_step:
                            result[meddic_elem]["gaps"].append(next_step)

    return result


def compute_health_score(account_id: str) -> int:
    """Compute account health score (0-100).

    Scoring:
    - MEDDIC completion: 40 points (6 elements * ~6.67 each)
    - Activity recency: 30 points (within 7 days = 30, 14 days = 20, 30 days = 10, older = 0)
    - Risk flags: -20 per high, -10 per medium, -5 per low (capped at -30)
    - Deal stage: 30 points max
    """
    data = load_data()

    # Find account
    account = None
    for acct in data["accounts"]:
        if acct["id"] == account_id:
            account = acct
            break

    if account is None:
        return 0

    # MEDDIC completion: 40 points
    meddic = compute_meddic_status(account_id)
    meddic_score = 0
    for elem, info in meddic.items():
        if info["status"] in ("Complete", "Filled"):
            meddic_score += 40 / 6  # ~6.67 per element
    meddic_score = min(meddic_score, 40)

    # Activity recency: 30 points
    activities = [
        a for a in data["activities"]
        if a["account_id"] == account_id
    ]
    recency_score = 0
    if activities:
        # Find most recent activity date
        dates = [a.get("date", "") for a in activities if a.get("date")]
        if dates:
            dates.sort(reverse=True)
            most_recent = dates[0]
            try:
                from datetime import datetime, timedelta
                activity_date = datetime.fromisoformat(most_recent.replace("Z", "+00:00"))
                now = datetime.now(timezone.utc)
                days_since = (now - activity_date).days

                if days_since <= 7:
                    recency_score = 30
                elif days_since <= 14:
                    recency_score = 20
                elif days_since <= 30:
                    recency_score = 10
                else:
                    recency_score = 0
            except (ValueError, TypeError):
                recency_score = 0

    # Risk flags: negative points (capped at -30)
    risk_deduction = 0
    account_cards = [
        c for c in data["action_cards"]
        if c["account_id"] == account_id and c["status"] == "active"
    ]
    for card in account_cards:
        recs = card.get("recommendations", {})
        for risk in recs.get("risk_flags", []):
            severity = risk.get("severity", "medium")
            if severity == "high":
                risk_deduction += 20
            elif severity == "medium":
                risk_deduction += 10
            else:
                risk_deduction += 5
    risk_deduction = min(risk_deduction, 30)

    # Deal stage: 30 points max
    stage = account.get("stage", "prospecting")
    stage_score = _STAGE_POINTS.get(stage, 0)

    # Total score
    total = meddic_score + recency_score - risk_deduction + stage_score
    return max(0, min(100, int(round(total))))


def ask_hermes(account_id: str, question: str) -> str:
    """Ask Hermes a free-form question about an account.

    Returns Hermes's text response.
    """
    data = load_data()

    # Find account
    account = None
    for acct in data["accounts"]:
        if acct["id"] == account_id:
            account = acct
            break

    if account is None:
        raise ValueError(f"Account {account_id} not found")

    # Build account context
    account_context = f"""Account: {account.get('name', 'Unknown')}
Industry: {account.get('industry', 'N/A')}
Deal Value: {account.get('deal_value', 0)} {account.get('currency', 'USD')}
Stage: {account.get('stage', 'N/A')}
Probability: {account.get('probability', 0)}%
Champion: {account.get('champion', 'Not identified')}
Economic Buyer: {account.get('economic_buyer', 'Not identified')}
Next Step: {account.get('next_step', 'N/A')}
Close Date: {account.get('close_date', 'N/A')}"""

    # Recent activities
    recent_activities = [
        a for a in data["activities"]
        if a["account_id"] == account_id
    ]
    recent_activities.sort(key=lambda a: a.get("date", ""), reverse=True)
    recent_activities = recent_activities[:10]

    activity_context = ""
    if recent_activities:
        lines = ["\nRecent activities:"]
        for act in recent_activities:
            lines.append(
                f"- [{act.get('date', 'unknown')}] {act.get('type', 'unknown')}: {act.get('brief', '')[:200]}"
            )
        activity_context = "\n".join(lines)

    # Active action cards
    active_cards = [
        c for c in data["action_cards"]
        if c["account_id"] == account_id and c["status"] == "active"
    ]
    cards_context = ""
    if active_cards:
        lines = ["\nActive action cards:"]
        for card in active_cards[:3]:
            recs = card.get("recommendations", {})
            actions = recs.get("immediate_actions", [])
            pending = [a for a in actions if not a.get("completed", False)]
            lines.append(
                f"- Card from {card.get('generated_at', 'unknown')[:10]}: "
                f"{len(pending)} pending actions, "
                f"{len(recs.get('risk_flags', []))} risk flags"
            )
        cards_context = "\n".join(lines)

    # MEDDIC status
    meddic = compute_meddic_status(account_id)
    meddic_summary = "\n\nMEDDIC Status:"
    for elem, info in meddic.items():
        meddic_summary += f"\n- {elem}: {info['status']}"
        if info["gaps"]:
            meddic_summary += f" ({info['gaps'][0]})"

    user_prompt = f"""You are a Business Development co-pilot. The user is asking a question about an active deal.

{account_context}
{activity_context}
{cards_context}
{meddic_summary}

User's question: {question}

Provide a concise, actionable answer based on the account context above. Be specific and reference the data provided. If you don't have enough information to answer fully, state what's missing and suggest how to find it."""

    context = {
        "system_prompt": "You are an expert BD co-pilot analyzing deal data. Provide concise, actionable answers. Base your analysis strictly on the provided account context.",
        "user_prompt": user_prompt,
    }

    import subprocess
    import sys as _sys

    analyzer_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_hermes_analyzer.py")

    try:
        proc = subprocess.run(
            [_sys.executable, analyzer_path],
            input=json.dumps(context),
            capture_output=True,
            text=True,
            timeout=_ANALYSIS_TIMEOUT,
        )
    except subprocess.TimeoutExpired:
        raise RuntimeError(
            f"Hermes analysis timed out after {_ANALYSIS_TIMEOUT}s."
        )
    except FileNotFoundError:
        raise RuntimeError(
            "Hermes is not available. Ensure hermes-agent is installed and accessible."
        )

    if proc.returncode != 0:
        stderr_msg = proc.stderr.strip()[:500] if proc.stderr else "Unknown error"
        raise RuntimeError(f"Hermes analysis failed (exit code {proc.returncode}): {stderr_msg}")

    response_text = proc.stdout.strip()
    if not response_text:
        stderr_msg = proc.stderr.strip()[:500] if proc.stderr else "Empty response"
        raise RuntimeError(f"Hermes returned empty response: {stderr_msg}")

    # For free-form questions, return the full text response
    return response_text
