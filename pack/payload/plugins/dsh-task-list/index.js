/**
 * Host half of the task-list bundle.
 *
 * Owns everything durable about a session's task list:
 *   - one JSON file per session under `$DSH_HOME/storages/task-list/`
 *     (see `lib/task-file.js` for the atomic write);
 *   - the browser API the panel talks to, `/task-list/api/tasks`, because a
 *     Client half cannot call arbitrary Host services (a `@Remote` namespace
 *     belongs to the shipped packages, not to a plain-JS bundle);
 *   - the two model-facing tools, `task_list` and `task_write`, and the
 *     removal of the old `todo_write` from the tool set;
 *   - the fork copy: a forked session starts with its parent's list.
 *
 * Merge rules are pure functions in `lib/task-store.js`; this file only adds
 * I/O, routing, and the agent-facing surface.
 */
import { readTaskState, writeTaskState } from './lib/task-file.js';
import {
  STATUSES,
  PRIORITIES,
  createTask,
  patchList,
  setStatus,
  setFocus,
  setPaused,
  setBlocked,
  insertTask,
  nextOrder,
  moveSibling,
  removeSubtree,
  mergeAgent,
  deriveStatus,
  assertValidTree,
} from './lib/task-store.js';

export const name = 'task-list';
export const inject = ['tools'];

const ROUTE_PATH = '/task-list/api/tasks';
const LOGGER = 'task-list';
const STATUS_LABEL = {
  pending: 'todo',
  in_progress: 'doing',
  review: 'needs review',
  completed: 'done',
  abandoned: 'abandoned',
};

function message(error) {
  return error && error.message ? String(error.message) : String(error);
}

function warn(ctx, text) {
  try {
    const logger = typeof ctx.logger === 'function' ? ctx.logger(LOGGER) : undefined;
    if (logger && typeof logger.warn === 'function') logger.warn(text);
  } catch {
    /* logging never breaks a request */
  }
}

// ---------------------------------------------------------------------------
// list formatting (what the agent reads)
// ---------------------------------------------------------------------------

/** Render one flat list as an indented tree for the model. */
function formatTaskList(tasks, includeNotes) {
  if (!Array.isArray(tasks) || tasks.length === 0) return 'The task list is empty.';
  const byId = new Map(tasks.map((task) => [task.id, task]));
  // A task counts as abandoned when it, or any ancestor, carries the abandoned
  // state: writing off a phase takes its whole subtree out of the progress
  // count without rewriting each child.
  const isAbandoned = (task) => {
    let cursor = task;
    const seen = new Set();
    while (cursor) {
      if (cursor.status === 'abandoned') return true;
      if (cursor.parentId === null || cursor.parentId === undefined || seen.has(cursor.id)) return false;
      seen.add(cursor.id);
      cursor = byId.get(cursor.parentId) || null;
    }
    return false;
  };
  const childrenOf = new Map();
  const roots = [];
  const abandonedRoots = [];
  for (const task of tasks) {
    const parentId = task.parentId === null || task.parentId === undefined ? null : task.parentId;
    if (isAbandoned(task)) {
      const parent = parentId === null ? null : byId.get(parentId);
      if (parent && isAbandoned(parent)) {
        const bucket = childrenOf.get(parentId);
        if (bucket) bucket.push(task);
        else childrenOf.set(parentId, [task]);
      } else {
        abandonedRoots.push(task);
      }
      continue;
    }
    if (parentId === null) {
      roots.push(task);
      continue;
    }
    const bucket = childrenOf.get(parentId);
    if (bucket) bucket.push(task);
    else childrenOf.set(parentId, [task]);
  }
  const normal = tasks.filter((task) => !isAbandoned(task));
  const done = normal.filter((task) => task.status === 'completed').length;
  const abandonedCount = tasks.length - normal.length;
  const header = 'Task list (' + done + '/' + normal.length + ' done'
    + (abandonedCount > 0 ? ', ' + abandonedCount + ' abandoned' : '') + '):';
  const lines = [header];
  const walk = (task, depth) => {
    const tags = [];
    if (task.priority && task.priority !== 'medium') tags.push(task.priority);
    if (task.blocked) tags.push('blocked');
    if (task.focused) tags.push('focused');
    if (task.paused) tags.push('paused');
    if (!includeNotes && task.notes) tags.push('has notes');
    const suffix = tags.length > 0 ? ' (' + tags.join(', ') + ')' : '';
    lines.push('  '.repeat(depth) + '- [' + (STATUS_LABEL[task.status] || task.status) + '] ' + task.id + ' ' + task.title + suffix);
    if (includeNotes && task.notes) {
      lines.push('  '.repeat(depth + 1) + 'notes: ' + task.notes);
    }
    const children = childrenOf.get(task.id);
    if (children) {
      for (const child of children) walk(child, depth + 1);
    }
  };
  for (const root of roots) walk(root, 0);
  if (abandonedRoots.length > 0) {
    lines.push('');
    lines.push('Abandoned (' + abandonedCount + '):');
    for (const root of abandonedRoots) walk(root, 0);
  }
  return lines.join('\n');
}

