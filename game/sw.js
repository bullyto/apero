// PATH: worker.js
// Cloudflare Worker — Carte de fidélité ADN66
// D1 binding expected: env.DB
// Secrets expected (set as Worker vars/secrets):
// - ADMIN_KEY   (ex: "test123")
// - PHONE_SALT  (random long string; keep secret)
//
// Routes:
// - POST /loyalty/register
// - GET  /loyalty/me
// - POST /loyalty/stamp
// - POST /loyalty/redeem (optional; stub ready)
// - GET  /admin/loyalty/search
// - GET  /admin/loyalty/qr
// - GET  /health
// - GET  / (debug)

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return corsPreflight(request);
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/g, "") || "/";
    const method = request.method.toUpperCase();

    // CORS (simple + permissive). Adjust origins if you want to restrict.
    if (method === "OPTIONS") return corsPreflight(request);

    try {
      // Basic health
      if (method === "GET" && path === "/health") {
        return json({ ok: true, service: "adn66-loyalty", ts: new Date().toISOString() }, 200);
      }

      // Debug root
      if (method === "GET" && path === "/") {
        return json(
          {
            ok: true,
            service: "adn66-loyalty",
            routes: [
              "POST /loyalty/register",
              "GET  /loyalty/me",
              "POST /loyalty/stamp",
              "POST /loyalty/redeem",
              "GET  /admin/loyalty/search",
              "GET  /admin/loyalty/qr",
              "GET  /health",
            ],
          },
          200
        );
      }

      // Ensure DB exists
      if (!env || !env.DB) return json({ ok: false, error: "missing_d1_binding", hint: "Bind D1 as env.DB" }, 500);

      // Auto-init tables (idempotent)
      // This runs on-demand; safe and simple for your use-case.
      await ensureSchema(env);

      // Routes
      if (path === "/loyalty/register" && method === "POST") return handleRegister(request, env);
      if (path === "/loyalty/me" && method === "GET") return handleMe(request, env, url);
      if (path === "/loyalty/stamp" && method === "POST") return handleStamp(request, env);
      if (path === "/loyalty/redeem" && method === "POST") return handleRedeem(request, env); // optional

      if (path === "/admin/loyalty/search" && method === "GET") return handleAdminSearch(request, env, url);
      if (path === "/admin/loyalty/qr" && method === "GET") return handleAdminQR(request, env, url);

      if (path === "/game/reward/request" && method === "POST") return handleGameRewardRequest(request, env);
      if (path === "/loyalty/reward/consume" && method === "POST") return handleRewardConsume(request, env);

      return json({ ok: false, error: "not_found", path, method }, 404);
    } catch (err) {
      return json({ ok: false, error: "server_error", message: safeMsg(err) }, 500);
    }
  },
};

/* ------------------------------- Handlers ------------------------------- */

