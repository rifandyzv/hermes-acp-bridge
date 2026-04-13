# Hermes Workspace Bridge

Local browser bridge for Hermes ACP.

This package does not modify Hermes itself. It launches `hermes acp`, speaks
ACP over stdio, exposes a small HTTP and WebSocket API for a browser UI, and
reads ACP session history from Hermes' shared `state.db`.

## Requirements

- Hermes installed locally with ACP support:

```bash
pip install -e '.[acp]'
```

- This bridge package installed:

```bash
cd workspace-bridge
pip install -e .
```

## Run

```bash
hermes-workspace-bridge
```

Environment variables:

- `WORKSPACE_BRIDGE_HOST` default `127.0.0.1`
- `WORKSPACE_BRIDGE_PORT` default `8742`
- `WORKSPACE_BRIDGE_CORS_ORIGINS` default `http://127.0.0.1:5173,http://localhost:5173`
- `WORKSPACE_HERMES_COMMAND` default `hermes`
- `WORKSPACE_HERMES_ARGS` default `acp`
- `WORKSPACE_DEFAULT_CWD` default current working directory

## Browser API

- `GET /api/health`
- `GET /api/sessions`
- `POST /api/sessions`
- `GET /api/sessions/{session_id}`
- `PATCH /api/sessions/{session_id}`
- `POST /api/sessions/{session_id}/prompt`
- `POST /api/sessions/{session_id}/cancel`
- `POST /api/sessions/{session_id}/fork`
- `POST /api/sessions/{session_id}/model`
- `POST /api/approvals/{approval_id}`
- `GET /ws`
