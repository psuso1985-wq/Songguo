#!/usr/bin/env node
import { pathToFileURL } from 'node:url';

const serviceIdentities = [
  {
    variable: 'NOCOBASE_API_TOKEN',
    role: 'aisys-phase1-reader',
    probes: ['agents:list?paginate=false&pageSize=1'],
  },
  {
    variable: 'NOCOBASE_REPORT_API_TOKEN',
    role: 'aisys-phase2-report-writer',
    probes: ['agent_credentials:list?paginate=false&pageSize=1'],
  },
  {
    variable: 'NOCOBASE_DISCUSSION_API_TOKEN',
    role: 'aisys-v3-discussion-service',
    probes: ['discussion_rooms:list?paginate=false&pageSize=1'],
  },
  {
    variable: 'NOCOBASE_MACHINE_API_TOKEN',
    role: 'aisys-machine-credential-service',
    probes: [
      'registered_machines:list?paginate=false&pageSize=1',
      'agents:list?paginate=false&pageSize=1',
    ],
  },
  {
    variable: 'NOCOBASE_WORK_API_TOKEN',
    role: 'aisys-v4-work-management-service',
    probes: [
      'work_tasks:list?paginate=false&pageSize=1',
      'projects:list?paginate=false&pageSize=1',
    ],
  },
];

function expect(value, message) {
  if (!value) throw new Error(message);
}

function decodePayload(token, variable) {
  const parts = token.split('.');
  expect(parts.length === 3, `${variable} is not a JWT-shaped NocoBase API Key.`);
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    throw new Error(`${variable} has an unreadable JWT payload.`);
  }
}

function containsTempClaim(payload) {
  return payload.temp === true
    || payload.type === 'temp'
    || payload.tokenType === 'temp'
    || payload.typ === 'temp';
}

export async function verifySharedServiceIdentities({
  env = process.env,
  fetchImpl = globalThis.fetch,
  now = Date.now(),
  log = console.log,
} = {}) {
  const baseUrl = (env.NOCOBASE_URL || '').replace(/\/$/, '');
  expect(baseUrl, 'NOCOBASE_URL is required.');
  expect(typeof fetchImpl === 'function', 'A fetch implementation is required.');

  const seenTokens = new Map();
  const results = [];
  for (const service of serviceIdentities) {
    const token = env[service.variable] || '';
    expect(token, `${service.variable} is missing.`);
    const duplicate = seenTokens.get(token);
    expect(!duplicate, `${service.variable} reuses the credential configured as ${duplicate}.`);
    seenTokens.set(token, service.variable);

    const payload = decodePayload(token, service.variable);
    expect(!containsTempClaim(payload), `${service.variable} contains a temporary-session claim.`);
    expect(payload.roleName === service.role,
      `${service.variable} is bound to an unexpected NocoBase role.`);
    expect(Number.isFinite(Number(payload.exp)) && Number(payload.exp) * 1000 > now,
      `${service.variable} is expired or has no valid expiry.`);

    const probes = [];
    for (const path of service.probes) {
      let response;
      try {
        response = await fetchImpl(`${baseUrl}/api/${path}`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        });
      } catch {
        throw new Error(`${service.variable} could not reach NocoBase.`);
      }
      await response.arrayBuffer();
      expect(response.ok,
        `${service.variable} failed ${path.split('?')[0]} permission probe (${response.status}).`);
      probes.push({ resource: path.split('?')[0], status: response.status });
    }
    results.push({
      variable: service.variable,
      role: service.role,
      expires_at: new Date(Number(payload.exp) * 1000).toISOString(),
      probes,
    });
  }

  const result = { status: 'PASS', session_token_assertion: 'PASS', services: results };
  log(JSON.stringify(result, null, 2));
  return result;
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === invokedPath) {
  verifySharedServiceIdentities().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Shared service identity preflight failed.');
    process.exitCode = 1;
  });
}
