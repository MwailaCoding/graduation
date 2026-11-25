import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import {
  hashPassword,
  validatePasswordStrength,
} from "../src/lib/admin/password.ts";

const { Pool } = pg;

function loadEnvLocalIfPresent() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) {
    return;
  }

  const raw = fs.readFileSync(envPath, "utf8");
  for (const rawLine of raw.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const line = trimmed.startsWith("export ")
      ? trimmed.slice("export ".length).trim()
      : trimmed;
    const eqIndex = line.indexOf("=");
    if (eqIndex <= 0) {
      continue;
    }

    const key = line.slice(0, eqIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      continue;
    }

    if (process.env[key] !== undefined) {
      continue;
    }

    let value = line.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

function parseArgs(argv) {
  const parsed = {
    help: false,
    email: undefined,
    password: undefined,
    name: undefined,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }
    if (arg === "--") {
      continue;
    }

    if (arg.startsWith("--email=")) {
      parsed.email = arg.slice("--email=".length);
      continue;
    }
    if (arg === "--email") {
      if (i + 1 >= argv.length) {
        throw new Error("Missing value for --email.");
      }
      parsed.email = argv[++i];
      continue;
    }

    if (arg.startsWith("--password=")) {
      parsed.password = arg.slice("--password=".length);
      continue;
    }
    if (arg === "--password") {
      if (i + 1 >= argv.length) {
        throw new Error("Missing value for --password.");
      }
      parsed.password = argv[++i];
      continue;
    }

    if (arg.startsWith("--name=")) {
      parsed.name = arg.slice("--name=".length);
      continue;
    }
    if (arg === "--name") {
      if (i + 1 >= argv.length) {
        throw new Error("Missing value for --name.");
      }
      parsed.name = argv[++i];
      continue;
    }

    throw new Error(`Unknown CLI argument: ${arg}`);
  }

  return parsed;
}

function normalizeEmail(raw) {
  if (typeof raw !== "string") {
    return "";
  }
  return raw.trim().toLowerCase();
}

function normalizeDisplayName(raw) {
  if (typeof raw !== "string") {
    return "";
  }
  return raw.replace(/[\u0000-\u001F\u007F]/g, "").trim().replace(/\s+/g, " ");
}

function printUsage() {
  console.log(
    "Usage: npm run admin:bootstrap -- --email=<email> --password=<strong-password> --name=<display-name>\n" +
      "Or set ADMIN_BOOTSTRAP_EMAIL, ADMIN_BOOTSTRAP_PASSWORD, and ADMIN_BOOTSTRAP_NAME in environment / .env.local.",
  );
}

async function main() {
  loadEnvLocalIfPresent();

  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid arguments.";
    console.error(`[bootstrap-admin] ${message}`);
    printUsage();
    process.exitCode = 1;
    return;
  }

  if (args.help) {
    printUsage();
    return;
  }

  const email = normalizeEmail(args.email ?? process.env.ADMIN_BOOTSTRAP_EMAIL);
  const password = args.password ?? process.env.ADMIN_BOOTSTRAP_PASSWORD ?? "";
  const displayName = normalizeDisplayName(
    args.name ?? process.env.ADMIN_BOOTSTRAP_NAME,
  );

  if (!email || email.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    console.error(
      "[bootstrap-admin] Invalid or missing email address (provide --email or ADMIN_BOOTSTRAP_EMAIL).",
    );
    process.exitCode = 1;
    return;
  }

  if (
    !displayName ||
    displayName.length < 2 ||
    displayName.length > 120 ||
    !/\p{L}/u.test(displayName)
  ) {
    console.error(
      "[bootstrap-admin] Invalid or missing display name (2-120 chars with at least one letter).",
    );
    process.exitCode = 1;
    return;
  }

  const strength = validatePasswordStrength(password, { email, displayName });
  if (!strength.valid) {
    console.error(
      `[bootstrap-admin] Password does not meet security requirements: ${strength.errors.join(" ")}`,
    );
    process.exitCode = 1;
    return;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error(
      "[bootstrap-admin] Missing DATABASE_URL environment variable.",
    );
    process.exitCode = 1;
    return;
  }

  const pool = new Pool({ connectionString: databaseUrl });
  let client;

  try {
    const passwordHash = await hashPassword(password);
    client = await pool.connect();

    await client.query("BEGIN");

    const existing = await client.query(
      "SELECT id, email FROM admin_users WHERE email = $1 LIMIT 1",
      [email],
    );

    if ((existing.rowCount ?? 0) > 0) {
      await client.query("ROLLBACK");
      console.log(
        `[bootstrap-admin] Admin account already exists for ${email}; skipping duplicate creation.`,
      );
      return;
    }

    const insertResult = await client.query(
      `
      INSERT INTO admin_users (
        email,
        display_name,
        password_hash,
        role,
        is_active
      ) VALUES ($1, $2, $3, 'admin', TRUE)
      ON CONFLICT (email) DO NOTHING
      RETURNING id, email, display_name, role
      `,
      [email, displayName, passwordHash],
    );

    if ((insertResult.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      console.log(
        `[bootstrap-admin] Admin account already exists for ${email}; skipping duplicate creation.`,
      );
      return;
    }

    const inserted = insertResult.rows[0];

    await client.query(
      `
      INSERT INTO admin_audit_logs (
        actor_admin_id,
        actor_identifier,
        action,
        target_type,
        target_id,
        summary,
        metadata
      ) VALUES ($1, $2, 'admin.bootstrap', 'admin_user', $3, $4, $5::jsonb)
      `,
      [
        inserted.id,
        inserted.email,
        inserted.id,
        "Bootstrapped administrator account via CLI",
        JSON.stringify({ role: inserted.role, source: "cli" }),
      ],
    );

    await client.query("COMMIT");
    console.log(
      `[bootstrap-admin] Created admin account id=${inserted.id} email=${inserted.email} role=${inserted.role}`,
    );
  } catch (err) {
    if (client) {
      await client.query("ROLLBACK").catch(() => {});
    }
    const safeErrorName =
      err instanceof Error ? `${err.name}: ${err.message}` : "BootstrapError";
    console.error(`[bootstrap-admin] Failed: ${safeErrorName}`);
    process.exitCode = 1;
  } finally {
    if (client) {
      client.release();
    }
    await pool.end().catch(() => {});
  }
}

await main();
