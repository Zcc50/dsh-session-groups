import test from 'node:test';
import assert from 'node:assert/strict';

import {
  STATUSES,
  createTask,
  patchTask,
  insertTask,
  patchList,
  setStatus,
  removeTask,
  mergeAgent,
  assertValidTree,
  importLegacyTodos,
  nextOrder,
  moveSibling,
  removeSubtree,
  setFocus,
  setPaused,
  setBlocked,
  deriveStatus,
} from './task-store.js';

const NOW = 1_700_000_000_000;

function makeOptions(now) {
  let counter = 0;
  return {
    now: now === undefined ? NOW : now,
    idFactory: () => {
      counter += 1;
      return 'id-' + counter;
    },
  };
}

function baseTasks() {
  const options = makeOptions();
  const parent = createTask({ sessionId: 's1', title: '父任务', order: 0, origin: 'agent' }, options);
  const child = createTask({ sessionId: 's1', title: '子任务', parentId: parent.id, order: 1, origin: 'agent' }, options);
  return { options, list: [parent, child] };
}

test('createTask fills defaults and rejects an empty title', () => {
  const task = createTask({ sessionId: 's1', title: '  写规则  ' }, makeOptions());
  assert.equal(task.title, '写规则');
  assert.equal(task.status, 'pending');
  assert.equal(task.priority, 'medium');
  assert.equal(task.origin, 'agent');
  assert.equal(task.version, 1);
  assert.equal(task.parentId, null);
  assert.equal(task.completedAt, null);
  assert.equal(task.externalUpdateAt, null);
  assert.equal(task.createdAt, NOW);
  assert.equal(task.updatedAt, NOW);

  assert.throws(() => createTask({ title: '' }, makeOptions()), /title/);
  assert.throws(() => createTask({ title: 'x', status: 'doing' }, makeOptions()), /status/);
  assert.throws(() => createTask({ title: 'x', priority: 'urgent' }, makeOptions()), /priority/);
});

test('createTask marks a completed task with completedAt', () => {
  const task = createTask({ title: 'done', status: 'completed' }, makeOptions());
  assert.equal(task.completedAt, NOW);
});

test('patchTask bumps version and updatedAt and clears the external marker', () => {
  const task = { ...createTask({ title: 'a' }, makeOptions()), externalUpdateAt: NOW - 5 };
  const next = patchTask(task, { title: 'b' }, { now: NOW + 10 });
  assert.equal(next.title, 'b');
  assert.equal(next.version, 2);
  assert.equal(next.updatedAt, NOW + 10);
  assert.equal(next.externalUpdateAt, null);
  // the original is untouched: every writer works on copies
  assert.equal(task.title, 'a');
});

test('patchTask maintains completedAt across status moves', () => {
  const created = createTask({ title: 'a' }, makeOptions());
  const completed = patchTask(created, { status: 'completed' }, { now: NOW + 1 });
  assert.equal(completed.completedAt, NOW + 1);
  const reopened = patchTask(completed, { status: 'review' }, { now: NOW + 2 });
  assert.equal(reopened.completedAt, null);
  // a patch that repeats the current status does not move completedAt
  const again = patchTask(completed, { status: 'completed' }, { now: NOW + 3 });
  assert.equal(again.completedAt, NOW + 1);
});

test('patchTask rejects identity and ownership fields', () => {
  const task = createTask({ title: 'a' }, makeOptions());
  for (const key of ['id', 'sessionId', 'origin', 'createdAt', 'version', 'updatedAt']) {
    assert.throws(() => patchTask(task, { [key]: 'x' }, makeOptions()), new RegExp(key));
  }
});

test('patchTask validates values', () => {
  const task = createTask({ title: 'a' }, makeOptions());
  assert.throws(() => patchTask(task, { status: 'nope' }, makeOptions()), /status/);
  assert.throws(() => patchTask(task, { priority: 'nope' }, makeOptions()), /priority/);
  assert.throws(() => patchTask(task, { title: '  ' }, makeOptions()), /title/);
  assert.throws(() => patchTask(task, { notes: 3 }, makeOptions()), /notes/);
  assert.throws(() => patchTask(task, { parentId: 3 }, makeOptions()), /parentId/);
});

