#!/usr/bin/env node
// The deterministic half of /iterate: worktrees, implementer sessions,
// landing onto the integration branch, the debounced test gate on that branch,
// the one dev server, the heavy-command lock, and the PreToolUse hook that
// keeps implementers in their worktrees. Run `iter.mjs help` for the commands.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const SKILL_DIR = path.dirname(path.dirname(SELF));
const ITER = `node ${SELF}`;
const HOME_DIR = path.join(os.homedir(), '.iterate');
const SESSIONS_DIR = path.join(HOME_DIR, 'sessions');
const SESSION = process.env.CONDUCTOR_SESSION_ID || process.env.CLAUDE_CODE_SESSION_ID || null;

const DEFAULTS = {
  branchPrefix: 'iter/',
  worktree: {
    root: '{main}/../{repoName}-iter',
    setup: ['git worktree add -b {branch} {path} {integration}'],
  },
  check: null,
  gate: { quietSec: 120, maxWaitSec: 900 },
  push: false,
  agent: 'claude',
  opener: '/pstack:poteto-mode',
  model: 'opus-5-5-1m',
  effort: 'high',
  heavy: { minFreeMB: 0, patterns: [] },
  block: [],
  server: null,
};

const HELP = `iter: the scripted half of /iterate

Lead:
  init [--integration <branch>]   Record the integration branch, install the hook
  spawn <slug> --brief <file> [--agent a] [--model m] [--effort e]
        [--extra <file>] [--title <text>] [--review-gated]
                                  Worktree + branch + implementer session for one item;
                                  --extra appends run-specific duties to the worker
                                  prompt, --review-gated makes done wait for --accepted
  watch [--interval <s>]          One line per actionable change, for the Monitor tool; starts
                                  the gate once landings go quiet
  gate [--sha <sha>]              Run the repo's check on the integration head now
  push                            Push the last green integration commit
  server up [--port n] | down
  done <slug> [--accepted] [--force]
                                  Archive the session, remove worktree and branch;
                                  a review-gated item needs --accepted (the user's call)

Implementer (or lead):
  land <slug>                     Rebase onto the integration branch and fast-forward it
  status [--json]                 One row per item, the gate, overlaps, and the server
  server status | logs [-n lines]

Anyone:
  heavy -- <command>              Run a heavy command when the lock and memory allow
  hook                            PreToolUse handler (installed by init)`;

// ---------------------------------------------------------------- helpers

function die(message, code = 1) {
  process.stderr.write(`iter: ${message}\n`);
  process.exit(code);
}

function q(value) {
  const text = String(value);
  return /^[\w@%+=:,./-]+$/.test(text) ? text : `'${text.replace(/'/g, `'\\''`)}'`;
}

function fill(template, vars) {
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    name in vars ? q(vars[name]) : match
  );
}

function fillRaw(template, vars) {
  return template.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match));
}

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 << 20, ...opts });
}

function git(args, cwd) {
  return run('git', args, { cwd });
}

function gitOut(args, cwd) {
  const result = git(args, cwd);
  if (result.status !== 0) die(`git ${args.join(' ')} failed in ${cwd}: ${result.stderr.trim()}`);
  return result.stdout.trim();
}

function bash(command, opts = {}) {
  return run('bash', ['-c', command], opts);
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tmp, file);
}

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

function isInside(child, parent) {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function flags(argv, names) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const name = arg.slice(2);
      if (!names.includes(name)) die(`unknown flag --${name}`, 2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) out[name] = true;
      else out[name] = argv[++i];
    } else if (arg === '-n') {
      out.n = argv[++i];
    } else {
      out._.push(arg);
    }
  }
  return out;
}

function now() {
  return new Date().toISOString();
}

// ---------------------------------------------------------------- locks

// A lock is a directory: mkdir is atomic everywhere, flock is missing on macOS.
function acquire(dir, name, { wait = true, timeoutMs = 2 * 3600e3, onWait } = {}) {
  const lock = path.join(dir, `${name}.lock`);
  fs.mkdirSync(dir, { recursive: true });
  const start = Date.now();
  let told = false;
  for (;;) {
    try {
      fs.mkdirSync(lock);
      fs.writeFileSync(
        path.join(lock, 'owner'),
        JSON.stringify({ pid: process.pid, session: SESSION, at: now(), argv: process.argv.slice(2) })
      );
      return () => fs.rmSync(lock, { recursive: true, force: true });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    const owner = readJson(path.join(lock, 'owner'), null);
    if (owner && !pidAlive(owner.pid)) {
      fs.rmSync(lock, { recursive: true, force: true });
      continue;
    }
    if (!owner) {
      let age = 0;
      try {
        age = Date.now() - fs.statSync(lock).mtimeMs;
      } catch {
        continue;
      }
      if (age > 5000) {
        fs.rmSync(lock, { recursive: true, force: true });
        continue;
      }
    }
    if (!wait) return null;
    if (!told && onWait) {
      onWait(owner);
      told = true;
    }
    if (Date.now() - start > timeoutMs) die(`timed out waiting for the ${name} lock`);
    sleepMs(500);
  }
}

function withLock(dir, name, fn) {
  const release = acquire(dir, name);
  try {
    return fn();
  } finally {
    release();
  }
}

// ---------------------------------------------------------------- repo, config, state

function repoAt(cwd = process.cwd()) {
  const top = git(['rev-parse', '--show-toplevel'], cwd);
  if (top.status !== 0) die(`not inside a git repository: ${cwd}`);
  const common = path.resolve(cwd, gitOut(['rev-parse', '--git-common-dir'], cwd));
  const main = path.dirname(common);
  const stateDir = path.join(common, 'iter');
  return { top: top.stdout.trim(), common, main, stateDir, statePath: path.join(stateDir, 'state.json') };
}

function repoKey(main) {
  const url = git(['remote', 'get-url', 'origin'], main).stdout.trim();
  if (!url) return path.basename(main);
  return url.replace(/\.git$/, '').replace(/^.*[:/]([^/:]+)\/([^/]+)$/, '$1__$2');
}

function loadConfig(main) {
  const key = repoKey(main);
  const configPath = process.env.ITER_CONFIG || path.join(SKILL_DIR, 'repos', `${key}.json`);
  const own = readJson(configPath, null);
  const config = { ...DEFAULTS };
  for (const [k, v] of Object.entries(own ?? {})) {
    config[k] =
      v && typeof v === 'object' && !Array.isArray(v) && DEFAULTS[k] && typeof DEFAULTS[k] === 'object'
        ? { ...DEFAULTS[k], ...v }
        : v;
  }
  return { config, configPath: own ? configPath : null, configDir: path.dirname(configPath), key };
}

function loadState(repo) {
  return readJson(repo.statePath, null);
}

function requireState(repo) {
  const state = loadState(repo);
  if (!state) die(`no /iterate run here; the lead runs \`${ITER} init\` in ${repo.main}`);
  return state;
}

