import "../../phase7/register-alias.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { startNextServer } from "../../phase7/server-helper.mjs";

export const ADMIN_COOKIE_NAME = "mwaila_admin_session";
export const QA_PREFIX = "[QA-P8]";
export const DEFAULT_SCREENSHOT_DIR = path.join(
  os.tmpdir(),
  "mwaila-phase8-screenshots",
);

export const RATE_LIMIT_SCOPES = [
  "admin_login",
  "admin_login_failed",
  "login",
  "create",
  "manage_read",
  "manage_update",
  "manage_failed",
];

export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function ensureEnvLoaded(projectRoot = process.cwd()) {
  if (process.env.DATABASE_URL?.trim()) {
    return;
  }
  const envPath = path.join(projectRoot, ".env.local");
  if (!fs.existsSync(envPath)) {
    return;
  }
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx <= 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (key && process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

export async function getDbPool() {
  ensureEnvLoaded();
  const dbMod = await import("../../../src/lib/db.ts");
  return {
    pool: dbMod.pool,
    checkDatabaseConnection: dbMod.checkDatabaseConnection,
  };
}

export function resolveScreenshotDir() {
  const configured = process.env.E2E_SCREENSHOT_DIR?.trim();
  return configured && configured.length > 0
    ? configured
    : DEFAULT_SCREENSHOT_DIR;
}

export async function resolveBaseUrl(extraEnv = {}) {
  const configured = process.env.BASE_URL?.trim();
  if (configured && configured.length > 0) {
    const normalized = configured.replace(/\/+$/, "");
    return {
      baseUrl: normalized,
      managedServer: null,
      stop: async () => {},
    };
  }
  const server = await startNextServer(extraEnv);
  return {
    baseUrl: server.baseUrl,
    managedServer: server,
    stop: async () => {
      await server.stop();
    },
  };
}

export function parseSessionCookie(res, cookieName = ADMIN_COOKIE_NAME) {
  let setCookies = [];
  if (typeof res?.headers?.getSetCookie === "function") {
    setCookies = res.headers.getSetCookie();
  } else {
    const single = res?.headers?.get?.("set-cookie");
    if (single) {
      setCookies = [single];
    }
  }

  for (const rawHeader of setCookies) {
    const parts = rawHeader.split(";").map((part) => part.trim());
    const [nameValue, ...attrParts] = parts;
    if (!nameValue) continue;
    const eqIdx = nameValue.indexOf("=");
    if (eqIdx <= 0) continue;
    const name = nameValue.slice(0, eqIdx).trim();
    if (name !== cookieName) continue;
    const value = nameValue.slice(eqIdx + 1).trim();

    const attributes = {
      httpOnly: false,
      secure: false,
      sameSite: null,
      path: null,
      maxAge: null,
      expires: null,
    };

    for (const attr of attrParts) {
      const attrEq = attr.indexOf("=");
      const attrName = (attrEq === -1 ? attr : attr.slice(0, attrEq))
        .trim()
        .toLowerCase();
      const attrVal = attrEq === -1 ? "" : attr.slice(attrEq + 1).trim();

      if (attrName === "httponly") attributes.httpOnly = true;
      else if (attrName === "secure") attributes.secure = true;
      else if (attrName === "samesite") attributes.sameSite = attrVal;
      else if (attrName === "path") attributes.path = attrVal;
      else if (attrName === "max-age") attributes.maxAge = Number(attrVal);
      else if (attrName === "expires") attributes.expires = attrVal;
    }

    return {
      rawHeader,
      name,
      value,
      attributes,
    };
  }

  return null;
}

export function getRateLimitPepper() {
  const configured = process.env.RATE_LIMIT_PEPPER?.trim();
  return configured && configured.length > 0
    ? configured
    : "mwaila-rsvp-v1-bucket-salt";
}

export function computeRateLimitBucketKey(scope, clientKey) {
  const normalizedClient = String(clientKey || "").trim() || "anonymous-client";
  return crypto
    .createHmac("sha256", getRateLimitPepper())
    .update(`${scope}:${normalizedClient}`, "utf8")
    .digest("hex");
}

export function computeRateLimitBucketKeysForIp(clientKey, scopes = RATE_LIMIT_SCOPES) {
  return scopes.map((scope) => computeRateLimitBucketKey(scope, clientKey));
}

export function hashPasswordFallback(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
  });
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

export async function hashAdminPassword(password) {
  const passwordModulePath = path.resolve(
    process.cwd(),
    "src/lib/admin/password.ts",
  );
  if (fs.existsSync(passwordModulePath)) {
    try {
      const mod = await import(pathToFileURL(passwordModulePath).href);
      const fn =
        mod.hashPassword ?? mod.hashAdminPassword ?? mod.createPasswordHash;
      if (typeof fn === "function") {
        const result = await fn(password);
        if (typeof result === "string" && result.startsWith("scrypt$")) {
          return result;
        }
      }
    } catch {
      // Fall back to compatible scrypt format if password.ts imports runtime-only deps.
    }
  }
  return hashPasswordFallback(password);
}

export async function tableExists(pool, tableName) {
  const res = await pool.query("SELECT to_regclass($1) AS reg", [tableName]);
  return Boolean(res.rows[0]?.reg);
}

export async function captureBaseline(pool) {
  let baselineMaxAuditId = null;
  let baselineMaxRetentionRunId = 0;
  let baselineEventSettings = null;

  if (await tableExists(pool, "admin_audit_logs")) {
    const res = await pool.query(
      "SELECT COALESCE(MAX(id), 0)::bigint AS max_id FROM admin_audit_logs",
    );
    baselineMaxAuditId = Number(res.rows[0]?.max_id ?? 0);
  }

  if (await tableExists(pool, "rsvp_retention_runs")) {
    const res = await pool.query(
      "SELECT COALESCE(MAX(id), 0)::bigint AS max_id FROM rsvp_retention_runs",
    );
    baselineMaxRetentionRunId = Number(res.rows[0]?.max_id ?? 0);
  }

  if (await tableExists(pool, "event_settings")) {
    const res = await pool.query(
      `SELECT id, rsvp_accepting_responses, allow_guest_self_editing,
              closure_deadline_at, manual_override_reason, updated_by_admin_id, updated_at
       FROM event_settings
       WHERE id = 1
       LIMIT 1`,
    );
    baselineEventSettings = res.rows[0] ?? null;
  }

  return {
    baselineMaxAuditId,
    baselineMaxRetentionRunId,
    baselineEventSettings,
  };
}

export async function provisionQaAdmin(pool, options = {}) {
  const envEmail = process.env.QA_ADMIN_EMAIL?.trim().toLowerCase();
  const envPassword = process.env.QA_ADMIN_PASSWORD;
  const tag = options.label ? String(options.label).replace(/[^a-z0-9-]/gi, "") : "p8";

  if (envEmail && envPassword) {
    const existing = await pool.query(
      "SELECT id, email, display_name, is_active FROM admin_users WHERE email = $1 LIMIT 1",
      [envEmail],
    );
    if (existing.rowCount > 0) {
      return {
        id: existing.rows[0].id,
        email: existing.rows[0].email,
        password: envPassword,
        displayName: existing.rows[0].display_name,
        ephemeral: false,
      };
    }

    const passwordHash = await hashAdminPassword(envPassword);
    const inserted = await pool.query(
      `INSERT INTO admin_users (email, display_name, password_hash, role, is_active)
       VALUES ($1, $2, $3, 'admin', TRUE)
       RETURNING id, email, display_name`,
      [envEmail, `${QA_PREFIX} Admin (${tag})`, passwordHash],
    );
    return {
      id: inserted.rows[0].id,
      email: inserted.rows[0].email,
      password: envPassword,
      displayName: inserted.rows[0].display_name,
      ephemeral: true,
    };
  }

  const randomHex = crypto.randomBytes(6).toString("hex");
  const email = `qa-${tag}-${randomHex}@example.test`.toLowerCase();
  const password = `Qa!${crypto.randomBytes(16).toString("base64url")}9#`;
  const displayName = `${QA_PREFIX} Admin ${tag}`;
  const passwordHash = await hashAdminPassword(password);

  const inserted = await pool.query(
    `INSERT INTO admin_users (email, display_name, password_hash, role, is_active)
     VALUES ($1, $2, $3, 'admin', TRUE)
     RETURNING id, email, display_name`,
    [email, displayName, passwordHash],
  );

  return {
    id: inserted.rows[0].id,
    email: inserted.rows[0].email,
    password,
    displayName: inserted.rows[0].display_name,
    ephemeral: true,
  };
}

export async function cleanupQaPhase8Data(pool, ctx = {}) {
  const {
    createdRsvpIds = [],
    phonePrefixes = [],
    namePrefix = QA_PREFIX,
    createdAdminId = null,
    createdAdminEphemeral = false,
    baselineMaxAuditId = null,
    baselineMaxRetentionRunId = null,
    baselineEventSettings = null,
    trackedRateLimitKeys = [],
    clientIpsToClean = [],
  } = ctx;

  if (baselineEventSettings && (await tableExists(pool, "event_settings"))) {
    await pool.query(
      `UPDATE event_settings
       SET rsvp_accepting_responses = $1,
           allow_guest_self_editing = $2,
           closure_deadline_at = $3,
           manual_override_reason = $4,
           updated_by_admin_id = $5,
           updated_at = $6
       WHERE id = 1`,
      [
        baselineEventSettings.rsvp_accepting_responses,
        baselineEventSettings.allow_guest_self_editing,
        baselineEventSettings.closure_deadline_at,
        baselineEventSettings.manual_override_reason,
        baselineEventSettings.updated_by_admin_id,
        baselineEventSettings.updated_at,
      ],
    );
  }

  if (await tableExists(pool, "admin_audit_logs")) {
    if (baselineMaxAuditId !== null && baselineMaxAuditId !== undefined) {
      await pool.query("DELETE FROM admin_audit_logs WHERE id > $1", [
        baselineMaxAuditId,
      ]);
    } else if (createdAdminId) {
      await pool.query(
        "DELETE FROM admin_audit_logs WHERE actor_admin_id = $1",
        [createdAdminId],
      );
    }
  }

  if (createdAdminId && (await tableExists(pool, "admin_sessions"))) {
    await pool.query("DELETE FROM admin_sessions WHERE admin_user_id = $1", [
      createdAdminId,
    ]);
  }

  if (createdRsvpIds.length > 0) {
    await pool.query("DELETE FROM rsvps WHERE id = ANY($1::uuid[])", [
      createdRsvpIds,
    ]);
  }

  if (namePrefix) {
    await pool.query("DELETE FROM rsvps WHERE full_name LIKE $1", [
      `${namePrefix}%`,
    ]);
    await pool.query("DELETE FROM rsvps WHERE organizer_notes LIKE $1", [
      `${namePrefix}%`,
    ]);
  }

  for (const phonePrefix of phonePrefixes) {
    await pool.query("DELETE FROM rsvps WHERE phone_e164 LIKE $1", [
      `${phonePrefix}%`,
    ]);
  }

  if (
    baselineMaxRetentionRunId !== null &&
    baselineMaxRetentionRunId !== undefined &&
    (await tableExists(pool, "rsvp_retention_runs"))
  ) {
    await pool.query("DELETE FROM rsvp_retention_runs WHERE id > $1", [
      baselineMaxRetentionRunId,
    ]);
  }

  const allRateLimitKeys = new Set(trackedRateLimitKeys);
  for (const ip of clientIpsToClean) {
    for (const key of computeRateLimitBucketKeysForIp(ip)) {
      allRateLimitKeys.add(key);
    }
  }

  if (allRateLimitKeys.size > 0 && (await tableExists(pool, "rsvp_rate_limits"))) {
    await pool.query(
      "DELETE FROM rsvp_rate_limits WHERE bucket_key = ANY($1::char(64)[])",
      [[...allRateLimitKeys]],
    );
  }

  if (clientIpsToClean.length > 0 && (await tableExists(pool, "admin_rate_limits"))) {
    const adminBucketKeys = [];
    for (const ip of clientIpsToClean) {
      const normalizedClient = String(ip || "").trim() || "anonymous";
      for (const scope of ["login", "login_failed"]) {
        adminBucketKeys.push(
          crypto
            .createHmac("sha256", "mwaila-admin-v1-bucket-salt")
            .update(`admin:${scope}:${normalizedClient}`, "utf8")
            .digest("hex"),
        );
      }
    }
    await pool.query(
      "DELETE FROM admin_rate_limits WHERE bucket_key = ANY($1::char(64)[])",
      [adminBucketKeys],
    );
  }

  if (
    createdAdminEphemeral &&
    createdAdminId &&
    (await tableExists(pool, "admin_users"))
  ) {
    await pool.query("DELETE FROM admin_users WHERE id = $1", [createdAdminId]);
  }
}

export async function adminFetch(baseUrl, urlPath, options = {}) {
  const {
    method = "GET",
    cookie = null,
    origin = baseUrl,
    referer = `${baseUrl}/admin`,
    clientIp = null,
    headers = {},
    body = undefined,
    redirect = "manual",
  } = options;

  const finalHeaders = { ...headers };
  if (cookie && !finalHeaders.Cookie && !finalHeaders.cookie) {
    finalHeaders.Cookie = `${ADMIN_COOKIE_NAME}=${cookie}`;
  }
  if (clientIp && !finalHeaders["x-forwarded-for"]) {
    finalHeaders["x-forwarded-for"] = clientIp;
  }
  if (origin !== null && !finalHeaders.Origin && !finalHeaders.origin) {
    finalHeaders.Origin = origin;
  }
  if (referer !== null && !finalHeaders.Referer && !finalHeaders.referer) {
    finalHeaders.Referer = referer;
  }

  let payload = body;
  if (
    payload !== undefined &&
    typeof payload !== "string" &&
    !(payload instanceof Uint8Array)
  ) {
    if (!finalHeaders["Content-Type"] && !finalHeaders["content-type"]) {
      finalHeaders["Content-Type"] = "application/json";
    }
    payload = JSON.stringify(payload);
  }

  return fetch(`${baseUrl}${urlPath}`, {
    method,
    headers: finalHeaders,
    body: payload,
    redirect,
    signal: AbortSignal.timeout(15000),
  });
}

export async function loginAsAdmin(baseUrl, credentials) {
  const { email, password, clientIp = "198.51.100.1", origin = baseUrl } =
    credentials;
  const res = await adminFetch(baseUrl, "/api/admin/auth/login", {
    method: "POST",
    clientIp,
    origin,
    referer: `${baseUrl}/admin/login`,
    body: { email, password },
  });
  const cookie = parseSessionCookie(res);
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { res, cookie, json };
}

export function assertNoSecretLeak(text, extraForbidden = [], contextLabel = "response") {
  const content = String(text ?? "");
  const forbiddenKeys = [
    "management_token_hash",
    "managementTokenHash",
    "password_hash",
    "passwordHash",
    "session_token_hash",
    "sessionTokenHash",
    "scrypt$",
  ];

  for (const key of forbiddenKeys) {
    if (content.includes(key)) {
      throw new Error(`Secret/hash marker "${key}" leaked in ${contextLabel}`);
    }
  }

  const envSecrets = [
    process.env.DATABASE_URL,
    process.env.ADMIN_SESSION_SECRET,
    process.env.RATE_LIMIT_PEPPER,
  ].filter((v) => typeof v === "string" && v.trim().length >= 8);

  for (const secret of [...envSecrets, ...extraForbidden]) {
    if (typeof secret === "string" && secret.length > 0 && content.includes(secret)) {
      throw new Error(`Sensitive credential/token value leaked in ${contextLabel}`);
    }
  }
}