test('insertTask refuses a duplicate id', () => {
  const { options, list } = baseTasks();
  assert.throws(() => insertTask(list, { id: list[0].id, title: 'dup' }, options), /duplicate/);
});

test('setStatus and patchList address an existing task only', () => {
  const { options, list } = baseTasks();
  const next = setStatus(list, list[1].id, 'in_progress', { now: NOW + 5 });
  assert.equal(next[1].status, 'in_progress');
  assert.equal(next[0].status, 'pending');
  assert.throws(() => patchList(list, 'missing', { title: 'x' }, options), /unknown task id/);
});

test('removeTask reports whether it removed anything', () => {
  const { list } = baseTasks();
  const removed = removeTask(list, list[0].id);
  assert.equal(removed.removed, true);
  assert.equal(removed.tasks.length, 1);
  const missing = removeTask(list, 'missing');
  assert.equal(missing.removed, false);
  assert.equal(missing.tasks.length, 2);
});

test('mergeAgent inserts unknown ids', () => {
  const { options, list } = baseTasks();
  const result = mergeAgent(list, [
    { id: list[0].id, title: list[0].title, order: 0, updatedAt: NOW },
    { id: list[1].id, title: list[1].title, order: 1, updatedAt: NOW },
    { id: 'new', title: 'agent 新任务', order: 2, updatedAt: NOW + 1 },
  ], options);
  assert.equal(result.tasks.length, 3);
  assert.deepEqual(result.inserted, ['new']);
  assert.equal(result.tasks.find((task) => task.id === 'new').origin, 'agent');
});

test('mergeAgent updates an existing task and bumps its version', () => {
  const { options, list } = baseTasks();
  const result = mergeAgent(list, [
    { id: list[0].id, title: '改过的标题', status: 'in_progress', updatedAt: NOW + 1 },
  ], options);
  const updated = result.tasks.find((task) => task.id === list[0].id);
  assert.equal(updated.title, '改过的标题');
  assert.equal(updated.status, 'in_progress');
  assert.equal(updated.version, list[0].version + 1);
  assert.equal(updated.updatedAt, NOW + 1);
});

test('mergeAgent keeps agent tasks missing from the submission out (agent deletes them)', () => {
  const { options, list } = baseTasks();
  const result = mergeAgent(list, [
    { id: list[0].id, title: '父任务', order: 0, updatedAt: NOW + 1 },
  ], options);
  assert.ok(result.removed.includes(list[1].id));
  assert.equal(result.tasks.length, 1);
});

test('mergeAgent never deletes a user-created task the submission omits', () => {
  const options = makeOptions();
  const userTask = createTask({ title: '用户建的', origin: 'user' }, options);
  const agentTask = createTask({ title: 'agent 建的', origin: 'agent' }, options);
  const result = mergeAgent([userTask, agentTask], [], options);
  assert.deepEqual(result.tasks.map((task) => task.id), [userTask.id]);
  assert.ok(result.removed.includes(agentTask.id));
});

test('mergeAgent lets a newer user edit win and stamps the conflict', () => {
  const options = makeOptions();
  const created = createTask({ title: '原', origin: 'user' }, { now: NOW, idFactory: () => 't1' });
  const edited = patchTask(created, { title: '用户改的' }, { now: NOW + 100 });
  const result = mergeAgent([edited], [
    { id: 't1', title: 'agent 想改的', updatedAt: NOW + 50 },
  ], options);
  const survivor = result.tasks[0];
  assert.equal(survivor.title, '用户改的');
  assert.deepEqual(result.conflicts, ['t1']);
  assert.equal(survivor.externalUpdateAt, NOW + 50);
  // the losing write still belongs to the user until they touch it again
  assert.equal(survivor.version, edited.version);
});

test('mergeAgent resolves equal timestamps in favour of the agent', () => {
  const options = makeOptions();
  const created = createTask({ title: '原' }, { now: NOW, idFactory: () => 't1' });
  const result = mergeAgent([created], [
    { id: 't1', title: 'agent 改的', updatedAt: NOW },
  ], options);
  assert.equal(result.tasks[0].title, 'agent 改的');
  assert.deepEqual(result.conflicts, []);
});