function updateState(repo, fn) {
  return withLock(repo.stateDir, 'state', () => {
    const state = loadState(repo) ?? { items: {} };
    const result = fn(state);
    writeJson(repo.statePath, state);
    return result;
  });
}

function vars(repo, state, extra = {}) {
  return {
    main: repo.main,
    repoName: path.basename(repo.main),
    integration: state?.integration ?? '',
    configDir: loadConfig(repo.main).configDir,
    ...extra,
  };
}

function worktreeRoot(repo, state, config) {
  return path.resolve(fillRaw(config.worktree.root, vars(repo, state)));
}

function item(state, slug) {
  const found = state.items?.[slug];
  if (!found) die(`no item "${slug}"; items: ${Object.keys(state.items ?? {}).join(', ') || 'none'}`);
  return found;
}

function headOf(branch, cwd) {
  return gitOut(['rev-parse', branch], cwd);
}

function dirtyTracked(cwd) {
  return git(['status', '--porcelain', '--untracked-files=no'], cwd).stdout.trim();
}

function isAncestor(a, b, cwd) {
  return git(['merge-base', '--is-ancestor', a, b], cwd).status === 0;
}

// ---------------------------------------------------------------- conductor

function conductor(args) {
  const result = run('conductor', ['--json', ...args]);
  if (result.error) return { ok: false, error: result.error.message };
  if (result.status !== 0) return { ok: false, error: (result.stderr || result.stdout).trim() };
  let data = null;
  try {
    data = JSON.parse(result.stdout);
  } catch {
    data = result.stdout.trim();
  }
  return { ok: true, data };
}

function sessionState(id) {
  if (!id) return 'none';
  const result = conductor(['session', 'status', id]);
  if (!result.ok) return 'unknown';
  return result.data?.status ?? 'unknown';
}

function tellSession(id, text) {
  if (!id || id === SESSION) return false;
  return conductor(['message', 'create', '--session', id, '--message', text]).ok;
}

// ---------------------------------------------------------------- heavy

function freeMB() {
  if (process.platform !== 'linux') return Infinity;
  const match = /MemAvailable:\s+(\d+)/.exec(fs.readFileSync('/proc/meminfo', 'utf8'));
  return match ? Math.floor(Number(match[1]) / 1024) : Infinity;
}

function heavyConfig(cwd) {
  const top = git(['rev-parse', '--show-toplevel'], cwd);
  if (top.status !== 0) return DEFAULTS.heavy;
  return loadConfig(repoAt(cwd).main).config.heavy;
}

// Runs `command` once the machine-wide heavy lock is ours and memory allows.
function runHeavy(command, { cwd = process.cwd(), logFile = null, append = false } = {}) {
  const { minFreeMB = 0 } = heavyConfig(cwd);
  const release = acquire(path.join(HOME_DIR, 'locks'), 'heavy', {
    onWait: (owner) =>
      process.stderr.write(
        `iter: waiting for the heavy lock (held by pid ${owner?.pid ?? '?'}${owner?.session ? `, session ${owner.session}` : ''})\n`
      ),
  });
  try {
    const start = Date.now();
    let told = false;
    while (freeMB() < minFreeMB && Date.now() - start < 10 * 60e3) {
      if (!told) {
        process.stderr.write(`iter: waiting for ${minFreeMB} MB free (now ${freeMB()} MB)\n`);
        told = true;
      }
      sleepMs(5000);
    }
    const out = logFile ? fs.openSync(logFile, append ? 'a' : 'w') : 'inherit';
    const result = spawnSync('bash', ['-c', command], { cwd, stdio: ['inherit', out, out] });
    if (logFile) fs.closeSync(out);
    return result.status ?? 1;
  } finally {
    release();
  }
}

function cmdHeavy(argv) {
  const at = argv.indexOf('--');
  const command = (at === -1 ? argv : argv.slice(at + 1)).join(' ').trim();
  if (!command) die('usage: heavy -- <command>', 2);
  process.exit(runHeavy(command));
}

// ---------------------------------------------------------------- hook install

function settingsPath() {
  return path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'settings.json');
}

function installHook(extraDir) {
  const file = settingsPath();
  const settings = readJson(file, {});
  settings.hooks ??= {};
  const command = `${ITER} hook`;
  const kept = (settings.hooks.PreToolUse ?? []).filter(
    (entry) => !(entry.hooks ?? []).some((h) => /iter\.mjs hook$/.test(h.command ?? ''))
  );
  kept.push({ matcher: 'Bash|Edit|Write|MultiEdit|NotebookEdit', hooks: [{ type: 'command', command }] });
  settings.hooks.PreToolUse = kept;
  settings.permissions ??= {};
  const dirs = new Set(settings.permissions.additionalDirectories ?? []);
  dirs.add(extraDir);
  settings.permissions.additionalDirectories = [...dirs];
  writeJson(file, settings);
  return file;
}

