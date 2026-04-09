# Pulse Assistant

Standalone local-first companion app extracted from Workhorse IDE.

## Features

- Shared notes, tasks, and reminders
- Sync by private code across phone and desktop
- Offline-capable PWA frontend
- Local JSON-backed state store

## Run

```bash
cd pulse-assistant
npm install
npm start
```

Open `http://localhost:3010`.

## Test

```bash
cd pulse-assistant
npm test
```

## Environment

- `PORT`: HTTP port for the standalone app, defaults to `3010`
- `PULSE_STORE_FILE`: optional path to the JSON sync store