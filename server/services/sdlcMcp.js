import 'dotenv/config';

// Thin MCP client for the Ananta SDLC backlog tool (remote, plain HTTPS + Bearer auth — no
// stdio shim needed since we're calling it directly from the server, not from a stdio-only MCP
// host). Speaks the Streamable HTTP transport: POST JSON-RPC, response comes back as a single
// SSE "message" event whose data payload is the JSON-RPC response.
const MCP_URL = process.env.SDLC_MCP_URL;
const MCP_TOKEN = process.env.SDLC_MCP_TOKEN;

let sessionId = null;
let reqId = 0;

function assertConfigured() {
  if (!MCP_URL || !MCP_TOKEN) {
    throw new Error('SDLC_MCP_URL and SDLC_MCP_TOKEN must be set in .env');
  }
}

// The transport wraps each JSON-RPC response in one `event: message\ndata: {...}` SSE frame —
// parse just the data payload rather than pulling in a full SSE client for a single event.
function parseSseJson(text) {
  const line = text.split('\n').find(l => l.startsWith('data:'));
  if (!line) throw new Error(`SDLC MCP: no data frame in response: ${text.slice(0, 200)}`);
  return JSON.parse(line.slice(5).trim());
}

async function rpcCall(method, params, { needsSession = true } = {}) {
  assertConfigured();
  const headers = {
    'Authorization': `Bearer ${MCP_TOKEN}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
  };
  if (needsSession && sessionId) headers['Mcp-Session-Id'] = sessionId;

  const res = await fetch(MCP_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: ++reqId, method, params }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`SDLC MCP ${method} failed: ${res.status} ${text.slice(0, 300)}`);

  if (!sessionId) {
    const sid = res.headers.get('mcp-session-id');
    if (sid) sessionId = sid;
  }

  const payload = parseSseJson(text);
  if (payload.error) throw new Error(`SDLC MCP ${method} error: ${payload.error.message || JSON.stringify(payload.error)}`);
  return payload.result;
}

async function ensureSession() {
  if (sessionId) return;
  await rpcCall('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'gnc-smart-layer', version: '1.0' },
  }, { needsSession: false });
}

// Calls an SDLC tool by name (e.g. 'create_task') and returns its parsed text content. Tool
// results come back as { content: [{ type: 'text', text: '...' }] } — for create_task the text
// is a human-readable confirmation line, not structured JSON, so callers that need the task
// code should parse it out of that line.
export async function callSdlcTool(name, args) {
  await ensureSession();
  const result = await rpcCall('tools/call', { name, arguments: args });
  const text = result?.content?.find(c => c.type === 'text')?.text || '';
  return { text, raw: result };
}

// Creates a backlog task and returns its code (e.g. "GNC-123") if the response includes one.
export async function createSdlcTask({ title, description, brandId, discipline, type, priority }) {
  const { text } = await callSdlcTool('create_task', {
    title,
    description,
    brandId: brandId || process.env.SDLC_MCP_BRAND_ID,
    discipline: discipline || 'DEVELOPMENT',
    type: type || 'FEATURE',
    priority: priority || 'MEDIUM',
  });
  const codeMatch = text.match(/[A-Z]+-\d+/);
  return { text, code: codeMatch ? codeMatch[0] : null };
}

// Checks whether a task code still exists in the backlog — get_task doesn't error or set an
// isError flag for a missing task, it just replies with a plain "Task \"X\" not found." line
// (confirmed by probing it directly), so detection is a text match rather than a thrown error.
export async function taskExists(code) {
  const { text } = await callSdlcTool('get_task', { identifier: code });
  return !/not found/i.test(text);
}