async function handleRegister(request, env) {
  // body: { name, phone }
  const body = await readJson(request);
  const name = normalizeName(body?.name);
  const phoneRaw = normalizePhone(body?.phone);

  if (!name) return json({ ok: false, error: "name_required" }, 400);
  if (!phoneRaw) return json({ ok: false, error: "phone_invalid" }, 400);

  const phoneLast4 = phoneRaw.slice(-4);
  const phoneHash = await phoneHashWithSalt(phoneRaw, env.PHONE_SALT || "");

  // Try find existing client by phone_hash
  const existing = await env.DB.prepare(
    "SELECT client_id, name, phone_last4, created_at FROM loyalty_clients WHERE phone_hash = ? LIMIT 1"
  )
    .bind(phoneHash)
    .first();

// Cleanup rule: if card has 0 stamp and is older than 30 days -> delete it, then allow re-creation
if (existing?.client_id) {
  const st = await env.DB.prepare("SELECT s.points, c.created_at " +
      "FROM loyalty_clients c " +
      "JOIN loyalty_state s ON s.client_id = c.client_id " +
      "WHERE c.client_id = ? LIMIT 1")
    .bind(existing.client_id)
    .first();

  const points0 = Number(st?.points || 0) === 0;
  const createdMs = st?.created_at ? Date.parse(String(st.created_at)) : NaN;
  const tooOld = Number.isFinite(createdMs) && (Date.now() - createdMs) >= 30 * 24 * 60 * 60 * 1000;

  if (points0 && tooOld) {
    await env.DB.prepare("DELETE FROM loyalty_clients WHERE client_id = ?").bind(existing.client_id).run();
    await logAction(env, existing.client_id, "register_cleanup_30d", {});
    // continue: will create new client below
  } else {
    // ✅ Solution 2: création UNIQUEMENT
    // Si le téléphone existe déjà: on ne modifie rien et on NE renvoie PAS client_id
    return json(
      {
        ok: true,
        exists: true,
        phone_last4: existing.phone_last4 || phoneLast4,
        note: "Card already exists for this phone. Use the recovery flow (admin QR) to restore.",
      },
      200
    );
  }
}

  // Create new client
  const clientId = crypto.randomUUID();
  const nowIso = new Date().toISOString();

  await env.DB.prepare(
    "INSERT INTO loyalty_clients (client_id, name, phone_hash, phone_last4, created_at) VALUES (?, ?, ?, ?, ?)"
  )
    .bind(clientId, name, phoneHash, phoneLast4, nowIso)
    .run();

  await env.DB.prepare(
    "INSERT INTO loyalty_state (client_id, points, goal, completed_at, last_stamp_ts, updated_at) VALUES (?, 0, 8, NULL, NULL, ?)"
  )
    .bind(clientId, nowIso)
    .run();

  await logAction(env, clientId, "register", { name, phone_last4: phoneLast4 });

  // IMPORTANT: do not leak phone number or hash
  return json(
    {
      ok: true,
      created: true,
      client_id: clientId,
      name,
      phone_last4: phoneLast4,
      note: "Store client_id locally (localStorage) and use it to fetch /loyalty/me",
    },
    200
  );
}

async function handleMe(request, env, url) {
  const clientId = getClientId(request, url);
  if (!clientId) return json({ ok: false, error: "client_id_required" }, 400);

  // Load state
  const row = await env.DB.prepare("SELECT c.client_id, c.name, c.phone_last4, c.created_at, s.points, s.goal, s.completed_at, s.last_stamp_ts, s.updated_at FROM loyalty_clients c JOIN loyalty_state s ON s.client_id = c.client_id WHERE c.client_id = ? LIMIT 1")
    .bind(clientId)
    .first();

  if (!row) return json({ ok: false, error: "not_found" }, 404);

// Auto-reset if completed more than 24h ago
const now = Date.now();
let points = Number(row.points || 0);

// Cleanup rule: delete cards with 0 stamp older than 30 days
const createdMs = row.created_at ? Date.parse(String(row.created_at)) : NaN;
if (Number(points) === 0 && Number.isFinite(createdMs) && (Date.now() - createdMs) >= 30 * 24 * 60 * 60 * 1000) {
  await env.DB.prepare("DELETE FROM loyalty_clients WHERE client_id = ?").bind(clientId).run();
  await logAction(env, clientId, "me_cleanup_30d", {});
  return json({ ok: false, error: "expired_deleted" }, 404);
}

  let goal = Number(row.goal || 8);
  let completedAt = row.completed_at ? String(row.completed_at) : null;

  if (completedAt) {
    const completedMs = Date.parse(completedAt);
    if (Number.isFinite(completedMs) && now - completedMs >= 24 * 60 * 60 * 1000) {
      const nowIso = new Date().toISOString();
      await env.DB.prepare(
        "UPDATE loyalty_state SET points = 0, goal = 8, completed_at = NULL, last_stamp_ts = NULL, updated_at = ? WHERE client_id = ?"
      )
        .bind(nowIso, clientId)
        .run();
      await logAction(env, clientId, "auto_reset_24h", {});
      points = 0;
      goal = 8;
      completedAt = null;
    }
  }

  // Response: no technical IDs beyond client_id (needed for QR + API)
  return json(
    {
      ok: true,
      card: {
        name: row.name,
        phone_last4: row.phone_last4,
        points,
        goal,
        completed: points >= goal,
        completed_at: completedAt,
      },
    },
    200
  );
}

