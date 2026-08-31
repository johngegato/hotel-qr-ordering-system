# Chat History

This folder stores AI agent conversation summaries for the **Hotel QR Ordering System** project.

Each file represents a session or a group of related sessions with an AI coding assistant (Antigravity / Claude / Gemini).

---

## Purpose

- **Recovery**: If something breaks, scroll back to the relevant session log to understand what changed and why.
- **Context**: Future agents can read these to understand decisions made in past sessions without re-reading thousands of lines of code.
- **Audit trail**: Every meaningful architectural decision, bug fix, and feature addition is documented here alongside the Git commit SHA.

---

## Naming Convention

Files are named: `YYYY-MM-DD_topic-summary.md`

Examples:
- `2026-08-30_background-service-fcm-push.md`
- `2026-08-31_eas-build-firebase-setup.md`
- `2026-08-31_taskqueue-bug-fixes-fab-ui.md`

---

## Sessions Index

| Date | File | Topics Covered |
|------|------|----------------|
| 2026-08-30 | [2026-08-30_background-service-fcm-push.md](./2026-08-30_background-service-fcm-push.md) | Background watchdog, WebSocket reconnect, battery optimization, FCM push dispatch, DB migration 18 |
| 2026-08-31 | [2026-08-31_foreground-service-type-push-diagnostics.md](./2026-08-31_foreground-service-type-push-diagnostics.md) | FOREGROUND_SERVICE_REMOTE_MESSAGING fix, FCM diagnostics suite (web + app), multi-strategy token resolution |
| 2026-08-31 | [2026-08-31_eas-build-firebase-setup.md](./2026-08-31_eas-build-firebase-setup.md) | Firebase project setup, google-services.json, EAS credentials, account migration to @johngegato |
| 2026-08-31 | [2026-08-31_taskqueue-bug-fixes-fab-ui.md](./2026-08-31_taskqueue-bug-fixes-fab-ui.md) | TaskQueue room number bug fix, FCM button moved to floating FAB |

---

## How to Add a New Entry

1. Create a new `.md` file using the naming convention above.
2. Add a one-line entry to the Sessions Index table above.
3. Commit with message: `docs: add chat history for YYYY-MM-DD session`
