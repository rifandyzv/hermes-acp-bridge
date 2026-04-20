"""Standalone Hermes analyzer for BD pipeline Action Card generation.

Called as a subprocess by pipeline_manager.py. Reads JSON context from
stdin, creates an AIAgent, runs the analysis prompt, and writes JSON
output to stdout.

Usage:
    python -m hermes_workspace_bridge._hermes_analyzer < context.json

Context JSON schema:
    {
        "system_prompt": "...",
        "user_prompt": "..."
    }

Output: raw AIAgent final_response text (expected to contain valid JSON)
"""
from __future__ import annotations

import json
import sys
import os

# Add the workspace-bridge source to path so run_agent import works
# when running as a subprocess from the bridge's working directory
_bridge_src = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
if _bridge_src not in sys.path:
    sys.path.insert(0, _bridge_src)


def _resolve_model() -> str:
    env = os.environ.get("HERMES_MODEL", "").strip()
    if env:
        return env
    try:
        from hermes_cli.config import load_config
        cfg = load_config() or {}
        model_cfg = cfg.get("model")
        if isinstance(model_cfg, dict):
            value = str(model_cfg.get("default", "") or "").strip()
            if value:
                return value
        if isinstance(model_cfg, str) and model_cfg.strip():
            return model_cfg.strip()
    except Exception:
        pass
    return "anthropic/claude-sonnet-4"


def _load_reasoning_config():
    try:
        from hermes_constants import parse_reasoning_effort
        from hermes_cli.config import load_config
        effort = str(
            load_config().get("agent", {}).get("reasoning_effort", "") or ""
        ).strip()
        return parse_reasoning_effort(effort)
    except Exception:
        return None


def _load_service_tier():
    try:
        from hermes_cli.config import load_config
        raw = str(
            load_config().get("agent", {}).get("service_tier", "") or ""
        ).strip().lower()
        if not raw or raw in {"normal", "default", "standard", "off", "none"}:
            return None
        if raw in {"fast", "priority", "on"}:
            return "priority"
        return None
    except Exception:
        return None


def _load_enabled_toolsets():
    try:
        from hermes_cli.config import load_config
        from hermes_cli.tools_config import _get_platform_tools
        enabled = sorted(
            _get_platform_tools(
                load_config(), "cli", include_default_mcp_servers=False
            )
        )
        return enabled or None
    except Exception:
        return None


def run_analysis(context: dict) -> str:
    """Run the analysis using AIAgent and return the response text."""
    from run_agent import AIAgent

    system_prompt = context.get("system_prompt", "")
    user_prompt = context.get("user_prompt", "")
    model = context.get("model", _resolve_model())

    agent = AIAgent(
        model=model,
        quiet_mode=True,
        verbose_logging=False,
        reasoning_config=_load_reasoning_config(),
        service_tier=_load_service_tier(),
        enabled_toolsets=_load_enabled_toolsets(),
        platform="workspace",
        session_id=None,  # ephemeral analysis session
        session_db=None,
        ephemeral_system_prompt=system_prompt if system_prompt else None,
    )

    result = agent.run_conversation(
        user_prompt,
        conversation_history=[],
        stream_callback=None,
    )

    if isinstance(result, dict):
        return str(result.get("final_response", "") or "")
    return str(result)


def main() -> None:
    try:
        raw = sys.stdin.read()
        if not raw.strip():
            print(json.dumps({"error": "Empty input"}), file=sys.stderr)
            sys.exit(1)

        context = json.loads(raw)
    except json.JSONDecodeError as exc:
        print(json.dumps({"error": f"Invalid JSON input: {exc}"}), file=sys.stderr)
        sys.exit(1)

    try:
        response = run_analysis(context)
        # Output the response as-is (it should contain JSON)
        sys.stdout.write(response)
        sys.stdout.flush()
    except Exception as exc:
        print(json.dumps({"error": f"Analysis failed: {exc}"}), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