async function handleStamp(request, env) {
  // Admin action: add +1 point with cooldown
  // body: { admin_key, client_id }
  const body = await readJson(request);
  const adminKey = String(body?.admin_key || "").trim();
  const clientId = String(body?.client_id || "").trim();

  if (!isAdmin(adminKey, env)) return json({ ok: false, error: "unauthorized" }, 401);
  if (!clientId) return json({ ok: false, error: "client_id_required" }, 400);

  const nowIso = new Date().toISOString();
  const nowMs = Date.now();

  // Load current state
  const state = await env.DB.prepare(
    "SELECT points, goal, completed_at, last_stamp_ts FROM loyalty_state WHERE client_id = ? LIMIT 1"
  )
    .bind(clientId)
    .first();

  if (!state) return json({ ok: false, error: "not_found" }, 404);

  const goal = Number(state.goal || 8);
  let points = Number(state.points || 0);
  const completedAt = state.completed_at ? String(state.completed_at) : null;

  // If already completed, keep completed_at and refuse new stamp (unless auto-reset happened via /me)
  if (points >= goal || completedAt) {
    await logAction(env, clientId, "stamp_refused_already_completed", { points, goal });
    return json({ ok: false, error: "already_completed", points, goal }, 409);
  }

  // Cooldown anti-abus (default 60s)
  const COOLDOWN_MS = 60_000;
  const lastTs = state.last_stamp_ts ? Date.parse(String(state.last_stamp_ts)) : NaN;
  if (Number.isFinite(lastTs) && nowMs - lastTs < COOLDOWN_MS) {
    const waitMs = COOLDOWN_MS - (nowMs - lastTs);
    await logAction(env, clientId, "stamp_refused_cooldown", { wait_ms: waitMs });
    return json({ ok: false, error: "cooldown", wait_ms: waitMs }, 429);
  }

  points = points + 1;
  const willComplete = points >= goal;
  const newCompletedAt = willComplete ? nowIso : null;

  await env.DB.prepare(
    "UPDATE loyalty_state SET points = ?, completed_at = ?, last_stamp_ts = ?, updated_at = ? WHERE client_id = ?"
  )
    .bind(points, newCompletedAt, nowIso, nowIso, clientId)
    .run();

  await logAction(env, clientId, "stamp", { points, goal, completed: willComplete });

  return json({ ok: true, points, goal, completed: willComplete, completed_at: newCompletedAt }, 200);
}

async function handleRedeem(request, env) {
  // Optional route: mark a reward redeemed after completion (if you decide to use it)
  // body: { admin_key, client_id }
  const body = await readJson(request);
  const adminKey = String(body?.admin_key || "").trim();
  const clientId = String(body?.client_id || "").trim();

  if (!isAdmin(adminKey, env)) return json({ ok: false, error: "unauthorized" }, 401);
  if (!clientId) return json({ ok: false, error: "client_id_required" }, 400);

  const state = await env.DB.prepare(
    "SELECT points, goal, completed_at FROM loyalty_state WHERE client_id = ? LIMIT 1"
  )
    .bind(clientId)
    .first();

  if (!state) return json({ ok: false, error: "not_found" }, 404);

  const points = Number(state.points || 0);
  const goal = Number(state.goal || 8);
  const completedAt = state.completed_at ? String(state.completed_at) : null;

  if (!(points >= goal && completedAt)) {
    return json({ ok: false, error: "not_completed" }, 409);
  }

  // For now: just log. You can extend with loyalty_rewards table if needed.
  await logAction(env, clientId, "redeem", { points, goal, completed_at: completedAt });

  return json({ ok: true, redeemed: true }, 200);
}

async function handleAdminSearch(request, env, url) {
  // Admin action: search by phone
  // GET /admin/loyalty/search?admin_key=...&phone=...
  const adminKey = String(url.searchParams.get("admin_key") || "").trim();
  if (!isAdmin(adminKey, env)) return json({ ok: false, error: "unauthorized" }, 401);

  const phoneRaw = normalizePhone(url.searchParams.get("phone"));
  if (!phoneRaw) return json({ ok: false, error: "phone_invalid" }, 400);

  const phoneHash = await phoneHashWithSalt(phoneRaw, env.PHONE_SALT || "");
  const row = await env.DB.prepare("SELECT c.client_id, c.name, c.phone_last4, c.created_at, s.points, s.goal, s.completed_at, s.updated_at FROM loyalty_clients c JOIN loyalty_state s ON s.client_id = c.client_id WHERE c.phone_hash = ? LIMIT 1")
    .bind(phoneHash)
    .first();

if (!row) return json({ ok: true, found: false }, 200);

// Cleanup rule: if 0 stamp and older than 30 days -> delete and report not found
const createdMs = row.created_at ? Date.parse(String(row.created_at)) : NaN;
const points = Number(row.points || 0);
if (points === 0 && Number.isFinite(createdMs) && (Date.now() - createdMs) >= 30 * 24 * 60 * 60 * 1000) {
  await env.DB.prepare("DELETE FROM loyalty_clients WHERE client_id = ?").bind(row.client_id).run();
  await logAction(env, row.client_id, "admin_cleanup_30d", {});
  return json({ ok: true, found: false }, 200);
}

  // Admin can receive client_id (needed to show QR and stamp), but DO NOT expose elsewhere.
  return json(
    {
      ok: true,
      found: true,
      client: {
        client_id: row.client_id,
        name: row.name,
        phone_last4: row.phone_last4,
        points: Number(row.points || 0),
        goal: Number(row.goal || 8),
        completed_at: row.completed_at ? String(row.completed_at) : null,
        created_at: row.created_at ? String(row.created_at) : null,
      },
    },
    200
  );
}