test('mergeAgent keeps the user origin when the agent edits that task', () => {
  const options = makeOptions();
  const userTask = createTask({ title: '用户任务', origin: 'user' }, { now: NOW, idFactory: () => 'u1' });
  const result = mergeAgent([userTask], [
    { id: 'u1', title: '被 agent 更新', updatedAt: NOW + 1 },
  ], options);
  assert.equal(result.tasks[0].title, '被 agent 更新');
  assert.equal(result.tasks[0].origin, 'user');
});

test('mergeAgent moves completedAt when the agent changes the status', () => {
  const options = makeOptions();
  const created = createTask({ title: '原' }, { now: NOW, idFactory: () => 't1' });
  const done = mergeAgent([created], [
    { id: 't1', status: 'completed', updatedAt: NOW + 1 },
  ], options).tasks[0];
  assert.equal(done.completedAt, NOW + 1);
  const back = mergeAgent([done], [
    { id: 't1', status: 'pending', updatedAt: NOW + 2 },
  ], options).tasks[0];
  assert.equal(back.completedAt, null);
});

test('mergeAgent rejects malformed submissions', () => {
  const { options, list } = baseTasks();
  assert.throws(() => mergeAgent(list, [{ title: 'no id' }], options), /needs a string id/);
  assert.throws(() => mergeAgent(list, [
    { id: 'x', title: 'a' },
    { id: 'x', title: 'b' },
  ], options), /repeats id/);
});

test('mergeAgent fails instead of storing an unreachable subtree', () => {
  const { options, list } = baseTasks();
  assert.throws(() => mergeAgent(list, [
    { id: 'orphan', title: '孤儿', parentId: 'missing', updatedAt: NOW + 1 },
  ], options), /missing parent/);
});

test('mergeAgent sorts the merged list by order then id', () => {
  const { options, list } = baseTasks();
  const result = mergeAgent(list, [
    { id: list[0].id, title: list[0].title, order: 1, updatedAt: NOW },
    { id: list[1].id, title: list[1].title, order: 2, parentId: list[0].id, updatedAt: NOW },
    { id: 'z', title: 'z', order: 0, updatedAt: NOW + 1 },
    { id: 'a', title: 'a', order: 0, updatedAt: NOW + 1 },
  ], options);
  assert.deepEqual(result.tasks.map((task) => task.id), ['a', 'z', list[0].id, list[1].id]);
});

test('mergeAgent warns when 4 new top-level tasks arrive with no subtasks', () => {
  const options = makeOptions();
  const result = mergeAgent([], [
    { id: 'p1', title: '阶段一', order: 0 },
    { id: 'p2', title: '阶段二', order: 1 },
    { id: 'p3', title: '阶段三', order: 2 },
    { id: 'p4', title: '阶段四', order: 3 },
  ], options);
  assert.equal(result.structure.newTopLevel, 4);
  assert.equal(result.structure.newTopLevelWithoutChildren, 4);
  assert.equal(result.structure.overLimit, true);
});

test('mergeAgent stays quiet when 4 top-level tasks each carry a subtask', () => {
  const options = makeOptions();
  const submission = [];
  for (let index = 1; index <= 4; index += 1) {
    submission.push({ id: 'p' + index, title: '阶段' + index, order: index * 2 });
    submission.push({ id: 'p' + index + '-c', title: '子' + index, parentId: 'p' + index, order: index * 2 + 1 });
  }
  const result = mergeAgent([], submission, options);
  assert.equal(result.structure.newTopLevel, 4);
  assert.equal(result.structure.newTopLevelWithoutChildren, 0);
  assert.equal(result.structure.overLimit, false);
});

test('mergeAgent stays quiet at or below the top-level threshold', () => {
  const options = makeOptions();
  const result = mergeAgent([], [
    { id: 'a', title: 'a', order: 0 },
    { id: 'b', title: 'b', order: 1 },
    { id: 'c', title: 'c', order: 2 },
  ], options);
  assert.equal(result.structure.newTopLevel, 3);
  assert.equal(result.structure.overLimit, false);
});