// ---------------------------------------------------------------- init

function cmdInit(argv) {
  const opts = flags(argv, ['integration']);
  const repo = repoAt();
  if (path.resolve(repo.top) !== path.resolve(repo.main)) die(`run init from the main checkout ${repo.main}`);
  const branch = opts.integration || gitOut(['branch', '--show-current'], repo.main);
  if (!branch) die('the main checkout is on a detached HEAD; pass --integration <branch>');
  if (gitOut(['branch', '--show-current'], repo.main) !== branch) {
    die(`the main checkout is on ${gitOut(['branch', '--show-current'], repo.main)}; check out ${branch} first`);
  }
  const { config, configPath, key } = loadConfig(repo.main);
  const state = updateState(repo, (s) => {
    s.integration = branch;
    s.main = repo.main;
    s.lead = SESSION;
    s.items ??= {};
    s.startedAt ??= now();
    s.gate ??= { green: headOf(branch, repo.main), runs: [] };
    return s;
  });
  const root = worktreeRoot(repo, state, config);
  fs.mkdirSync(root, { recursive: true });
  const settings = installHook(root);
  console.log(`integration branch  ${branch}`);
  console.log(`main checkout       ${repo.main}`);
  console.log(`worktrees           ${root}`);
  console.log(`repo config         ${configPath ?? `none (defaults); add ${path.join(SKILL_DIR, 'repos', `${key}.json`)}`}`);
  console.log(`hook                ${settings}`);
  const dirty = dirtyTracked(repo.main);
  if (dirty) {
    console.log(`\nwarning: the main checkout has uncommitted changes, and land refuses until they are committed or moved:\n${dirty}`);
  }
  console.log('');
  printStatus(repo, state, config);
}

// ---------------------------------------------------------------- spawn

function renderBrief(repo, state, config, it, briefText, extraText = '') {
  const template = fs.readFileSync(path.join(SKILL_DIR, 'worker.md'), 'utf8');
  const port = state.server?.port;
  const url = port ? `http://localhost:${port}` : null;
  const browse = url && config.server?.browse ? fillRaw(config.server.browse, vars(repo, state, { url, port })) : '';
  const values = {
    slug: it.slug,
    worktree: it.worktree,
    branch: it.branch,
    integration: state.integration,
    main: repo.main,
    iter: ITER,
    server: url ? ` at ${url}` : '',
    browse,
    extra: extraText.trim(),
  };
  const body = template.replace(/\{\{(\w+)\}\}/g, (m, name) => (name in values ? values[name] : m));
  const opener = config.opener ? `${config.opener} ` : '';
  return `${opener}${body.trim()}\n\n## Your item: ${it.slug}\n\n${briefText.trim()}\n`;
}

function cmdSpawn(argv) {
  const opts = flags(argv, ['brief', 'agent', 'model', 'effort', 'extra', 'title', 'review-gated']);
  const slug = opts._[0];
  if (!slug || !/^[a-z0-9][a-z0-9-]{0,40}$/.test(slug)) die('usage: spawn <slug> --brief <file> (slug: lowercase, digits, dashes)', 2);
  if (!opts.brief) die('spawn needs --brief <file>', 2);
  if (opts.extra === true || opts.title === true) die('--extra and --title each take a value', 2);
  const briefText = fs.readFileSync(opts.brief, 'utf8');
  const extraText = opts.extra ? fs.readFileSync(opts.extra, 'utf8') : '';
  const repo = repoAt();
  const state = requireState(repo);
  const { config, configPath } = loadConfig(repo.main);
  const existing = state.items?.[slug];
  if (existing?.session) die(`item "${slug}" already has session ${existing.session}; message it instead`);

  const branch = `${config.branchPrefix}${slug}`;
  const worktree = path.join(worktreeRoot(repo, state, config), slug);
  if (!existing) {
    if (git(['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], repo.main).status === 0) {
      die(`branch ${branch} already exists; pick another slug or delete it`);
    }
    for (const step of config.worktree.setup) {
      const command = fill(step, vars(repo, state, { branch, path: worktree, slug }));
      const result = bash(command, { cwd: repo.main });
      if (result.status !== 0) die(`worktree setup failed: ${command}\n${result.stdout}${result.stderr}`);
    }
  }
  const it = {
    slug,
    branch,
    worktree,
    createdAt: existing?.createdAt ?? now(),
    reviewGated: Boolean(opts['review-gated'] || existing?.reviewGated),
  };
  updateState(repo, (s) => {
    s.items[slug] = { ...s.items[slug], ...it };
  });

  const agent = opts.agent || config.agent;
  const model = opts.model || config.model;
  const effort = opts.effort || config.effort;
  const session = crypto.randomUUID();
  writeJson(path.join(SESSIONS_DIR, `${session}.json`), {
    slug,
    worktree,
    main: repo.main,
    stateDir: repo.stateDir,
    configPath,
  });
  const briefFile = path.join(repo.stateDir, 'briefs', `${slug}.md`);
  fs.mkdirSync(path.dirname(briefFile), { recursive: true });
  fs.writeFileSync(briefFile, renderBrief(repo, state, config, it, briefText, extraText));
  const name = opts.title ? `${slug}: ${opts.title}` : `iter: ${slug}`;
  const args = ['session', 'create', '--agent', agent, '--session-id', session, '--name', name, '--message-file', briefFile];
  if (model) args.push('--model', model);
  if (effort) args.push('--effort', effort);
  const created = conductor(args);
  if (!created.ok) {
    fs.rmSync(path.join(SESSIONS_DIR, `${session}.json`), { force: true });
    die(`conductor session create failed: ${created.error}\nThe worktree is ready; rerun spawn to retry.`);
  }
  const link = created.data?.deepLink ?? created.data?.deep_link ?? created.data?.link ?? null;
  updateState(repo, (s) => {
    Object.assign(s.items[slug], { session, agent, model, link });
  });
  console.log(`spawned ${slug}`);
  console.log(`  session   ${session}${link ? `\n  link      ${link}` : ''}`);
  console.log(`  branch    ${branch}`);
  console.log(`  worktree  ${worktree}`);
  if (it.reviewGated) console.log('  review    gated: done needs --accepted once the user accepts');
  if (agent !== 'claude') console.log('  note      the guard hook only runs in claude sessions');
}

// ---------------------------------------------------------------- status

function snapshot(repo, state, it) {
  const exists = fs.existsSync(it.worktree);
  const head = exists ? headOf(it.branch, repo.main) : null;
  const ahead = head ? Number(gitOut(['rev-list', '--count', `${state.integration}..${it.branch}`], repo.main)) : 0;
  const dirty = exists ? git(['status', '--porcelain'], it.worktree).stdout.trim().split('\n').filter(Boolean).length : 0;
  const files = head
    ? gitOut(['diff', '--name-only', `${state.integration}...${it.branch}`], repo.main).split('\n').filter(Boolean)
    : [];
  const dirtyFiles = exists
    ? git(['status', '--porcelain'], it.worktree).stdout.split('\n').filter(Boolean).map((l) => l.slice(3))
    : [];
  const landed = head ? ahead === 0 && (it.landed?.length ?? 0) > 0 : false;
  return {
    slug: it.slug,
    session: sessionState(it.session),
    head: head?.slice(0, 7) ?? '-',
    ahead,
    dirty,
    gate: itemGate(repo, state, it),
    landed: landed ? 'yes' : ahead === 0 ? '-' : 'no',
    lastLand: it.landed?.at(-1)?.sha?.slice(0, 7) ?? '-',
    review: it.reviewGated ? 'gated' : '-',
    link: it.link ?? it.session ?? '-',
    files: [...new Set([...files, ...dirtyFiles])],
  };
}

function overlaps(rows) {
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const shared = rows[i].files.filter((f) => rows[j].files.includes(f));
      if (shared.length) out.push({ a: rows[i].slug, b: rows[j].slug, files: shared });
    }
  }
  return out;
}