function describeMerge(result) {
  const parts = ['Updated task list: ' + result.tasks.length + ' task(s)'];
  if (result.inserted.length > 0) parts.push(result.inserted.length + ' added');
  if (result.removed.length > 0) parts.push(result.removed.length + ' removed');
  if (result.conflicts.length > 0) {
    parts.push(result.conflicts.length + ' kept from a newer user edit (' + result.conflicts.join(', ') + ')');
  }
  let text = parts.join(', ') + '.';
  const structure = result.structure;
  if (structure && structure.overLimit) {
    text += ' (warning: ' + structure.newTopLevel + ' new top-level tasks without subtasks — keep at most '
      + structure.maxFlatTopLevel + ' phases at the top level and hang each deliverable under one as a child task)';
  }
  return text;
}

// ---------------------------------------------------------------------------
// tool definitions
// ---------------------------------------------------------------------------

const outputShape = {
  type: 'object',
  additionalProperties: false,
  properties: { text: { type: 'string' } },
};

function renderText(_args, value) {
  const text = value && typeof value.text === 'string' ? value.text : '';
  return [{ type: 'text', text }];
}

function taskListTool() {
  return {
    name: 'task_list',
    description: 'Read this session\'s task list: a tree with five states (todo / doing / needs review / done / '
      + 'abandoned), '
      + 'priority, notes, blocked and focused markers. Parent rows report a derived state from their subtasks. '
      + 'Use it before planning work and after finishing a step; write changes with task_write.',
    // `ctx.tools.register` takes a finished JSON Schema; only `defineTool`
    // compiles a parameter spec, and a plain-JS bundle cannot import it. A tool
    // also needs at least one property: `{}` becomes `type: null` and the model
    // API rejects the whole request.
    parameters: {
      type: 'object',
      properties: {
        includeNotes: {
          type: 'boolean',
          description: 'Also return each task\'s full note text (default: a task with notes is marked "has notes").',
        },
      },
    },
    output: { schema: outputShape, render: renderText },
    execute(args, exec) {
      const agent = exec.agent;
      if (!agent) throw new Error('task_list requires an owning agent session');
      const state = readTaskState(String(agent.id));
      return Promise.resolve({
        text: formatTaskList(deriveStatus(state.tasks), Boolean(args && args.includeNotes === true)),
      });
    },
  };
}

function taskWriteTool() {
  return {
    name: 'task_write',
    description: 'Replace the whole task list of this session with `tasks`. This is the write path for the task '
      + 'list shown in the panel beside the conversation; prefer it over todo_write, which is still registered but '
      + 'is being retired. Every item needs an `id`: reuse the id of an '
      + 'existing task to update it, and invent a short stable id for a new one. An item missing from the '
      + 'submission is treated as withdrawn (except tasks the user created, which survive). `status` uses '
      + 'todo / in_progress / review / completed; mark a stuck task with `blocked: true` and write the reason '
      + 'in `notes` rather than inventing a new status. '
      + 'Structure: a top-level task is a phase or a big deliverable, never a single step — when more than 3 '
      + 'top-level tasks seem needed, group them under phase parents first. Every top-level task needs at least '
      + 'one subtask, and one subtask equals one action that can be accepted or rejected on its own. Two levels '
      + 'maximum: the panel renders a parent and its direct children only. '
      + 'Abandoning: `status: "abandoned"` writes a task off (it cannot be done, or the plan changed). It leaves '
      + 'its parent\'s sections and is listed under a separate Abandoned block, but keeps its parentId, so writing '
      + 'its previous status restores it in place. Abandoning a phase also lifts its whole subtree out of the '
      + 'progress count. '
      + 'Naming: keep `title` a short label of 7 Chinese characters or fewer; put details, reasons and '
      + 'multi-clause wording in `notes`. Longer titles are accepted, but the panel ellipsises them.',
    parameters: {
      type: 'object',
      properties: {
        tasks: {
          type: 'array',
          description: 'The COMPLETE task list, replacing any previous list.',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              id: { type: 'string', description: 'Stable task id; keep it when updating.' },
              title: { type: 'string', description: 'Short task name: 7 Chinese characters or fewer; details go in notes.' },
              status: { type: 'string', enum: [...STATUSES], description: 'todo | in_progress | review | completed.' },
              notes: { type: 'string', description: 'Details, or the reason a task is blocked.' },
              priority: { type: 'string', enum: [...PRIORITIES], description: 'high | medium | low (default medium).' },
              parentId: { type: 'string', description: 'Id of the parent task, for subtasks.' },
              order: { type: 'number', description: 'Sibling order; lower comes first.' },
              blocked: { type: 'boolean', description: 'Waiting on something outside the list.' },
            },
            required: ['id', 'title', 'status'],
          },
        },
      },
      required: ['tasks'],
    },
    output: { schema: outputShape, render: renderText },
    execute(args, exec) {
      const agent = exec.agent;
      if (!agent) throw new Error('task_write requires an owning agent session');
      const sessionId = String(agent.id);
      const state = readTaskState(sessionId);
      const submission = args && Array.isArray(args.tasks) ? args.tasks : [];
      const result = mergeAgent(state.tasks, submission, { now: Date.now() });
      writeTaskState(sessionId, result.tasks);
      return Promise.resolve({ text: describeMerge(result) });
    },
  };
}

