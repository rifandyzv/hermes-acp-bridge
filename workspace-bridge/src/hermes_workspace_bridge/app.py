from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .acp_bridge import ACPBridgeService
from .config import BridgeConfig


class CreateSessionRequest(BaseModel):
    cwd: str | None = None


class PromptRequest(BaseModel):
    text: str = Field(min_length=1)


class TitleRequest(BaseModel):
    title: str


class ModelRequest(BaseModel):
    model_id: str = Field(min_length=1)


class ApprovalDecisionRequest(BaseModel):
    decision: str


def create_app(config: BridgeConfig | None = None) -> FastAPI:
    resolved_config = config or BridgeConfig.from_env()
    bridge = ACPBridgeService(resolved_config)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        await bridge.start()
        try:
            yield
        finally:
            await bridge.stop()

    app = FastAPI(title="Hermes Workspace Bridge", lifespan=lifespan)
    app.state.bridge = bridge
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(resolved_config.cors_origins),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/health")
    async def health() -> dict[str, Any]:
        return await bridge.health()

    @app.get("/api/sessions")
    async def list_sessions(limit: int = 50, offset: int = 0) -> list[dict[str, Any]]:
        return await bridge.list_sessions(limit=limit, offset=offset)

    @app.post("/api/sessions")
    async def create_session(request: CreateSessionRequest) -> dict[str, Any]:
        return await bridge.create_session(cwd=request.cwd)

    @app.get("/api/sessions/{session_id}")
    async def get_session(session_id: str) -> dict[str, Any]:
        session = await bridge.get_session(session_id)
        if session is None:
            raise HTTPException(status_code=404, detail="Session not found")
        return session

    @app.patch("/api/sessions/{session_id}")
    async def update_session(session_id: str, request: TitleRequest) -> dict[str, Any]:
        try:
            return await bridge.update_title(session_id, request.title)
        except KeyError:
            raise HTTPException(status_code=404, detail="Session not found")
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

    @app.post("/api/sessions/{session_id}/prompt")
    async def prompt(session_id: str, request: PromptRequest) -> dict[str, Any]:
        try:
            run_id = await bridge.start_prompt(session_id, request.text)
        except KeyError:
            raise HTTPException(status_code=404, detail="Session not found")
        except RuntimeError as exc:
            raise HTTPException(status_code=409, detail=str(exc))
        return {"run_id": run_id, "session_id": session_id}

    @app.post("/api/sessions/{session_id}/cancel")
    async def cancel(session_id: str) -> dict[str, Any]:
        await bridge.cancel_session(session_id)
        return {"session_id": session_id, "status": "cancelling"}

    @app.post("/api/sessions/{session_id}/fork")
    async def fork(session_id: str, request: CreateSessionRequest) -> dict[str, Any]:
        try:
            return await bridge.fork_session(session_id, cwd=request.cwd)
        except KeyError:
            raise HTTPException(status_code=404, detail="Session not found")

    @app.post("/api/sessions/{session_id}/model")
    async def set_model(session_id: str, request: ModelRequest) -> dict[str, Any]:
        try:
            return await bridge.set_session_model(session_id, request.model_id)
        except KeyError:
            raise HTTPException(status_code=404, detail="Session not found")

    @app.post("/api/approvals/{approval_id}")
    async def resolve_approval(
        approval_id: str, request: ApprovalDecisionRequest
    ) -> dict[str, Any]:
        try:
            await bridge.resolve_approval(approval_id, request.decision)
        except KeyError:
            raise HTTPException(status_code=404, detail="Approval not found")
        return {"approval_id": approval_id, "status": "resolved"}

    @app.websocket("/ws")
    async def websocket_endpoint(websocket: WebSocket) -> None:
        await websocket.accept()
        queue = await bridge.event_bus.subscribe()
        try:
            await websocket.send_json(await bridge.health())
            while True:
                event = await queue.get()
                try:
                    await websocket.send_json(event)
                except Exception:
                    break
        except WebSocketDisconnect:
            pass
        finally:
            await bridge.event_bus.unsubscribe(queue)

    return app
