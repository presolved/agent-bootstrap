#!/usr/bin/env node
// Serve the Plan Editor against real services (Azure OpenAI, SharePoint, Azure
// Search) from a cloud agent's checkout, signed in with a synthetic session so
// no person has to log in. Test mode (the verify skill's up.sh) stays the
// default; use this only when the behavior under test depends on a real service.
//
// Run it from inside the checkout it should serve:
//   node ~/.agent-bootstrap/cursor/repos/presolved__iem-planning-augmentation/serve-real.cjs \
//     [--port 3200] [--search-index <name>] [--allow-shared-db]
//
// Environment, lowest precedence first:
//   1. dev's non-secret values from .github/configs/apps.deployment.yml
//      (defaults.env, the plan-editor app env, envByEnvironment.dev), minus
//      deploy-only values: container paths and hosts on the deploy network;
//   2. apps/plan-editor/.env when the checkout has one;
//   3. the process environment (Cursor injects the team's secrets here);
//   4. what this script owns: development mode with mocks off, the port, and
//      a NEXTAUTH_SECRET private to this checkout.
//
// The database must be this machine's own (~/.agent-bootstrap/cursor/start.sh):
// the server runs pg-boss workers, and two servers on one database take each
// other's jobs. A non-local DATABASE_URL is refused unless --allow-shared-db.
//
// The synthetic session is an admin/tier2 user minted with next-auth's own
// encoder and the private secret. It is written to
// .context/real-service-qa/browser-state.json and, for the verify harness, to
// .context/verify/sessions/localhost-<port>/me.json. It proves nothing about
// Entra sign-in. Never print or commit either file.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');

const root = spawnSync('git', ['rev-parse', '--show-toplevel'], {
  encoding: 'utf8',
}).stdout.trim();
if (!root || !fs.existsSync(path.join(root, 'apps/plan-editor'))) {
  console.error('serve-real: run this from inside an iem-planning-augmentation checkout');
  process.exit(1);
}
const app = path.join(root, 'apps/plan-editor');
const qaDir = path.join(root, '.context/real-service-qa');
const fromRoot = (id) => require(require.resolve(id, { paths: [root] }));

const LOCAL_DATABASE_URL =
  'postgresql://postgres:postgres@localhost:5432/planning_db';
const SESSION_MAX_AGE_SEC = 12 * 60 * 60;

main().catch((error) => {
  console.error(`serve-real: ${error.message}`);
  process.exit(1);
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = buildEnv(args);
  assertOwnDatabase(env.DATABASE_URL, args.allowSharedDb);
  await writeQaSession(args.port, env.NEXTAUTH_SECRET);
  migrate(env);
  console.log(
    `serve-real: starting http://localhost:${args.port} (first compile takes 1-3 min)`
  );
  const child = spawn(
    process.execPath,
    [
      path.join(root, 'node_modules/next/dist/bin/next'),
      'dev',
      '--turbopack',
      '--hostname',
      '0.0.0.0',
      '--port',
      args.port,
    ],
    { cwd: app, env, stdio: 'inherit' }
  );
  for (const signal of ['SIGTERM', 'SIGINT'])
    process.on(signal, () => child.kill(signal));
  child.on('exit', (code) => process.exit(code ?? 0));
}

function parseArgs(argv) {
  const args = { port: '3200', searchIndex: undefined, allowSharedDb: false };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--port') args.port = argv[++i];
    else if (flag === '--search-index') args.searchIndex = argv[++i];
    else if (flag === '--allow-shared-db') args.allowSharedDb = true;
    else throw new Error(`unknown argument ${flag}`);
  }
  if (!/^\d+$/.test(args.port ?? '')) throw new Error('--port needs a number');
  return args;
}