async function handleAdminQR(request, env, url) {
  // Admin action: return QR payload (client_id) for recovery
  // GET /admin/loyalty/qr?admin_key=...&client_id=...
  const adminKey = String(url.searchParams.get("admin_key") || "").trim();
  if (!isAdmin(adminKey, env)) return json({ ok: false, error: "unauthorized" }, 401);

  const clientId = String(url.searchParams.get("client_id") || "").trim();
  if (!clientId) return json({ ok: false, error: "client_id_required" }, 400);

  const exists = await env.DB.prepare("SELECT client_id FROM loyalty_clients WHERE client_id = ? LIMIT 1")
    .bind(clientId)
    .first();
  if (!exists) return json({ ok: false, error: "not_found" }, 404);

  await logAction(env, clientId, "admin_qr", {});

  // QR payload is simply client_id as agreed (UUID/ULID)
  // Your admin UI can render a QR code from this string.
  return json({ ok: true, qr_payload: clientId }, 200);
}

/* ---------------------------- Game Reward API ---------------------------- */

// POST /game/reward/request
// body: { client_id, milestone? }  milestone defaults to "GAME_25"
// Server-side rule: 1 reward per (client_id, milestone) — blocks localStorage reset abuse.
async function handleGameRewardRequest(request, env) {
  const body = await readJson(request);
  const clientId = String(body?.client_id || "").trim();
  const milestone = String(body?.milestone || "GAME_25").trim();

  if (!clientId) return json({ ok: false, error: "client_id_required" }, 400);

  // Must exist
  const client = await env.DB.prepare(
    "SELECT client_id FROM loyalty_clients WHERE client_id = ? LIMIT 1"
  ).bind(clientId).first();
  if (!client) return json({ ok: false, error: "not_found" }, 404);

  // Already claimed?
  const claimed = await env.DB.prepare(
    "SELECT claimed_at FROM reward_claims WHERE client_id = ? AND milestone = ? LIMIT 1"
  ).bind(clientId, milestone).first();

  if (claimed) {
    await logAction(env, clientId, "reward_request_refused_already_claimed", { milestone });
    return json({ ok: false, error: "already_claimed", milestone }, 409);
  }

  // Create a short-lived token (10 minutes)
  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + 10 * 60_000).toISOString();
  const token = generateToken();

  const ua = request.headers.get("user-agent") || "";
  const meta = JSON.stringify({ ua });

  await env.DB.prepare(
    "INSERT INTO reward_tokens (token, client_id, milestone, created_at, expires_at, used_at, meta) VALUES (?, ?, ?, ?, ?, NULL, ?)"
  ).bind(token, clientId, milestone, nowIso, expiresAt, meta).run();

  await logAction(env, clientId, "reward_token_issued", { milestone });

  return json({ ok: true, token, milestone, expires_at: expiresAt }, 200);
}

