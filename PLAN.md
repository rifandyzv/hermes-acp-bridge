# BD Pipeline -- Agentic Development Plan

## Overview

A BD pipeline tracking feature for the Hermes Workspace that is **AI-native**, not a dumb CRM.
The core loop: BD logs activity --> Hermes analyzes --> Action Card generated --> BD acts --> Repeat.

## Architecture

```
Frontend (React)              Bridge (FastAPI)              Hermes
┌─────────────────┐           ┌─────────────────┐           ┌───────────┐
│ Pipeline Page   │  REST     │ /api/pipeline/   │  prompt  │           │
│ - Accounts list │<--------->│ - CRUD deals     │<-------->│ AIAgent   │
│ - Activity feed │           │ - CRUD activities│          │ with BD   │
│ - Action Cards  │           │ - POST /analyze  │          │ skill     │
│ - Slide-over    │           │ - GET /card      │          │ prompt    │
└─────────────────┘           └─────────────────┘           └───────────┘
        │                              │
        └───── Storage: ~/.hermes/bd/pipeline.json (JSON file) ─────────┘
```

## File Changes

### New Files

| File | Purpose |
|------|---------|
| `workspace-ui/src/components/PipelinePage.tsx` | Main pipeline page with 3 sub-views |
| `workspace-ui/src/components/AccountList.tsx` | Account table with search/filter |
| `workspace-ui/src/components/ActivityFeed.tsx` | Chronological activity log |
| `workspace-ui/src/components/ActionCard.tsx` | Hermes-generated recommendation card |
| `workspace-ui/src/components/ActivityLogModal.tsx` | Modal to log new activity + Hermes button |
| `workspace-ui/src/components/AccountDetailPanel.tsx` | Slide-over panel for account details |
| `workspace-bridge/src/hermes_workspace_bridge/pipeline_manager.py` | Python module: CRUD + Hermes analysis |
| `~/.hermes/bd/pipeline.json` | Local data store (created on first use) |

### Modified Files