test('mergeAgent never flags an existing flat list it merely updates', () => {
  const options = makeOptions();
  const existing = [
    createTask({ id: 'old-1', title: '旧一', order: 0 }, options),
    createTask({ id: 'old-2', title: '旧二', order: 1 }, options),
    createTask({ id: 'old-3', title: '旧三', order: 2 }, options),
    createTask({ id: 'old-4', title: '旧四', order: 3 }, options),
  ];
  const submission = existing.map((task, index) => ({
    id: task.id,
    title: task.title,
    order: task.order,
    status: 'in_progress',
    updatedAt: NOW + 1 + index,
  }));
  const result = mergeAgent(existing, submission, options);
  assert.equal(result.structure.newTopLevel, 0);
  assert.equal(result.structure.overLimit, false);
  assert.equal(result.tasks.length, 4);
});

test('assertValidTree rejects cycles and self-parenting', () => {
  const options = makeOptions();
  const first = createTask({ id: 'a', title: 'a' }, options);
  const second = createTask({ id: 'b', title: 'b', parentId: 'a' }, options);
  assert.throws(() => assertValidTree([{ ...first, parentId: 'b' }, second]), /cycle/);
  assert.throws(() => assertValidTree([{ ...first, parentId: 'a' }]), /own parent/);
  assert.throws(() => assertValidTree([{ ...first, parentId: 'gone' }]), /missing parent/);
  assert.doesNotThrow(() => assertValidTree([first, second]));
});

test('every status in STATUSES round-trips through setStatus', () => {
  const { options, list } = baseTasks();
  let current = list;
  for (const status of STATUSES) {
    current = setStatus(current, list[0].id, status, { now: NOW + 1 });
    assert.equal(current[0].status, status);
  }
});

test('the abandoned state remembers where it came from and restores it', () => {
  const options = makeOptions();
  const task = createTask({ id: 't1', title: '原', status: 'in_progress' }, options);
  const dropped = patchTask(task, { status: 'abandoned' }, { now: NOW + 1 });
  assert.equal(dropped.status, 'abandoned');
  assert.equal(dropped.abandonedFrom, 'in_progress');
  assert.equal(dropped.completedAt, null);
  const back = patchTask(dropped, { status: 'in_progress' }, { now: NOW + 2 });
  assert.equal(back.status, 'in_progress');
  assert.equal(back.abandonedFrom, null);
});

test('an agent write to abandoned records the predecessor too', () => {
  const options = makeOptions();
  const task = createTask({ id: 't1', title: '原', status: 'review' }, options);
  const dropped = mergeAgent([task], [
    { id: 't1', status: 'abandoned', updatedAt: NOW + 1 },
  ], options).tasks[0];
  assert.equal(dropped.abandonedFrom, 'review');
  const restored = mergeAgent([dropped], [
    { id: 't1', status: 'review', updatedAt: NOW + 2 },
  ], options).tasks[0];
  assert.equal(restored.abandonedFrom, null);
});

test('deriveStatus skips abandoned children when it aggregates', () => {
  const options = makeOptions();
  const parent = createTask({ id: 'p1', title: '父', status: 'in_progress' }, options);
  const done = createTask({ id: 'c1', title: '完成', parentId: 'p1', status: 'completed' }, options);
  const dropped = createTask({ id: 'c2', title: '废弃', parentId: 'p1', status: 'abandoned' }, options);
  const derived = deriveStatus([parent, done, dropped]);
  assert.equal(derived.find((task) => task.id === 'p1').status, 'completed');
});

test('deriveStatus leaves a parent at its own state when every child was abandoned', () => {
  const options = makeOptions();
  const parent = createTask({ id: 'p1', title: '父', status: 'in_progress' }, options);
  const first = createTask({ id: 'c1', title: '废弃一', parentId: 'p1', status: 'abandoned' }, options);
  const second = createTask({ id: 'c2', title: '废弃二', parentId: 'p1', status: 'abandoned' }, options);
  const derived = deriveStatus([parent, first, second]);
  assert.equal(derived.find((task) => task.id === 'p1').status, 'in_progress');
});

test('insertTask refuses a new subtask under an abandoned parent', () => {
  const options = makeOptions();
  const parent = createTask({ id: 'p1', title: '父', status: 'abandoned' }, options);
  assert.throws(
    () => insertTask([parent], { title: '子', parentId: 'p1' }, options),
    /is abandoned: cannot add a subtask/,
  );
  const live = createTask({ id: 'p2', title: '活父', status: 'in_progress' }, options);
  const added = insertTask([live], { title: '子', parentId: 'p2' }, options);
  assert.equal(added.length, 2);
});

