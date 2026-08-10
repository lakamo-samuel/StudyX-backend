import { Redis } from 'ioredis';
import { env } from "./env";

const isTls = env.REDIS_URL.startsWith("rediss://");

export const redis = new Redis(env.REDIS_URL, {
  tls: isTls ? {} : undefined,
  maxRetriesPerRequest: null,
});

redis.on('connect', () => {
    console.log('Redis connected')
})
redis.on('error', (err) => {
    console.log('Redis error', err)
})