| File | Change |
|------|--------|
| `workspace-ui/src/App.tsx` | Add `activeTab === "pipeline"` branch, import PipelinePage, extend activeTab union type |
| `workspace-ui/src/components/SessionSidebar.tsx` | Add Pipeline nav item + rail icon, extend activeTab union prop type |
| `workspace-ui/src/lib/api.ts` | Append pipeline API functions (follows existing fetch/readJson pattern) |
| `workspace-ui/src/styles.css` | Append all pipeline-related CSS (BEM naming with `pipeline-` prefix) |
| `workspace-bridge/src/hermes_workspace_bridge/app.py` | Add Pydantic request models + /api/pipeline/* endpoints |

### Already Exists (No Changes Needed)

| File | Status |
|------|--------|
| `workspace-ui/src/types/pipeline.ts` | **ALREADY EXISTS** -- Complete types for Account, Activity, ActionCard, ActionItem, MeddicGap, StakeholderAction, RiskFlag, PipelineData, DealStage, ActivityType, Priority, CardStatus, PipelineTab |

---

## Phase 1: Frontend Shell + Local State (No Backend)

**Goal**: Pipeline tab works with localStorage, manual data entry, no Hermes analysis yet.

### Tasks

| # | Task | Files | Complexity |
|---|------|-------|------------|
| 1.1 | Extend activeTab union: add `"pipeline"` to App.tsx line 43 (`"chat" | "knowledge" | "pipeline"`) | App.tsx | Low |
| 1.2 | Extend SessionSidebarProps activeTab type (line 6) to include `"pipeline"` | SessionSidebar.tsx | Low |
| 1.3 | Add Pipeline nav button in sidebar__nav (after Knowledge), same SVG pattern as existing nav items | SessionSidebar.tsx | Low |
| 1.4 | Add Pipeline rail icon button in sidebar-rail__actions (after Knowledge), same SVG pattern | SessionSidebar.tsx | Low |
| 1.5 | Add pipeline branch in App.tsx ternary (line 370-385 pattern: `{activeTab === "pipeline" ? <div className="pipeline-pane"><PipelinePage /></div> : ...}`) | App.tsx | Low |
| 1.6 | Create PipelinePage.tsx with 3 sub-view tabs (accounts/activities/action-cards), follow KnowledgePage layout pattern (header + content area with sidebar/viewer split) | PipelinePage.tsx | Medium |
| 1.7 | Create AccountList.tsx with localStorage CRUD (read/write PipelineData.accounts key) | AccountList.tsx | Medium |
| 1.8 | Create ActivityLogModal.tsx (form with account select, activity type, brief textarea, date) | ActivityLogModal.tsx | Medium |
| 1.9 | Create ActivityFeed.tsx (display chronological Activity entries grouped by account) | ActivityFeed.tsx | Low |
| 1.10 | Create ActionCard.tsx (static render from PipelineData.action_cards, no generation yet) | ActionCard.tsx | Medium |
| 1.11 | Create AccountDetailPanel.tsx (slide-over panel showing account details + activity history) | AccountDetailPanel.tsx | Medium |
| 1.12 | Append all pipeline CSS to styles.css (follow existing BEM convention, see CSS section below) | styles.css | Medium |

### Phase 1 Acceptance Criteria
- [ ] Sidebar shows 3 tabs: Chat, Knowledge, Pipeline (both in expanded nav and collapsed rail)
- [ ] Pipeline page renders with 3 sub-views: Accounts, Activities, Action Cards
- [ ] Can add/edit/delete accounts (stored in localStorage under `hermes-pipeline-data`)
- [ ] Can log an activity with free-text brief via modal form
- [ ] Activity feed shows chronological entries
- [ ] Can manually create a mock action card (hardcoded JSON) to verify render
- [ ] Account detail panel slides in when an account row is clicked

### Implementation Notes for Phase 1
- **types/pipeline.ts already exists** -- no new type definitions needed. Task 1.4 from original plan is eliminated.
- **App.tsx pattern**: The existing tab switch at line 370-385 uses a ternary. Add a third branch: `{activeTab === "pipeline" ? (<div className="pipeline-pane"><PipelinePage /></div>) : (...)}`.
- **SessionSidebar pattern**: Rail icons go in `sidebar-rail__actions` div (line 111-133). Nav items go in `sidebar__nav` div (line 166-188). Each uses an SVG with `width="20" height="20"` (rail) or `width="18" height="18"` (nav). Active state uses `--active` modifier class.
- **KnowledgePage pattern**: Self-contained component, useEffect for data load on mount, useState for all state, no external data fetching library. PipelinePage should follow this same pattern.
- **localStorage key**: Use `hermes-pipeline-data` to store serialized PipelineData JSON.

---

## Phase 2: Bridge Backend + Persistence

**Goal**: Move from localStorage to bridge-managed JSON file, add REST API.

### Tasks

| # | Task | Files | Complexity |
|---|------|-------|------------|
| 2.1 | Create pipeline_manager.py with: data path resolution (~/.hermes/bd/), JSON read/write with backup-on-write, CRUD for accounts/activities/action_cards, schema validation on load | pipeline_manager.py | High |
| 2.2 | Add Pydantic request models to app.py (CreateDealRequest, CreateActivityRequest, UpdateDealRequest, etc.) following existing pattern (line 22-48) | app.py | Low |
| 2.3 | Add /api/pipeline/deals endpoints (GET list, POST create, PUT/{id} update, DELETE/{id}) to app.py, following /api/wiki/* pattern | app.py | Medium |
| 2.4 | Add /api/pipeline/activities endpoints (GET list, POST create, GET/{id}, POST/{id}/analyze placeholder) to app.py | app.py | Medium |
| 2.5 | Add /api/pipeline/action-cards endpoints (GET list, GET/{id}, PUT/{id} for status updates) to app.py | app.py | Medium |
| 2.6 | Append pipeline API functions to api.ts: `fetchDeals()`, `createDeal()`, `updateDeal()`, `deleteDeal()`, `fetchActivities()`, `createActivity()`, `fetchActionCards()`, `updateActionCard()` | api.ts | Medium |
| 2.7 | Replace localStorage calls in AccountList/ActivityFeed/ActionCard with api.ts calls | AccountList, ActivityFeed, ActionCard, PipelinePage | Medium |
| 2.8 | Add pipeline data directory creation on bridge startup (add to lifespan in app.py or pipeline_manager init) | pipeline_manager.py or app.py | Low |

### Phase 2 Acceptance Criteria
- [ ] All pipeline data persisted to ~/.hermes/bd/pipeline.json
- [ ] Full CRUD works through REST API (verify with curl)
- [ ] Frontend loads data from bridge, not localStorage
- [ ] Data survives browser refresh
- [ ] JSON file is backed up before each write (pipeline.json.bak)
- [ ] Schema validation on load prevents corrupt data from crashing the bridge

### Implementation Notes for Phase 2
- **Storage pattern**: Follow wiki_manager.py approach -- module-level `PIPELINE_PATH = Path(os.path.expanduser("~/.hermes/bd")).resolve()`, with an `ensure_pipeline_structure()` function called on first access.
- **Backup pattern**: Before writing pipeline.json, copy to pipeline.json.bak using `shutil.copy2()`.
- **EventBus reuse**: The existing `EventBus` in acp_bridge.py (line 24-43) handles WebSocket broadcasting. Pipeline events should use `bridge.event_bus.publish()` directly -- **do NOT create a new events.py module**. The existing events.py is for session event normalization only.
- **API prefix**: Use `/api/pipeline/` to match the existing `/api/wiki/` and `/api/sessions/` patterns.
- **Pydantic models**: Define inside app.py alongside existing models (CreateSessionRequest, PromptRequest, etc.) OR inside pipeline_manager.py and import. Given app.py already imports from wiki_manager, importing from pipeline_manager is consistent.

---

## Phase 3: Hermes Agentic Analysis

**Goal**: The "Hermes Recommendation" button that generates Action Cards.

### Tasks

| # | Task | Files | Complexity |
|---|------|-------|------------|
| 3.1 | Design the analysis prompt (BD skill-based system prompt with MEDDIC framework, stakeholder mapping, risk identification) | pipeline_manager.py | High |
| 3.2 | Implement `analyze_activity()` in pipeline_manager.py: builds context (account + prior activities + current brief), calls Hermes, parses JSON response | pipeline_manager.py | High |
| 3.3 | Add POST /api/pipeline/activities/{id}/analyze endpoint in app.py | app.py, pipeline_manager.py | High |
| 3.4 | Spawn Hermes session for analysis (non-blocking) -- use subprocess or ACP bridge session pattern from acp_bridge.py | pipeline_manager.py | High |
| 3.5 | Parse Hermes JSON response into ActionCard model, validate against schema | pipeline_manager.py | Medium |
| 3.6 | Add "Hermes Recommendation" button to ActivityFeed.tsx | ActivityFeed.tsx | Low |
| 3.7 | Show loading state while Hermes analyzes (spinner + "Hermes is analyzing..." text) | ActivityFeed.tsx | Low |
| 3.8 | Render generated ActionCard inline below the activity | ActivityFeed.tsx, ActionCard.tsx | Medium |
| 3.9 | Add WebSocket event handler for `pipeline.action_card` type in App.tsx socket.onmessage | App.tsx | Medium |
| 3.10 | Auto-refresh feed when card arrives via WebSocket | ActivityFeed.tsx | Low |
| 3.11 | Action Card interactivity: complete/snooze/dismiss items (PATCH /api/pipeline/action-cards/{id}) | ActionCard.tsx, api.ts | Medium |

### Analysis Flow

```
User clicks [Hermes Recommendation] on an activity
    |
    v
POST /api/pipeline/activities/{id}/analyze
    |
    v
Bridge builds analysis context:
  - Account details (stage, deal value, stakeholders, MEDDIC status)
  - Prior activities for this account (last N entries)
  - Current activity brief (meeting notes)
  - System prompt (BD framework: MEDDIC, stakeholder strategy, risk flags)
    |
    v
Bridge spawns Hermes subprocess/ACP session with context
    |
    v
Hermes returns structured JSON:
  {
    immediate_actions: [{text, priority, rationale, deadline}],
    meddic_gaps: [{element, status, next_step}],
    stakeholder_actions: [{stakeholder, role, action, framing}],
    next_meeting_agenda: [string],
    risk_flags: [{flag, severity, mitigation}]
  }
    |
    v
Bridge validates response, creates ActionCard record, saves to pipeline.json
    |
    v
Bridge emits WebSocket event via event_bus.publish():
  {type: "pipeline.action_card", card: ActionCard, timestamp: ...}
    |
    v
Frontend receives event, updates state, renders ActionCard inline
```

### Phase 3 Acceptance Criteria
- [ ] Clicking "Hermes Recommendation" on an activity triggers analysis
- [ ] Loading spinner shows while Hermes thinks
- [ ] Generated Action Card appears with structured recommendations
- [ ] Card sections: Immediate Actions, MEDDIC Gaps, Stakeholder Strategy, Next Meeting Agenda, Risk Flags
- [ ] Can check off completed action items
- [ ] Can dismiss or snooze a card
- [ ] Completed/dismissed state persists across refresh
- [ ] WebSocket push works: card appears without manual refresh

### Implementation Notes for Phase 3
- **Hermes invocation**: Study acp_bridge.py's session creation pattern (line 341-358) for spawning Hermes. The analysis can use a temporary/short-lived session or a direct subprocess call. The key is getting a structured JSON response.
- **WebSocket event**: Use the existing `bridge.event_bus.publish()` pattern. The event type should be `"pipeline.action_card"` (namespaced to avoid collision with session events). Frontend handles it in App.tsx's socket.onmessage block (line 152-226) -- add a new condition after the session-specific checks since pipeline events are global (not tied to a session_id).
- **Graceful degradation**: If Hermes is not available (subprocess fails, timeout), return 503 with a user-friendly error. The "Hermes not available" badge should appear on the button.
- **JSON parsing resilience**: Wrap Hermes response parsing in try/except. If JSON fails, attempt to extract JSON from markdown code blocks (common LLM output pattern). Final fallback: store raw text response and render as-is.

---

## Phase 4: Agentic Loop + Smart Features

**Goal**: Close the loop -- actions feed back into recommendations.

### Tasks

| # | Task | Files | Complexity |
|---|------|-------|------------|
| 4.1 | When BD logs follow-up activity, re-analyze account context and surface updated gaps | pipeline_manager.py | High |
| 4.2 | Auto-generate new Action Card based on completed actions + new activity | pipeline_manager.py | High |
| 4.3 | Action Cards dashboard with priority sorting across all accounts | PipelinePage.tsx, ActionCard.tsx | Medium |
| 4.4 | MEDDIC progress tracker (visual fill per element) | AccountDetailPanel.tsx | Medium |
| 4.5 | Account health score (computed from MEDDIC completion + activity recency + risk flags) | pipeline_manager.py | Medium |
| 4.6 | Pipeline board view (Kanban) with drag-drop stages | PipelinePage.tsx | High |
| 4.7 | "Ask Hermes" free-form chat about any account from detail panel | AccountDetailPanel.tsx, pipeline_manager.py | Medium |

### Phase 4 Acceptance Criteria
- [ ] Completing action items + logging new activity generates updated recommendations
- [ ] Action Cards dashboard shows prioritized list across all accounts
- [ ] MEDDIC progress visible per account
- [ ] Account health score shown in account list
- [ ] Kanban board for pipeline stage management
- [ ] Can ask Hermes open questions about an account from the detail panel

---

## Implementation Order

```
Week 1: Phase 1 (Frontend shell, localStorage)
  --> User sees Pipeline tab, can manually enter data

Week 2: Phase 2 (Bridge backend, persistence)
  --> Data moves to server, survives refresh

Week 3: Phase 3 (Hermes agentic analysis)  *** THE DIFFERENTIATOR ***
  --> "Hermes Recommendation" button generates Action Cards

Week 4: Phase 4 (Smart loop, polish)
  --> Auto-recommendations, Kanban, health scores
```

## Risk & Mitigation

| Risk | Mitigation |
|------|-----------|
| Hermes analysis is slow | Show progressive loading, stream card sections as they arrive |
| JSON parse fails on Hermes output | Wrap in retry, fall back to text rendering of raw response |
| pipeline.json gets corrupted | Backup on every write (pipeline.json.bak), validate schema on load |
| Bridge doesn't have Hermes available | Graceful degradation: show "Hermes not available" badge, allow manual entry |
| Concurrency: multiple tabs writing to pipeline.json | Use file locking (fcntl/flock) or atomic write (write to temp + rename) |

## CSS Naming Convention

All pipeline CSS uses `pipeline-` prefix to avoid conflicts. Follow existing BEM naming from styles.css:

```
/* Pipeline page layout (follows .knowledge-page pattern) */
.pipeline-page
.pipeline-page__header
.pipeline-page__tabs
.pipeline-page__tab
.pipeline-page__tab--active
.pipeline-page__content