test('mergeAgent refuses a new subtask under an abandoned parent but keeps existing ones', () => {
  const options = makeOptions();
  const parent = createTask({ id: 'p1', title: '父', status: 'abandoned' }, options);
  const existingChild = createTask({ id: 'c1', title: '旧子', parentId: 'p1' }, options);
  assert.throws(() => mergeAgent([parent, existingChild], [
    { id: 'p1', title: '父', updatedAt: NOW },
    { id: 'c1', title: '旧子', parentId: 'p1', updatedAt: NOW },
    { id: 'c2', title: '新子', parentId: 'p1', updatedAt: NOW + 1 },
  ], options), /is abandoned: cannot add a subtask/);
  // Keeping or editing the existing subtree is fine: only new insertions are
  // frozen, so lists written before a phase was written off stay updatable.
  const ok = mergeAgent([parent, existingChild], [
    { id: 'p1', title: '父', status: 'abandoned', updatedAt: NOW },
    { id: 'c1', title: '旧子改名', parentId: 'p1', updatedAt: NOW + 1 },
  ], options);
  assert.equal(ok.tasks.find((task) => task.id === 'c1').title, '旧子改名');
});

test('importLegacyTodos maps historical todo rows once', () => {
  const tasks = importLegacyTodos([
    { content: '第一项', status: 'pending' },
    { content: '第二项', status: 'in_progress' },
    { content: '第三项', status: 'completed' },
    { content: '未知状态', status: 'weird' },
  ], { sessionId: 's1', now: NOW, idFactory: makeOptions().idFactory });

  assert.deepEqual(tasks.map((task) => task.title), ['第一项', '第二项', '第三项', '未知状态']);
  assert.deepEqual(tasks.map((task) => task.status), ['pending', 'in_progress', 'completed', 'pending']);
  assert.deepEqual(tasks.map((task) => task.order), [0, 1, 2, 3]);
  assert.ok(tasks.every((task) => task.origin === 'agent' && task.sessionId === 's1'));
  assert.equal(tasks[2].completedAt, NOW);
});

// ---------------------------------------------------------------------------
// blocked / focused / order / tree
// ---------------------------------------------------------------------------

test('createTask defaults the blocked and focused markers to false', () => {
  const task = createTask({ title: '写规则' }, makeOptions());
  assert.equal(task.blocked, false);
  assert.equal(task.focused, false);
});

test('patchTask can flip blocked and focused and rejects non-booleans', () => {
  const task = createTask({ title: '写规则' }, makeOptions());
  const blocked = patchTask(task, { blocked: true }, { now: NOW + 1 });
  assert.equal(blocked.blocked, true);
  const focused = patchTask(blocked, { focused: true }, { now: NOW + 2 });
  assert.equal(focused.focused, true);
  assert.throws(() => patchTask(task, { blocked: 'yes' }), /blocked must be a boolean/);
  assert.throws(() => patchTask(task, { focused: 1 }), /focused must be a boolean/);
});

test('setFocus keeps at most one focused task and null clears it', () => {
  const { options, list } = baseTasks();
  const [parent, child] = list;
  const pinned = setFocus(list, child.id, options);
  assert.equal(pinned.find((task) => task.id === child.id).focused, true);
  assert.equal(pinned.find((task) => task.id === parent.id).focused, false);

  const repinned = setFocus(pinned, parent.id, { now: NOW + 1 });
  assert.equal(repinned.find((task) => task.id === parent.id).focused, true);
  assert.equal(repinned.find((task) => task.id === child.id).focused, false);

  const cleared = setFocus(repinned, null, { now: NOW + 2 });
  assert.ok(cleared.every((task) => task.focused === false));
  assert.throws(() => setFocus(list, 'gone', options), /unknown task id/);
});

test('nextOrder appends after the highest sibling order', () => {
  const { list } = baseTasks();
  assert.equal(nextOrder(list, null), 1);
  assert.equal(nextOrder(list, list[0].id), 2);
});

