/**
 * Task list merge rules — pure functions, no DOM, no I/O, no timers.
 *
 * Two writers share one list:
 *   - the user (Client UI) edits single tasks: `patchTask` / `setStatus` / `removeTask`;
 *   - the agent submits the whole list: `mergeAgent`.
 *
 * Merge contract (see HANDOFF §4.4):
 *   1. New id in the agent submission → inserted.
 *   2. Existing id → agent fields win, `version` increments.
 *   3. A task the user created is never deleted by an agent submission, even
 *      when the submission omits it.
 *   4. A task the agent created is deleted when the submission omits it.
 *   5. When both sides touched one task, the later `updatedAt` wins; a losing
 *      agent write is recorded in `conflicts` and stamps `externalUpdateAt`
 *      on the surviving task so the UI can show "updated elsewhere" once.
 *   6. Equal timestamps resolve in the agent's favour: a user write always
 *      bumps `updatedAt` and `version`, so equality means the user did not
 *      touch the task since the agent read it.
 *
 * Invariants: agent submissions never carry `version` (the Host owns it),
 * and every task has a valid parent when `parentId` is set.
 */

export const STATUSES = ['pending', 'in_progress', 'review', 'completed', 'abandoned'];
export const PRIORITIES = ['high', 'medium', 'low'];

/**
 * `abandoned` is the fifth state, but it is not part of the progress ladder:
 * a task is abandoned when it cannot be done or the plan changed. It keeps its
 * `parentId` so a restore returns it to the original parent; the renderer and
 * the agent view both lift an abandoned subtree out of the parent's sections
 * into one standing "abandoned" area. `abandonedFrom` remembers the state it
 * left so a restore does not have to guess.
 */
const ABANDONED = 'abandoned';

/**
 * How many new top-level tasks an agent submission may add before the merge
 * reports a structure warning. Not a rejection: the panel renders two levels,
 * so a flat list of phases is merely awkward, not invalid.
 */
export const DEFAULT_MAX_FLAT_TOP_LEVEL = 3;

const LOCAL_PATCH_FIELDS = new Set(['title', 'notes', 'priority', 'status', 'parentId', 'order', 'blocked', 'focused', 'paused']);
const USER_ORIGIN = 'user';

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function assertStatus(value, label) {
  if (!STATUSES.includes(value)) {
    throw new Error((label || 'status') + ' must be one of ' + STATUSES.join(', ') + ': ' + String(value));
  }
}

function assertPriority(value, label) {
  if (!PRIORITIES.includes(value)) {
    throw new Error((label || 'priority') + ' must be one of ' + PRIORITIES.join(', ') + ': ' + String(value));
  }
}

function requireTitle(value) {
  if (!isNonEmptyString(value)) throw new Error('title must be a non-empty string');
  return value.trim();
}

function normaliseParent(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new Error('parentId must be a string or null');
  return value;
}

