import "dotenv/config";
import app from "./app";
import { env } from "./config/env";
import { redis } from "./config/redis";
import { db } from "./config/db";
import { sql } from "drizzle-orm";


const PORT = env.PORT || 5000

const start = async () => {
    try {
        // test db
        await db.execute(sql`SELECT 1`)
        console.log('Database connected')

        //test redis

        await redis.ping()
        console.log('Redis is conneced')

        //start server

        app.listen(PORT, () => {
            console.log(`server is running on port ${PORT}`)
            console.log(`server is running on port ${PORT}`)
        })
    }
    catch (err) {
        console.error('Failed to start server:', err);
        process.exit(1)
    }
}
start();