test('moveSibling swaps with the neighbour and ignores the edges', () => {
  const options = makeOptions();
  const first = createTask({ id: 'a', title: 'a', order: 0 }, options);
  const second = createTask({ id: 'b', title: 'b', order: 1 }, options);
  const third = createTask({ id: 'c', title: 'c', order: 2 }, options);
  const list = [first, second, third];

  const orderOf = (tasks) => new Map(tasks.map((task) => [task.id, task.order]));

  const down = moveSibling(list, 'a', 1, { now: NOW + 1 });
  assert.equal(orderOf(down).get('b'), 0);
  assert.equal(orderOf(down).get('a'), 1);
  assert.equal(orderOf(down).get('c'), 2);

  const up = moveSibling(down, 'c', -1, { now: NOW + 2 });
  assert.equal(orderOf(up).get('b'), 0);
  assert.equal(orderOf(up).get('c'), 1);
  assert.equal(orderOf(up).get('a'), 2);

  assert.equal(moveSibling(list, 'a', -1, options), list);
  assert.equal(moveSibling(list, 'c', 1, options), list);
  assert.throws(() => moveSibling(list, 'gone', 1, options), /unknown task id/);
});

test('moveSibling normalises duplicate orders before swapping', () => {
  const options = makeOptions();
  const first = createTask({ id: 'a', title: 'a', order: 0 }, options);
  const second = createTask({ id: 'b', title: 'b', order: 0 }, options);
  const moved = moveSibling([first, second], 'b', -1, { now: NOW + 1 });
  const byId = new Map(moved.map((task) => [task.id, task]));
  assert.equal(byId.get('b').order, 0);
  assert.equal(byId.get('a').order, 1);
});

test('removeSubtree removes the task and every descendant', () => {
  const options = makeOptions();
  const root = createTask({ id: 'r', title: 'r', order: 0 }, options);
  const child = createTask({ id: 'c1', title: 'c1', parentId: 'r', order: 1 }, options);
  const grandchild = createTask({ id: 'c2', title: 'c2', parentId: 'c1', order: 2 }, options);
  const outside = createTask({ id: 'o', title: 'o', order: 3 }, options);

  const result = removeSubtree([root, child, grandchild, outside], 'r');
  assert.deepEqual(result.tasks.map((task) => task.id), ['o']);
  assert.deepEqual(result.removed.sort(), ['c1', 'c2', 'r']);
});

test('deriveStatus reports a parent from its children only', () => {
  const options = makeOptions();
  const parent = createTask({ id: 'p', title: 'p' }, options);
  const one = createTask({ id: 'a', title: 'a', parentId: 'p' }, options);
  const two = createTask({ id: 'b', title: 'b', parentId: 'p' }, options);

  const allPending = deriveStatus([parent, one, two]);
  assert.equal(allPending.find((task) => task.id === 'p').status, 'pending');

  const mixed = deriveStatus([
    parent,
    patchTask(one, { status: 'completed' }, { now: NOW + 1 }),
    two,
  ]);
  assert.equal(mixed.find((task) => task.id === 'p').status, 'in_progress');

  const allDone = deriveStatus([
    parent,
    patchTask(one, { status: 'completed' }, { now: NOW + 1 }),
    patchTask(two, { status: 'completed' }, { now: NOW + 1 }),
  ]);
  assert.equal(allDone.find((task) => task.id === 'p').status, 'completed');

  // The stored parent status is never rewritten by the derivation.
  assert.equal(allDone.find((task) => task.id === 'p').version, parent.version);
});

test('deriveStatus resolves nested parents from the leaves up', () => {
  const options = makeOptions();
  const root = createTask({ id: 'r', title: 'r' }, options);
  const middle = createTask({ id: 'm', title: 'm', parentId: 'r' }, options);
  const leaf = createTask({ id: 'l', title: 'l', parentId: 'm' }, options);

  const derived = deriveStatus([
    root,
    middle,
    patchTask(leaf, { status: 'completed' }, { now: NOW + 1 }),
  ]);
  assert.equal(derived.find((task) => task.id === 'm').status, 'completed');
  assert.equal(derived.find((task) => task.id === 'r').status, 'completed');
});

test('mergeAgent never pins a task and keeps the user pin', () => {
  const options = makeOptions();
  const userTask = setFocus([createTask({ id: 'u', title: 'u', origin: 'user' }, options)], 'u', options);
  const result = mergeAgent(userTask, [
    { id: 'u', title: 'u', status: 'pending', focused: true },
    { id: 'n', title: 'n', status: 'pending', focused: true },
  ], { now: NOW + 1 });
  assert.equal(result.tasks.find((task) => task.id === 'u').focused, true);
  assert.equal(result.tasks.find((task) => task.id === 'n').focused, false);
});

