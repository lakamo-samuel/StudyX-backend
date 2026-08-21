import rateLimit from 'express-rate-limit';

export const authRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 7,
    message: { message: 'Too many attempts, please try again in a minute' },
    standardHeaders: true,
    legacyHeaders: false,
});

export const generalRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    message: { message: "Too many requests, please slow down" },
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * Strict rate limit for AI-powered endpoints (quiz generation, agenda, chat).
 * 5 requests per minute — prevents token/credit abuse.
 * Authenticate middleware runs before this, so only logged-in users reach it.
 */
export const aiRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    message: { message: "Too many AI requests. Please wait a moment before trying again." },
    standardHeaders: true,
    legacyHeaders: false,
});