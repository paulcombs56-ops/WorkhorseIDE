# Frontend Regression Checklist

Use this checklist after frontend refactors and before releases.

## Startup

- [ ] Open `http://localhost:3001/index.html` and confirm no blocking errors in browser console.
- [ ] Confirm Monaco editor loads and accepts input.
- [ ] Confirm file explorer panel loads a tree from workspace root.

## Editor + Execution

- [ ] Switch language selector between JavaScript and Python; syntax highlighting updates.
- [ ] Run JavaScript sample and verify output appears in console panel.
- [ ] Run Python sample and verify streamed output appears without layout breakage.
- [ ] Format code and verify editor content updates.

## Chat + AI Routes

- [ ] In chat transport selector, choose `Agent` and send a prompt; response renders in chat.
- [ ] Choose `Provider` and send a prompt; response renders and does not break chat history.
- [ ] Switch chat model from selector and confirm model-change log appears in console.
- [ ] Use Analyze/Refactor/Generate Docs buttons and verify panel output updates.

## Explorer + File Actions

- [ ] Expand/collapse folders in file explorer.
- [ ] Open a file from explorer and confirm editor content/language update.
- [ ] If AI proposes file actions, preview and apply one change, then undo.

## Layout + Shortcuts

- [ ] Drag left and right panel resizers; panels resize correctly.
- [ ] Drag console resizer; editor/console heights update correctly.
- [ ] Press `Ctrl+Enter` to run code.
- [ ] Use Up/Down arrows (outside chat input) to navigate command history.

## Security + Compatibility

- [ ] If `WORKHORSE_API_TOKEN` is enabled, protected routes succeed only with token.
- [ ] Verify `/api/ai/health` returns provider status.
- [ ] If legacy route is enabled, verify `/ai/health` includes deprecation headers.
