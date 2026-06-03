const express = require("express");
const { Pool } = require("pg");
const Redis = require("ioredis");
const client = require("prom-client");

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

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const tasksCreatedTotal = new client.Counter({
  name: "tasks_created_total",
  help: "Liczba utworzonych zadań",
  registers: [register]
});

const httpRequestsTotal = new client.Counter({
  name: "http_requests_total",
  help: "Liczba zapytań HTTP",
  labelNames: ["method", "path", "status"],
  registers: [register]
});

const httpRequestDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "Czas trwania zapytań HTTP",
  labelNames: ["method", "path"],
  registers: [register]
});

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  const end = httpRequestDuration.startTimer({ method: req.method, path: req.path });
  res.on("finish", () => {
    httpRequestsTotal.inc({ method: req.method, path: req.path, status: res.statusCode });
    end();
  });
  next();
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/metrics", async (req, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

app.post("/tasks", async (req, res) => {
  const { title } = req.body;
  if (!title) {
    return res.status(400).json({ error: "title is required" });
  }

  try {
    const result = await pool.query(
      "INSERT INTO tasks (title) VALUES ($1) RETURNING id",
      [title]
    );
    const id = result.rows[0].id;

    await redis.lpush("tasks_queue", `NEW_TASK:${id}:${title}`);
    tasksCreatedTotal.inc();

    res.status(201).json({ id, title });
  } catch (err) {
    console.error("Error inserting task:", err);
    res.status(500).json({ error: "internal error" });
  }
});

app.get("/tasks", async (req, res) => {
  try {
    const result = await pool.query("SELECT id, title FROM tasks ORDER BY id");
    res.json({ tasks: result.rows });
  } catch (err) {
    console.error("Error fetching tasks:", err);
    res.status(500).json({ error: "internal error" });
  }
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});