function buildEnv({ port, searchIndex }) {
  const dotenvFile = path.join(app, '.env');
  const env = {
    ...devOverlay(),
    ...(fs.existsSync(dotenvFile)
      ? fromRoot('dotenv').parse(fs.readFileSync(dotenvFile))
      : {}),
    ...process.env,
    NODE_ENV: 'development',
    E2E_TEST_MODE: 'false',
    MOCK_AUTH: 'false',
    MOCK_MS_GRAPH_API: 'false',
    PORT: port,
    NEXTAUTH_URL: `http://localhost:${port}`,
    NEXTAUTH_SECRET: privateSecret(),
    WATCHPACK_POLLING: 'true',
  };
  if (!env.DATABASE_URL || env.DATABASE_URL === 'memory')
    env.DATABASE_URL = LOCAL_DATABASE_URL;
  if (searchIndex) env.AZURE_SEARCH_SHAREPOINT_V2_INDEX = searchIndex;
  return env;
}

// Container paths (/iem/...) and deploy-network hosts (*.internal.*) do not
// exist outside the Azure environment.
function devOverlay() {
  const config = fromRoot('yaml').parse(
    fs.readFileSync(
      path.join(root, '.github/configs/apps.deployment.yml'),
      'utf8'
    )
  );
  const planEditor = config.apps.find((entry) => entry.id === 'plan-editor');
  const merged = {
    ...config.defaults.env,
    ...planEditor.env,
    ...planEditor.envByEnvironment.dev,
  };
  return Object.fromEntries(
    Object.entries(merged)
      .map(([key, value]) => [key, String(value)])
      .filter(
        ([, value]) => !value.startsWith('/') && !value.includes('.internal.')
      )
  );
}

function assertOwnDatabase(databaseUrl, allowShared) {
  const host = new URL(databaseUrl).hostname;
  if (['localhost', '127.0.0.1', '::1'].includes(host) || allowShared) return;
  throw new Error(
    `DATABASE_URL points at ${host}. Use this machine's own database (~/.agent-bootstrap/cursor/start.sh); ` +
      'pass --allow-shared-db only when no other server runs against that database.'
  );
}

function privateSecret() {
  const file = path.join(qaDir, 'session-secret');
  fs.mkdirSync(qaDir, { recursive: true, mode: 0o700 });
  if (!fs.existsSync(file))
    fs.writeFileSync(file, crypto.randomBytes(48).toString('hex'), {
      mode: 0o600,
    });
  return fs.readFileSync(file, 'utf8');
}

async function writeQaSession(port, secret) {
  const idFile = path.join(qaDir, 'user-id');
  if (!fs.existsSync(idFile))
    fs.writeFileSync(idFile, `sandbox-qa-${crypto.randomUUID()}`, {
      mode: 0o600,
    });
  const user = {
    id: fs.readFileSync(idFile, 'utf8').trim(),
    name: 'Local QA',
    email: 'local-qa@example.invalid',
    roles: ['admin', 'tier2'],
  };
  const { encode } = fromRoot('next-auth/jwt');
  const value = await encode({
    secret,
    token: { sub: user.id, user },
    maxAge: SESSION_MAX_AGE_SEC,
  });
  const state = JSON.stringify({
    cookies: [
      {
        name: 'next-auth.session-token',
        value,
        domain: 'localhost',
        path: '/',
        expires: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SEC,
        httpOnly: true,
        secure: false,
        sameSite: 'Lax',
      },
    ],
    origins: [],
  });
  const verifyDir = path.join(
    root,
    `.context/verify/sessions/localhost-${port}`
  );
  fs.mkdirSync(verifyDir, { recursive: true, mode: 0o700 });
  for (const file of [
    path.join(qaDir, 'browser-state.json'),
    path.join(verifyDir, 'me.json'),
  ]) {
    fs.writeFileSync(file, state, { mode: 0o600 });
  }
  console.log(
    `serve-real: QA session written for verify target http://localhost:${port} (user me)`
  );
}

function migrate(env) {
  console.log('serve-real: applying migrations');
  const result = spawnSync('yarn', ['drizzle:migrate:plan-editor'], {
    cwd: root,
    env,
    stdio: 'inherit',
  });
  if (result.status !== 0)
    throw new Error(
      'migrations failed; is the database up? (~/.agent-bootstrap/cursor/start.sh)'
    );
}