// ---------------------------------------------------------------------------
// browser API
// ---------------------------------------------------------------------------

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // same-origin GETs and the Electron shell omit it
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

async function readJson(req, limitBytes = 1_000_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limitBytes) throw new Error('request body too large');
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  const text = Buffer.concat(chunks).toString('utf8');
  if (text.trim().length === 0) return {};
  const parsed = JSON.parse(text);
  return parsed && typeof parsed === 'object' ? parsed : {};
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function requireId(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(label + ' is required');
  return value;
}

/**
 * Apply one panel operation to a session's list and persist it.
 * Every op returns the whole updated list so the caller can drop its optimistic
 * copy instead of reconciling a delta.
 */
function applyOp(sessionId, body) {
  const state = readTaskState(sessionId);
  const tasks = state.tasks;
  const op = typeof body.op === 'string' ? body.op : '';
  const id = typeof body.id === 'string' ? body.id : null;
  const now = Date.now();
  let next;
  let removed = [];

  switch (op) {
    case 'create': {
      const input = body.input && typeof body.input === 'object' ? body.input : {};
      const parentId = input.parentId === undefined || input.parentId === null || input.parentId === ''
        ? null
        : String(input.parentId);
      next = insertTask(tasks, {
        ...input,
        sessionId,
        parentId,
        order: nextOrder(tasks, parentId),
        origin: 'user',
      }, { now });
      break;
    }
    case 'update': {
      const patch = body.patch && typeof body.patch === 'object' ? body.patch : {};
      next = patchList(tasks, requireId(id, 'id'), patch, { now });
      break;
    }
    case 'status':
      next = setStatus(tasks, requireId(id, 'id'), requireId(body.status, 'status'), { now });
      break;
    case 'focus':
      next = setFocus(tasks, id === null ? null : requireId(id, 'id'), { now });
      break;
    case 'move':
      next = moveSibling(tasks, requireId(id, 'id'), body.direction === 'up' ? -1 : 1, { now });
      break;
    case 'pause': {
      const scope = body.scope === 'subtree' ? 'subtree' : 'all';
      const parentId = scope === 'subtree' ? requireId(id, 'id') : null;
      next = setPaused(tasks, scope, parentId, body.paused === true, { now });
      break;
    }
    case 'block': {
      // A blocked parent blocks the children it owns; `task` keeps a single
      // row blocked when the row has no subtasks.
      next = setBlocked(tasks, requireId(id, 'id'), body.blocked === true, {
        now,
        scope: body.scope === 'task' ? 'task' : 'subtree',
      });
      break;
    }
    case 'delete': {
      const result = removeSubtree(tasks, requireId(id, 'id'));
      next = result.tasks;
      removed = result.removed;
      break;
    }
    default:
      throw new Error('unknown op: ' + op);
  }

  assertValidTree(next);
  const written = writeTaskState(sessionId, next);
  return { tasks: next, removed, updatedAt: written.updatedAt };
}