// POST /loyalty/reward/consume
// body: { token }
async function handleRewardConsume(request, env) {
  const body = await readJson(request);
  const token = String(body?.token || "").trim();
  if (!token) return json({ ok: false, error: "token_required" }, 400);

  const row = await env.DB.prepare(
    "SELECT token, client_id, milestone, expires_at, used_at FROM reward_tokens WHERE token = ? LIMIT 1"
  ).bind(token).first();

  if (!row) return json({ ok: false, error: "invalid_token" }, 404);

  const clientId = String(row.client_id);
  const milestone = String(row.milestone);
  const usedAt = row.used_at ? String(row.used_at) : null;
  const expiresAt = String(row.expires_at);

  if (usedAt) {
    await logAction(env, clientId, "reward_consume_refused_used", { milestone });
    return json({ ok: false, error: "token_used" }, 409);
  }

  const nowMs = Date.now();
  const expMs = Date.parse(expiresAt);
  if (Number.isFinite(expMs) && nowMs > expMs) {
    // Mark token as used to avoid replays (optional but safer)
    await env.DB.prepare("UPDATE reward_tokens SET used_at = ? WHERE token = ?")
      .bind(new Date().toISOString(), token)
      .run();
    await logAction(env, clientId, "reward_consume_refused_expired", { milestone });
    return json({ ok: false, error: "token_expired" }, 410);
  }

  // Already claimed? (defense-in-depth)
  const claimed = await env.DB.prepare(
    "SELECT claimed_at FROM reward_claims WHERE client_id = ? AND milestone = ? LIMIT 1"
  ).bind(clientId, milestone).first();

  if (claimed) {
    await env.DB.prepare("UPDATE reward_tokens SET used_at = ? WHERE token = ?")
      .bind(new Date().toISOString(), token)
      .run();
    await logAction(env, clientId, "reward_consume_refused_already_claimed", { milestone });
    return json({ ok: false, error: "already_claimed", milestone }, 409);
  }

  // Load current loyalty state
  const state = await env.DB.prepare(
    "SELECT points, goal, completed_at, last_stamp_ts FROM loyalty_state WHERE client_id = ? LIMIT 1"
  ).bind(clientId).first();

  if (!state) return json({ ok: false, error: "not_found" }, 404);

  const goal = Number(state.goal || 8);
  let points = Number(state.points || 0);
  const completedAt = state.completed_at ? String(state.completed_at) : null;

  // Do not allow reward stamps if already completed
  if (points >= goal || completedAt) {
    // Consume token to prevent replays
    await env.DB.prepare("UPDATE reward_tokens SET used_at = ? WHERE token = ?")
      .bind(new Date().toISOString(), token)
      .run();
    await logAction(env, clientId, "reward_consume_refused_already_completed", { milestone, points, goal });
    return json({ ok: false, error: "already_completed", points, goal }, 409);
  }

  // Apply +1 stamp
  const nowIso = new Date().toISOString();
  points = points + 1;
  const willComplete = points >= goal;
  const newCompletedAt = willComplete ? nowIso : null;

  // Transaction-ish order:
  // 1) mark token used
  // 2) write claim (PK prevents duplicates)
  // 3) update loyalty_state
  await env.DB.prepare("UPDATE reward_tokens SET used_at = ? WHERE token = ?")
    .bind(nowIso, token)
    .run();

  await env.DB.prepare(
    "INSERT INTO reward_claims (client_id, milestone, claimed_at) VALUES (?, ?, ?)"
  ).bind(clientId, milestone, nowIso).run();

  await env.DB.prepare(
    "UPDATE loyalty_state SET points = ?, completed_at = ?, last_stamp_ts = ?, updated_at = ? WHERE client_id = ?"
  ).bind(points, newCompletedAt, nowIso, nowIso, clientId).run();

  await logAction(env, clientId, "reward_stamp", { milestone, points, goal, completed: willComplete });

  return json({ ok: true, milestone, points, goal, completed: willComplete, completed_at: newCompletedAt }, 200);
}

