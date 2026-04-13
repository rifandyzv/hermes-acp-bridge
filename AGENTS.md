# Zero-Touch Web Workspace via ACP Bridge

  ## Summary

  Build the web workspace as a separate companion product, not as a Hermes codebase change. The product has two
  parts: a React browser UI and a local Python sidecar. The sidecar launches hermes acp, speaks ACP over stdio using
  the official Python ACP SDK, exposes browser-friendly HTTP/WebSocket APIs, and reads Hermes’ persisted ACP
  sessions from ~/.hermes/state.db through hermes_state.SessionDB rather than patching Hermes.

  References that define the supported Hermes surface:

  - website/docs/developer-guide/acp-internals.md
  - acp_adapter/server.py
  - acp_adapter/session.py
  - ACP overview: https://agentclientprotocol.com/protocol/overview
  - ACP Python SDK: https://agentclientprotocol.github.io/python-sdk/

  ## Architecture and Public Interfaces

  ### Companion product structure

  - workspace-ui/: Vite + React + TypeScript browser app.
  - workspace-bridge/: Python service, installed separately from Hermes, with its own dependencies.
  - Hermes remains an external dependency: require hermes-agent[acp] on the machine and spawn hermes acp as a
    subprocess.

  ### Sidecar responsibilities

  - Process manager:
      - Spawn hermes acp.
      - Run ACP initialize and authenticate if needed.
      - Capture stderr for bridge logs; never parse CLI/TUI output.
  - ACP client:
      - Call new_session, load_session, resume_session, fork_session, prompt, cancel, and set_session_model.
      - Receive session/update notifications and normalize them for the browser.
      - Handle request_permission from Hermes and block until the browser responds or timeout denies.
  - Session browser:
      - Use hermes_state.SessionDB to list ACP sessions, load transcript history, and update titles.
      - Filter sessions to source="acp" so CLI/gateway sessions do not pollute the workspace list.

  ### Browser-facing API

  Implement these bridge APIs as the stable frontend contract:

  - POST /api/sessions
      - Body: { cwd?: string }
      - Action: ACP new_session
      - Returns: { session_id, cwd }
  - GET /api/sessions
      - Action: SessionDB.list_sessions_rich(source="acp", ...)
      - Returns: sidebar-ready summaries: { session_id, title, preview, model, started_at, last_active, cwd }[]
  - GET /api/sessions/{session_id}
      - Action: load transcript and metadata from SessionDB
      - Returns: { session_id, title, cwd, model, messages }
  - PATCH /api/sessions/{session_id}
      - Body: { title: string }
      - Action: SessionDB.set_session_title
  - POST /api/sessions/{session_id}/prompt
      - Body: { text: string }
      - Action: ensure ACP resume_session(cwd, session_id) then call prompt
      - Returns immediately with { run_id, session_id }
  - POST /api/sessions/{session_id}/cancel
      - Action: ACP cancel
  - POST /api/sessions/{session_id}/fork
      - Body: { cwd?: string }
      - Action: ACP fork_session
      - Returns: { session_id }
  - POST /api/sessions/{session_id}/model
      - Body: { model_id: string }
      - Action: ACP set_session_model
  - POST /api/approvals/{approval_id}
      - Body: { decision: "allow_once" | "allow_always" | "deny" }
      - Action: resolve a pending ACP permission request
  - GET /api/health
      - Returns bridge status plus Hermes ACP subprocess status

  ### WebSocket event stream

  Expose one browser stream, e.g. GET /ws, carrying normalized events:

  - session.started
  - session.resumed
  - message.delta
  - message.final
  - thinking.delta
  - tool.started
  - tool.completed
  - commands.available
  - approval.requested
  - run.finished
  - run.cancelled
  - run.failed
  - bridge.status

  The frontend should treat the WebSocket as ephemeral UI state only. Persisted truth comes from SessionDB and is
  reloaded after each run.

  ## Key Behavior

  ### Session lifecycle

  - New chat:
      - Browser calls POST /api/sessions.
      - Bridge creates ACP session and immediately stores returned session_id.
  - Open existing chat:
      - Browser loads transcript from GET /api/sessions/{id}.
      - Before the next prompt, bridge calls ACP resume_session with the saved cwd.
  - Rename chat:
      - Use PATCH /api/sessions/{id}; title lives in Hermes state.db, not browser local storage.
  - Retry:
      - Frontend reads the last user message from loaded transcript and re-submits it to POST /prompt.
      - This is explicit “resend last prompt”, not CLI /retry history surgery.

  ### Prompt execution

  - Browser posts prompt, then subscribes to WebSocket events for the active run.
  - Bridge forwards ACP session updates:
      - agent_message_chunk -> message.delta
      - thought updates -> thinking.delta
      - tool_call -> tool.started
      - tool_call_update -> tool.completed
      - available_commands_update -> commands.available
  - When ACP PromptResponse returns:
      - emit run.finished or run.cancelled
      - refresh transcript and session list from SessionDB

  ### Approvals

  - When Hermes requests permission through ACP:
      - Bridge creates approval_id, emits approval.requested with command and options.
      - Browser shows a modal or drawer with Allow once, Allow always, Deny.
      - Bridge blocks until /api/approvals/{id} resolves or timeout denies.
  - Approval UX is first-class in the workspace; no CLI scraping, no polling.

  ### Command palette

  Use a command palette, not freeform CLI emulation.

  - First-class palette actions:
      - New chat
      - Switch chat
      - Rename chat
      - Retry last prompt
      - Interrupt run
      - Fork chat
      - Switch model
  - Optional convenience:
      - Allow slash commands in the composer and pass them through unchanged, since ACP already supports /help, /
        model, /tools, /context, /reset, /compact, /version.

  ## Test Plan

  ### Bridge tests

  - Spawned ACP subprocess initializes correctly and advertises session capabilities.
  - POST /api/sessions creates a usable ACP session.
  - POST /prompt streams tool/message/thinking events to WebSocket consumers.
  - cancel during an active prompt yields run.cancelled.
  - Permission request roundtrip blocks Hermes and resumes correctly on browser decision.
  - GET /api/sessions and GET /api/sessions/{id} reflect persisted ACP sessions from SessionDB.
  - PATCH /api/sessions/{id} persists title updates.
  - set_session_model changes the session model and survives reload.
  - Bridge restart recovers by reconnecting to Hermes ACP and resuming existing persisted sessions on demand.

  ### Frontend tests

  - Sidebar renders session summaries and switches between sessions.
  - Chat transcript rehydrates from persisted messages.
  - Tool timeline updates in order from WebSocket events.
  - Approval modal appears and resolves pending permission requests.
  - Retry, interrupt, fork, and model switch actions call the correct bridge APIs.
  - Disconnected bridge state is visible and recoverable.

  ### Acceptance scenarios

  - Start a new ACP chat, run a tool-heavy prompt, watch live tool events, reload the page, and recover the
    transcript from Hermes storage.
  - Cancel a long-running run and verify Hermes stops plus the UI marks the turn as interrupted.
  - Approve a dangerous command from the browser and confirm the run continues without CLI interaction.
  - Rename and fork a session, then reopen both from the sidebar.

  ## Assumptions and Defaults

  - This is a local single-user product bound to 127.0.0.1; no hosted multi-user design in v1.
  - The bridge is Python, not Node, because it can reuse Hermes' SessionDB helpers and the official ACP Python SDK
    instead of reimplementing protocol or SQLite schema handling.
  - The browser UI is React/TypeScript and never talks to Hermes directly.
  - No Hermes source files are modified. Coupling to Hermes happens only through supported ACP methods and read/
    write use of hermes_state.SessionDB.
  - The main maintenance risk is version drift in ACP schema or state.db usage. Mitigate by pinning supported
    Hermes/ACP versions and running a startup compatibility check before the bridge accepts browser traffic.

  ## Known Issues

  ### Streaming responses not incremental (Hermes-side)

  **Problem**: The frontend receives WebSocket events correctly, but `message.delta` events arrive only once at the
  very end of a run with the complete response text, rather than incrementally during generation. During the run,
  only `thinking.delta` and tool events (`tool.started`/`tool.completed`) arrive. This means the chat UI shows no
  assistant text until the run finishes.

  **Evidence** (from browser console debug logs):
  ```
  [WS] Event type: thinking.delta        <-- arrives during run
  [WS] Event type: tool.started          <-- arrives during run
  [WS] Event type: tool.completed        <-- arrives during run
  [WS] Event type: thinking.delta        <-- arrives during run
  ...
  [WS] Event type: message.delta text: "Yes, I'm sure! Based on the files..."  <-- arrives ONCE at the end, full text
  [WS] Event type: run.finished          <-- immediately after
  ```

  **Expected behavior**: `message.delta` should arrive multiple times with small text chunks during generation,
  similar to how `thinking.delta` arrives incrementally.

  **Likely root cause**: Hermes ACP does not emit `agent_message_chunk` notifications incrementally during token
  generation. It buffers the full response and emits it as a single chunk when generation completes. This is a
  Hermes behavior, not a bridge or frontend issue.

  **Investigation needed**:
  1. Check Hermes ACP's `session/update` notification flow — does it emit `agent_message_chunk` per-token or
     only at completion?
  2. Check if there's a streaming mode or configuration in Hermes that enables incremental message chunks.
  3. If Hermes doesn't support incremental message streaming, the frontend should display `thinking.delta`
     content during the run to provide user feedback, then replace it with the final message on `run.finished`.

  **Workaround**: Show `thinking.delta` content in the chat during the run so users see activity. The bridge
  already normalizes `agent_thought_chunk` → `thinking.delta` correctly. The frontend just needs to render it.
