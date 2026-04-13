# Hermes Workspace UI

React frontend for the Hermes ACP bridge.

## Run

Start the bridge first:

```bash
cd workspace-bridge
hermes-workspace-bridge
```

Then start the UI:

```bash
cd workspace-ui
npm install
npm run dev
```

The Vite dev server proxies `/api` and `/ws` to `http://127.0.0.1:8742` by
default. Override with `WORKSPACE_BRIDGE_ORIGIN` when needed.
