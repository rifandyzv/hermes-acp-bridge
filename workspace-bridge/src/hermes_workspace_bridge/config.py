from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def _split_csv(value: str) -> tuple[str, ...]:
    return tuple(part.strip() for part in value.split(",") if part.strip())


def _split_args(value: str) -> tuple[str, ...]:
    return tuple(part.strip() for part in value.split() if part.strip())


@dataclass(frozen=True)
class BridgeConfig:
    host: str
    port: int
    cors_origins: tuple[str, ...]
    hermes_command: str
    hermes_args: tuple[str, ...]
    default_cwd: str
    log_level: str

    @classmethod
    def from_env(cls) -> "BridgeConfig":
        default_cwd = os.getenv("WORKSPACE_DEFAULT_CWD") or str(Path.cwd())
        return cls(
            host=os.getenv("WORKSPACE_BRIDGE_HOST", "127.0.0.1"),
            port=int(os.getenv("WORKSPACE_BRIDGE_PORT", "8742")),
            cors_origins=_split_csv(
                os.getenv(
                    "WORKSPACE_BRIDGE_CORS_ORIGINS",
                    "http://127.0.0.1:5173,http://localhost:5173",
                )
            ),
            hermes_command=os.getenv("WORKSPACE_HERMES_COMMAND", "hermes"),
            hermes_args=_split_args(os.getenv("WORKSPACE_HERMES_ARGS", "acp")),
            default_cwd=default_cwd,
            log_level=os.getenv("WORKSPACE_BRIDGE_LOG_LEVEL", "info"),
        )