function resolveTime(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

let idCounter = 0;

/** Host-default id factory; inject one for deterministic tests. */
export function defaultIdFactory() {
  const cryptoImpl = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (cryptoImpl && typeof cryptoImpl.randomUUID === 'function') return cryptoImpl.randomUUID();
  idCounter += 1;
  return 'task-' + Date.now().toString(36) + '-' + idCounter.toString(36);
}

export function createTask(input, options) {
  const source = input || {};
  const config = options || {};
  const now = resolveTime(config.now, Date.now());
  const id = isNonEmptyString(source.id) ? source.id : (config.idFactory || defaultIdFactory)();
  if (!isNonEmptyString(id)) throw new Error('id must be a non-empty string');
  const status = source.status === undefined ? 'pending' : source.status;
  assertStatus(status);
  const priority = source.priority === undefined ? 'medium' : source.priority;
  assertPriority(priority);
  const origin = source.origin === USER_ORIGIN ? USER_ORIGIN : 'agent';

  return {
    id,
    sessionId: typeof source.sessionId === 'string' ? source.sessionId : '',
    parentId: normaliseParent(source.parentId),
    title: requireTitle(source.title),
    notes: typeof source.notes === 'string' ? source.notes : '',
    priority,
    status,
    order: Number.isFinite(source.order) ? source.order : 0,
    origin,
    // `blocked` is a badge on top of the five states, never a state itself; it
    // carries the reason in `notes`. `focused` is the single pinned task per
    // session and is user intent, so mergeAgent never sets it.
    blocked: source.blocked === true,
    focused: source.focused === true,
    // `paused` is the run/pause switch: it never changes a state, it only
    // tells the reader not to advance the task. Like `focused`, it is the
    // user's flag and an agent submission never clears it.
    paused: source.paused === true,
    abandonedFrom: status === ABANDONED && STATUSES.includes(source.abandonedFrom)
      ? source.abandonedFrom
      : null,
    version: 1,
    createdAt: now,
    updatedAt: now,
    completedAt: status === 'completed' ? now : null,
    externalUpdateAt: null,
  };
}

/** The state a status change leaves behind: abandoned stores its predecessor. */
function statusTransition(currentStatus, nextStatus) {
  if (nextStatus === currentStatus) return null;
  if (nextStatus === ABANDONED) return { abandonedFrom: currentStatus };
  return { abandonedFrom: null };
}

/**
 * Apply a user edit to one task. Not part of an agent submission: `version`
 * increments and `updatedAt` moves to `now`, which is what makes a later
 * agent write lose the timestamp comparison.
 */
export function patchTask(task, patch, options) {
  const config = options || {};
  const now = resolveTime(config.now, Date.now());
  const changes = patch || {};
  for (const key of Object.keys(changes)) {
    if (LOCAL_PATCH_FIELDS.has(key)) continue;
    throw new Error('patchTask cannot change "' + key + '"');
  }
  const next = {
    ...task,
    version: task.version + 1,
    updatedAt: now,
    externalUpdateAt: null,
  };
  if (changes.title !== undefined) next.title = requireTitle(changes.title);
  if (changes.notes !== undefined) {
    if (typeof changes.notes !== 'string') throw new Error('notes must be a string');
    next.notes = changes.notes;
  }
  if (changes.priority !== undefined) {
    assertPriority(changes.priority);
    next.priority = changes.priority;
  }
  if (changes.parentId !== undefined) next.parentId = normaliseParent(changes.parentId);
  if (changes.order !== undefined) {
    if (!Number.isFinite(changes.order)) throw new Error('order must be a finite number');
    next.order = changes.order;
  }
  if (changes.status !== undefined) {
    assertStatus(changes.status);
    if (changes.status !== task.status) {
      next.status = changes.status;
      next.completedAt = changes.status === 'completed' ? now : null;
      const transition = statusTransition(task.status, changes.status);
      if (transition) next.abandonedFrom = transition.abandonedFrom;
    }
  }
  if (changes.blocked !== undefined) {
    if (typeof changes.blocked !== 'boolean') throw new Error('blocked must be a boolean');
    next.blocked = changes.blocked;
  }
  if (changes.focused !== undefined) {
    if (typeof changes.focused !== 'boolean') throw new Error('focused must be a boolean');
    next.focused = changes.focused;
  }
  if (changes.paused !== undefined) {
    if (typeof changes.paused !== 'boolean') throw new Error('paused must be a boolean');
    next.paused = changes.paused;
  }
  return next;
}

/**
 * A written-off parent is frozen: it accepts no new subtasks. Existing
 * children stay put (a written-off phase keeps its subtree in the store and
 * the renderer moves the whole block aside), so only *new* insertions are
 * rejected — that keeps old data valid.
 */
function assertParentAcceptsSubtask(tasks, parentId) {
  if (parentId === null || parentId === undefined) return;
  const parent = tasks.find((task) => task.id === parentId);
  if (parent && parent.status === ABANDONED) {
    throw new Error('parent ' + parent.id + ' is abandoned: cannot add a subtask under it');
  }
}

export function insertTask(tasks, input, options) {
  const next = createTask(input, options);
  if (tasks.some((task) => task.id === next.id)) throw new Error('duplicate task id: ' + next.id);
  assertParentAcceptsSubtask(tasks, next.parentId);
  return [...tasks, next];
}

export function patchList(tasks, id, patch, options) {
  let found = false;
  const next = tasks.map((task) => {
    if (task.id !== id) return task;
    found = true;
    return patchTask(task, patch, options);
  });
  if (!found) throw new Error('unknown task id: ' + id);
  return next;
}

export function setStatus(tasks, id, status, options) {
  assertStatus(status);
  return patchList(tasks, id, { status }, options);
}

export function removeTask(tasks, id) {
  const next = tasks.filter((task) => task.id !== id);
  return { tasks: next, removed: next.length !== tasks.length };
}

function applyIncoming(current, raw, incomingAt) {
  const status = raw.status === undefined ? current.status : raw.status;
  assertStatus(status);
  const priority = raw.priority === undefined ? current.priority : raw.priority;
  assertPriority(priority);
  const merged = {
    ...current,
    title: raw.title === undefined ? current.title : requireTitle(raw.title),
    notes: raw.notes === undefined ? current.notes : String(raw.notes),
    priority,
    status,
    parentId: raw.parentId === undefined ? current.parentId : normaliseParent(raw.parentId),
    order: Number.isFinite(raw.order) ? raw.order : current.order,
    blocked: raw.blocked === undefined ? current.blocked : raw.blocked === true,
    focused: current.focused,
    paused: current.paused,
    version: current.version + 1,
    updatedAt: Math.max(incomingAt, current.updatedAt),
    externalUpdateAt: null,
  };
  if (status !== current.status) {
    merged.completedAt = status === 'completed' ? incomingAt : null;
    merged.abandonedFrom = status === ABANDONED ? current.status : null;
  }
  return merged;
}

/**
 * Apply one whole-list agent submission.
 * Returns the merged list plus what happened: inserted ids, deleted ids, and
 * ids whose agent write lost to a newer user edit.
 *
 * `structure` reports whether the submission added more top-level tasks than
 * `maxFlatTopLevel` (default 3) while giving none of them a child. It is a
 * soft signal for the returning text, never a reason to reject: lists written
 * before this rule existed must stay updatable. Only tasks new to this
 * submission count; history is never re-judged.
 */
export function mergeAgent(tasks, submission, options) {
  const config = options || {};
  const now = resolveTime(config.now, Date.now());
  const maxFlatTopLevel = Number.isFinite(config.maxFlatTopLevel) ? config.maxFlatTopLevel : DEFAULT_MAX_FLAT_TOP_LEVEL;
  const incoming = Array.isArray(submission) ? submission : [];
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const knownIds = new Set(tasks.map((task) => task.id));
  const incomingIds = new Set();
  const newTopLevelIds = [];
  const conflicts = [];
  const removed = [];
  const inserted = [];

  for (const raw of incoming) {
    if (!raw || !isNonEmptyString(raw.id)) throw new Error('agent submission item needs a string id');
    if (incomingIds.has(raw.id)) throw new Error('agent submission repeats id: ' + raw.id);
    incomingIds.add(raw.id);
    if (!knownIds.has(raw.id)) {
      const parentId = raw.parentId === undefined || raw.parentId === null || raw.parentId === '' ? null : raw.parentId;
      if (parentId === null) newTopLevelIds.push(raw.id);
    }
    const incomingAt = resolveTime(raw.updatedAt, now);
    const existing = byId.get(raw.id);
    if (!existing) {
      // `focused` is user intent: an agent submission may create the task, but
      // only the UI pins it.
      const created = createTask({ ...raw, focused: false, sessionId: raw.sessionId === undefined ? '' : raw.sessionId }, {
        now: incomingAt,
        idFactory: () => raw.id,
      });
      byId.set(created.id, created);
      inserted.push(created.id);
      continue;
    }
    if (existing.updatedAt > incomingAt) {
      conflicts.push(raw.id);
      byId.set(raw.id, { ...existing, externalUpdateAt: incomingAt });
      continue;
    }
    byId.set(raw.id, applyIncoming(existing, raw, incomingAt));
  }

  for (const task of tasks) {
    if (incomingIds.has(task.id)) continue;
    if (task.origin === USER_ORIGIN) continue;
    byId.delete(task.id);
    removed.push(task.id);
  }

  const merged = [...byId.values()].sort(compareOrder);
  assertValidTree(merged);
  // New subtasks are refused under a written-off parent; existing children of
  // that parent are left alone (the renderer lifts the whole block aside).
  for (const id of inserted) {
    const task = byId.get(id);
    if (task.parentId === null || task.parentId === undefined) continue;
    const parent = byId.get(task.parentId);
    if (parent && parent.status === ABANDONED) {
      throw new Error('parent ' + parent.id + ' is abandoned: cannot add a subtask under it');
    }
  }
  const parentsWithChildren = new Set();
  for (const task of merged) {
    if (task.parentId !== null && task.parentId !== undefined) parentsWithChildren.add(task.parentId);
  }
  const newTopLevelWithoutChildren = newTopLevelIds.filter((id) => !parentsWithChildren.has(id));
  const structure = {
    newTopLevel: newTopLevelIds.length,
    newTopLevelWithoutChildren: newTopLevelWithoutChildren.length,
    maxFlatTopLevel,
    overLimit: newTopLevelIds.length > maxFlatTopLevel && newTopLevelWithoutChildren.length === newTopLevelIds.length,
  };
  return { tasks: merged, conflicts, removed, inserted, structure };
}

/**
 * Pin one task as the session focus, or clear every pin with `null`.
 * At most one task stays focused: pinning a second one unpins the first.
 */
export function setFocus(tasks, id, options) {
  const now = resolveTime((options || {}).now, Date.now());
  if (id === null || id === undefined) {
    return tasks.map((task) => (task.focused ? patchTask(task, { focused: false }, { now }) : task));
  }
  const target = tasks.find((task) => task.id === id);
  if (!target) throw new Error('unknown task id: ' + id);
  return tasks.map((task) => {
    if (task.id === id) return target.focused ? task : patchTask(task, { focused: true }, { now });
    return task.focused ? patchTask(task, { focused: false }, { now }) : task;
  });
}

/**
 * Flip the run/pause switch across a scope. `all` covers every task;
 * `subtree` covers the direct children of `parentId`. Completed tasks are
 * skipped — pausing finished work means nothing.
 */
export function setPaused(tasks, scope, parentId, paused, options) {
  const now = resolveTime((options || {}).now, Date.now());
  const flag = paused === true;
  return tasks.map((task) => {
    if (task.status === 'completed' || task.status === ABANDONED) return task;
    if (scope === 'subtree' && task.parentId !== parentId) return task;
    if (task.paused === flag) return task;
    return patchTask(task, { paused: flag }, { now });
  });
}

/**
 * Mark a task — and with `subtree` its unfinished direct children — as blocked.
 * A blocked parent means its children cannot move either, so the flag is
 * written down instead of only being shown on the parent row.
 */
export function setBlocked(tasks, id, blocked, options) {
  const now = resolveTime((options || {}).now, Date.now());
  const flag = blocked === true;
  const scope = (options || {}).scope === 'task' ? 'task' : 'subtree';
  if (!tasks.some((task) => task.id === id)) throw new Error('unknown task id: ' + id);
  return tasks.map((task) => {
    const isTarget = task.id === id;
    const isChild = scope === 'subtree' && task.parentId === id
      && task.status !== 'completed' && task.status !== ABANDONED;
    if (!isTarget && !isChild) return task;
    if (isTarget && task.status === ABANDONED) return task;
    if (task.blocked === flag) return task;
    return patchTask(task, { blocked: flag }, { now });
  });
}

/** Next sibling order for a new task under `parentId` (null = top level). */export function nextOrder(tasks, parentId) {
  const parent = parentId === undefined || parentId === null ? null : parentId;
  let max = -1;
  for (const task of tasks) {
    if (task.parentId !== parent) continue;
    if (task.order > max) max = task.order;
  }
  return max + 1;
}

/**
 * Swap one task with its previous (-1) or next (+1) sibling. Siblings are
 * renumbered from their current visual order first, so duplicate or sparse
 * `order` values cannot stall a move.
 */
export function moveSibling(tasks, id, direction, options) {
  const now = resolveTime((options || {}).now, Date.now());
  const target = tasks.find((task) => task.id === id);
  if (!target) throw new Error('unknown task id: ' + id);
  const siblings = tasks.filter((task) => task.parentId === target.parentId).sort(compareOrder);
  const index = siblings.findIndex((task) => task.id === id);
  const swapIndex = index + direction;
  if (swapIndex < 0 || swapIndex >= siblings.length) return tasks;
  const reordered = siblings.slice();
  const held = reordered[index];
  reordered[index] = reordered[swapIndex];
  reordered[swapIndex] = held;
  const orderById = new Map(reordered.map((task, position) => [task.id, position]));
  return tasks.map((task) => {
    if (!orderById.has(task.id)) return task;
    const order = orderById.get(task.id);
    if (order === task.order) return task;
    return { ...task, order, version: task.version + 1, updatedAt: now, externalUpdateAt: null };
  });
}

/**
 * Move one task in front of `beforeId` among its siblings (`beforeId` null =
 * last). Siblings are renumbered from their current visual order first, so
 * duplicate or sparse `order` values cannot stall the move. The drag preview
 * writes this same ordering locally, so the drop commits exactly what the user
 * saw. Throws when `beforeId` names a task outside that sibling group.
 */
export function moveBefore(tasks, id, beforeId, options) {
  const now = resolveTime((options || {}).now, Date.now());
  const target = tasks.find((task) => task.id === id);
  if (!target) throw new Error('unknown task id: ' + id);
  const siblings = tasks.filter((task) => task.parentId === target.parentId).sort(compareOrder);
  const from = siblings.findIndex((task) => task.id === id);
  if (from < 0) return tasks;
  const before = beforeId === null || beforeId === undefined ? null : String(beforeId);
  if (before === id) return tasks;
  const rest = siblings.filter((task) => task.id !== id);
  let insertAt = rest.length;
  if (before !== null) {
    insertAt = rest.findIndex((task) => task.id === before);
    if (insertAt < 0) throw new Error('not a sibling: ' + before);
  }
  if (insertAt === from) return tasks;
  const reordered = rest.slice();
  reordered.splice(insertAt, 0, target);
  const orderById = new Map(reordered.map((task, position) => [task.id, position]));
  return tasks.map((task) => {
    if (!orderById.has(task.id)) return task;
    const order = orderById.get(task.id);
    if (order === task.order) return task;
    return { ...task, order, version: task.version + 1, updatedAt: now, externalUpdateAt: null };
  });
}

/**
 * Remove one task and every descendant (hard delete, no recycle bin).
 * Returns the surviving list plus the exact ids that disappeared.
 */
export function removeSubtree(tasks, id) {
  const doomed = new Set();
  const queue = [id];
  while (queue.length > 0) {
    const current = queue.pop();
    if (doomed.has(current)) continue;
    doomed.add(current);
    for (const task of tasks) {
      if (task.parentId === current) queue.push(task.id);
    }
  }
  return { tasks: tasks.filter((task) => !doomed.has(task.id)), removed: [...doomed] };
}

export function compareOrder(left, right) {
  if (left.order !== right.order) return left.order - right.order;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

/**
 * Reject parent ids that do not exist and parent cycles, so a bad agent
 * submission fails the merge instead of producing an unreachable subtree.
 */
export function assertValidTree(tasks) {
  const ids = new Set(tasks.map((task) => task.id));
  for (const task of tasks) {
    if (task.parentId !== null && !ids.has(task.parentId)) {
      throw new Error('task ' + task.id + ' has missing parent ' + task.parentId);
    }
    if (task.parentId === task.id) throw new Error('task ' + task.id + ' is its own parent');
  }
  for (const task of tasks) {
    const seen = new Set([task.id]);
    let cursor = task.parentId;
    while (cursor !== null && cursor !== undefined) {
      if (seen.has(cursor)) throw new Error('parent cycle at task ' + task.id);
      seen.add(cursor);
      const parent = tasks.find((candidate) => candidate.id === cursor);
      cursor = parent ? parent.parentId : null;
    }
  }
}

function deriveFromChildren(statuses) {
  if (statuses.every((status) => status === 'completed')) return 'completed';
  if (statuses.every((status) => status === 'pending')) return 'pending';
  return 'in_progress';
}

/**
 * Parent status is derived, never authored: a task with children reports
 * `completed` when every child is done, `pending` when every child is still
 * pending, and `in_progress` otherwise. Abandoned children are skipped — they
 * were written off, so they neither complete a parent nor hold it open. The
 * stored status of a parent stays untouched; this returns a copy for display
 * and for what the agent reads.
 */
export function deriveStatus(tasks) {
  const childrenOf = new Map();
  for (const task of tasks) {
    if (task.parentId === null || task.parentId === undefined) continue;
    if (task.status === ABANDONED) continue;
    const bucket = childrenOf.get(task.parentId);
    if (bucket) bucket.push(task);
    else childrenOf.set(task.parentId, [task]);
  }
  const memo = new Map();
  const resolve = (task) => {
    if (memo.has(task.id)) return memo.get(task.id);
    const children = childrenOf.get(task.id);
    let status;
    if (!children || children.length === 0) {
      status = task.status;
    } else {
      // Seed the memo with the stored value so a malformed cycle terminates.
      memo.set(task.id, task.status);
      status = deriveFromChildren(children.map(resolve));
    }
    memo.set(task.id, status);
    return status;
  };
  return tasks.map((task) => {
    const status = resolve(task);
    return status === task.status ? task : { ...task, status };
  });
}

const LEGACY_STATUS = {
  pending: 'pending',
  in_progress: 'in_progress',
  completed: 'completed',
};

/**
 * One-way import of a historical `todo_write` list. The result is a normal
 * agent-origin list; nothing reads back into the old projection, and the
 * caller is responsible for importing a session only once.
 */
export function importLegacyTodos(todos, options) {
  const config = options || {};
  const now = resolveTime(config.now, Date.now());
  const list = Array.isArray(todos) ? todos : [];
  return list.map((todo, index) => createTask({
    sessionId: config.sessionId || '',
    title: todo && todo.content !== undefined ? String(todo.content) : '',
    status: LEGACY_STATUS[todo && todo.status] || 'pending',
    order: index,
    origin: 'agent',
  }, { now, idFactory: config.idFactory }));
}