function generateToken() {
  // 24 bytes -> 32 chars base64url-ish
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

function base64UrlEncode(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  // btoa expects binary string
  const b64 = btoa(binary);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

/* ------------------------------- Schema ------------------------------- */

async function ensureSchema(env) {
  // Create tables if they don't exist
  // NOTE: D1 supports IF NOT EXISTS
  const stmts = [
    `CREATE TABLE IF NOT EXISTS loyalty_clients (
      client_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone_hash TEXT NOT NULL UNIQUE,
      phone_last4 TEXT NOT NULL,
      created_at TEXT NOT NULL
    );`,
    `CREATE TABLE IF NOT EXISTS loyalty_state (
      client_id TEXT PRIMARY KEY,
      points INTEGER NOT NULL DEFAULT 0,
      goal INTEGER NOT NULL DEFAULT 8,
      completed_at TEXT NULL,
      last_stamp_ts TEXT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (client_id) REFERENCES loyalty_clients(client_id) ON DELETE CASCADE
    );`,
    `CREATE TABLE IF NOT EXISTS loyalty_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL,
      client_id TEXT NOT NULL,
      action TEXT NOT NULL,
      meta TEXT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS idx_loyalty_logs_client_ts ON loyalty_logs(client_id, ts);`,
    `CREATE TABLE IF NOT EXISTS loyalty_rate_limits (
      ip TEXT NOT NULL,
      ts TEXT NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS idx_loyalty_rate_limits_ip_ts ON loyalty_rate_limits(ip, ts);`,
`CREATE TABLE IF NOT EXISTS reward_claims (
  client_id TEXT NOT NULL,
  milestone TEXT NOT NULL,
  claimed_at TEXT NOT NULL,
  PRIMARY KEY (client_id, milestone),
  FOREIGN KEY (client_id) REFERENCES loyalty_clients(client_id) ON DELETE CASCADE
);`,
`CREATE TABLE IF NOT EXISTS reward_tokens (
  token TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  milestone TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT NULL,
  meta TEXT NULL,
  FOREIGN KEY (client_id) REFERENCES loyalty_clients(client_id) ON DELETE CASCADE
);`,
`CREATE INDEX IF NOT EXISTS idx_reward_tokens_client_milestone ON reward_tokens(client_id, milestone);`,
  ];

  // Run sequentially (small count)
  for (const sql of stmts) {
    await env.DB.prepare(sql).run();
  }
}

async function logAction(env, clientId, action, metaObj) {
  const ts = new Date().toISOString();
  const meta = metaObj ? JSON.stringify(metaObj) : null;
  await env.DB.prepare("INSERT INTO loyalty_logs (ts, client_id, action, meta) VALUES (?, ?, ?, ?)")
    .bind(ts, clientId, action, meta)
    .run();
}

/* --------------------------- Rate limiting --------------------------- */

function getClientIp(request) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for") ||
    ""
  ).split(",")[0].trim();
}

async function rateLimitRegister(request, env) {
  // Limit: max 5 register attempts per 30 minutes per IP
  const ip = getClientIp(request);
  if (!ip) return { ok: true, ip: "" };

  const WINDOW_MS = 30 * 60 * 1000;
  const MAX = 5;
  const nowIso = new Date().toISOString();
  const cutoffIso = new Date(Date.now() - WINDOW_MS).toISOString();

  // cleanup old
  await env.DB.prepare("DELETE FROM loyalty_rate_limits WHERE ts < ?").bind(cutoffIso).run();

  // insert current attempt
  await env.DB.prepare("INSERT INTO loyalty_rate_limits (ip, ts) VALUES (?, ?)").bind(ip, nowIso).run();

  // count
  const row = await env.DB.prepare(
    "SELECT COUNT(1) as n FROM loyalty_rate_limits WHERE ip = ? AND ts >= ?"
  )
    .bind(ip, cutoffIso)
    .first();

  const n = Number(row?.n || 0);
  if (n > MAX) return { ok: false, ip, error: "rate_limited" };
  return { ok: true, ip };
}

/* ------------------------------ Utilities ----------------------------- */


function json(obj, status = 200, extraHeaders = {}) {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...corsHeaders(),
    ...extraHeaders,
  });
  return new Response(JSON.stringify(obj), { status, headers });
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "vary": "Origin",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,authorization,x-admin-key",
    "access-control-max-age": "86400",
  };
}

function corsPreflight(request) {
  const origin = request.headers.get("Origin") || "*";
  const reqHeaders =
    request.headers.get("Access-Control-Request-Headers") ||
    "content-type,authorization,x-admin-key";

  return new Response(null, {
    status: 204,
    headers: new Headers({
      "access-control-allow-origin": origin === "null" ? "*" : origin,
      "vary": "Origin",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": reqHeaders,
      "access-control-max-age": "86400",
    }),
  });
}

async function readJson(request) {
  const ct = request.headers.get("content-type") || "";
  if (!ct.toLowerCase().includes("application/json")) {
    // allow empty body -> {}
    const text = await request.text();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      return {};
    }
  }
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function safeMsg(err) {
  if (!err) return "unknown";
  if (typeof err === "string") return err.slice(0, 300);
  if (err instanceof Error) return (err.message || "error").slice(0, 300);
  return "error";
}

