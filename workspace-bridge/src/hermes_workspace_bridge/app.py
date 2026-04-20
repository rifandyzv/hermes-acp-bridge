from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from starlette.responses import StreamingResponse

from .acp_bridge import ACPBridgeService
from .config import BridgeConfig
from .pipeline_manager import (
    analyze_activity,
    create_account,
    create_action_card,
    create_activity,
    delete_account,
    delete_activity,
    list_accounts,
    list_action_cards,
    list_activities,
    load_data,
    update_account,
    update_action_card,
    update_activity,
)
from .wiki_manager import (
    get_document,
    get_wiki_index,
    list_documents,
    search_documents,
    upload_file,
)


class CreateSessionRequest(BaseModel):
    cwd: str | None = None


class PromptRequest(BaseModel):
    text: str = Field(min_length=1)
    mode: str = "interrupt"


class TitleRequest(BaseModel):
    title: str


class ModelRequest(BaseModel):
    model_id: str = Field(min_length=1)


class ApprovalDecisionRequest(BaseModel):
    decision: str


class PromptResponseRequest(BaseModel):
    response: str


class WikiSearchRequest(BaseModel):
    query: str = Field(min_length=1)


class CreateAccountRequest(BaseModel):
    name: str = Field(min_length=1)
    industry: str = ""
    description: str = ""
    deal_value: float = 0
    currency: str = "USD"
    probability: float = 0
    stage: str = "prospecting"
    close_date: str | None = None
    champion: str = ""
    economic_buyer: str = ""
    next_step: str = ""
    next_step_date: str | None = None


class UpdateAccountRequest(BaseModel):
    name: str | None = None
    industry: str | None = None
    description: str | None = None
    deal_value: float | None = None
    currency: str | None = None
    probability: float | None = None
    stage: str | None = None
    close_date: str | None = None
    champion: str | None = None
    economic_buyer: str | None = None
    next_step: str | None = None
    next_step_date: str | None = None


class CreateActivityRequest(BaseModel):
    account_id: str = Field(min_length=1)
    account_name: str = Field(min_length=1)
    type: str = Field(min_length=1)
    brief: str = Field(min_length=1)
    date: str
    analyzed: bool = False
    action_card_id: str | None = None


class UpdateActionCardRequest(BaseModel):
    status: str | None = None
    recommendations: dict[str, Any] | None = None


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

    @app.post("/api/sessions/{session_id}/input")
    async def input_message(session_id: str, request: PromptRequest) -> dict[str, Any]:
        try:
            return await bridge.submit_input(
                session_id,
                request.text,
                mode=request.mode,
            )
        except KeyError:
            raise HTTPException(status_code=404, detail="Session not found")
        except RuntimeError as exc:
            raise HTTPException(status_code=409, detail=str(exc))

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

    @app.post("/api/prompt-requests/{request_id}/respond")
    async def respond_to_prompt_request(
        request_id: str, request: PromptResponseRequest
    ) -> dict[str, Any]:
        try:
            await bridge.respond_to_prompt_request(request_id, request.response)
        except KeyError:
            raise HTTPException(status_code=404, detail="Prompt request not found")
        return {"request_id": request_id, "status": "resolved"}

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

    @app.get("/api/wiki/documents")
    async def wiki_list_documents() -> list[dict[str, Any]]:
        return list_documents()

    @app.get("/api/wiki/documents/{doc_path:path}")
    async def wiki_get_document(doc_path: str) -> dict[str, Any]:
        doc = get_document(doc_path)
        if doc is None:
            raise HTTPException(status_code=404, detail="Document not found")
        return doc

    @app.post("/api/wiki/upload")
    async def wiki_upload(file: UploadFile = File(...)) -> dict[str, Any]:
        content = await file.read()
        filename = file.filename or "untitled"
        try:
            return upload_file(content, filename)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

    @app.get("/api/wiki/search")
    async def wiki_search(q: str) -> list[dict[str, Any]]:
        return search_documents(q)

    @app.get("/api/wiki/index")
    async def wiki_index() -> dict[str, str]:
        return {"content": get_wiki_index()}

    # -- Pipeline API endpoints --

    @app.get("/api/pipeline/data")
    async def pipeline_get_data() -> dict[str, Any]:
        return load_data()

    @app.post("/api/pipeline/accounts")
    async def pipeline_create_account(request: CreateAccountRequest) -> dict[str, Any]:
        return create_account(
            name=request.name,
            industry=request.industry,
            description=request.description,
            deal_value=request.deal_value,
            currency=request.currency,
            probability=request.probability,
            stage=request.stage,
            close_date=request.close_date,
            champion=request.champion,
            economic_buyer=request.economic_buyer,
            next_step=request.next_step,
            next_step_date=request.next_step_date,
        )

    @app.put("/api/pipeline/accounts/{account_id}")
    async def pipeline_update_account(account_id: str, request: UpdateAccountRequest) -> dict[str, Any]:
        updates = {k: v for k, v in request.model_dump().items() if v is not None}
        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")
        result = update_account(account_id, updates)
        if result is None:
            raise HTTPException(status_code=404, detail="Account not found")
        return result

    @app.delete("/api/pipeline/accounts/{account_id}")
    async def pipeline_delete_account(account_id: str) -> dict[str, Any]:
        if not delete_account(account_id):
            raise HTTPException(status_code=404, detail="Account not found")
        return {"id": account_id, "status": "deleted"}

    @app.post("/api/pipeline/activities")
    async def pipeline_create_activity(request: CreateActivityRequest) -> dict[str, Any]:
        return create_activity(
            account_id=request.account_id,
            account_name=request.account_name,
            activity_type=request.type,
            brief=request.brief,
            date=request.date,
            analyzed=request.analyzed,
            action_card_id=request.action_card_id,
        )

    @app.put("/api/pipeline/activities/{activity_id}/analyze")
    async def pipeline_analyze_activity(activity_id: str) -> dict[str, Any]:
        try:
            card = analyze_activity(activity_id)
            # Publish WebSocket event so frontend can react immediately
            try:
                await bridge.event_bus.publish({
                    "type": "pipeline.action_card",
                    "card": card,
                    "activity_id": activity_id,
                })
            except Exception:
                pass  # Non-critical: WebSocket push failure should not break the response
            return card
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc))
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc))
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Analysis failed: {exc}")

    @app.get("/api/pipeline/action-cards")
    async def pipeline_list_action_cards() -> list[dict[str, Any]]:
        return list_action_cards()

    @app.put("/api/pipeline/action-cards/{card_id}")
    async def pipeline_update_action_card(card_id: str, request: UpdateActionCardRequest) -> dict[str, Any]:
        updates = {k: v for k, v in request.model_dump().items() if v is not None}
        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")
        result = update_action_card(card_id, updates)
        if result is None:
            raise HTTPException(status_code=404, detail="Action card not found")
        return result

    return app