async function handleTasks(ctx, req, res) {
  try {
    const url = new URL(req.url || ROUTE_PATH, 'http://task-list.invalid');
    if (req.method === 'GET') {
      const sessionId = url.searchParams.get('sessionId');
      if (!sessionId) return sendJson(res, 400, { ok: false, error: 'sessionId is required' });
      const state = readTaskState(sessionId);
      return sendJson(res, 200, { ok: true, tasks: state.tasks, corrupt: state.corrupt === true, updatedAt: state.updatedAt });
    }
    if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method not allowed' });
    if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, error: 'cross-origin write refused' });
    const body = await readJson(req);
    const sessionId = requireId(body.sessionId, 'sessionId');
    const result = applyOp(sessionId, body);
    return sendJson(res, 200, { ok: true, tasks: result.tasks, removed: result.removed, updatedAt: result.updatedAt });
  } catch (error) {
    warn(ctx, 'request failed: ' + message(error));
    return sendJson(res, 400, { ok: false, error: message(error) });
  }
}

function mountRoutes(ctx) {
  // `webServer` is optional: a headless profile has none, and a hard injection
  // there would leave the whole plugin pending (and the tools unregistered).
  ctx.inject(['webServer'], (web) => {
    const server = web && web.webServer;
    if (!server || typeof server.register !== 'function') return;
    const routes = [];
    try {
      routes.push(server.register({ kind: 'exact', path: ROUTE_PATH, handler: (req, res) => handleTasks(ctx, req, res) }));
    } catch (error) {
      warn(ctx, 'route not registered: ' + message(error));
      return;
    }
    ctx.effect(() => () => {
      for (const dispose of routes) {
        try {
          dispose();
        } catch {
          /* route already gone */
        }
      }
    }, 'task-list: http route');
  });
}

// ---------------------------------------------------------------------------
// session lifecycle
// ---------------------------------------------------------------------------

/**
 * A fork starts with its parent's list. `session/created` is the only durable
 * signal: fork appends no session event of its own, but the child header names
 * its `parentSession`. Subagents carry `origin: 'subagent'` and are skipped.
 * This listener must never throw — a synchronous throw vetoes creation.
 */
function watchForks(ctx) {
  if (typeof ctx.on !== 'function') return;
  ctx.effect(() => ctx.on('session/created', (session) => {
    try {
      const header = session && session.header;
      if (!header || !header.parentSession) return;
      if (header.origin === 'subagent') return;
      const parentId = String(header.parentSession);
      const childId = String(session.id);
      if (childId === parentId) return;
      if (readTaskState(childId).tasks.length > 0) return;
      const source = readTaskState(parentId).tasks;
      if (source.length === 0) return;
      writeTaskState(childId, source.map((task) => ({ ...task, sessionId: childId })));
    } catch (error) {
      warn(ctx, 'fork copy failed: ' + message(error));
    }
  }), 'task-list: fork copy');
}

/**
 * `todo_write` is replaced, not supplemented. Restricting it (rather than
 * disabling the `include:tool-todo` row) leaves the `todos` projection alive,
 * so historical todo cards in old sessions still render.
 *
 * The mask cannot be applied blindly: this plugin and `tool-todo` both depend
 * on `tools`, so either may finish first, and a mask naming a tool that is not
 * registered yet throws. Retry on `tools/change` until the name resolves, then
 * keep one disposer.
 */
function suppressTodoWrite(ctx) {
  let disposer = null;
  const attempt = () => {
    if (disposer) return;
    try {
      const tools = typeof ctx.get === 'function' ? ctx.get('tools') : undefined;
      if (!tools || typeof tools.get !== 'function') return;
      if (!tools.get('todo_write')) return;
      disposer = ctx.tools.restrict({ deny: ['todo_write'] });
    } catch (error) {
      warn(ctx, 'todo_write restriction failed: ' + message(error));
    }
  };
  ctx.effect(() => {
    const off = typeof ctx.on === 'function' ? ctx.on('tools/change', attempt) : () => {};
    attempt();
    return () => {
      if (typeof off === 'function') off();
      if (disposer) {
        try {
          disposer();
        } catch {
          /* already lifted */
        }
        disposer = null;
      }
    };
  }, 'task-list: replace todo_write');
}

export function apply(ctx) {
  ctx.effect(() => ctx.tools.register(taskListTool()), 'task-list: tool task_list');
  ctx.effect(() => ctx.tools.register(taskWriteTool()), 'task-list: tool task_write');
  suppressTodoWrite(ctx);
  mountRoutes(ctx);
  watchForks(ctx);
}
