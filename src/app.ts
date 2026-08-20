import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { errorhandler } from './middleware/error.middleware'
import { generalRateLimit } from './middleware/rateLimit.middleware'

import { env } from './config/env'

import authRoutes from './modules/auth/auth.routes'
import usersRoutes from "./modules/users/users.routes";
import groupsRoutes from "./modules/groups/groups.routes";
import sessionsRoutes from './modules/sessions/sessions.routes'
import messagesRoutes from './modules/messages/messages.routes'
import notificationsRoutes from "./modules/notifications/notifications.routes";
import toolkitRoutes from "./modules/toolkit/toolkit.routes";
import quizzesRoutes from "./modules/quizzes/quizzes.routes";
import discoverRoutes from "./modules/discover/discover.routes";
import billingRoutes from "./modules/billing/billing.routes";
import {
    logger
    
} from './lib/logger';
 import pinoHttp from 'pino-http'
const app = express()

// Trust the first proxy hop (required when behind localtunnel, ngrok, nginx, etc.)
// This lets express-rate-limit and req.ip work correctly with X-Forwarded-For
app.set('trust proxy', 1)

//Security
app.use(helmet());
app.use(cors({
    origin: env.CLIENT_URL,
    credentials: true
}))
app.use(pinoHttp({
    logger,
    autoLogging: process.env.NODE_ENV === 'production'
}))

// Webhook route MUST be registered before the rate limiter and body parser
// so Flutterwave's POST is never blocked or interfered with
import { flutterwaveWebhookController } from './modules/billing/billing.controller'
app.post('/api/billing/webhooks/flutterwave', express.json(), flutterwaveWebhookController)

// Rate limiter for all other routes
app.use(generalRateLimit)

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }))

// Health check

app.get('/health', (req, res) => {
    res.json({status: "ok", message: 'Vyrdly API is running'})
})

// ── ROUTES ──
app.use('/api/auth', authRoutes)
app.use("/api/users", usersRoutes);
app.use("/api/groups", groupsRoutes);
 app.use("/api/sessions", sessionsRoutes);
app.use('/api/toolkit', toolkitRoutes)
app.use("/api/quizzes", quizzesRoutes);
app.use("/api/messages", messagesRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use('/api/discover', discoverRoutes)
app.use('/api/billing', billingRoutes)


// error handler

app.use(errorhandler)

export default app