/* Account list (follows .knowledge-page__sidebar pattern) */
.account-list
.account-list__search
.account-list__table
.account-list__row
.account-list__row--selected
.account-list__health-score

/* Activity feed */
.activity-feed
.activity-feed__item
.activity-feed__item--analyzed
.activity-feed__brief
.activity-feed__actions
.activity-feed__analyze-btn

/* Action card */
.action-card
.action-card__header
.action-card__section
.action-card__section-title
.action-card__action-item
.action-card__action-item--completed
.action-card__action-item--high-priority
.action-card__status-badge

/* Activity log modal */
.activity-log-modal
.activity-log-modal__overlay
.activity-log-modal__content
.activity-log-modal__form
.activity-log-modal__submit-btn

/* Account detail panel (slide-over) */
.account-detail-panel
.account-detail-panel__overlay
.account-detail-panel__content
.account-detail-panel__header
.account-detail-panel__meddic-tracker

/* Kanban board (Phase 4) */
.pipeline-kanban
.pipeline-kanban__column
.pipeline-kanban__card
.pipeline-kanban__card--dragging
```

## Key Codebase Patterns to Follow

### Frontend
1. **No React Router**: The app uses a single `activeTab` state in App.tsx to switch views. PipelinePage follows the same pattern as KnowledgePage (line 382: `<div className="knowledge-pane"><KnowledgePage /></div>`).
2. **No data fetching library**: All API calls are raw `fetch()` with a shared `readJson<T>()` helper. Pipeline API functions append to api.ts.
3. **Types in separate files**: Main types in types.ts, domain-specific types in types/pipeline.ts (already exists).
4. **Inline SVG icons**: No icon library. All icons are inline SVG with `width`, `height`, `viewBox`, `fill="none"`, `stroke="currentColor"`.
5. **CSS variables**: Use existing CSS vars from :root (--bg-primary, --accent, --border, --radius-*, etc.).

### Backend
1. **FastAPI app factory**: `create_app(config)` in app.py. All routes defined inside this function.
2. **Pydantic request models**: Defined at module level (lines 22-48 in app.py). Use `Field(min_length=1)` for validation.
3. **Manager modules**: Domain logic lives in separate modules (wiki_manager.py, pipeline_manager.py) -- app.py only handles routing and HTTP concerns.
4. **EventBus**: WebSocket events go through `bridge.event_bus.publish()`. The existing events.py is for session event normalization, NOT for custom domain events.
5. **HTTP errors**: Use `HTTPException(status_code=404, detail="...")` consistently.
6. **Path safety**: wiki_manager.py demonstrates path traversal prevention (line 99-101). Apply same pattern to pipeline.json path resolution.