test('mergeAgent updates the blocked marker from an agent submission', () => {
  const options = makeOptions();
  const list = [createTask({ id: 'a', title: 'a', origin: 'agent' }, options)];
  const result = mergeAgent(list, [{ id: 'a', title: 'a', status: 'pending', blocked: true }], { now: NOW + 1 });
  assert.equal(result.tasks[0].blocked, true);
});


test('setPaused flips every unfinished task for the all scope', () => {
  const options = makeOptions();
  const done = patchTask(createTask({ id: 'd', title: 'd' }, options), { status: 'completed' }, { now: NOW + 1 });
  const list = [createTask({ id: 'a', title: 'a' }, options), done];
  const paused = setPaused(list, 'all', null, true, { now: NOW + 2 });
  assert.equal(paused.find((task) => task.id === 'a').paused, true);
  assert.equal(paused.find((task) => task.id === 'd').paused, false);
  const resumed = setPaused(paused, 'all', null, false, { now: NOW + 3 });
  assert.equal(resumed.find((task) => task.id === 'a').paused, false);
});

test('setPaused subtree only touches the children of that parent', () => {
  const options = makeOptions();
  const list = [
    createTask({ id: 'p', title: 'p' }, options),
    createTask({ id: 'c1', title: 'c1', parentId: 'p' }, options),
    createTask({ id: 'c2', title: 'c2', parentId: 'p' }, options),
    createTask({ id: 'other', title: 'other' }, options),
  ];
  const paused = setPaused(list, 'subtree', 'p', true, { now: NOW + 2 });
  assert.equal(paused.find((task) => task.id === 'c1').paused, true);
  assert.equal(paused.find((task) => task.id === 'c2').paused, true);
  assert.equal(paused.find((task) => task.id === 'p').paused, false);
  assert.equal(paused.find((task) => task.id === 'other').paused, false);
});

test('mergeAgent keeps the user pause flag', () => {
  const options = makeOptions();
  const list = setPaused([createTask({ id: 'a', title: 'a', origin: 'user' }, options)], 'all', null, true, { now: NOW + 1 });
  const result = mergeAgent(list, [{ id: 'a', title: 'a', status: 'pending' }], { now: NOW + 2 });
  assert.equal(result.tasks[0].paused, true);
});

test('setBlocked subtree blocks the parent and its unfinished children', () => {
  const options = makeOptions();
  const done = patchTask(createTask({ id: 'c2', title: 'c2', parentId: 'p' }, options), { status: 'completed' }, { now: NOW + 1 });
  const list = [
    createTask({ id: 'p', title: 'p' }, options),
    createTask({ id: 'c1', title: 'c1', parentId: 'p' }, options),
    done,
    createTask({ id: 'other', title: 'other' }, options),
  ];
  const blocked = setBlocked(list, 'p', true, { now: NOW + 2, scope: 'subtree' });
  assert.equal(blocked.find((task) => task.id === 'p').blocked, true);
  assert.equal(blocked.find((task) => task.id === 'c1').blocked, true);
  // Finished work is not blocked: there is nothing left to wait on.
  assert.equal(blocked.find((task) => task.id === 'c2').blocked, false);
  assert.equal(blocked.find((task) => task.id === 'other').blocked, false);
  const cleared = setBlocked(blocked, 'p', false, { now: NOW + 3, scope: 'subtree' });
  assert.equal(cleared.find((task) => task.id === 'p').blocked, false);
  assert.equal(cleared.find((task) => task.id === 'c1').blocked, false);
});

test('setBlocked task scope leaves the children alone', () => {
  const options = makeOptions();
  const list = [
    createTask({ id: 'p', title: 'p' }, options),
    createTask({ id: 'c1', title: 'c1', parentId: 'p' }, options),
  ];
  const blocked = setBlocked(list, 'p', true, { now: NOW + 2, scope: 'task' });
  assert.equal(blocked.find((task) => task.id === 'p').blocked, true);
  assert.equal(blocked.find((task) => task.id === 'c1').blocked, false);
});