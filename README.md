# Vyrdly Backend

REST API and real-time server for the Vyrdly collaborative study platform.

Built with **Express**, **Socket.IO**, **Drizzle ORM**, **PostgreSQL**, **Redis**, and **BullMQ**.

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | >= 20 |
| npm | >= 10 |
| PostgreSQL | >= 15 |
| Redis | >= 7 |

> You can run PostgreSQL and Redis locally with Docker — see the `docker-compose.yaml` at the root of this directory.

---

## Local Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy the example env file and fill in your values
cp .env.example .env

# 3. Start PostgreSQL + Redis (if using Docker)
docker compose up -d

# 4. Run database migrations
npm run db:migrate

# 5. (Optional) Seed the database with sample data
npm run db:seed

# 6. Start the dev server
npm run dev
```

The server will start on the port defined by `PORT` in your `.env` (default: `3000`).

---

## Environment Variables

Copy `.env.example` to `.env` and replace all placeholder values.

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | HTTP server port (default: `3000`) |
| `NODE_ENV` | No | `development` \| `production` \| `test` |
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `JWT_SECRET` | ✅ | Secret key for signing JWTs — use a long random string |
| `JWT_EXPIRES_IN` | No | JWT expiry duration (default: `7d`) |
| `REDIS_URL` | ✅ | Redis connection string |
| `CLOUDINARY_CLOUD_NAME` | ✅ | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | ✅ | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | ✅ | Cloudinary API secret |
| `GEMINI_API_KEY` | ✅ | Google Gemini API key |
| `RESEND_API_KEY` | No | Resend email API key |
| `EMAIL_FROM` | No | Sender address for transactional emails |
| `CLIENT_URL` | ✅ | Frontend origin URL (used for CORS and Socket.IO) |

> ⚠️ **Never commit your `.env` file.** It is listed in `.gitignore`.

---

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start dev server with hot reload (`tsx watch`) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled production build |
| `npm run db:generate` | Generate a new Drizzle migration from schema changes |
| `npm run db:migrate` | Apply pending migrations to the database |
| `npm run db:studio` | Open Drizzle Studio (visual DB browser) |
| `npm run db:seed` | Seed the database with sample data |

---

## Project Structure

```
src/
├── app.ts              # Express app setup (middleware, routes)
├── index.ts            # Server entry point (HTTP + Socket.IO startup)
├── socket.ts           # Socket.IO initialisation and handler registration
├── config/             # Environment, DB, Redis, Cloudinary config
├── db/                 # Drizzle schema and seed scripts
├── jobs/               # BullMQ background job workers
├── lib/                # Shared utilities
├── middleware/         # Express middleware (auth, error, rate limiting)
├── modules/            # Feature modules (auth, users, groups, sessions…)
├── socket/             # Socket handlers and middleware
│   ├── handlers/       # Per-feature socket event handlers
│   └── middleware/     # Socket auth middleware
└── types/              # Shared TypeScript types
```

---

## API Overview

All routes are prefixed with `/api`.

| Prefix | Module |
|--------|--------|
| `/api/auth` | Authentication (register, login, refresh) |
| `/api/users` | User profiles |
| `/api/groups` | Study groups |
| `/api/sessions` | Study sessions |
| `/api/messages` | Group messaging |
| `/api/notifications` | User notifications |
| `/api/toolkit` | Study toolkit (AI-powered tools) |
| `/api/quizzes` | Quiz creation and management |
| `/api/discover` | Discover groups and content |

A health check is available at `GET /health`.

---

## Real-Time (Socket.IO)

The Socket.IO server is attached to the same HTTP server as the REST API. Clients must authenticate by passing a JWT in the `auth.token` field on connect:

```js
import { io } from 'socket.io-client'

const socket = io(SOCKET_URL, {
  auth: { token: '<jwt>' },
  transports: ['websocket'],
})
```

Registered event namespaces: **presence**, **chat**, **session**, **quiz**, **toolkit**.
