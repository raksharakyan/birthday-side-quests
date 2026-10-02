#!/usr/bin/env node
/**
 * Weekly check of every offer sourceUrl in public/offers.json.
 * Hard failures (network error, 404/410, 5xx, non-https) open or update ONE GitHub issue via `gh`.
 * 401/403/429 are reported as "blocked" only — many brand sites block bots.
 * Usage: node scripts/check-links.mjs [--dry-run]
 */
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const UA = 'BirthdaySideQuests-LinkCheck';
const TIMEOUT_MS = 15_000;
const ISSUE_TITLE = 'Offer source links failing';
const dryRun = process.argv.includes('--dry-run') || !process.env.GH_TOKEN;

async function probe(url, method) {
  const res = await fetch(url, {
    method,
    redirect: 'follow',
    headers: { 'User-Agent': UA, Accept: 'text/html,*/*;q=0.8' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  // Don't download bodies.
  await res.body?.cancel().catch(() => {});
  return res.status;
}

async function check(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { kind: 'fail', detail: 'invalid URL' };
  }
  if (parsed.protocol !== 'https:') return { kind: 'fail', detail: 'not https' };
  let status;
  try {
    status = await probe(url, 'HEAD');
    if (status >= 400) status = await probe(url, 'GET'); // many servers mishandle HEAD
  } catch (err) {
    try {
      status = await probe(url, 'GET');
    } catch (err2) {
      return { kind: 'fail', detail: `network error: ${(err2 ?? err)?.name ?? 'Error'}` };
    }
  }
  if (status < 400) return { kind: 'ok', detail: String(status) };
  if (status === 401 || status === 403 || status === 429) return { kind: 'blocked', detail: String(status) };
  return { kind: 'fail', detail: `HTTP ${status}` };
}

function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
}

const data = JSON.parse(await readFile(new URL('../public/offers.json', import.meta.url), 'utf8'));
const offers = Array.isArray(data.offers) ? data.offers : [];
const results = [];
for (const o of offers) {
  const r = await check(String(o.sourceUrl ?? ''));
  results.push({ id: String(o.id), brand: String(o.brand), url: String(o.sourceUrl), ...r });
  console.log(`${r.kind.padEnd(7)} ${r.detail.padEnd(22)} ${o.id} ${o.sourceUrl}`);
}

const failed = results.filter((r) => r.kind === 'fail');
const blocked = results.filter((r) => r.kind === 'blocked');
console.log(`\n${results.length} checked · ${failed.length} failed · ${blocked.length} blocked`);

if (failed.length === 0) process.exit(0);

const date = new Date().toISOString().slice(0, 10);
// Table cells are built from repo data (reviewed via PR), but escape anyway so a stray "|", backtick,
// "@mention", "<tag>" or newline can't break the table, ping people or inject markup into the issue.
const cell = (v) =>
  String(v)
    .replace(/[\r\n]+/g, ' ')
    .replace(/[|`<>\[\]]/g, (c) => `&#${c.charCodeAt(0)};`)
    .replace(/@/g, '@\u200b')
    .slice(0, 300);
const row = (r) => `| \`${cell(r.id)}\` | ${cell(r.brand)} | ${cell(r.url)} | ${cell(r.detail)} |`;
const body = [
  `Weekly link check on ${date} found **${failed.length}** failing offer source link(s) in \`public/offers.json\`.`,
  '',
  'Please re-verify these offers on the official brand page and update `sourceUrl` / `lastVerified`, or set `verified: false`.',
  '',
  '| id | brand | sourceUrl | result |',
  '|---|---|---|---|',
  ...failed.map(row),
  '',
  blocked.length ? `<details><summary>${blocked.length} link(s) blocked automated checks (401/403/429) — check manually</summary>\n\n${blocked.map(row).join('\n')}\n</details>` : '',
].join('\n');

if (dryRun) {
  console.log('\n[dry run] would open/update issue:\n');
  console.log(body);
  process.exit(1);
}

const existing = JSON.parse(gh(['issue', 'list', '--state', 'open', '--search', `"${ISSUE_TITLE}" in:title`, '--json', 'number,title']));
const match = existing.find((i) => i.title === ISSUE_TITLE);
if (match) {
  gh(['issue', 'edit', String(match.number), '--body', body]);
  gh(['issue', 'comment', String(match.number), '--body', `Still failing on ${date}: ${failed.map((f) => `\`${f.id}\``).join(', ')}`]);
  console.log(`Updated issue #${match.number}`);
} else {
  gh(['issue', 'create', '--title', ISSUE_TITLE, '--body', body]);
  console.log('Opened a new issue');
}
// Exit 0 once the issue is filed so the scheduled run isn't noisy; the issue is the signal.
