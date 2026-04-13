from __future__ import annotations

import uvicorn

from .app import create_app
from .config import BridgeConfig


def main() -> None:
    config = BridgeConfig.from_env()
    uvicorn.run(
        create_app(config),
        host=config.host,
        port=config.port,
        log_level=config.log_level,
    )


if __name__ == "__main__":
    main()