function serverStatus(state) {
  const server = state.server;
  if (!server) return { line: 'no iter server', alive: false };
  const alive = pidAlive(server.pid);
  return {
    alive,
    line: `${alive ? 'up' : 'DOWN'} on port ${server.port}, pid ${server.pid}, log ${server.log}`,
  };
}

function printStatus(repo, state, config, json = false) {
  const rows = Object.values(state.items ?? {}).map((it) => snapshot(repo, state, it));
  const pairs = overlaps(rows);
  const server = serverStatus(state);
  const gate = gateView(repo, state);
  if (json) {
    console.log(JSON.stringify({ integration: state.integration, gate, server: state.server ?? null, items: rows, overlaps: pairs }, null, 2));
    return;
  }
  console.log(`integration ${state.integration} at ${gate.head.slice(0, 7)}; ${gateLine(repo, state, gate)}; server: ${server.line}`);
  if (!rows.length) {
    console.log('no items');
    return;
  }
  const cols = ['slug', 'session', 'head', 'ahead', 'dirty', 'landed', 'lastLand', 'gate', 'review', 'link'];
  const widths = cols.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c]).length)));
  const line = (r) => cols.map((c, i) => String(r[c]).padEnd(widths[i])).join('  ');
  console.log(line(Object.fromEntries(cols.map((c) => [c, c]))));
  for (const r of rows) console.log(line(r));
  for (const p of pairs) console.log(`overlap: ${p.a} and ${p.b} both change ${p.files.join(', ')}`);
}

function cmdStatus(argv) {
  const opts = flags(argv, ['json']);
  const repo = repoAt();
  const state = requireState(repo);
  printStatus(repo, state, loadConfig(repo.main).config, Boolean(opts.json));
}

