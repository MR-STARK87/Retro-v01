# Deployment Guide (Render)

This repository contains a Node.js + Express + MongoDB backend that provides:

- Chat endpoint using Groq API (`/chat`)
- Notes CRUD + enhancement endpoints (`/notes`, `/notes/enhance`)
- Flashcard generation endpoint (`/cards/generate`)
- Health check (`/health`)

It is now prepared for deployment on [Render](https://render.com/).

## 1. Prerequisites

- Render account
- MongoDB database (MongoDB Atlas or Render External DB)
- Groq API key (optional if you need AI features)

## 2. Important Files

| File           | Purpose                                                |
| -------------- | ------------------------------------------------------ |
| `package.json` | Declares start script (`npm start`) and Node engine    |
| `src/index.js` | Express server, security middleware, graceful shutdown |
| `render.yaml`  | (Optional) Blueprint spec for Render deployment        |
| `.env.example` | Template of required environment variables             |

## 3. Environment Variables

Create a `.env` locally for development (DO NOT COMMIT). In Render, add these via the Dashboard UI:

| Name           | Required | Description                             |
| -------------- | -------- | --------------------------------------- |
| `MONGO_URI`    | Yes      | Connection string to MongoDB cluster    |
| `GROQ_API_KEY` | Optional | Enables AI responses & enhancements     |
| `CORS_ORIGIN`  | Optional | Comma separated list of allowed origins |
| `JSON_LIMIT`   | Optional | Increase JSON body limit (default 1mb)  |
| `NODE_ENV`     | Auto     | Render sets to `production`             |

Render automatically injects `PORT`.

## 4. Deploy Methods

### Option A: Blueprint (Infrastructure as Code)

1. Commit `render.yaml` to `main`.
2. In Render UI: New + > Blueprint > Select repository.
3. Confirm service `retro-backend` is detected.
4. Add environment variables.
5. Deploy.

### Option B: Manual Web Service

1. Push repo to GitHub.
2. Render UI: New + > Web Service > Pick repo.
3. Root directory: `/`.
4. Build Command: `npm install`
5. Start Command: `npm start`
6. Add environment variables.
7. Deploy.

## 5. Health Check

Render will use `GET /health` (configured in `render.yaml`). Response example:

```
{
  "status": "ok",
  "mongoState": 1
}
```

`mongoState` values: 0=disconnected, 1=connected, 2=connecting, 3=disconnecting.

## 6. Logging & Monitoring

- Structured console logs appear in Render Logs.
- Add external logging later (e.g., Logtail, Datadog) if needed.

## 7. Security Hardening Already Added

- `helmet` for basic security headers
- `cors` with optional origin restriction
- Central error handler & 404 handler
- Graceful shutdown closing Mongo connection

## 8. Recommended Next Enhancements (Post-Deploy)

- Add request rate limiting (e.g. express-rate-limit)
- Add authentication / API keys per user
- Swap in persistent chat + note history user separation
- Add Prisma/Redis for session or caching if needed
- Add tests (currently none) & CI workflow
- Implement pagination for large note sets
- Add input validation layer (zod / joi) per route

## 9. Local Development

```
cp .env.example .env
# edit .env then
npm install
npm run dev
```

Visit: http://localhost:3000/health

## 10. Curl Smoke Tests

```
# Health
curl -s http://localhost:3000/health

# Create / upsert note
curl -s -X POST http://localhost:3000/notes -H "Content-Type: application/json" \
  -d '{"id":"note_1","title":"Test","html":"<p>Hello</p>","delta":{}}'

# List notes
curl -s http://localhost:3000/notes
```

---

Happy shipping 🚀
