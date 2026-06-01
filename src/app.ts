import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { errorhandler } from './middleware/error.middleware'
import { generalRateLimit } from './middleware/rateLimit.middleware'

import { env } from './config/env'

import authRoutes from './modules/auth/auth.routes'
import usersRoutes from "./modules/users/users.routes";
import groupsRoutes from "./modules/groups/groups.routes";

const app = express()


//Security

app.use(helmet());
app.use(cors({
    origin: env.CLIENT_URL,
    credentials: true
}))

//rate limiter
app.use(generalRateLimit)

//Body parsing

app.use(express.json());
app.use(express.urlencoded({ extended: true }))

// Health check

app.get('/health', (req, res) => {
    res.json({status: "ok", message: 'Vryd API is running'})
})

// ── ROUTES ──
app.use('/api/auth', authRoutes)
app.use("/api/users", usersRoutes);
app.use("/api/groups", groupsRoutes);
// app.use('/api/sessions', sessionRoutes)
// app.use('/api/toolkit', toolkitRoutes)
// app.use('/api/quizzes', quizRoutes)
// app.use('/api/messages', messageRoutes)
// app.use('/api/notifications', notificationRoutes)
// app.use('/api/discover', discoverRoutes)


// error handler

app.use(errorhandler)

export default app