// The gate's debounce: check the integration head once it has stood still for
// quietSec, or once changes have waited maxWaitSec under a stream of landings.
async function cmdWatch(argv) {
  const opts = flags(argv, ['interval']);
  const interval = Number(opts.interval || 20) * 1000;
  const repo = repoAt();
  const { config } = loadConfig(repo.main);
  const quietMs = config.gate.quietSec * 1000;
  const maxWaitMs = config.gate.maxWaitSec * 1000;
  let previous = null;
  const seenPairs = new Set();
  let previousGate = '';
  let serverWasAlive = true;
  let head = { sha: null, since: 0 };
  let pendingSince = null;
  for (;;) {
    const state = requireState(repo);
    const gate = gateView(repo, state);
    if (gate.head !== head.sha) head = { sha: gate.head, since: Date.now() };
    if (gate.phase !== 'pending') pendingSince = null;
    else {
      pendingSince ??= Date.now();
      if (Date.now() - head.since >= quietMs || Date.now() - pendingSince >= maxWaitMs) {
        startGate(repo, gate.head);
        pendingSince = null;
      }
    }
    const rows = Object.values(state.items ?? {}).map((it) => snapshot(repo, state, it));
    const stamp = new Date().toTimeString().slice(0, 5);
    const line = gateLine(repo, requireState(repo));
    const server = serverStatus(state);
    const serverAlive = !state.server || server.alive;
    // The first pass is one summary line; after it, only what the lead acts on:
    // a session going idle, a landing, a gate result, a new overlap, the server going down.
    if (previous === null) {
      const items = rows.map((r) => `${r.slug} ${r.session}`).join(', ') || 'no items';
      console.log(`${stamp} watching ${items}; ${line}; server ${serverAlive ? 'up' : `DOWN (${server.line})`}`);
      previousGate = line;
    } else {
      for (const r of rows) {
        const before = previous[r.slug];
        const changes = [];
        if (!before) changes.push(`new, session ${r.session}`);
        else {
          if (r.session === 'idle' && before.session !== 'idle') changes.push('session idle');
          if (before.lastLand !== r.lastLand) changes.push(`landed ${r.lastLand}`);
          if (before.gate !== r.gate) changes.push(`gate ${r.gate}`);
        }
        if (changes.length) console.log(`${stamp} ${r.slug}: ${changes.join(', ')}`);
      }
      for (const slug of Object.keys(previous)) {
        if (!rows.some((r) => r.slug === slug)) console.log(`${stamp} ${slug}: done`);
      }
      if (line !== previousGate) console.log(`${stamp} ${line}`);
      previousGate = line;
      if (serverWasAlive && !serverAlive) console.log(`${stamp} server DOWN (${server.line})`);
    }
    for (const p of overlaps(rows)) {
      const key = `${p.a}+${p.b}`;
      if (!seenPairs.has(key)) console.log(`${stamp} overlap ${key}: ${p.files.join(', ')}`);
      seenPairs.add(key);
    }
    serverWasAlive = serverAlive;
    previous = Object.fromEntries(rows.map((r) => [r.slug, r]));
    // An async sleep lets Node reap gate runs that exit, so a crashed one reads as dead.
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

// ---------------------------------------------------------------- gate

// The gate checks integration commits, never item branches: `green` is the last
// commit that passed, and a run checks everything landed since it.
function gateView(repo, state) {
  const gate = state.gate ?? {};
  const head = headOf(state.integration, repo.main);
  const last = gate.runs?.at(-1);
  if (gate.running && pidAlive(gate.running.pid)) return { phase: 'running', head, sha: gate.running.sha };
  if (head === gate.green) return { phase: 'green', head };
  if (last && last.sha === head && !last.ok) return { phase: 'red', head, run: last };
  return { phase: 'pending', head };
}

function gateLine(repo, state, view = gateView(repo, state)) {
  const green = state.gate?.green?.slice(0, 7) ?? 'none';
  if (view.phase === 'green') return `gate green at ${green}`;
  if (view.phase === 'running') return `gate checking ${view.sha.slice(0, 7)} (last green ${green})`;
  const items = landedSince(repo, state, state.gate?.green, view.head);
  const since = `landed since ${green}: ${items.join(', ') || 'no items'}`;
  if (view.phase === 'red') return `gate FAIL at ${view.head.slice(0, 7)} (${since}); log ${view.run.log ?? 'none'}`;
  return `gate pending at ${view.head.slice(0, 7)} (${since})`;
}

function landedSince(repo, state, green, sha) {
  return Object.values(state.items ?? {})
    .filter((it) =>
      (it.landed ?? []).some((l) => isAncestor(l.sha, sha, repo.main) && !(green && isAncestor(l.sha, green, repo.main)))
    )
    .map((it) => it.slug);
}

function itemGate(repo, state, it) {
  const sha = it.landed?.at(-1)?.sha;
  if (!sha) return '-';
  const gate = state.gate ?? {};
  if (gate.green && isAncestor(sha, gate.green, repo.main)) return 'green';
  const last = gate.runs?.at(-1);
  if (last && !last.ok && isAncestor(sha, last.sha, repo.main)) return 'FAIL';
  return 'pending';
}

function startGate(repo, sha) {
  const out = path.join(repo.stateDir, 'logs', 'gate.out');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const fd = fs.openSync(out, 'a');
  spawn(process.execPath, [SELF, 'gate', '--sha', sha], { cwd: repo.main, detached: true, stdio: ['ignore', fd, fd] }).unref();
  fs.closeSync(fd);
}

// A worktree of its own, so the check sees one commit while landings move the
// main checkout under the dev server.
function gateWorktree(repo, state, config, sha) {
  const wt = path.join(worktreeRoot(repo, state, config), '.gate');
  const branch = `${config.branchPrefix}_gate`;
  if (!fs.existsSync(wt)) {
    git(['worktree', 'prune'], repo.main);
    git(['branch', '-D', branch], repo.main);
    for (const step of config.worktree.setup) {
      const command = fill(step, vars(repo, state, { branch, path: wt, slug: '_gate' }));
      const result = bash(command, { cwd: repo.main });
      if (result.status !== 0) throw new Error(`gate worktree setup failed: ${command}\n${result.stdout}${result.stderr}`);
    }
  }
  for (const args of [['reset', '--hard', sha], ['clean', '-fd']]) {
    const result = git(args, wt);
    if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed in ${wt}: ${result.stderr.trim()}`);
  }
  return { wt, branch };
}

function cmdGate(argv) {
  const opts = flags(argv, ['sha']);
  const repo = repoAt();
  const { config } = loadConfig(repo.main);
  const release = acquire(repo.stateDir, 'gate', { wait: false });
  if (!release) {
    console.log('a gate check is already running; `status` shows it');
    return;
  }
  let ok = true;
  try {
    const state = requireState(repo);
    const sha = gitOut(['rev-parse', opts.sha || state.integration], repo.main);
    const green = state.gate?.green ?? null;
    if (sha === green) {
      console.log(`PASS ${sha.slice(0, 7)} (already green)`);
      return;
    }
    const base = green ?? sha;
    const log = path.join(repo.stateDir, 'logs', `gate-${sha.slice(0, 7)}.log`);
    fs.mkdirSync(path.dirname(log), { recursive: true });
    fs.writeFileSync(log, '');
    updateState(repo, (s) => {
      s.gate ??= { green, runs: [] };
      s.gate.running = { pid: process.pid, sha, base, startedAt: now(), log };
    });
    console.log(`gate ${sha.slice(0, 7)} since ${base.slice(0, 7)}; log ${log}`);
    if (!config.check) {
      console.log('no check configured for this repo; recording a pass');
    } else {
      try {
        const { wt, branch } = gateWorktree(repo, state, config, sha);
        const command = fill(config.check, vars(repo, state, { branch, path: wt, slug: '_gate', base }));
        fs.writeFileSync(log, `$ ${command}\n`);
        ok = runHeavy(command, { cwd: wt, logFile: log, append: true }) === 0;
      } catch (error) {
        fs.appendFileSync(log, `${error.message}\n`);
        ok = false;
      }
    }
    const items = landedSince(repo, state, green, sha);
    updateState(repo, (s) => {
      delete s.gate.running;
      s.gate.runs = [...(s.gate.runs ?? []), { sha, base, ok, at: now(), log, items }].slice(-20);
      if (ok && !(s.gate.green && isAncestor(sha, s.gate.green, repo.main))) s.gate.green = sha;
    });
    if (ok) {
      console.log(`PASS ${sha.slice(0, 7)} (${items.join(', ') || 'no items'})`);
      if (config.push) {
        const push = git(['push', 'origin', `${sha}:refs/heads/${state.integration}`], repo.main);
        console.log(push.status === 0 ? `pushed ${state.integration} at ${sha.slice(0, 7)}` : `push failed: ${push.stderr.trim()}`);
      }
      return;
    }
    const tail = fs.readFileSync(log, 'utf8').split('\n').slice(-40).join('\n');
    console.log(`FAIL ${sha.slice(0, 7)} (${items.join(', ') || 'no items'})\n--- last lines of ${log} ---\n${tail}`);
    for (const slug of items) {
      const it = state.items[slug];
      const others = items.filter((o) => o !== slug);
      const text = `iter gate: the repo check failed on ${state.integration} at ${sha.slice(0, 7)}, which has your landings${others.length ? ` and those of ${others.join(', ')}` : ''} since the last pass at ${base.slice(0, 7)}. Full log: ${log}. Last lines:\n${tail}\n\nIf the failure comes from your change, fix it in your worktree, commit, and run \`${ITER} land ${slug}\`; the gate checks again once landings go quiet. If it does not, reply saying so.`;
      if (tellSession(it.session, text)) console.log(`told ${slug}`);
    }
  } finally {
    release();
  }
  process.exitCode = ok ? 0 : 1;
}

function cmdPush() {
  const repo = repoAt();
  const state = requireState(repo);
  const green = state.gate?.green;
  if (!green) die('nothing has passed the gate yet');
  const push = git(['push', 'origin', `${green}:refs/heads/${state.integration}`], repo.main);
  if (push.status !== 0) die(`push failed: ${push.stderr.trim()}`);
  const head = headOf(state.integration, repo.main);
  console.log(`pushed ${state.integration} at ${green.slice(0, 7)}${head === green ? '' : `; ${head.slice(0, 7)} is not green yet and stays local`}`);
}

// ---------------------------------------------------------------- land

function cmdLand(argv) {
  const opts = flags(argv, []);
  const slug = opts._[0];
  if (!slug) die('usage: land <slug>', 2);
  const repo = repoAt();
  const release = acquire(repo.stateDir, 'land', {
    onWait: (owner) => process.stderr.write(`iter: waiting for another land (pid ${owner?.pid ?? '?'})\n`),
  });
  try {
    const state = requireState(repo);
    const it = item(state, slug);
    const integration = state.integration;
    const wtDirty = dirtyTracked(it.worktree);
    if (wtDirty) die(`commit your changes in ${it.worktree} first:\n${wtDirty}`);
    const head = headOf(it.branch, repo.main);
    if (isAncestor(head, integration, repo.main)) {
      console.log(`nothing to land: ${it.branch} at ${head.slice(0, 7)} is already in ${integration}`);
      console.log(`READY ${head}`);
      return;
    }
    const mainDirty = dirtyTracked(repo.main);
    if (mainDirty) {
      die(`the main checkout ${repo.main} has uncommitted changes; it serves the integration branch only, so commit or move them first:\n${mainDirty}`);
    }
    const onBranch = gitOut(['branch', '--show-current'], repo.main);
    if (onBranch !== integration) die(`the main checkout is on ${onBranch}, not ${integration}`);

    const behind = Number(gitOut(['rev-list', '--count', `${it.branch}..${integration}`], repo.main));
    if (behind > 0) {
      const rebase = git(['rebase', integration], it.worktree);
      if (rebase.status !== 0) {
        const conflicted = git(['diff', '--name-only', '--diff-filter=U'], it.worktree).stdout.trim().split('\n').filter(Boolean);
        git(['rebase', '--abort'], it.worktree);
        const text = `iter land ${slug}: rebasing ${it.branch} onto ${integration} conflicts in ${conflicted.join(', ') || 'unknown files'}. Nothing landed and your branch is unchanged. In ${it.worktree}: run \`git rebase ${integration}\`, resolve, commit, then \`${ITER} land ${slug}\` again.`;
        const told = tellSession(it.session, text);
        die(`${text}${told ? '\n(sent to the item session)' : ''}`);
      }
    }
    const landedSha = headOf(it.branch, repo.main);
    const merge = git(['merge', '--ff-only', it.branch], repo.main);
    if (merge.status !== 0) die(`fast-forward of ${integration} failed: ${merge.stderr.trim()}`);
    updateState(repo, (s) => {
      const entry = s.items[slug];
      entry.landed ??= [];
      entry.landed.push({ sha: landedSha, at: now(), rebasedOver: behind });
    });
    console.log(`landed ${slug}: ${integration} is now ${landedSha.slice(0, 7)}${behind ? ` (rebased over ${behind} commit${behind === 1 ? '' : 's'})` : ''}`);
    if (state.server?.port) console.log(`live at http://localhost:${state.server.port} once the dev server reloads; \`${ITER} server logs\` shows its compile errors`);
    console.log(`READY ${landedSha}`);
  } finally {
    release();
  }
}

// ---------------------------------------------------------------- server

function portFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '0.0.0.0', () => server.close(() => resolve(true)));
  });
}

