const { Pool } = require("pg");
const Redis = require("ioredis");
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const DB_HOST = process.env.DB_HOST || "postgres";
const DB_PORT = parseInt(process.env.DB_PORT || "5432", 10);
const DB_NAME = process.env.DB_NAME || "tasksdb";
const DB_USER = process.env.DB_USER || "tasksuser";
const DB_PASSWORD = process.env.DB_PASSWORD || "taskspass";

const REDIS_HOST = process.env.REDIS_HOST || "redis";
const REDIS_PORT = parseInt(process.env.REDIS_PORT || "6379", 10);

const pool = new Pool({
  host: DB_HOST,
  port: DB_PORT,
  database: DB_NAME,
  user: DB_USER,
  password: DB_PASSWORD
});

const redis = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT
});

async function main() {
  console.log("Worker started, waiting for tasks...");

  while (true) {
    try {
      const result = await redis.blpop("tasks_queue", 5);
      if (result) {
        const [, payload] = result;
        console.log("Worker got message:", payload);
      } else {
        await sleep(1000);
      }
    } catch (err) {
      console.error("Worker error:", err);
      await sleep(2000);
    }
  }
}

main().catch(err => {
  console.error("Fatal worker error:", err);
  process.exit(1);
});