function normalizeName(name) {
  // Strict name rules (2A):
  // - 2..20 chars
  // - letters (incl accents) + space + '-' + "'"
  // - no digits / emojis / symbols
  // - blacklist + anti repetition
  let s = String(name || "");
  s = s.replace(/[\u200B-\u200D\uFEFF]/g, ""); // zero-width
  s = s.trim().replace(/\s+/g, " ");
  if (!s) return "";
  if (s.length < 2 || s.length > 20) return "";

  // Allowed characters only
  if (!/^[A-Za-zÀ-ÖØ-öø-ÿ' -]+$/.test(s)) return "";

  // Must contain at least 2 letters (ignore separators)
  const lettersOnly = s.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]+/g, "");
  if (lettersOnly.length < 2) return "";

  const low = lettersOnly.toLowerCase();

  // Blacklist (troll / placeholder)
  const bad = new Set([
    "test","mdr","lol","ok","okay","aaa","aaaa","xxxxx","xxx","inconnu","anonyme","noname",
    "prout","merde","bite","salope","con","fdp","pute"
  ]);
  if (bad.has(low)) return "";

  // Anti repetition: 4+ same letters in a row
  if (/(.)\1\1\1/i.test(low)) return "";

  // Anti pattern: repeating bigram 3+ times (ex: jejeje, lololol)
  if (/(..).?\1.?\1/i.test(low)) return "";

  // Title-case (optional, clean)
  s = s
    .split(" ")
    .map(part => part ? (part[0].toUpperCase() + part.slice(1)) : part)
    .join(" ");

  return s;
}

function normalizePhone(phone) {
  // Strict phone rules (1A):
  // Accept ONLY FR mobile:
  // - 06XXXXXXXX or 07XXXXXXXX (10 digits)
  // - also accepts 33/0033 then converts to 0
  let s = String(phone || "").trim();
  if (!s) return "";

  // keep digits only
  let digits = s.replace(/\D+/g, "");
  if (!digits) return "";

  // handle 0033XXXXXXXXX
  if (digits.startsWith("0033")) digits = digits.slice(4);
  // handle 33XXXXXXXXX
  if (digits.startsWith("33")) digits = digits.slice(2);

  // if now 9 digits and starts with 6/7, prefix 0
  if (digits.length === 9 && (digits[0] === "6" || digits[0] === "7")) {
    digits = "0" + digits;
  }

  // must be exactly 10 digits
  if (digits.length !== 10) return "";

  // must be mobile FR
  if (!(digits.startsWith("06") || digits.startsWith("07"))) return "";

  // reject obvious fake patterns
  if (/^(\d)\1{9}$/.test(digits)) return "";                 // all same (0000000000 etc)
  if (digits === "0123456789" || digits === "9876543210") return "";

  // reject: after 06/07, if the remaining 8 digits are all identical (0600000000, 0711111111, etc.)
  const rest8 = digits.slice(2);
  if (/^(\d)\1{7}$/.test(rest8)) return "";

  // extra hard blocks (common junk)
  if (digits === "0600000000" || digits === "0700000000") return "";

  return digits;
}

function getClientId(request, url) {
  // Priority: Authorization: Bearer <client_id>
  const auth = request.headers.get("authorization") || "";
  const m = auth.match(/^\s*Bearer\s+(.+)\s*$/i);
  if (m && m[1]) return String(m[1]).trim();

  // Or query ?client_id=
  const q = url.searchParams.get("client_id");
  if (q) return String(q).trim();

  return "";
}

function isAdmin(adminKey, env) {
  // Allow either:
  // - admin_key in body/query
  // - x-admin-key header
  // Here, caller passes adminKey explicitly. If empty, check header not available in this signature.
  const secret = String(env.ADMIN_KEY || "").trim();
  if (!secret) return adminKey === "test123"; // fallback dev only; replace by setting env.ADMIN_KEY
  return adminKey === secret;
}

async function phoneHashWithSalt(phoneDigits, salt) {
  // SHA-256(salt + ":" + phoneDigits)
  const input = `${String(salt || "")}:${String(phoneDigits || "")}`;
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return hex(hash);
}

function hex(buffer) {
  const bytes = new Uint8Array(buffer);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}