function httpCode(url) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 5000 }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on('error', () => resolve(0));
    req.on('timeout', () => {
      req.destroy();
      resolve(0);
    });
  });
}

function foreignServers(dir) {
  if (process.platform !== 'linux') return [];
  const out = [];
  for (const pid of fs.readdirSync('/proc').filter((p) => /^\d+$/.test(p))) {
    try {
      if (path.resolve(fs.readlinkSync(`/proc/${pid}/cwd`)) !== path.resolve(dir)) continue;
      const cmd = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ').trim();
      if (cmd) out.push({ pid: Number(pid), cmd: cmd.slice(0, 160) });
    } catch {
      // process exited or is not ours to read
    }
  }
  return out;
}

async function cmdServer(argv) {
  const [action = 'status', ...rest] = argv;
  const opts = flags(rest, ['port']);
  const repo = repoAt();
  const state = requireState(repo);
  const { config } = loadConfig(repo.main);
  const server = config.server;
  if (!server) die(`no server configured for this repo; add "server" to its config (see ${path.join(SKILL_DIR, 'repos', 'README.md')})`);
  const healthUrl = (port) => `http://127.0.0.1:${port}${server.health ?? '/'}`;

  if (action === 'status') {
    const s = state.server;
    if (!s) {
      console.log('no iter server');
      const foreign = server.exclusiveDir ? foreignServers(path.join(repo.main, server.exclusiveDir)) : [];
      for (const f of foreign) console.log(`not ours: pid ${f.pid} ${f.cmd}`);
      return;
    }
    const alive = pidAlive(s.pid);
    const code = alive ? await httpCode(healthUrl(s.port)) : 0;
    console.log(`${alive ? 'up' : 'DOWN'} http://localhost:${s.port} pid ${s.pid} health ${code || 'no answer'} since ${s.startedAt} owner ${s.owner ?? '?'}\nlog ${s.log}`);
    return;
  }
  if (action === 'logs') {
    const s = state.server;
    if (!s) die('no iter server');
    const lines = fs.readFileSync(s.log, 'utf8').split('\n');
    console.log(lines.slice(-Number(opts.n || 80)).join('\n'));
    return;
  }
  if (action === 'down') {
    const s = state.server;
    if (!s) {
      console.log('no iter server to stop');
      return;
    }
    if (pidAlive(s.pid)) {
      try {
        process.kill(-s.pid, 'SIGTERM');
      } catch {
        process.kill(s.pid, 'SIGTERM');
      }
      const start = Date.now();
      while (pidAlive(s.pid) && Date.now() - start < 10000) sleepMs(250);
      if (pidAlive(s.pid)) {
        try {
          process.kill(-s.pid, 'SIGKILL');
        } catch {
          process.kill(s.pid, 'SIGKILL');
        }
      }
    }
    updateState(repo, (st) => {
      delete st.server;
    });
    console.log(`stopped the iter server on port ${s.port}`);
    return;
  }
  if (action !== 'up') die('usage: server up [--port n] | down | status | logs [-n lines]', 2);

  if (state.server && pidAlive(state.server.pid)) {
    console.log(`already up on port ${state.server.port} (pid ${state.server.pid}); \`server down\` first to restart`);
    return;
  }
  if (server.exclusiveDir) {
    const foreign = foreignServers(path.join(repo.main, server.exclusiveDir));
    if (foreign.length) {
      die(`processes iter did not start already run from ${server.exclusiveDir}; only one server fits this checkout. Stop them or ask their owner:\n${foreign.map((f) => `  pid ${f.pid} ${f.cmd}`).join('\n')}`);
    }
  }
  let port = Number(opts.port || 0);
  if (port) {
    if (!(await portFree(port))) die(`port ${port} is busy`);
  } else {
    port = Number(server.basePort || 3200);
    while (!(await portFree(port))) port++;
  }
  const command = fill(server.start, vars(repo, state, { port }));
  const logDir = path.join(repo.stateDir, 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  const log = path.join(logDir, `server-${port}.log`);
  const fd = fs.openSync(log, 'a');
  const child = spawn('bash', ['-c', command], {
    cwd: server.cwd ? path.join(repo.main, server.cwd) : repo.main,
    env: { ...process.env, ...(server.env ?? {}), PORT: String(port) },
    detached: true,
    stdio: ['ignore', fd, fd],
  });
  child.unref();
  updateState(repo, (st) => {
    st.server = { pid: child.pid, port, log, startedAt: now(), owner: SESSION, command };
  });
  console.log(`starting on port ${port} (pid ${child.pid}); log ${log}`);
  const deadline = Date.now() + Number(server.readyTimeoutSec || 180) * 1000;
  for (;;) {
    if (!pidAlive(child.pid)) {
      updateState(repo, (st) => {
        delete st.server;
      });
      die(`the server exited during startup; last lines:\n${fs.readFileSync(log, 'utf8').split('\n').slice(-30).join('\n')}`);
    }
    const code = await httpCode(healthUrl(port));
    if (code && code < 500) break;
    if (Date.now() > deadline) die(`no healthy answer from ${healthUrl(port)} in time; it is still starting (pid ${child.pid}), see ${log}`);
    sleepMs(2000);
  }
  console.log(`up: http://localhost:${port}`);
}

// ---------------------------------------------------------------- done

function cmdDone(argv) {
  const opts = flags(argv, ['force', 'accepted']);
  const slug = opts._[0];
  if (!slug) die('usage: done <slug> [--accepted] [--force]', 2);
  const repo = repoAt();
  const state = requireState(repo);
  const it = item(state, slug);
  if (it.reviewGated && !opts.accepted) {
    die(`${slug} is review-gated: run done --accepted only after the user accepts it in its session`);
  }
  const exists = fs.existsSync(it.worktree);
  if (exists && !opts.force) {
    const head = headOf(it.branch, repo.main);
    if (!isAncestor(head, state.integration, repo.main)) die(`${it.branch} has commits not in ${state.integration}; land them or pass --force to drop them`);
    const gate = itemGate(repo, state, it);
    if (gate !== 'green' && gate !== '-') die(`the gate has not passed on ${slug}'s last landing (gate ${gate}); wait for it, run \`${ITER} gate\`, or pass --force`);
    const dirty = git(['status', '--porcelain'], it.worktree).stdout.trim();
    if (dirty) die(`${it.worktree} has uncommitted changes; pass --force to drop them:\n${dirty}`);
  }
  if (it.session) {
    const archived = conductor(['session', 'archive', it.session]);
    if (!archived.ok) console.log(`could not archive session ${it.session}: ${archived.error}`);
    fs.rmSync(path.join(SESSIONS_DIR, `${it.session}.json`), { force: true });
  }
  if (exists) {
    const removed = git(['worktree', 'remove', '--force', it.worktree], repo.main);
    if (removed.status !== 0) console.log(`worktree remove failed: ${removed.stderr.trim()}`);
  }
  git(['branch', '-D', it.branch], repo.main);
  updateState(repo, (s) => {
    s.done ??= [];
    s.done.push({ ...s.items[slug], doneAt: now() });
    delete s.items[slug];
  });
  console.log(`done ${slug}: session archived, worktree and ${it.branch} removed`);
}

// ---------------------------------------------------------------- hook

function block(message) {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

function cmdHook() {
  let input;
  try {
    input = JSON.parse(fs.readFileSync(0, 'utf8'));
  } catch {
    process.exit(0);
  }
  const reg = readJson(path.join(SESSIONS_DIR, `${input.session_id}.json`), null);
  if (!reg) process.exit(0);
  try {
    guard(input, reg);
  } catch (error) {
    fs.mkdirSync(HOME_DIR, { recursive: true });
    fs.appendFileSync(path.join(HOME_DIR, 'hook.log'), `${now()} ${error.stack}\n`);
  }
  process.exit(0);
}

function guard(input, reg) {
  const wt = reg.worktree;
  const config = { ...DEFAULTS, ...(reg.configPath ? readJson(reg.configPath, {}) : {}) };
  const tool = input.tool_name;
  const toolInput = input.tool_input ?? {};

  if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool)) {
    const file = toolInput.file_path ?? toolInput.notebook_path;
    if (!file) return;
    const abs = path.resolve(input.cwd ?? wt, file);
    if (!isInside(abs, wt)) {
      const twin = isInside(abs, reg.main) ? path.join(wt, path.relative(reg.main, abs)) : null;
      block(`iter: you are the implementer for "${reg.slug}" and edit only inside your worktree ${wt}.${twin ? ` The same file there is ${twin}.` : ''}`);
    }
    return;
  }
  if (tool !== 'Bash') return;
  const cmd = String(toolInput.command ?? '').trim();
  const iterCall = /^node\s+\S*iter\.mjs\s+(land|heavy|status|help|server\s+(status|logs))\b/.test(cmd);

  if (/\biter\.mjs\s+(init|spawn|watch|gate|push|done|server\s+(up|down))\b/.test(cmd)) {
    block(`iter: that is the lead's command. The lead runs the dev server and the gate; \`${ITER} land ${reg.slug}\` puts your work on the server, and \`${ITER} status\` shows the gate.`);
  }
  if (/\bgit\s+push\b/.test(cmd)) {
    block(`iter: \`${ITER} land ${reg.slug}\` puts your work on the integration branch; pushing is the lead's call.`);
  }
  if (/\bln\s+-\w*s\w*\b[^|;&]*node_modules/.test(cmd)) {
    block('iter: a symlinked node_modules resolves packages from another checkout. Your worktree already has its own node_modules.');
  }
  for (const rule of config.block ?? []) {
    if (new RegExp(rule.pattern).test(cmd)) block(`iter: ${rule.message}`);
  }
  if (!iterCall) {
    const cwd = input.cwd ? path.resolve(input.cwd) : null;
    const escaped = wt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const cdFirst = new RegExp(`^cd\\s+['"]?${escaped}(?:/[^\\s'"&;|]*)?['"]?(\\s|$|;|&)`).test(cmd);
    if (!cdFirst && !(cwd && isInside(cwd, wt))) {
      block(`iter: run commands from your worktree. Start the command with \`cd ${wt} && \`.`);
    }
  }
  const heavy = (config.heavy?.patterns ?? []).some((p) => new RegExp(p).test(cmd));
  if (heavy && !/\biter\.mjs\s+heavy\b/.test(cmd)) {
    block(`iter: this is a heavy command. Run it as \`${ITER} heavy -- <command>\` so sessions take turns and the dev server keeps its memory.`);
  }
}

// ---------------------------------------------------------------- main

const [command, ...argv] = process.argv.slice(2);
const commands = {
  init: cmdInit,
  spawn: cmdSpawn,
  status: cmdStatus,
  watch: cmdWatch,
  gate: cmdGate,
  push: cmdPush,
  land: cmdLand,
  server: cmdServer,
  heavy: cmdHeavy,
  done: cmdDone,
  hook: cmdHook,
};
if (!command || command === 'help' || command === '--help') {
  console.log(HELP);
} else if (!commands[command]) {
  die(`unknown command ${command}\n${HELP}`, 2);
} else {
  await commands[command](argv);
}
