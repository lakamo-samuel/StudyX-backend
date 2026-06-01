import rateLimit from 'express-rate-limit';

export const authRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    message: { message: 'Too many attempts, please try again in a minute' },
    standardHeaders: true,
    legacyHeaders: false
})

export const generalRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    message: { message: "Too many requests, please slow down" },
    standardHeaders: true,
    legacyHeaders: false,
})