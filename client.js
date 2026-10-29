/**
 * Session Groups — Client plugin half.
 *
 * Registers:
 *   - sidebar.panellist              one sidebar entry icon ("Groups")
 *   - main (key session-groups)      the groups board panel
 *   - sidebar.workspaces             priority 10: the grouped browser replacing the shipped one
 *   - sidebar.workspaces.session.menu.item  "Move to group…" row
 *   - sidebar.session.row.hover      the current group shown in the hover card
 *   - shell.overlay                  the move-to-group dialog
 *
 * Group data is plugin-owned and lives in this browser's localStorage,
 * keyed by Workspace id. It never touches the Session log.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-workspace-frontend',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    // createPortal lives in react-dom, never in react. Taking it off React yields
    // undefined, and the first context toast then throws inside the browser
    // component, which hands the whole sidebar back to the shipped one.
    let createPortal = null;
    try {
      const ReactDOM = require('react-dom');
      if (ReactDOM && typeof ReactDOM.createPortal === 'function') createPortal = ReactDOM.createPortal;
    } catch (error) {
      createPortal = null;
    }
    const useState = React.useState;
    const useEffect = React.useEffect;
    const useMemo = React.useMemo;
    const useRef = React.useRef;

    const NS = 'sessionGroups';
    const STORAGE_KEY = 'dsh.session-groups.v1';
    const CSS_ID = '@local/dsh-workspace-frontend/panel.css';

    const PALETTE = [
      '#D97757', '#6A9B7E', '#5B8DB8', '#B08BBB',
      '#C9A227', '#C96F6F', '#7C8A9A', '#4F9D9D',
    ];

    // ------------------------------------------------------------------
    // locale dictionaries
    // ------------------------------------------------------------------
    const zh = {
      'panel.label': '工作区美化',
      'panel.title': '工作区美化',
      'panel.subtitle': 'DSH 工作区前端重建：会话分组、拖拽归类、布局与视觉。',
      'panel.total': '共 {n} 个会话',
      'panel.hint': '分组数据只保存在这台机器的浏览器里，不会写进会话日志。',
      'panel.noWorkspace': '还没有工作区。先在侧栏新建一个会话，或添加一个工作区，再回来建分组。',
      'workspace.label': '工作区',
      'workspace.defaultName': '默认工作区',
      'section.new': '新建分组',
      'section.namePlaceholder': '分组名称，例如「项目 A」',
      'section.untitled': '未命名分组',
      'section.count': '{n} 个会话',
      'section.empty': '这个分组还没有会话',
      'section.rename': '重命名',
      'section.delete': '删除分组',
      'section.deleteConfirm': '确认删除',
      'section.up': '上移',
      'section.down': '下移',
      'section.add': '添加会话',
      'section.noCandidates': '没有可添加的会话',
      'unassigned': '未分组',
      'row.move': '移动到分组',
      'row.open': '打开会话',
      'row.rename': '重命名',
      'row.moveUp': '上移',
      'row.moveDown': '下移',
      'row.copyId': '复制 Session ID',
      'row.context': '上下文已用 {percent}%',
      'row.contextRunning': '正在工作 · 上下文已用 {percent}%',
      'row.schedule': '已设定时任务',
      'row.archive': '归档会话',
      'row.unarchive': '取消归档',
      'rename.title': '重命名会话',
      'rename.placeholder': '输入会话标题',
      'rename.confirm': '保存',
      'rename.cancel': '取消',
      'rename.empty': '标题不能为空。',
      'rename.failed': '重命名失败：{message}',
      'move.title': '移入分组',
      'move.none': '未分组',
      'move.newSectionPlaceholder': '新分组名称',
      'move.create': '创建并移入',
      'move.noWorkspace': '找不到这个会话所属的工作区。',
      'menu.moveToSection': '移入分组…',
      'hover.section': '分组',
      'browser.searchPlaceholder': '搜索会话',
      'browser.showArchived': '显示已归档',
      'browser.hideArchived': '隐藏已归档',
      'browser.addWorkspace': '添加工作区',
      'browser.newSession': '新建会话',
      'browser.addGroup': '添加分组',
      'section.color': '修改颜色',
      'browser.emptyWorkspace': '这个工作区还没有会话',
      'browser.noWorkspace': '还没有工作区',
      'browser.addFirstWorkspace': '添加工作区',
      'browser.deleteWorkspace': '删除工作区',
      'browser.deleteWorkspaceConfirm': '确认删除',
      'browser.deleteGroup': '删除分组',
      'browser.deleteGroupConfirm': '确认删除',
      'orphan.label': '无工作区',
      'newSession': '新会话',
      'row.more': '更多操作',
      'untitled': '未命名会话',
      'confirm': '确定',
      'cancel': '取消',
      'time.now': '刚刚',
      'time.minute': '{n} 分钟前',
      'time.hour': '{n} 小时前',
      'time.day': '{n} 天前',
      'time.month': '{n} 个月前',
      'time.year': '{n} 年前',
      'ctx.alert20.title': '上下文已用 {percent}%',
      'ctx.alert20.body': '已达 20% 提醒线。继续工作即可，到 40% 会提醒先收尾、再换会话。',
      'ctx.alert40.title': '上下文已用 {percent}%，准备换会话',
      'ctx.alert40.body': '先把当前工作收尾，我会补齐项目 HANDOFF；随后开一个新会话继续。',
    };

    const en = {
      'panel.label': 'Workspace Polish',
      'panel.title': 'Workspace Polish',
      'panel.subtitle': 'Workspace frontend rebuild: session groups, drag assignment, layout and visual polish.',
      'panel.total': '{n} sessions',
      'panel.hint': 'Groups are stored in this browser only and never written to a session log.',
      'panel.noWorkspace': 'No workspace yet. Create a session or add a workspace first, then come back.',
      'workspace.label': 'Workspace',
      'workspace.defaultName': 'Default workspace',
      'section.new': 'New group',
      'section.namePlaceholder': 'Group name, e.g. "Project A"',
      'section.untitled': 'Untitled group',
      'section.count': '{n} sessions',
      'section.empty': 'No sessions in this group yet',
      'section.rename': 'Rename',
      'section.delete': 'Delete group',
      'section.deleteConfirm': 'Confirm delete',
      'section.up': 'Move up',
      'section.down': 'Move down',
      'section.add': 'Add session',
      'section.noCandidates': 'No session to add',
      'unassigned': 'Unassigned',
      'row.move': 'Move to group',
      'row.open': 'Open session',
      'row.rename': 'Rename',
      'row.moveUp': 'Move up',
      'row.moveDown': 'Move down',
      'row.copyId': 'Copy session ID',
      'row.context': '{percent}% of context used',
      'row.contextRunning': 'Working · {percent}% of context used',
      'row.schedule': 'Scheduled task set',
      'row.archive': 'Archive session',
      'row.unarchive': 'Unarchive session',
      'rename.title': 'Rename session',
      'rename.placeholder': 'Session title',
      'rename.confirm': 'Save',
      'rename.cancel': 'Cancel',
      'rename.empty': 'A title is required.',
      'rename.failed': 'Rename failed: {message}',
      'move.title': 'Move to group',
      'move.none': 'Unassigned',
      'move.newSectionPlaceholder': 'New group name',
      'move.create': 'Create and move',
      'move.noWorkspace': 'The workspace of this session could not be resolved.',
      'menu.moveToSection': 'Move to group…',
      'hover.section': 'Group',
      'browser.searchPlaceholder': 'Search sessions',
      'browser.showArchived': 'Show archived',
      'browser.hideArchived': 'Hide archived',
      'browser.addWorkspace': 'Add workspace',
      'browser.newSession': 'New session',
      'browser.addGroup': 'Add group',
      'section.color': 'Change color',
      'browser.emptyWorkspace': 'No sessions in this workspace yet',
      'browser.noWorkspace': 'No workspace yet',
      'browser.addFirstWorkspace': 'Add workspace',
      'browser.deleteWorkspace': 'Delete workspace',
      'browser.deleteWorkspaceConfirm': 'Confirm delete',
      'browser.deleteGroup': 'Delete group',
      'browser.deleteGroupConfirm': 'Confirm delete',
      'orphan.label': 'No workspace',
      'newSession': 'New session',
      'row.more': 'More actions',
      'untitled': 'Untitled session',
      'confirm': 'OK',
      'cancel': 'Cancel',
      'time.now': 'just now',
      'time.minute': '{n}m ago',
      'time.hour': '{n}h ago',
      'time.day': '{n}d ago',
      'time.month': '{n}mo ago',
      'time.year': '{n}y ago',
      'ctx.alert20.title': 'Context {percent}% used',
      'ctx.alert20.body': '20% reached. Keep working; at 40% you will be asked to wrap up and restart.',
      'ctx.alert40.title': 'Context {percent}% used - switch sessions soon',
      'ctx.alert40.body': 'Finish the current task first; the project HANDOFF gets updated, then start a new session.',
    };

    // ------------------------------------------------------------------
    // helpers
    // ------------------------------------------------------------------
    function cx() {
      const out = [];
      for (let index = 0; index < arguments.length; index += 1) {
        if (arguments[index]) out.push(arguments[index]);
      }
      return out.join(' ');
    }

    function toMs(value) {
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      if (typeof value === 'string') {
        const parsed = Date.parse(value);
        return Number.isFinite(parsed) ? parsed : 0;
      }
      return 0;
    }

    /** Mirror the shipped browser: the stored default title renders localized. */
    function workspaceTitleOf(workspace, t) {
      const title = workspace && typeof workspace.title === 'string' ? workspace.title : '';
      if (!title || title === 'default-workspace') return t('workspace.defaultName');
      return title;
    }

    function relativeTime(updatedAt, t) {
      const diff = Date.now() - toMs(updatedAt);
      if (!Number.isFinite(diff) || diff < 0) return '';
      const minutes = Math.floor(diff / 60000);
      if (minutes < 1) return t('time.now');
      if (minutes < 60) return t('time.minute', { n: minutes });
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return t('time.hour', { n: hours });
      const days = Math.floor(hours / 24);
      if (days < 30) return t('time.day', { n: days });
      const months = Math.floor(days / 30);
      if (months < 12) return t('time.month', { n: months });
      return t('time.year', { n: Math.floor(months / 12) });
    }

    function emptyState() {
      return { version: 1, byWorkspace: {}, moves: {}, orders: {} };
    }

    function normalizeState(raw) {
      const out = emptyState();
      if (!raw || typeof raw !== 'object') return out;
      const source = raw.byWorkspace;
      if (source && typeof source === 'object') {
        for (const wsId of Object.keys(source)) {
          const bucket = source[wsId];
          if (!bucket || typeof bucket !== 'object') continue;
          const sections = [];
          const seen = new Set();
          if (Array.isArray(bucket.sections)) {
            for (const entry of bucket.sections) {
              if (!entry || typeof entry.id !== 'string' || seen.has(entry.id)) continue;
              seen.add(entry.id);
              sections.push({
                id: entry.id,
                name: typeof entry.name === 'string' && entry.name ? entry.name : 'Group',
                color: typeof entry.color === 'string' && entry.color ? entry.color : PALETTE[sections.length % PALETTE.length],
              });
            }
          }
          const assignments = {};
          if (bucket.assignments && typeof bucket.assignments === 'object') {
            for (const sessionId of Object.keys(bucket.assignments)) {
              const sectionId = bucket.assignments[sessionId];
              if (typeof sectionId === 'string' && seen.has(sectionId)) assignments[sessionId] = sectionId;
            }
          }
          out.byWorkspace[wsId] = { sections, assignments };
        }
      }
      if (raw.moves && typeof raw.moves === 'object') {
        for (const sessionId of Object.keys(raw.moves)) {
          const entry = raw.moves[sessionId];
          if (!entry || typeof entry.workspaceId !== 'string' || !entry.workspaceId) continue;
          out.moves[sessionId] = {
            workspaceId: entry.workspaceId,
            sectionId: typeof entry.sectionId === 'string' ? entry.sectionId : '',
          };
        }
      }
      // Manual row order: orders[workspaceId][sectionId | ''] = [sessionId, ...]
      // A present list means that group no longer sorts by updatedAt.
      if (raw.orders && typeof raw.orders === 'object') {
        for (const wsId of Object.keys(raw.orders)) {
          const wsOrders = raw.orders[wsId];
          if (!wsOrders || typeof wsOrders !== 'object') continue;
          const clean = {};
          for (const key of Object.keys(wsOrders)) {
            const ids = wsOrders[key];
            if (!Array.isArray(ids)) continue;
            const seen = new Set();
            const list = [];
            for (const id of ids) {
              if (typeof id !== 'string' || !id || seen.has(id)) continue;
              seen.add(id);
              list.push(id);
            }
            if (list.length > 0) clean[key] = list;
          }
          if (Object.keys(clean).length > 0) out.orders[wsId] = clean;
        }
      }
      return out;
    }

    // ------------------------------------------------------------------
    // section store (module-level, localStorage-backed)
    // ------------------------------------------------------------------
    let cache = null;
    const listeners = new Set();

    function getState() {
      if (cache === null) {
        try {
          cache = normalizeState(JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null'));
        } catch (error) {
          cache = emptyState();
        }
      }
      return cache;
    }

    function notify() {
      const snapshot = Array.from(listeners);
      for (const listener of snapshot) {
        try {
          listener();
        } catch (error) {
          // A crashing subscriber must not break the remaining ones.
        }
      }
    }

    function commit(next) {
      cache = next;
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch (error) {
        // Persistence is best effort; the in-memory state stays authoritative.
      }
      notify();
    }

    function subscribe(listener) {
      listeners.add(listener);
      const onStorage = (event) => {
        if (event.key !== STORAGE_KEY && event.key !== null) return;
        cache = null;
        notify();
      };
      window.addEventListener('storage', onStorage);
      return function unsubscribe() {
        listeners.delete(listener);
        window.removeEventListener('storage', onStorage);
      };
    }

    function bucketOf(state, wsId) {
      const bucket = state.byWorkspace[wsId];
      return bucket || { sections: [], assignments: {} };
    }

    function updateBucket(wsId, mutate) {
      if (!wsId) return;
      const state = getState();
      const current = bucketOf(state, wsId);
      const nextBucket = mutate({
        sections: current.sections.slice(),
        assignments: Object.assign({}, current.assignments),
      });
      if (nextBucket === current) return;
      const byWorkspace = Object.assign({}, state.byWorkspace);
      byWorkspace[wsId] = nextBucket;
      commit(Object.assign({}, state, { byWorkspace }));
    }

    function newSectionId() {
      return 'sec-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    }

    function addSection(wsId, name) {
      const id = newSectionId();
      updateBucket(wsId, (bucket) => ({
        sections: bucket.sections.concat([{
          id,
          name: name || 'Group',
          color: PALETTE[bucket.sections.length % PALETTE.length],
        }]),
        assignments: bucket.assignments,
      }));
      return id;
    }

    function renameSection(wsId, sectionId, name) {
      updateBucket(wsId, (bucket) => {
        let changed = false;
        const sections = bucket.sections.map((section) => {
          if (section.id !== sectionId || section.name === name) return section;
          changed = true;
          return { id: section.id, name, color: section.color };
        });
        return changed ? { sections, assignments: bucket.assignments } : bucket;
      });
    }

    function setSectionColor(wsId, sectionId, color) {
      if (!color) return;
      updateBucket(wsId, (bucket) => {
        let changed = false;
        const sections = bucket.sections.map((section) => {
          if (section.id !== sectionId || section.color === color) return section;
          changed = true;
          return { id: section.id, name: section.name, color };
        });
        return changed ? { sections, assignments: bucket.assignments } : bucket;
      });
    }

    function removeSection(wsId, sectionId) {
      const state = getState();
      const bucket = bucketOf(state, wsId);
      if (!bucket.sections.some((section) => section.id === sectionId)) return;
      const assignments = {};
      for (const sessionId of Object.keys(bucket.assignments)) {
        if (bucket.assignments[sessionId] !== sectionId) assignments[sessionId] = bucket.assignments[sessionId];
      }
      const byWorkspace = Object.assign({}, state.byWorkspace);
      byWorkspace[wsId] = {
        sections: bucket.sections.filter((section) => section.id !== sectionId),
        assignments,
      };
      // Cross-workspace drag records may point at this section; blank the section
      // so those sessions fall back to the ungrouped area instead of a dead id.
      let moves = state.moves || {};
      let movesChanged = false;
      for (const sessionId of Object.keys(moves)) {
        const move = moves[sessionId];
        if (!move || move.workspaceId !== wsId || move.sectionId !== sectionId) continue;
        if (!movesChanged) {
          moves = Object.assign({}, moves);
          movesChanged = true;
        }
        moves[sessionId] = { workspaceId: move.workspaceId, sectionId: '' };
      }
      const next = Object.assign({}, state, { byWorkspace });
      if (movesChanged) next.moves = moves;
      const wsOrders = state.orders && state.orders[wsId];
      if (wsOrders && Object.prototype.hasOwnProperty.call(wsOrders, sectionId)) {
        const orders = Object.assign({}, state.orders);
        const clean = Object.assign({}, wsOrders);
        delete clean[sectionId];
        orders[wsId] = clean;
        next.orders = orders;
      }
      commit(next);
    }

    function moveSection(wsId, sectionId, delta) {
      updateBucket(wsId, (bucket) => {
        const index = bucket.sections.findIndex((section) => section.id === sectionId);
        const target = index + delta;
        if (index < 0 || target < 0 || target >= bucket.sections.length) return bucket;
        const sections = bucket.sections.slice();
        const moved = sections.splice(index, 1)[0];
        sections.splice(target, 0, moved);
        return { sections, assignments: bucket.assignments };
      });
    }

    // Manual row order inside one group. The ungrouped bucket uses the '' key.
    function setGroupOrder(wsId, sectionKey, ids) {
      const state = getState();
      const orders = Object.assign({}, state.orders);
      const wsOrders = Object.assign({}, orders[wsId] || {});
      wsOrders[sectionKey] = ids.slice();
      orders[wsId] = wsOrders;
      commit(Object.assign({}, state, { orders }));
    }

    function sortByOrder(rows, ids) {
      if (!Array.isArray(ids) || ids.length === 0) return rows;
      const index = new Map();
      ids.forEach((id, position) => {
        if (!index.has(id)) index.set(id, position);
      });
      return rows.slice().sort((left, right) => {
        const leftIndex = index.has(left.id) ? index.get(left.id) : -1;
        const rightIndex = index.has(right.id) ? index.get(right.id) : -1;
        if (leftIndex !== rightIndex) {
          if (leftIndex < 0) return -1;
          if (rightIndex < 0) return 1;
          return leftIndex - rightIndex;
        }
        return toMs(right.updatedAt) - toMs(left.updatedAt);
      });
    }

    // Freeze the current on-screen order, then swap the row with one neighbour.
    function moveSessionInGroup(wsId, sectionKey, ids, index, delta) {
      const target = index + delta;
      if (index < 0 || target < 0 || target >= ids.length) return;
      const next = ids.slice();
      const moved = next.splice(index, 1)[0];
      next.splice(target, 0, moved);
      setGroupOrder(wsId, sectionKey, next);
    }

    // Only touch an existing manual list: an untouched group keeps its live sort.
    function reorderListForMove(wsOrders, toKey, sessionId) {
      let changed = false;
      const next = Object.assign({}, wsOrders);
      for (const key of Object.keys(next)) {
        if (key === toKey) continue;
        const list = next[key];
        if (!Array.isArray(list) || list.indexOf(sessionId) < 0) continue;
        next[key] = list.filter((id) => id !== sessionId);
        changed = true;
      }
      if (Object.prototype.hasOwnProperty.call(wsOrders, toKey)) {
        const list = (Array.isArray(wsOrders[toKey]) ? wsOrders[toKey] : []).filter((id) => id !== sessionId);
        list.unshift(sessionId);
        next[toKey] = list;
        changed = true;
      }
      return changed ? next : null;
    }

    function assignSession(wsId, sessionId, sectionId) {
      if (!wsId || !sessionId) return;
      const state = getState();
      const bucket = bucketOf(state, wsId);
      const assignments = Object.assign({}, bucket.assignments);
      const sectionKey = sectionId || '';
      if (sectionId) assignments[sessionId] = sectionId;
      else delete assignments[sessionId];
      const byWorkspace = Object.assign({}, state.byWorkspace);
      byWorkspace[wsId] = { sections: bucket.sections, assignments };
      const orders = Object.assign({}, state.orders);
      const wsOrders = reorderListForMove(orders[wsId] || {}, sectionKey, sessionId);
      if (wsOrders) orders[wsId] = wsOrders;
      const next = Object.assign({}, state, { byWorkspace });
      if (wsOrders) next.orders = orders;
      commit(next);
    }

    function clearWorkspaceData(wsId) {
      if (!wsId) return;
      const state = getState();
      const hasBucket = Object.prototype.hasOwnProperty.call(state.byWorkspace, wsId);
      const hasOrders = state.orders && Object.prototype.hasOwnProperty.call(state.orders, wsId);
      if (!hasBucket && !hasOrders) return;
      const byWorkspace = Object.assign({}, state.byWorkspace);
      delete byWorkspace[wsId];
      const next = Object.assign({}, state, { byWorkspace });
      if (hasOrders) {
        const orders = Object.assign({}, state.orders);
        delete orders[wsId];
        next.orders = orders;
      }
      commit(next);
    }

    function setSessionMove(sessionId, workspaceId, sectionId) {
      if (!sessionId || !workspaceId) return;
      const state = getState();
      const moves = Object.assign({}, state.moves);
      moves[sessionId] = { workspaceId, sectionId: sectionId || '' };
      const orders = Object.assign({}, state.orders);
      const wsOrders = reorderListForMove(orders[workspaceId] || {}, sectionId || '', sessionId);
      if (wsOrders) orders[workspaceId] = wsOrders;
      const next = Object.assign({}, state, { moves });
      if (wsOrders) next.orders = orders;
      commit(next);
    }

    function clearSessionMove(sessionId) {
      const state = getState();
      if (!Object.prototype.hasOwnProperty.call(state.moves, sessionId)) return;
      const moves = Object.assign({}, state.moves);
      delete moves[sessionId];
      commit(Object.assign({}, state, { moves }));
    }

    // ------------------------------------------------------------------
    // move-dialog request store
    // ------------------------------------------------------------------
    let overlayRequest = null;
    const overlayListeners = new Set();

    function getOverlayRequest() {
      return overlayRequest;
    }

    function subscribeOverlay(listener) {
      overlayListeners.add(listener);
      return function unsubscribe() {
        overlayListeners.delete(listener);
      };
    }

    function emitOverlay() {
      const snapshot = Array.from(overlayListeners);
      for (const listener of snapshot) {
        try {
          listener();
        } catch (error) {
          // Ignore one broken subscriber.
        }
      }
    }

    function openMoveDialog(payload) {
      overlayRequest = { sessionId: payload.sessionId, title: payload.title || '' };
      emitOverlay();
    }

    function closeMoveDialog() {
      if (overlayRequest === null) return;
      overlayRequest = null;
      emitOverlay();
    }

    // ------------------------------------------------------------------
    // rename-dialog request store
    // ------------------------------------------------------------------
    let renameRequest = null;
    const renameListeners = new Set();

    function getRenameRequest() {
      return renameRequest;
    }

    function subscribeRename(listener) {
      renameListeners.add(listener);
      return function unsubscribe() {
        renameListeners.delete(listener);
      };
    }

    function emitRename() {
      const snapshot = Array.from(renameListeners);
      for (const listener of snapshot) {
        try {
          listener();
        } catch (error) {
          // Ignore one broken subscriber.
        }
      }
    }

    function openRenameDialog(payload) {
      renameRequest = { sessionId: payload.sessionId, title: payload.title || '' };
      emitRename();
    }

    function closeRenameDialog() {
      if (renameRequest === null) return;
      renameRequest = null;
      emitRename();
    }

    // ------------------------------------------------------------------
    // store hooks
    // ------------------------------------------------------------------
    const useSyncStore = typeof React.useSyncExternalStore === 'function'
      ? React.useSyncExternalStore
      : function useSyncStoreFallback(subscribeTo, getSnapshot) {
        const initial = useState(getSnapshot);
        const setValue = initial[1];
        useEffect(() => subscribeTo(() => setValue(getSnapshot)), [subscribeTo, getSnapshot]);
        return initial[0];
      };

    function useSectionsState() {
      return useSyncStore(subscribe, getState);
    }

    function useMoveRequest() {
      return useSyncStore(subscribeOverlay, getOverlayRequest);
    }

    function useRenameRequest() {
      return useSyncStore(subscribeRename, getRenameRequest);
    }

    // Safe fallbacks when a standard root hook is unavailable.
    function useEmptyWorkspaces(selector) {
      return selector({ items: [], archivedSessionIds: [], pinnedSessionIds: [] });
    }

    function useEmptySessions(selector) {
      return selector({ ids: [], byId: {} });
    }

    function useNoopMenuState() {
      return [false, function () {}];
    }

    function workspacesHookOf(props) {
      return typeof props.useWorkspaces === 'function' ? props.useWorkspaces : useEmptyWorkspaces;
    }

    function sessionsHookOf(props) {
      return typeof props.useSessions === 'function' ? props.useSessions : useEmptySessions;
    }

    // useSessionStatus((snapshot) => snapshot) returns a Map keyed by session id;
    // entries expose at least `running` and `pendingInteraction`.
    function sessionStatusHookOf(props) {
      if (typeof props.useSessionStatus === 'function') return props.useSessionStatus;
      return () => () => null;
    }

    // ------------------------------------------------------------------
    // sidebar panel icon
    // ------------------------------------------------------------------
    function PanelIcon(props) {
      const size = typeof props.size === 'number' && props.size > 0 ? props.size : 16;
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 16 16',
        'aria-hidden': 'true',
        style: { display: 'block' },
      },
        h('g', { fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' },
          h('line', { x1: 6.5, y1: 4, x2: 13.5, y2: 4 }),
          h('line', { x1: 6.5, y1: 8, x2: 13.5, y2: 8 }),
          h('line', { x1: 6.5, y1: 12, x2: 13.5, y2: 12 })),
        h('g', { fill: 'currentColor' },
          h('circle', { cx: 3.2, cy: 4, r: 1.3 }),
          h('circle', { cx: 3.2, cy: 8, r: 1.3 }),
          h('circle', { cx: 3.2, cy: 12, r: 1.3 }))
      );
    }

    function IconChevron(props) {
      const size = typeof props.size === 'number' ? props.size : 13;
      const open = props.open !== false;
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 16 16',
        'aria-hidden': 'true',
        style: { display: 'block', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .12s ease' },
      }, h('path', {
        d: 'M6 3.5 L10.5 8 L6 12.5',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.3,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      }));
    }

    function IconArrowUp(props) {
      const size = typeof props.size === 'number' ? props.size : 14;
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 16 16',
        'aria-hidden': 'true',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.3,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        style: { display: 'block' },
      },
        h('path', { d: 'M8 13V3' }),
        h('path', { d: 'M4.2 6.8L8 3l3.8 3.8' }));
    }

    function IconArrowDown(props) {
      const size = typeof props.size === 'number' ? props.size : 14;
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 16 16',
        'aria-hidden': 'true',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.3,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        style: { display: 'block' },
      },
        h('path', { d: 'M8 3v10' }),
        h('path', { d: 'M4.2 9.2L8 13l3.8-3.8' }));
    }

    function IconPlus(props) {
      const size = typeof props.size === 'number' ? props.size : 14;
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 16 16',
        'aria-hidden': 'true',
        style: { display: 'block' },
      }, h('path', {
        d: 'M8 3v10M3 8h10',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.3,
        strokeLinecap: 'round',
      }));
    }

    function IconArchive(props) {
      const size = typeof props.size === 'number' ? props.size : 16;
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 16 16',
        'aria-hidden': 'true',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.3,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        style: { display: 'block' },
      },
        h('rect', { x: 2, y: 3, width: 12, height: 3, rx: 1 }),
        h('path', { d: 'M3.2 6.5v5.3a1 1 0 0 0 1 1h7.6a1 1 0 0 0 1-1V6.5' }),
        h('path', { d: 'M6.5 9.5h3' }));
    }

    function IconMore(props) {
      const size = typeof props.size === 'number' ? props.size : 16;
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 16 16',
        'aria-hidden': 'true',
        style: { display: 'block' },
      }, h('g', { fill: 'currentColor' },
        h('circle', { cx: 4, cy: 8, r: 1.4 }),
        h('circle', { cx: 8, cy: 8, r: 1.4 }),
        h('circle', { cx: 12, cy: 8, r: 1.4 })));
    }

    function IconEdit(props) {
      const size = typeof props.size === 'number' ? props.size : 14;
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 16 16',
        'aria-hidden': 'true',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.3,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        style: { display: 'block' },
      },
        h('path', { d: 'M10.8 3.2l2 2L5.4 12.6H3.4v-2z' }),
        h('path', { d: 'M9.6 4.4l2 2' }));
    }

    function IconClose(props) {
      const size = typeof props.size === 'number' ? props.size : 14;
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 16 16',
        'aria-hidden': 'true',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.3,
        strokeLinecap: 'round',
        style: { display: 'block' },
      }, h('path', { d: 'M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6' }));
    }

    function IconTrash(props) {
      const size = typeof props.size === 'number' ? props.size : 14;
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 16 16',
        'aria-hidden': 'true',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.3,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        style: { display: 'block' },
      },
        h('path', { d: 'M3 4.7h10' }),
        h('path', { d: 'M6.2 4.7V3.2h3.6v1.5' }),
        h('path', { d: 'M4.3 4.7l.5 8.1a1 1 0 0 0 1 .9h4.4a1 1 0 0 0 1-.9l.5-8.1' }),
        h('path', { d: 'M6.6 7v3.8M9.4 7v3.8' }));
    }

    function IconFolderPlus(props) {
      const size = typeof props.size === 'number' ? props.size : 14;
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 16 16',
        'aria-hidden': 'true',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.3,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        style: { display: 'block' },
      },
        h('path', { d: 'M2.6 4.4a1 1 0 0 1 1-1h2.9l1.2 1.4h4.7a1 1 0 0 1 1 1v6.8a1 1 0 0 1-1 1H3.6a1 1 0 0 1-1-1z' }),
        h('path', { d: 'M8 7.4v3.4M6.3 9.1h3.4' }));
    }

    function IconPalette(props) {
      const size = typeof props.size === 'number' ? props.size : 14;
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 16 16',
        'aria-hidden': 'true',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.3,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        style: { display: 'block' },
      },
        h('path', { d: 'M8 2.6a5.4 5.4 0 1 0 0 10.8c.9 0 1.2-.7.8-1.3-.5-.8 0-1.8 1-1.8h1.4a2.2 2.2 0 0 0 2.2-2.2A5.4 5.4 0 0 0 8 2.6z' }),
        h('circle', { cx: 5.7, cy: 6.2, r: 0.85, fill: 'currentColor', stroke: 'none' }),
        h('circle', { cx: 8.2, cy: 5, r: 0.85, fill: 'currentColor', stroke: 'none' }),
        h('circle', { cx: 10.5, cy: 6.6, r: 0.85, fill: 'currentColor', stroke: 'none' }));
    }

    // ------------------------------------------------------------------
    // session row hover card: current group
    // ------------------------------------------------------------------
    function SectionHover(props) {
      const t = props.t;
      const state = useSectionsState();
      const sessionId = props.sessionId;
      let section = null;
      for (const wsId of Object.keys(state.byWorkspace)) {
        const bucket = state.byWorkspace[wsId];
        const sectionId = bucket.assignments[sessionId];
        if (!sectionId) continue;
        const found = bucket.sections.find((entry) => entry.id === sectionId);
        if (found) {
          section = found;
          break;
        }
      }
      if (!section) return null;
      return h('div', { className: 'dssx-hover-row' },
        h(Dot, { color: section.color }),
        h('span', { className: 'dssx-hover-label' }, t('hover.section')),
        h('span', { className: 'dssx-hover-name' }, section.name));
    }

    // ------------------------------------------------------------------
    // session row menu item
    // ------------------------------------------------------------------
    function MoveToSectionMenuItem(props) {
      const t = props.t;
      const sessionId = props.sessionId;
      const displayTitle = props.displayTitle;
      const useMenuOpenState = typeof props.useMenuOpenState === 'function' ? props.useMenuOpenState : useNoopMenuState;
      const menuState = useMenuOpenState();
      const setMenuOpen = menuState[1];
      return h('button', {
        type: 'button',
        role: 'menuitem',
        className: 'dssx-menu-item',
        onClick: (event) => {
          event.stopPropagation();
          if (typeof setMenuOpen === 'function') setMenuOpen(false);
          openMoveDialog({ sessionId, title: displayTitle });
        },
      }, h(PanelIcon, { size: 14 }), t('menu.moveToSection'));
    }

    // ------------------------------------------------------------------
    // shared inline pieces
    // ------------------------------------------------------------------
    function InlineInput(props) {
      const inputRef = useRef(null);
      useEffect(() => {
        const node = inputRef.current;
        if (node && typeof node.focus === 'function') node.focus();
        if (node && typeof node.select === 'function') node.select();
      }, []);
      return h('input', {
        ref: inputRef,
        className: 'dssx-input',
        type: 'text',
        value: props.value,
        placeholder: props.placeholder,
        onChange: (event) => props.onChange(event.target.value),
        onKeyDown: (event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            props.onCommit();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            props.onCancel();
          }
        },
      });
    }

    // ------------------------------------------------------------------
    // context-pressure alerts
    // ------------------------------------------------------------------
    const CONTEXT_ALERT_KEY = 'dsh.context-alert.v1';
    const CONTEXT_ALERT_LEVELS = [20, 40];

    function readContextAlertState() {
      try {
        const raw = window.localStorage.getItem(CONTEXT_ALERT_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
      } catch (error) {
        return {};
      }
    }

    function writeContextAlertState(state) {
      try {
        window.localStorage.setItem(CONTEXT_ALERT_KEY, JSON.stringify(state));
      } catch (error) {
        // Storage can be unavailable (private mode); the alert still fires once per mount.
      }
    }

    /**
     * One-shot context-pressure alert. Rendered through a portal so the sidebar's
     * overflow/transform never clips it. 20% fades on its own; 40% waits for a click
     * because it carries the handoff instruction.
     */
    function ContextToast(props) {
      const alert = props.alert;
      const t = props.t;
      const warn = alert.level >= 40;
      return h('div', {
        className: cx('dssx-context-toast', warn && 'dssx-context-toast-warn'),
        role: warn ? 'alert' : 'status',
      },
        h('div', { className: 'dssx-context-toast-title' }, t(warn ? 'ctx.alert40.title' : 'ctx.alert20.title', { percent: alert.percent })),
        h('div', { className: 'dssx-context-toast-body' }, t(warn ? 'ctx.alert40.body' : 'ctx.alert20.body')),
        h('div', { className: 'dssx-context-toast-foot' },
          h('button', { type: 'button', className: 'dssx-btn dssx-primary', onClick: props.onDismiss }, t('confirm'))));
    }

    function Dot(props) {
      return h('span', { className: 'dssx-dot', style: { background: props.color || 'transparent' } });
    }

    /** Sidebar cost cell: the skin exposes per-session spend in 1e-6 yuan; two digits either side of the point. */
    const COST_ENDPOINT = '/dsh-claude-style/session-cost';
    function formatCny(cny) {
      if (typeof cny !== 'number' || !isFinite(cny) || cny < 0) return '—';
      const parts = (cny / 1e6).toFixed(2).split('.');
      return '¥' + parts[0].padStart(2, '0') + '.' + parts[1];
    }

    /**
     * Context ring colour at a percent: hue 120 -> 0 continuously (green to red),
     * saturation 55% / lightness 50%. Every 1% changes the hue, so the full ring
     * reads as one green-to-red gradient.
     */
    function contextRingColor(percent) {
      const clamped = Math.max(0, Math.min(100, Number(percent) || 0));
      const hue = (120 * (100 - clamped)) / 100;
      return 'hsl(' + hue.toFixed(1) + ', 55%, 50%)';
    }

    // Context ring geometry (14px viewBox, rendered at 18px): one occupancy arc with a
    // hollow centre dot. The dot steps its colour at the 20% / 40% thresholds.
    const CTX_CX = 7;
    const CTX_CY = 7;
    const CTX_RADIUS = 5.5;
    const CTX_CIRCUMFERENCE = 2 * Math.PI * CTX_RADIUS;
    const CTX_START_DEG = -90;
    const CTX_DOT_RADIUS = 3.2;
    const CTX_DOT_HOLE = 2.2;

    // Every ring on the page carries its own mask id; a shared id would let one row's
    // hole punch through the others.
    let ctxHoleSeq = 0;

    function prefersReducedMotion() {
      try {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches === true;
      } catch (error) {
        return false;
      }
    }

    /**
     * Context meter: one occupancy arc (the 0-100% colour ladder at the current
     * percent) over a neutral track, with a hollow centre dot. The dot steps its
     * colour at the rated thresholds — under 20% it takes the arc's own colour,
     * 20-39% the warning colour, 40%+ the error colour.
     */
    function ContextRing(props) {
      const percent = Math.max(0, Math.min(100, Number(props.percent) || 0));
      const spinning = props.spinning === true && !prefersReducedMotion();
      const holeRef = useRef(0);
      if (holeRef.current === 0) {
        ctxHoleSeq += 1;
        holeRef.current = ctxHoleSeq;
      }
      const holeId = 'dssx-ctx-hole-' + holeRef.current;
      const innerRadius = 3.2;
      const innerStroke = 1;
      const innerGapHalf = 27;
      const leftColor = percent >= 20 ? 'var(--dsw-alias-state-warn-primary,#d98e2b)' : contextRingColor(0);
      const rightColor = percent >= 40 ? 'var(--dsw-alias-state-error-primary,#d93025)' : contextRingColor(0);
      const polarPoint = (radius, deg) => {
        const rad = (deg * Math.PI) / 180;
        return [CTX_CX + radius * Math.cos(rad), CTX_CY + radius * Math.sin(rad)];
      };
      // One tiny arc per percent: 1% of circumference each, coloured by its own
      // percent, so a full ring is a continuous green -> red gradient instead of a
      // single linear gradient across the whole circle.
      const segmentNodes = [];
      const drawnSegments = Math.round(percent);
      for (let i = 0; i < drawnSegments; i += 1) {
        const from = CTX_START_DEG + (360 * i) / 100;
        const to = CTX_START_DEG + (360 * (i + 1)) / 100 + 0.06;
        const [sx, sy] = polarPoint(CTX_RADIUS, from);
        const [ex, ey] = polarPoint(CTX_RADIUS, to);
        segmentNodes.push(h('path', {
          key: 'ctxseg' + i,
          d: 'M' + sx.toFixed(2) + ' ' + sy.toFixed(2) + 'A' + CTX_RADIUS + ' ' + CTX_RADIUS + ' 0 0 1 ' + ex.toFixed(2) + ' ' + ey.toFixed(2),
          fill: 'none',
          stroke: contextRingColor(i + 0.5),
          strokeWidth: 1,
        }));
      }
      const [leftStartX, leftStartY] = polarPoint(innerRadius, 90 + innerGapHalf);
      const [leftEndX, leftEndY] = polarPoint(innerRadius, 270 - innerGapHalf);
      const [rightStartX, rightStartY] = polarPoint(innerRadius, 270 + innerGapHalf);
      const [rightEndX, rightEndY] = polarPoint(innerRadius, 90 - innerGapHalf);
      const innerArc = (sx, sy, ex, ey) => 'M' + sx.toFixed(3) + ' ' + sy.toFixed(3) + 'A' + innerRadius + ' ' + innerRadius + ' 0 0 1 ' + ex.toFixed(3) + ' ' + ey.toFixed(3);
      return h('span', {
        className: 'dssx-ctx-ring',
        title: props.title || '',
      },
        h('svg', { width: 20, height: 20, viewBox: '0 0 14 14', 'aria-hidden': 'true', style: { display: 'block' } },
          h('defs', null,
            h('mask', { id: holeId, maskUnits: 'userSpaceOnUse', x: 1, y: 1, width: 12, height: 12 },
              h('circle', { cx: CTX_CX, cy: CTX_CY, r: CTX_DOT_RADIUS, fill: '#fff' }),
              h('circle', { cx: CTX_CX, cy: CTX_CY, r: CTX_DOT_HOLE, fill: '#000' }))),
          h('circle', {
            cx: CTX_CX,
            cy: CTX_CY,
            r: CTX_RADIUS,
            fill: 'none',
            stroke: 'var(--dsw-alias-border-l2,#d6d0c6)',
            strokeWidth: 1,
          }),
          h('g', { className: spinning ? 'dssx-ctx-spin' : undefined }, segmentNodes),
          h('g', { className: 'dssx-ctx-inner' },
            h('path', { d: innerArc(leftStartX, leftStartY, leftEndX, leftEndY), fill: 'none', stroke: leftColor, strokeWidth: innerStroke, strokeLinecap: 'round' }),
            h('path', { d: innerArc(rightStartX, rightStartY, rightEndX, rightEndY), fill: 'none', stroke: rightColor, strokeWidth: innerStroke, strokeLinecap: 'round' }),
            h('circle', { cx: leftStartX, cy: leftStartY, r: 0.55, fill: 'none', stroke: leftColor, strokeWidth: 0.35 }),
            h('circle', { cx: leftEndX, cy: leftEndY, r: 0.55, fill: 'none', stroke: leftColor, strokeWidth: 0.35 }),
            h('circle', { cx: rightStartX, cy: rightStartY, r: 0.55, fill: 'none', stroke: rightColor, strokeWidth: 0.35 }),
            h('circle', { cx: rightEndX, cy: rightEndY, r: 0.55, fill: 'none', stroke: rightColor, strokeWidth: 0.35 }))));
    }

    /**
     * Active-schedule mark. Self-drawn: the shipped `sidebar.session.row.leading`
     * occupant only renders inside the shipped browser, so this row owns its own
     * clock glyph and reads the Host schedule catalog through `props.scheduled`.
     */
    function ClockMark(props) {
      return h('span', { className: 'dssx-clock', title: props.title || '' },
        h('svg', {
          width: 18,
          height: 18,
          viewBox: '0 0 16 16',
          'aria-hidden': 'true',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.3,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          style: { display: 'block' },
        },
          h('circle', { cx: 8, cy: 8, r: 5.8 }),
          h('path', { d: 'M8 4.9v3.4l2.4 1.5' })));
    }

    /** Two id sets are interchangeable when they hold the same members. */
    function sameIdSet(left, right) {
      if (left === right) return true;
      if (!left || !right || left.size !== right.size) return false;
      for (const id of left) {
        if (!right.has(id)) return false;
      }
      return true;
    }

    // ------------------------------------------------------------------
    // main panel
    // ------------------------------------------------------------------
    function SessionGroupsPanel(props) {
      const t = props.t;
      const openSession = props.openSession;
      const useWorkspaces = workspacesHookOf(props);
      const useSessions = sessionsHookOf(props);

      const workspaceState = useWorkspaces((snapshot) => snapshot);
      const sessionState = useSessions((snapshot) => snapshot);
      const sectionsState = useSectionsState();

      const [wsChoice, setWsChoice] = useState(null);
      const [draft, setDraft] = useState(null);
      const [confirmDelete, setConfirmDelete] = useState(null);
      const [openMenu, setOpenMenu] = useState(null);
      const [addingTo, setAddingTo] = useState(null);
      const [collapsed, setCollapsed] = useState({});

      const items = workspaceState && Array.isArray(workspaceState.items) ? workspaceState.items : [];
      const archived = useMemo(() => {
        const source = workspaceState && Array.isArray(workspaceState.archivedSessionIds)
          ? workspaceState.archivedSessionIds
          : [];
        return new Set(source);
      }, [workspaceState]);

      const byId = sessionState && sessionState.byId ? sessionState.byId : {};
      const mainSessionId = useMemo(() => {
        const ids = Object.keys(byId);
        for (const id of ids) {
          const summary = byId[id];
          if (!summary || !summary.retainedBy) continue;
          if ((summary.retainedBy.mainView || 0) > 0) return id;
        }
        return null;
      }, [byId]);

      const derivedWorkspace = useMemo(() => {
        if (mainSessionId) {
          const owner = items.find((workspace) => Array.isArray(workspace.sessionIds) && workspace.sessionIds.indexOf(mainSessionId) >= 0);
          if (owner) return owner.workspaceId;
        }
        return items.length > 0 ? items[0].workspaceId : '';
      }, [items, mainSessionId]);

      const wsId = wsChoice !== null && items.some((workspace) => workspace.workspaceId === wsChoice)
        ? wsChoice
        : derivedWorkspace;
      const workspace = items.find((entry) => entry.workspaceId === wsId) || null;

      const sessions = useMemo(() => {
        if (!workspace || !Array.isArray(workspace.sessionIds)) return [];
        const rows = [];
        for (const id of workspace.sessionIds) {
          const summary = byId[id];
          if (!summary || summary.blank || archived.has(id)) continue;
          rows.push(summary);
        }
        rows.sort((left, right) => toMs(right.updatedAt) - toMs(left.updatedAt));
        return rows;
      }, [workspace, byId, archived]);

      const bucket = sectionsState.byWorkspace[wsId] || { sections: [], assignments: {} };

      const grouped = useMemo(() => {
        const map = new Map();
        for (const section of bucket.sections) map.set(section.id, []);
        const unassigned = [];
        for (const summary of sessions) {
          const sectionId = bucket.assignments[summary.id];
          const target = sectionId ? map.get(sectionId) : undefined;
          if (target) target.push(summary);
          else unassigned.push(summary);
        }
        return { map, unassigned };
      }, [sessions, bucket]);

      useEffect(() => {
        if (!openMenu) return undefined;
        const close = (event) => {
          const target = event.target;
          if (target && typeof target.closest === 'function' && target.closest('.dssx-menu-anchor')) return;
          setOpenMenu(null);
        };
        document.addEventListener('pointerdown', close, true);
        return () => document.removeEventListener('pointerdown', close, true);
      }, [openMenu]);

      useEffect(() => {
        if (!confirmDelete) return undefined;
        const timer = window.setTimeout(() => setConfirmDelete(null), 4000);
        return () => window.clearTimeout(timer);
      }, [confirmDelete]);

      const startCreate = (forSessionId) => {
        setDraft({ mode: 'new', name: '', forSessionId: forSessionId || null });
        setOpenMenu(null);
        setAddingTo(null);
      };

      const startRename = (section) => {
        setDraft({ mode: 'rename', id: section.id, name: section.name });
      };

      const commitDraft = () => {
        if (!draft) return;
        const name = draft.name.trim() || t('section.untitled');
        if (draft.mode === 'new') {
          const id = addSection(wsId, name);
          if (draft.forSessionId) assignSession(wsId, draft.forSessionId, id);
        } else if (draft.mode === 'rename') {
          renameSection(wsId, draft.id, name);
        }
        setDraft(null);
      };

      const toggleCollapsed = (key) => {
        setCollapsed((current) => {
          const next = Object.assign({}, current);
          if (next[key]) delete next[key];
          else next[key] = true;
          return next;
        });
      };

      const toggleMenu = (sessionId) => {
        setOpenMenu((current) => (current === sessionId ? null : sessionId));
      };

      const renderRow = (summary) => {
        const title = summary.title || t('untitled');
        const sectionId = bucket.assignments[summary.id];
        const assignedSection = sectionId ? bucket.sections.find((section) => section.id === sectionId) : undefined;
        const menuOpen = openMenu === summary.id;
        return h('div', { className: 'dssx-row', key: summary.id },
          h('button', {
            type: 'button',
            className: 'dssx-row-main',
            title: t('row.open'),
            onClick: () => {
              if (typeof openSession === 'function') openSession(summary.id);
            },
          },
            assignedSection ? h(Dot, { color: assignedSection.color }) : null,
            h('span', { className: 'dssx-row-title' }, title),
            h('span', { className: 'dssx-row-time' }, relativeTime(summary.updatedAt, t))
          ),
          h('div', { className: 'dssx-menu-anchor' },
            h('button', {
              type: 'button',
              className: 'dssx-icon-btn',
              'aria-label': t('row.move'),
              'aria-haspopup': 'menu',
              'aria-expanded': menuOpen ? 'true' : 'false',
              onClick: (event) => {
                event.stopPropagation();
                toggleMenu(summary.id);
              },
            }, h(IconMore, { size: 16 })),
            menuOpen ? h('div', {
              className: 'dssx-pop',
              role: 'menu',
              onPointerDown: (event) => event.stopPropagation(),
            },
              h('div', { className: 'dssx-pop-label' }, t('row.move')),
              h('button', {
                type: 'button',
                role: 'menuitem',
                className: cx('dssx-pop-item', !assignedSection && 'dssx-active'),
                onClick: () => {
                  assignSession(wsId, summary.id, '');
                  setOpenMenu(null);
                },
              }, h(Dot, { color: 'transparent' }), t('unassigned')),
              bucket.sections.map((section) => h('button', {
                type: 'button',
                role: 'menuitem',
                key: section.id,
                className: cx('dssx-pop-item', assignedSection && assignedSection.id === section.id && 'dssx-active'),
                onClick: () => {
                  assignSession(wsId, summary.id, section.id);
                  setOpenMenu(null);
                },
              }, h(Dot, { color: section.color }), h('span', { className: 'dssx-pop-name' }, section.name),
                assignedSection && assignedSection.id === section.id ? h('span', { className: 'dssx-check' }, '\u2713') : null)),
              h('button', {
                type: 'button',
                role: 'menuitem',
                className: 'dssx-pop-item dssx-pop-new',
                onClick: () => startCreate(summary.id),
              }, '+ ', t('section.new'))
            ) : null
          )
        );
      };

      const renderInlineDraft = (extra) => {
        if (!draft || (extra && draft.mode !== extra)) return null;
        return h('div', { className: 'dssx-inline-form' },
          h(InlineInput, {
            value: draft.name,
            placeholder: t('section.namePlaceholder'),
            onChange: (value) => setDraft(Object.assign({}, draft, { name: value })),
            onCommit: commitDraft,
            onCancel: () => setDraft(null),
          }),
          h('button', { type: 'button', className: 'dssx-btn dssx-primary', onClick: commitDraft }, t('confirm')),
          h('button', { type: 'button', className: 'dssx-btn', onClick: () => setDraft(null) }, t('cancel'))
        );
      };

      const renderSectionCard = (section, rows, unassigned) => {
        const key = section ? section.id : '';
        const isCollapsed = collapsed[key] === true;
        const isRenaming = draft && draft.mode === 'rename' && section && draft.id === section.id;
        const pendingDelete = section ? confirmDelete === section.id : false;
        const candidates = unassigned ? [] : grouped.unassigned;
        return h('section', { className: 'dssx-card', key: key || 'unassigned' },
          h('header', { className: 'dssx-card-head' },
            h('button', {
              type: 'button',
              className: 'dssx-caret',
              'aria-label': isCollapsed ? 'expand' : 'collapse',
              onClick: () => toggleCollapsed(key),
            }, h(IconChevron, { open: !isCollapsed })),
            section ? h(Dot, { color: section.color }) : h(Dot, { color: 'transparent' }),
            isRenaming
              ? h('div', { className: 'dssx-inline-form dssx-inline-rename' },
                h(InlineInput, {
                  value: draft.name,
                  placeholder: t('section.namePlaceholder'),
                  onChange: (value) => setDraft(Object.assign({}, draft, { name: value })),
                  onCommit: commitDraft,
                  onCancel: () => setDraft(null),
                }),
                h('button', { type: 'button', className: 'dssx-btn dssx-primary', onClick: commitDraft }, t('confirm')),
                h('button', { type: 'button', className: 'dssx-btn', onClick: () => setDraft(null) }, t('cancel')))
              : h('span', { className: 'dssx-card-title' }, section ? section.name : t('unassigned')),
            h('span', { className: 'dssx-count' }, t('section.count', { n: rows.length })),
            section ? h('div', { className: 'dssx-card-actions' },
              h('button', { type: 'button', className: 'dssx-icon-btn', 'aria-label': t('section.up'), onClick: () => moveSection(wsId, section.id, -1) }, '\u2191'),
              h('button', { type: 'button', className: 'dssx-icon-btn', 'aria-label': t('section.down'), onClick: () => moveSection(wsId, section.id, 1) }, '\u2193'),
              h('button', { type: 'button', className: 'dssx-icon-btn', 'aria-label': t('section.rename'), onClick: () => startRename(section) }, h(IconEdit, { size: 14 })),
              h('button', {
                type: 'button',
                className: cx('dssx-icon-btn', pendingDelete && 'dssx-danger'),
                'aria-label': t('section.delete'),
                onClick: () => {
                  if (pendingDelete) {
                    removeSection(wsId, section.id);
                    setConfirmDelete(null);
                  } else {
                    setConfirmDelete(section.id);
                  }
                },
              }, pendingDelete ? t('section.deleteConfirm') : h(IconClose, { size: 13 }))
            ) : null
          ),
          isCollapsed ? null : h('div', { className: 'dssx-rows' },
            rows.length === 0 ? h('div', { className: 'dssx-empty-row' }, t('section.empty')) : null,
            rows.map((summary) => renderRow(summary)),
            section ? h('div', { className: 'dssx-card-foot' },
              addingTo === section.id
                ? h('div', { className: 'dssx-add-panel' },
                  candidates.length === 0
                    ? h('div', { className: 'dssx-empty-row' }, t('section.noCandidates'))
                    : candidates.map((summary) => h('button', {
                      type: 'button',
                      key: summary.id,
                      className: 'dssx-add-item',
                      onClick: () => {
                        assignSession(wsId, summary.id, section.id);
                        setAddingTo(null);
                      },
                    }, summary.title || t('untitled'))),
                  h('button', { type: 'button', className: 'dssx-link-btn', onClick: () => setAddingTo(null) }, t('cancel'))
                )
                : h('button', {
                  type: 'button',
                  className: 'dssx-link-btn',
                  onClick: () => setAddingTo(addingTo === section.id ? null : section.id),
                }, '+ ', t('section.add'))
            ) : null
          )
        );
      };

      const header = h('div', { className: 'dssx-head' },
        h('h1', { className: 'dssx-head-title' }, t('panel.title')),
        h('p', { className: 'dssx-head-sub' }, t('panel.subtitle'))
      );

      if (!workspace) {
        return h('div', { className: 'dssx-panel' }, header,
          h('div', { className: 'dssx-list' },
            h('div', { className: 'dssx-placeholder' }, t('panel.noWorkspace'))));
      }

      const toolbar = h('div', { className: 'dssx-toolbar' },
        h('label', { className: 'dssx-field' },
          h('span', { className: 'dssx-field-label' }, t('workspace.label')),
          h('select', {
            className: 'dssx-select',
            value: wsId,
            onChange: (event) => {
              setWsChoice(event.target.value);
              setDraft(null);
              setOpenMenu(null);
              setAddingTo(null);
            },
          }, items.map((entry) => h('option', { key: entry.workspaceId, value: entry.workspaceId },
            workspaceTitleOf(entry, t)))))
      ,
        h('span', { className: 'dssx-total' }, t('panel.total', { n: sessions.length })),
        h('button', { type: 'button', className: 'dssx-btn dssx-primary', onClick: () => startCreate(null) }, '+ ', t('section.new'))
      );

      const body = [];
      if (draft && draft.mode === 'new') body.push(renderInlineDraft('new'));
      for (const section of bucket.sections) {
        body.push(renderSectionCard(section, grouped.map.get(section.id) || [], false));
      }
      body.push(renderSectionCard(null, grouped.unassigned, true));

      return h('div', { className: 'dssx-panel' },
        header,
        toolbar,
        h('div', { className: 'dssx-list' }, body),
        h('div', { className: 'dssx-foot' }, t('panel.hint'))
      );
    }

    // ------------------------------------------------------------------
    // move-to-group dialog
    // ------------------------------------------------------------------
    function MoveToSectionDialog(props) {
      const t = props.t;
      const useWorkspaces = workspacesHookOf(props);
      const workspaceState = useWorkspaces((snapshot) => snapshot);
      const sectionsState = useSectionsState();
      const request = useMoveRequest();
      const [name, setName] = useState('');
      const inputRef = useRef(null);

      useEffect(() => {
        if (!request) return undefined;
        const onKeyDown = (event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            closeMoveDialog();
          }
        };
        document.addEventListener('keydown', onKeyDown);
        const handle = window.setTimeout(() => {
          const node = inputRef.current;
          if (node && typeof node.focus === 'function') node.focus();
        }, 0);
        return () => {
          document.removeEventListener('keydown', onKeyDown);
          window.clearTimeout(handle);
        };
      }, [request]);

      if (!request) return null;

      const items = workspaceState && Array.isArray(workspaceState.items) ? workspaceState.items : [];
      let wsId = '';
      for (const workspace of items) {
        if (Array.isArray(workspace.sessionIds) && workspace.sessionIds.indexOf(request.sessionId) >= 0) {
          wsId = workspace.workspaceId;
          break;
        }
      }
      if (!wsId) {
        for (const candidate of Object.keys(sectionsState.byWorkspace)) {
          const bucket = sectionsState.byWorkspace[candidate];
          if (bucket.assignments[request.sessionId]) {
            wsId = candidate;
            break;
          }
        }
      }

      const bucket = wsId ? (sectionsState.byWorkspace[wsId] || { sections: [], assignments: {} }) : { sections: [], assignments: {} };
      const assignedId = bucket.assignments[request.sessionId];

      const choose = (sectionId) => {
        assignSession(wsId, request.sessionId, sectionId);
        closeMoveDialog();
      };

      const create = () => {
        if (!wsId) return;
        const label = name.trim() || t('section.untitled');
        const id = addSection(wsId, label);
        assignSession(wsId, request.sessionId, id);
        setName('');
        closeMoveDialog();
      };

      return h('div', {
        className: 'dssx-mask',
        onPointerDown: (event) => {
          if (event.target === event.currentTarget) closeMoveDialog();
        },
      },
        h('div', {
          className: 'dssx-dialog',
          role: 'dialog',
          'aria-modal': 'true',
          'aria-label': t('move.title'),
        },
          h('div', { className: 'dssx-dialog-title' }, t('move.title')),
          h('div', { className: 'dssx-dialog-sub' }, request.title || t('untitled')),
          wsId ? [
            h('div', { className: 'dssx-choice-list' },
              h('button', {
                type: 'button',
                className: cx('dssx-choice', !assignedId && 'dssx-active'),
                onClick: () => choose(''),
              }, h(Dot, { color: 'transparent' }), h('span', { className: 'dssx-choice-name' }, t('move.none')),
                !assignedId ? h('span', { className: 'dssx-check' }, '\u2713') : null),
              bucket.sections.map((section) => h('button', {
                type: 'button',
                key: section.id,
                className: cx('dssx-choice', assignedId === section.id && 'dssx-active'),
                onClick: () => choose(section.id),
              }, h(Dot, { color: section.color }), h('span', { className: 'dssx-choice-name' }, section.name),
                assignedId === section.id ? h('span', { className: 'dssx-check' }, '\u2713') : null))
            ),
            h('div', { className: 'dssx-dialog-new' },
              h('input', {
                ref: inputRef,
                className: 'dssx-input',
                type: 'text',
                value: name,
                placeholder: t('move.newSectionPlaceholder'),
                onChange: (event) => setName(event.target.value),
                onKeyDown: (event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    create();
                  }
                },
              }),
              h('button', { type: 'button', className: 'dssx-btn dssx-primary', onClick: create }, t('move.create'))
            )
          ] : h('div', { className: 'dssx-placeholder' }, t('move.noWorkspace')),
          h('div', { className: 'dssx-dialog-foot' },
            h('button', { type: 'button', className: 'dssx-btn', onClick: closeMoveDialog }, t('cancel')))
        )
      );
    }

    // ------------------------------------------------------------------
    // rename-session dialog
    // ------------------------------------------------------------------
    function RenameSessionDialog(props) {
      const t = props.t;
      const request = useRenameRequest();
      const [value, setValue] = useState('');
      const [error, setError] = useState('');
      const [saving, setSaving] = useState(false);
      const inputRef = useRef(null);

      useEffect(() => {
        if (!request) return undefined;
        setValue(request.title);
        setError('');
        setSaving(false);
        const onKeyDown = (event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            closeRenameDialog();
          }
        };
        document.addEventListener('keydown', onKeyDown);
        const handle = window.setTimeout(() => {
          const node = inputRef.current;
          if (node && typeof node.focus === 'function') {
            node.focus();
            if (typeof node.select === 'function') node.select();
          }
        }, 0);
        return () => {
          document.removeEventListener('keydown', onKeyDown);
          window.clearTimeout(handle);
        };
      }, [request]);

      if (!request) return null;

      const submit = async () => {
        const title = value.trim();
        if (!title) {
          setError(t('rename.empty'));
          return;
        }
        setSaving(true);
        setError('');
        try {
          if (typeof props.renameSession === 'function') await props.renameSession(request.sessionId, title);
          closeRenameDialog();
        } catch (failure) {
          setSaving(false);
          setError(t('rename.failed', { message: failure && failure.message ? failure.message : String(failure) }));
        }
      };

      return h('div', {
        className: 'dssx-mask',
        onPointerDown: (event) => {
          if (event.target === event.currentTarget) closeRenameDialog();
        },
      },
        h('div', { className: 'dssx-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('rename.title') },
          h('div', { className: 'dssx-dialog-title' }, t('rename.title')),
          h('div', { className: 'dssx-inline-form dssx-rename-form' },
            h('input', {
              ref: inputRef,
              className: 'dssx-input',
              type: 'text',
              value,
              placeholder: t('rename.placeholder'),
              disabled: saving,
              onChange: (event) => setValue(event.target.value),
              onKeyDown: (event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  submit();
                }
              },
            })
          ),
          error ? h('div', { className: 'dssx-dialog-error' }, error) : null,
          h('div', { className: 'dssx-dialog-foot' },
            h('button', { type: 'button', className: 'dssx-btn', onClick: closeRenameDialog }, t('rename.cancel')),
            h('button', { type: 'button', className: 'dssx-btn dssx-primary', disabled: saving, onClick: submit },
              saving ? '\u2026' : t('rename.confirm'))
          )
        )
      );
    }

    // ------------------------------------------------------------------
    // sidebar browser (stage B): workspaces -> groups -> sessions
    // ------------------------------------------------------------------
    /** Same hook-context factory shape the shipped browser declares for its menu rows. */
    const menuOpenStateFactory = (_standard, state) => () => state;

    const EMPTY_BUCKET = { sections: [], assignments: {} };

    function toggleKey(map, setMap, key) {
      setMap((current) => {
        const next = Object.assign({}, current);
        if (next[key]) delete next[key];
        else next[key] = true;
        return next;
      });
    }

    /**
     * Session state marker: a stacked control — a solid four-corner arrow (tip,
     * two wings, and an inner notch at the pointing end) above a two-layer ring.
     * The ring follows the ContextRing geometry at the same rendered scale:
     * outer ring r7/stroke2.5, inner arcs r4/stroke1.25 (the ContextRing ratio
     * 5.5:2 / 3.2:1). The outer ring is split on the "/" diagonal (45°/225°,
     * upper-left muted, lower-right accent); the inner arcs carry the same two
     * colours turned 90° clockwise, so their gaps sit on the "\" diagonal
     * (225°/45°) and their split line coincides with the gaps. The whole ring
     * group swaps its halves by rotating 180°; the arrow swings around the dot
     * centre from pointing up to pointing right.
     *
     * This control is independent from the row's ContextRing: it never draws an
     * occupancy arc and never reads the context percent.
     * Status colours paint the whole ring (outer + inner) as one colour:
     * question -> brand blue, approval / plan-review -> warn yellow,
     * completionUnread -> the ContextRing 0% green.
     */
    function SessionMarker(props) {
      const current = props.current === true;
      const pending = props.pending;
      const stateColor = pending === 'question'
        ? 'var(--dsw-alias-brand-primary,#d97757)'
        : (pending === 'approval' || pending === 'plan-review')
          ? 'var(--dsw-alias-state-warn-primary,#d98e2b)'
          : props.completed === true
            ? 'hsl(120, 55%, 50%)'
            : null;
      // Colour transitions play an exit animation for the old ring (arcs retract,
      // spin back) and then the normal enter animation for the new colour. The
      // first mount stays still.
      const markerState = stateColor || 'idle';
      const firstRender = useRef(true);
      const prevState = useRef(markerState);
      const timers = useRef({ out: 0, in: 0 });
      const [anim, setAnim] = useState({ phase: 'idle', color: markerState });
      useEffect(() => {
        if (firstRender.current) {
          firstRender.current = false;
          prevState.current = markerState;
          return;
        }
        if (prevState.current === markerState) return;
        const previous = prevState.current;
        prevState.current = markerState;
        window.clearTimeout(timers.current.out);
        window.clearTimeout(timers.current.in);
        setAnim({ phase: 'exit', color: previous });
        timers.current.out = window.setTimeout(() => {
          setAnim({ phase: 'enter', color: markerState });
          timers.current.in = window.setTimeout(() => {
            setAnim({ phase: 'idle', color: markerState });
          }, 1000);
        }, 1000);
      }, [markerState]);
      useEffect(() => () => {
        window.clearTimeout(timers.current.out);
        window.clearTimeout(timers.current.in);
      }, []);
      const phase = anim.phase;
      const displayColor = anim.color === 'idle' ? null : anim.color;
      const spinClass = phase === 'exit' ? 'dssx-marker-exit' : (phase === 'enter' ? 'dssx-marker-enter' : undefined);
      const dotCx = 13;
      const dotCy = 15;
      const outerR = 7;
      const innerR = 4;
      const outerSpan = 90 - 12; // outer half-arc span after leaving a 3px seam
      const innerSpan = 63; // inner half-arc span (54° gap, same as ContextRing)
      const p = (value) => value.toFixed(2);
      const polar = (r, deg) => {
        const a = (deg * Math.PI) / 180;
        return [dotCx + r * Math.cos(a), dotCy + r * Math.sin(a)];
      };
      const arcPath = (r, startDeg, endDeg) => {
        const [x1, y1] = polar(r, startDeg);
        const [x2, y2] = polar(r, endDeg);
        return 'M' + p(x1) + ' ' + p(y1) + 'A' + r + ' ' + r + ' 0 0 1 ' + p(x2) + ' ' + p(y2);
      };
      const arrowPath = 'M 13 0 L 9.5 6 L 13 2 L 16.5 6 Z';
      const arrowMiniPath = 'M 13 -3.4 L 11.4 -1.2 L 13 -1.7 L 14.6 -1.2 Z';
      const muted = 'var(--dsw-alias-label-tertiary,#a39d92)';
      const accent = 'var(--dsw-alias-brand-primary,#d97757)';
      const outerMutedArc = arcPath(outerR, 225 - outerSpan, 225 + outerSpan);
      const outerAccentArc = arcPath(outerR, 45 - outerSpan, 45 + outerSpan);
      const innerMutedArc = arcPath(innerR, 315 - innerSpan, 315 + innerSpan);
      const innerAccentArc = arcPath(innerR, 135 - innerSpan, 135 + innerSpan);
      const innerDots = [];
      [315 - innerSpan, 315 + innerSpan, 135 - innerSpan, 135 + innerSpan].forEach((deg, i) => {
        const [x, y] = polar(innerR, deg);
        innerDots.push(h('circle', {
          key: 'innerDot' + i,
          cx: p(x),
          cy: p(y),
          r: 0.7,
          fill: 'none',
          stroke: displayColor || (i < 2 ? muted : accent),
          strokeWidth: 0.45,
        }));
      });
      const arcLen = (r, spanDeg) => (2 * Math.PI * r * spanDeg) / 360;
      const outerArcLen = arcLen(outerR, outerSpan * 2);
      const innerArcLen = arcLen(innerR, innerSpan * 2);
      const sweepStyle = (len) => (phase === 'idle' ? undefined : { '--dssx-arc': len.toFixed(2) + 'px' });
      const sweepClass = phase === 'exit' ? 'dssx-marker-exit-sweep' : (phase === 'enter' ? 'dssx-marker-sweep' : undefined);
      return h('span', { className: cx('dssx-marker', current && 'dssx-marker-on'), title: props.title || undefined },
        h('svg', { width: 40, height: 30, viewBox: '0 0 40 30', 'aria-hidden': 'true', style: { display: 'block' } },
          h('g', { className: 'dssx-marker-arrow' },
            h('g', { className: 'dssx-marker-arrow-scale' },
              h('g', { className: 'dssx-marker-arrow-squash' },
                h('path', { d: arrowPath, fill: 'currentColor' })),
              h('path', { d: arrowMiniPath, fill: 'currentColor', className: 'dssx-marker-arrow-mini' }))),
          h('g', {
            className: spinClass,
            key: 'anim-' + phase + '-' + anim.color,
          },
            h('g', {
              className: 'dssx-marker-dot',
              style: displayColor ? { filter: 'saturate(65%)' } : undefined,
            },
              h('path', { d: outerMutedArc, fill: 'none', stroke: displayColor || muted, strokeWidth: 2.5, strokeLinecap: 'butt', className: sweepClass, style: sweepStyle(outerArcLen) }),
              h('path', { d: outerAccentArc, fill: 'none', stroke: displayColor || accent, strokeWidth: 2.5, strokeLinecap: 'butt', className: sweepClass, style: sweepStyle(outerArcLen) }),
              h('path', { d: innerMutedArc, fill: 'none', stroke: displayColor || muted, strokeWidth: 1.25, strokeLinecap: 'round', className: sweepClass, style: sweepStyle(innerArcLen) }),
              h('path', { d: innerAccentArc, fill: 'none', stroke: displayColor || accent, strokeWidth: 1.25, strokeLinecap: 'round', className: sweepClass, style: sweepStyle(innerArcLen) }),
              ...innerDots))
        ));
    }

    function BrowserSessionRow(props) {
      const t = props.t;
      const summary = props.summary;
      const current = props.current === true;
      const section = props.section;
      const renderSlot = props.renderSlot;
      const openSession = props.openSession;
      const [menuPos, setMenuPos] = useState(null);
      const menuRef = useRef(null);
      const title = summary.title || (summary.blank ? t('newSession') : t('untitled'));

      useEffect(() => {
        if (!menuPos) return undefined;
        const close = (event) => {
          const node = menuRef.current;
          if (node && event.target instanceof Node && node.contains(event.target)) return;
          setMenuPos(null);
        };
        document.addEventListener('pointerdown', close, true);
        return () => document.removeEventListener('pointerdown', close, true);
      }, [menuPos]);

      const openMenu = (event) => {
        event.stopPropagation();
        if (menuPos) {
          setMenuPos(null);
          return;
        }
        const rect = event.currentTarget.getBoundingClientRect();
        setMenuPos({
          top: rect.bottom + 4,
          left: Math.max(8, Math.min(rect.right - 200, window.innerWidth - 208)),
        });
      };

      const toggleArchive = () => {
        setMenuPos(null);
        try {
          if (props.archived) {
            if (typeof props.unarchiveSession === 'function') props.unarchiveSession(summary.id);
          } else if (typeof props.archiveSession === 'function') {
            props.archiveSession(summary.id);
          }
        } catch (error) {
          // A Host refusal (running work) surfaces through the Host notification channel.
        }
      };

      const menuItems = [
        h('button', {
          type: 'button',
          role: 'menuitem',
          className: 'dssx-pop-item',
          onClick: () => {
            setMenuPos(null);
            openSession(summary.id);
          },
        }, t('row.open')),
        h('button', {
          type: 'button',
          role: 'menuitem',
          className: 'dssx-pop-item',
          onClick: () => {
            setMenuPos(null);
            openRenameDialog({ sessionId: summary.id, title: summary.title || '' });
          },
        }, t('row.rename')),
      ];
      if (props.orphan !== true) {
        menuItems.push(h('button', {
          type: 'button',
          role: 'menuitem',
          className: 'dssx-pop-item',
          onClick: () => {
            setMenuPos(null);
            openMoveDialog({ sessionId: summary.id, title: summary.title || '' });
          },
        }, t('menu.moveToSection')));
      }
      menuItems.push(
        h('button', {
          type: 'button',
          role: 'menuitem',
          className: 'dssx-pop-item',
          onClick: toggleArchive,
        }, props.archived ? t('row.unarchive') : t('row.archive')),
        h('button', {
          type: 'button',
          role: 'menuitem',
          className: 'dssx-pop-item',
          onClick: () => {
            setMenuPos(null);
            try {
              navigator.clipboard.writeText(String(summary.id));
            } catch (error) {
              // Clipboard access can be denied; the row itself still works.
            }
          },
        }, t('row.copyId')),
      );

      return h('div', {
        className: cx('dssx-browser-row', current && 'dssx-current', props.dragging && 'dssx-dragging'),
        draggable: true,
        // Whole-row click opens the session. Clicks on the row's own buttons
        // (open/actions/menu items) keep their own handlers.
        onClick: (event) => {
          if (props.dragging === true) return;
          const target = event.target;
          if (target && typeof target.closest === 'function' && target.closest('button, [role="menuitem"], input, textarea, select')) return;
          openSession(summary.id);
        },
        onDragStart: (event) => {
          if (typeof props.onDragStart === 'function') props.onDragStart(event, summary.id);
        },
        onDragEnd: () => {
          if (typeof props.onDragEnd === 'function') props.onDragEnd();
        },
      },
        h(SessionMarker, {
          current,
          percent: props.contextPercent,
          running: props.running === true,
          completed: props.completed === true,
          pending: props.pending || null,
        }),
        h('span', { className: 'dssx-browser-seat' },
          props.scheduled === true
            ? h(ClockMark, { title: t('row.schedule') })
            : null,
          typeof props.contextPercent === 'number'
            ? h(ContextRing, {
              percent: props.contextPercent,
              spinning: props.running === true,
              title: t('row.context', { percent: props.contextPercent }),
            })
            : null),
        h('button', {
          type: 'button',
          className: 'dssx-browser-open',
          title,
          onClick: () => openSession(summary.id),
        },
          section ? h(Dot, { color: section.color }) : null,
          h('span', { className: 'dssx-browser-name' }, title)
        ),
        h('div', { className: 'dssx-browser-tail' },
          h('span', { className: 'dssx-row-cost' }, formatCny(props.cost)),
          h('div', { className: 'dssx-browser-actions' },
          h('button', {
            type: 'button',
            className: 'dssx-icon-btn dssx-order-btn',
            title: t('row.moveUp'),
            'aria-label': t('row.moveUp'),
            disabled: props.canMoveUp !== true,
            onClick: (event) => {
              event.stopPropagation();
              if (typeof props.onMoveUp === 'function') props.onMoveUp();
            },
          }, h(IconArrowUp, { size: 13 })),
          h('button', {
            type: 'button',
            className: 'dssx-icon-btn dssx-order-btn',
            title: t('row.moveDown'),
            'aria-label': t('row.moveDown'),
            disabled: props.canMoveDown !== true,
            onClick: (event) => {
              event.stopPropagation();
              if (typeof props.onMoveDown === 'function') props.onMoveDown();
            },
          }, h(IconArrowDown, { size: 13 })),
          renderSlot ? renderSlot('sidebar.workspaces.session.row.action', {
            sessionId: summary.id,
            displayTitle: summary.title || '',
          }) : null,
          h('button', {
            type: 'button',
            className: 'dssx-icon-btn',
            'aria-label': t('row.more'),
            'aria-haspopup': 'menu',
            'aria-expanded': menuPos ? 'true' : 'false',
            onClick: openMenu,
          }, h(IconMore, { size: 16 }))
        )),
        h('span', { className: 'dssx-browser-time' }, relativeTime(summary.updatedAt, t)),
        menuPos ? h('div', {
          className: 'dssx-rowmenu',
          role: 'menu',
          ref: menuRef,
          style: { top: menuPos.top + 'px', left: menuPos.left + 'px' },
          onPointerDown: (event) => event.stopPropagation(),
        }, menuItems) : null
      );
    }

    function SessionGroupsBrowser(props) {
      const t = props.t;
      const wide = props.wide === true;
      const renderSlot = typeof props.renderSlot === 'function' ? props.renderSlot : null;
      const openSession = props.openSession;
      const startSession = props.startSession;
      const startSessionInGroup = props.startSessionInGroup;
      const addWorkspace = props.addWorkspace;
      const deleteWorkspace = props.deleteWorkspace;
      const archiveSession = props.archiveSession;
      const unarchiveSession = props.unarchiveSession;
      const openPanel = props.openPanel;
      const refreshProjections = props.refreshProjections;
      const scheduleSessions = props.scheduleSessions;
      const onScheduleChanged = props.onScheduleChanged;
      const useWorkspaces = workspacesHookOf(props);
      const useSessions = sessionsHookOf(props);
      const useSessionStatus = sessionStatusHookOf(props);

      const workspaceState = useWorkspaces((snapshot) => snapshot);
      const sessionState = useSessions((snapshot) => snapshot);
      const statusMap = useSessionStatus((snapshot) => snapshot);
      const sectionsState = useSectionsState();

      // A row spins its context ring while that Session is actively working.
      const runningOf = (sessionId) => {
        if (!statusMap || typeof statusMap.get !== 'function') return false;
        const entry = statusMap.get(sessionId);
        return !!(entry && entry.running === true);
      };

      // Unified UI status: `completionUnread` marks a finished run the user has not
      // opened yet; `pendingInteraction.kind` carries approval / plan-review /
      // question while the Session waits for the user.
      const completedOf = (sessionId) => {
        if (!statusMap || typeof statusMap.get !== 'function') return false;
        const entry = statusMap.get(sessionId);
        return !!(entry && entry.completionUnread === true);
      };
      const pendingOf = (sessionId) => {
        if (!statusMap || typeof statusMap.get !== 'function') return null;
        const entry = statusMap.get(sessionId);
        const kind = entry && entry.pendingInteraction ? entry.pendingInteraction.kind : undefined;
        return kind === 'approval' || kind === 'plan-review' || kind === 'question' ? kind : null;
      };

      const projections = sessionState && sessionState.projectionsBySession ? sessionState.projectionsBySession : {};
      const contextPercentOf = (sessionId) => {
        const snapshot = projections[sessionId];
        const pressure = snapshot && snapshot.values ? snapshot.values.contextPressure : undefined;
        if (!pressure || typeof pressure !== 'object') return null;
        const used = typeof pressure.projectedTokens === 'number'
          ? pressure.projectedTokens
          : (typeof pressure.pressureTokens === 'number' ? pressure.pressureTokens : undefined);
        const total = typeof pressure.contextWindow === 'number' ? pressure.contextWindow : undefined;
        if (used === undefined || total === undefined || total <= 0) return null;
        return Math.max(0, Math.min(100, Math.round((used / total) * 100)));
      };

      // Sessions carrying an active Host reminder. The catalog is a pull, so it is
      // read on mount, pushed again whenever the Host reports a schedule change,
      // and re-polled slowly as a fallback. A failed read keeps the previous marks
      // instead of blanking every row.
      const [scheduledIds, setScheduledIds] = useState(() => new Set());
      useEffect(() => {
        if (typeof scheduleSessions !== 'function') return undefined;
        let alive = true;
        const refresh = () => {
          Promise.resolve()
            .then(() => scheduleSessions())
            .then((next) => {
              if (!alive || !(next instanceof Set)) return;
              setScheduledIds((current) => (sameIdSet(current, next) ? current : next));
            })
            .catch(() => {});
        };
        refresh();
        const off = typeof onScheduleChanged === 'function' ? onScheduleChanged(refresh) : null;
        const timer = window.setInterval(refresh, 30000);
        return () => {
          alive = false;
          window.clearInterval(timer);
          if (typeof off === 'function') off();
        };
      }, [scheduleSessions, onScheduleChanged]);

      const [showArchived, setShowArchived] = useState(false);
      const [collapsedWorkspaces, setCollapsedWorkspaces] = useState({});
      const [collapsedGroups, setCollapsedGroups] = useState({});
      const [busy, setBusy] = useState(false);
      const [pendingWorkspaceDelete, setPendingWorkspaceDelete] = useState(null);
      const [pendingGroupDelete, setPendingGroupDelete] = useState(null);
      const [draggingId, setDraggingId] = useState(null);
      const [dropTarget, setDropTarget] = useState(null);
      const [editingGroup, setEditingGroup] = useState(null);
      const [editingName, setEditingName] = useState('');
      const [colorPicker, setColorPicker] = useState(null);
      const leaveTimerRef = useRef(null);

      const cancelLeave = () => {
        if (leaveTimerRef.current) {
          window.clearTimeout(leaveTimerRef.current);
          leaveTimerRef.current = null;
        }
      };

      const armLeave = (key) => {
        cancelLeave();
        leaveTimerRef.current = window.setTimeout(() => {
          leaveTimerRef.current = null;
          setDropTarget((current) => (current === key ? null : current));
        }, 80);
      };

      useEffect(() => {
        if (!pendingWorkspaceDelete) return undefined;
        const timer = window.setTimeout(() => setPendingWorkspaceDelete(null), 4000);
        return () => window.clearTimeout(timer);
      }, [pendingWorkspaceDelete]);

      useEffect(() => {
        if (!pendingGroupDelete) return undefined;
        const timer = window.setTimeout(() => setPendingGroupDelete(null), 4000);
        return () => window.clearTimeout(timer);
      }, [pendingGroupDelete]);

      const items = workspaceState && Array.isArray(workspaceState.items) ? workspaceState.items : [];
      const moves = sectionsState.moves || {};
      const workspaceIds = useMemo(() => new Set(items.map((workspace) => workspace.workspaceId)), [items]);

      // Session cost cells: one pull per session id, refreshed on a slow timer. A missing
      // or unauthorised skin endpoint leaves the cell blank instead of breaking the row.
      const itemsRef = useRef(items);
      itemsRef.current = items;
      const [costMap, setCostMap] = useState({});
      useEffect(() => {
        let alive = true;
        const load = () => {
          const ids = new Set();
          for (const workspace of itemsRef.current) {
            for (const id of Array.isArray(workspace.sessionIds) ? workspace.sessionIds : []) ids.add(String(id));
          }
          if (ids.size === 0) return Promise.resolve();
          return Promise.all(Array.from(ids).map((id) => fetch(COST_ENDPOINT + '?id=' + encodeURIComponent(id), { credentials: 'same-origin' })
            .then((res) => (res && res.ok ? res.json() : null))
            .then((data) => {
              const value = data && data.ok === true ? data.value : null;
              return value && typeof value.cny === 'number' ? [id, value.cny] : null;
            })
            .catch(() => null))).then((pairs) => {
            if (!alive) return;
            const next = {};
            for (const pair of pairs) {
              if (pair) next[pair[0]] = pair[1];
            }
            if (Object.keys(next).length === 0) return;
            setCostMap((prev) => ({ ...prev, ...next }));
          });
        };
        load();
        const timer = window.setInterval(load, 15000);
        return () => {
          alive = false;
          window.clearInterval(timer);
        };
      }, []);
      const costOf = (sessionId) => (typeof costMap[String(sessionId)] === 'number' ? costMap[String(sessionId)] : null);
      const sumCost = (rows) => {
        let total = 0;
        let seen = false;
        for (const row of rows) {
          const value = costOf(row.id);
          if (typeof value === 'number') {
            total += value;
            seen = true;
          }
        }
        return seen ? total : null;
      };

      const requestedProjections = useRef({});
      useEffect(() => {
        if (typeof refreshProjections !== 'function') return;
        for (const workspace of items) {
          for (const sessionId of Array.isArray(workspace.sessionIds) ? workspace.sessionIds : []) {
            if (requestedProjections.current[sessionId]) continue;
            requestedProjections.current[sessionId] = true;
            try {
              refreshProjections(sessionId);
            } catch (error) {
              // A Host refusal leaves the ring empty; nothing else depends on it.
            }
          }
        }
      }, [items, refreshProjections]);
      const archived = useMemo(() => {
        const source = workspaceState && Array.isArray(workspaceState.archivedSessionIds)
          ? workspaceState.archivedSessionIds
          : [];
        return new Set(source);
      }, [workspaceState]);
      const pinned = useMemo(() => {
        const source = workspaceState && Array.isArray(workspaceState.pinnedSessionIds)
          ? workspaceState.pinnedSessionIds
          : [];
        return new Set(source);
      }, [workspaceState]);
      const byId = sessionState && sessionState.byId ? sessionState.byId : {};
      const mainSessionId = useMemo(() => {
        for (const id of Object.keys(byId)) {
          const summary = byId[id];
          if (!summary || !summary.retainedBy) continue;
          if ((summary.retainedBy.mainView || 0) > 0) return id;
        }
        return null;
      }, [byId]);

      // Context-pressure alerts: fires once per Session per threshold, then stays
      // quiet (persisted in localStorage) so a page refresh does not re-nag.
      const currentPercent = mainSessionId ? contextPercentOf(mainSessionId) : null;
      const [contextAlert, setContextAlert] = useState(null);
      useEffect(() => {
        if (!mainSessionId || typeof currentPercent !== 'number') return;
        const firedMap = readContextAlertState();
        const fired = Array.isArray(firedMap[mainSessionId]) ? firedMap[mainSessionId] : [];
        const nextFired = fired.slice();
        let raised = null;
        for (const level of CONTEXT_ALERT_LEVELS) {
          if (currentPercent >= level && nextFired.indexOf(level) < 0) {
            nextFired.push(level);
            raised = level;
          }
        }
        if (nextFired.length !== fired.length) {
          writeContextAlertState(Object.assign({}, firedMap, { [mainSessionId]: nextFired }));
        }
        if (raised !== null) {
          setContextAlert({ level: raised, percent: currentPercent, sessionId: mainSessionId });
        }
      }, [mainSessionId, currentPercent]);

      // The 20% notice is informational, so it fades; the 40% one waits for a click.
      useEffect(() => {
        if (!contextAlert || contextAlert.level >= 40) return undefined;
        const timer = window.setTimeout(() => setContextAlert(null), 6000);
        return () => window.clearTimeout(timer);
      }, [contextAlert]);

      const orphanSessions = useMemo(() => {
        const known = new Set();
        for (const workspace of items) {
          for (const sessionId of Array.isArray(workspace.sessionIds) ? workspace.sessionIds : []) {
            known.add(sessionId);
          }
        }
        const out = [];
        for (const sessionId of Object.keys(byId)) {
          const summary = byId[sessionId];
          if (!summary || known.has(sessionId)) continue;
          const move = moves[sessionId];
          if (move && workspaceIds.has(move.workspaceId)) continue;
          if (summary.blank && sessionId !== mainSessionId) continue;
          if (archived.has(sessionId) && !showArchived) continue;
          out.push(summary);
        }
        out.sort((left, right) => {
          const leftPinned = pinned.has(left.id) ? 1 : 0;
          const rightPinned = pinned.has(right.id) ? 1 : 0;
          if (leftPinned !== rightPinned) return rightPinned - leftPinned;
          return toMs(right.updatedAt) - toMs(left.updatedAt);
        });
        return out;
      }, [items, byId, archived, pinned, showArchived, mainSessionId, moves, workspaceIds]);

      const nodes = useMemo(() => {
        const out = [];
        for (const workspace of items) {
          const wsId = workspace.workspaceId;
          const bucket = sectionsState.byWorkspace[wsId] || EMPTY_BUCKET;
          const rows = [];
          for (const sessionId of Array.isArray(workspace.sessionIds) ? workspace.sessionIds : []) {
            const move = moves[sessionId];
            if (move && move.workspaceId !== wsId) continue;
            const summary = byId[sessionId];
            if (!summary) continue;
            if (summary.blank && sessionId !== mainSessionId) continue;
            if (archived.has(sessionId) && !showArchived) continue;
            rows.push(summary);
          }
          for (const sessionId of Object.keys(moves)) {
            const move = moves[sessionId];
            if (move.workspaceId !== wsId) continue;
            if (Array.isArray(workspace.sessionIds) && workspace.sessionIds.indexOf(sessionId) >= 0) continue;
            const summary = byId[sessionId];
            if (!summary || summary.blank) continue;
            if (archived.has(sessionId) && !showArchived) continue;
            rows.push(summary);
          }
          rows.sort((left, right) => {
            const leftPinned = pinned.has(left.id) ? 1 : 0;
            const rightPinned = pinned.has(right.id) ? 1 : 0;
            if (leftPinned !== rightPinned) return rightPinned - leftPinned;
            return toMs(right.updatedAt) - toMs(left.updatedAt);
          });
          const groups = bucket.sections.map((section) => ({
            key: section.id,
            name: section.name,
            color: section.color,
            rows: [],
          }));
          const bySection = new Map(groups.map((group) => [group.key, group]));
          const unassigned = [];
          for (const summary of rows) {
            const move = moves[summary.id];
            const sectionId = move && move.workspaceId === wsId
              ? (move.sectionId || '')
              : bucket.assignments[summary.id];
            const target = sectionId ? bySection.get(sectionId) : undefined;
            if (target) target.rows.push(summary);
            else unassigned.push(summary);
          }
          // A group that was manually reordered keeps that list; the rest stay live.
          const wsOrders = (sectionsState.orders && sectionsState.orders[wsId]) || null;
          if (wsOrders) {
            for (const group of groups) {
              if (wsOrders[group.key]) group.rows = sortByOrder(group.rows, wsOrders[group.key]);
            }
          }
          out.push({
            workspace,
            groups,
            unassigned: wsOrders && wsOrders[''] ? sortByOrder(unassigned, wsOrders['']) : unassigned,
          });
        }
        return out;
      }, [items, byId, archived, pinned, sectionsState, showArchived, mainSessionId, moves]);

      const ownerOf = (sessionId) => {
        for (const workspace of items) {
          if (Array.isArray(workspace.sessionIds) && workspace.sessionIds.indexOf(sessionId) >= 0) return workspace.workspaceId;
        }
        const move = moves[sessionId];
        return move ? move.workspaceId : '';
      };

      const beginDrag = (event, sessionId) => {
        setDraggingId(sessionId);
        try {
          event.dataTransfer.setData('text/plain', sessionId);
          event.dataTransfer.effectAllowed = 'move';
        } catch (error) {
          // Some environments refuse custom drag data; the in-memory id still drives the move.
        }
      };

      const endDrag = () => {
        setDraggingId(null);
        setDropTarget(null);
      };

      const handleDrop = (event, workspaceId, sectionId) => {
        event.preventDefault();
        event.stopPropagation();
        const sessionId = draggingId || event.dataTransfer.getData('text/plain');
        cancelLeave();
        setDropTarget(null);
        setDraggingId(null);
        if (!sessionId) return;
        const owner = ownerOf(sessionId);
        if (owner === workspaceId) {
          clearSessionMove(sessionId);
          assignSession(workspaceId, sessionId, sectionId || '');
          return;
        }
        setSessionMove(sessionId, workspaceId, sectionId || '');
      };

      if (!wide) {
        return h('div', { className: 'dssx-browser-rail' },
          h('button', {
            type: 'button',
            className: 'dssx-rail-btn',
            title: t('panel.label'),
            onClick: () => {
              if (typeof openPanel === 'function') openPanel();
            },
          }, h(PanelIcon, { size: 18 })));
      }

      const tools = h('div', { className: 'dssx-browser-tools' },
        h('span', { className: 'dssx-browser-tools-title' }, t('workspace.label')),
        h('button', {
          type: 'button',
          className: cx('dssx-browser-tool', showArchived && 'dssx-active'),
          title: showArchived ? t('browser.hideArchived') : t('browser.showArchived'),
          'aria-pressed': showArchived ? 'true' : 'false',
          onClick: () => setShowArchived((value) => !value),
        }, h(IconArchive, { size: 16 })),
        h('button', {
          type: 'button',
          className: 'dssx-browser-tool',
          title: t('browser.addWorkspace'),
          disabled: busy,
          onClick: async () => {
            if (typeof addWorkspace !== 'function') return;
            setBusy(true);
            try {
              await addWorkspace();
            } catch (error) {
              // Keep the toolbar usable; the Host notification channel reports the failure.
            } finally {
              setBusy(false);
            }
          },
        }, h(IconPlus, { size: 16 }))
      );

      if (items.length === 0 && orphanSessions.length === 0) {
        return h('div', { className: 'dssx-browser' }, tools,
          h('div', { className: 'dssx-browser-empty' }, t('browser.noWorkspace')));
      }

      const body = nodes.map((node) => {
        const workspace = node.workspace;
        const wsKey = workspace.workspaceId;
        const wsCollapsed = collapsedWorkspaces[wsKey] === true;
        const count = node.groups.reduce((sum, group) => sum + group.rows.length, 0) + node.unassigned.length;
        const wsCost = sumCost(node.groups.reduce((acc, group) => acc.concat(group.rows), []).concat(node.unassigned));
        return h('section', { className: 'dssx-browser-ws', key: wsKey },
          h('header', { className: 'dssx-browser-ws-head' },
            h('button', {
              type: 'button',
              className: 'dssx-browser-caret',
              'aria-label': wsCollapsed ? 'expand' : 'collapse',
              onClick: () => toggleKey(collapsedWorkspaces, setCollapsedWorkspaces, wsKey),
            }, h(IconChevron, { open: !wsCollapsed })),
            h('span', { className: 'dssx-browser-ws-title', title: workspaceTitleOf(workspace, t) },
              workspaceTitleOf(workspace, t)),
            h('span', { className: cx('dssx-browser-count', 'dssx-browser-ws-count') }, count),
            h('div', { className: 'dssx-browser-tail' },
              h('span', { className: 'dssx-row-cost' }, formatCny(wsCost)),
              h('button', {
                type: 'button',
                className: 'dssx-browser-tool',
                title: t('browser.newSession'),
              onClick: () => {
                if (typeof startSession === 'function') startSession(wsKey);
              },
            }, h(IconPlus, { size: 14 })),
            h('button', {
              type: 'button',
              className: 'dssx-browser-tool dssx-ws-addgroup',
              title: t('browser.addGroup'),
              disabled: busy,
              onClick: () => {
                if (collapsedWorkspaces[wsKey] === true) {
                  toggleKey(collapsedWorkspaces, setCollapsedWorkspaces, wsKey);
                }
                const id = addSection(wsKey, t('section.untitled'));
                setColorPicker(null);
                setEditingGroup({ wsId: wsKey, sectionId: id });
                setEditingName(t('section.untitled'));
              },
            }, h(IconFolderPlus, { size: 15 })),
            h('button', {
              type: 'button',
              className: cx('dssx-browser-tool', 'dssx-ws-delete', pendingWorkspaceDelete === wsKey && 'dssx-danger'),
              title: pendingWorkspaceDelete === wsKey ? t('browser.deleteWorkspaceConfirm') : t('browser.deleteWorkspace'),
              'aria-label': t('browser.deleteWorkspace'),
              disabled: busy,
              onClick: async (event) => {
                event.stopPropagation();
                if (busy) return;
                if (pendingWorkspaceDelete !== wsKey) {
                  setPendingWorkspaceDelete(wsKey);
                  return;
                }
                setPendingWorkspaceDelete(null);
                if (typeof deleteWorkspace !== 'function') return;
                setBusy(true);
                try {
                  await deleteWorkspace(wsKey);
                  clearWorkspaceData(wsKey);
                } catch (error) {
                  // A Host refusal surfaces through the Host notification channel.
                } finally {
                  setBusy(false);
                }
              },
            }, h(IconTrash, { size: 15 })))
          ),
          wsCollapsed ? null : h('div', { className: 'dssx-browser-groups' },
            node.groups.map((group, groupIndex) => {
              const groupKey = wsKey + ':' + group.key;
              const groupCollapsed = collapsedGroups[groupKey] === true;
              const groupTargetKey = 'group:' + groupKey;
              const isEditingGroup = editingGroup !== null && editingGroup.wsId === wsKey && editingGroup.sectionId === group.key;
              const showColorPicker = colorPicker !== null && colorPicker.wsId === wsKey && colorPicker.sectionId === group.key;
              const pendingGroup = pendingGroupDelete === groupKey;
              const rowIds = group.rows.map((row) => row.id);
              return h('div', {
                className: cx('dssx-browser-group', dropTarget === groupTargetKey && 'dssx-drop-target'),
                key: group.key,
                onDragOver: (event) => {
                  event.preventDefault();
                  cancelLeave();
                  setDropTarget((current) => (current === groupTargetKey ? current : groupTargetKey));
                },
                onDragLeave: (event) => {
                  const next = event.relatedTarget;
                  if (next && event.currentTarget.contains(next)) return;
                  armLeave(groupTargetKey);
                },
                onDrop: (event) => handleDrop(event, wsKey, group.key),
              },
                h('header', { className: 'dssx-browser-group-head' },
                  h('button', {
                    type: 'button',
                    className: 'dssx-browser-caret',
                    'aria-label': groupCollapsed ? 'expand' : 'collapse',
                    onClick: () => toggleKey(collapsedGroups, setCollapsedGroups, groupKey),
                  }, h(IconChevron, { open: !groupCollapsed })),
                  h(Dot, { color: group.color }),
                  isEditingGroup
                    ? h('div', { className: 'dssx-inline-form dssx-inline-rename' },
                      h(InlineInput, {
                        value: editingName,
                        placeholder: t('section.namePlaceholder'),
                        onChange: setEditingName,
                        onCommit: () => {
                          renameSection(wsKey, group.key, editingName.trim() || t('section.untitled'));
                          setEditingGroup(null);
                        },
                        onCancel: () => setEditingGroup(null),
                      }))
                    : h('span', { className: 'dssx-browser-group-name' }, group.name),
                  h('div', { className: 'dssx-browser-tail' },
                    h('span', { className: 'dssx-row-cost' }, formatCny(sumCost(group.rows))),
                    h('div', { className: cx('dssx-browser-group-actions', pendingGroup && 'dssx-visible') },
                    h('button', {
                      type: 'button',
                      className: 'dssx-browser-tool',
                      title: t('browser.newSession'),
                      'aria-label': t('browser.newSession'),
                      onClick: () => {
                        // A collapsed group would file the new row out of sight;
                        // reveal it first, as "add group" already does for a
                        // collapsed workspace.
                        if (groupCollapsed) toggleKey(collapsedGroups, setCollapsedGroups, groupKey);
                        if (typeof startSessionInGroup === 'function') startSessionInGroup(wsKey, group.key);
                        else if (typeof startSession === 'function') startSession(wsKey);
                      },
                    }, h(IconPlus, { size: 14 })),
                    h('button', {
                      type: 'button',
                      className: 'dssx-browser-tool',
                      title: t('section.up'),
                      'aria-label': t('section.up'),
                      disabled: groupIndex === 0,
                      onClick: () => moveSection(wsKey, group.key, -1),
                    }, h(IconArrowUp, { size: 14 })),
                    h('button', {
                      type: 'button',
                      className: 'dssx-browser-tool',
                      title: t('section.down'),
                      'aria-label': t('section.down'),
                      disabled: groupIndex === node.groups.length - 1,
                      onClick: () => moveSection(wsKey, group.key, 1),
                    }, h(IconArrowDown, { size: 14 })),
                    h('button', {
                      type: 'button',
                      className: 'dssx-browser-tool',
                      title: t('section.color'),
                      onClick: () => setColorPicker(showColorPicker ? null : { wsId: wsKey, sectionId: group.key }),
                    }, h(IconPalette, { size: 14 })),
                    h('button', {
                      type: 'button',
                      className: 'dssx-browser-tool',
                      title: t('section.rename'),
                      onClick: () => {
                        setColorPicker(null);
                        setEditingGroup({ wsId: wsKey, sectionId: group.key });
                        setEditingName(group.name);
                      },
                    }, h(IconEdit, { size: 14 })),
                    h('button', {
                      type: 'button',
                      className: cx('dssx-browser-tool', 'dssx-ws-delete', pendingGroup && 'dssx-danger'),
                      title: pendingGroup ? t('browser.deleteGroupConfirm') : t('browser.deleteGroup'),
                      'aria-label': t('browser.deleteGroup'),
                      onClick: () => {
                        setColorPicker(null);
                        if (pendingGroupDelete === groupKey) {
                          if (editingGroup !== null && editingGroup.wsId === wsKey && editingGroup.sectionId === group.key) {
                            setEditingGroup(null);
                          }
                          removeSection(wsKey, group.key);
                          setPendingGroupDelete(null);
                          return;
                        }
                        setPendingGroupDelete(groupKey);
                      },
                    }, h(IconTrash, { size: 14 }))
                  )),
                  h('span', { className: 'dssx-browser-count' }, group.rows.length)
                ),
                showColorPicker ? h('div', { className: 'dssx-color-row' },
                  PALETTE.map((color) => h('button', {
                    key: color,
                    type: 'button',
                    className: cx('dssx-color-swatch', color === group.color && 'dssx-active'),
                    style: { background: color },
                    'aria-label': color,
                    onClick: () => {
                      setSectionColor(wsKey, group.key, color);
                      setColorPicker(null);
                    },
                  }))) : null,
                groupCollapsed ? null : h('div', { className: 'dssx-browser-rows' },
                  group.rows.length === 0
                    ? h('div', { className: 'dssx-browser-empty-row' }, t('section.empty'))
                    : group.rows.map((summary, rowIndex) => h(BrowserSessionRow, {
                      key: summary.id,
                      t,
                      cost: costOf(summary.id),
                      contextPercent: contextPercentOf(summary.id),
                      scheduled: scheduledIds.has(String(summary.id)),
                      running: runningOf(summary.id),
                      completed: completedOf(summary.id),
                      pending: pendingOf(summary.id),
                      summary,
                      current: summary.id === mainSessionId,
                      section: group,
                      archived: archived.has(summary.id),
                      archiveSession,
                      unarchiveSession,
                      renderSlot,
                      openSession,
                      dragging: draggingId === summary.id,
                      onDragStart: beginDrag,
                      onDragEnd: endDrag,
                      canMoveUp: rowIndex > 0,
                      canMoveDown: rowIndex < group.rows.length - 1,
                      onMoveUp: () => moveSessionInGroup(wsKey, group.key, rowIds, rowIndex, -1),
                      onMoveDown: () => moveSessionInGroup(wsKey, group.key, rowIds, rowIndex, 1),
                    })))
              );
            }),
            h('div', {
              className: cx('dssx-browser-group', node.groups.length > 0 && 'dssx-unassigned-group', dropTarget === 'unassigned:' + wsKey && 'dssx-drop-target'),
              onDragOver: (event) => {
                event.preventDefault();
                cancelLeave();
                setDropTarget((current) => (current === 'unassigned:' + wsKey ? current : 'unassigned:' + wsKey));
              },
              onDragLeave: (event) => {
                const next = event.relatedTarget;
                if (next && event.currentTarget.contains(next)) return;
                armLeave('unassigned:' + wsKey);
              },
              onDrop: (event) => handleDrop(event, wsKey, ''),
            },
              h('header', { className: 'dssx-browser-group-head' },
                h('span', { className: 'dssx-browser-group-name dssx-unassigned-name' }, t('unassigned')),
                h('span', { className: 'dssx-browser-count' }, node.unassigned.length)
              ),
              h('div', { className: 'dssx-browser-rows' },
                node.unassigned.length === 0
                  ? (node.groups.length === 0 ? h('div', { className: 'dssx-browser-empty-row' }, t('browser.emptyWorkspace')) : null)
                  : node.unassigned.map((summary, rowIndex) => h(BrowserSessionRow, {
                    key: summary.id,
                    t,
                    cost: costOf(summary.id),
                    contextPercent: contextPercentOf(summary.id),
                    scheduled: scheduledIds.has(String(summary.id)),
                    running: runningOf(summary.id),
                    completed: completedOf(summary.id),
                    pending: pendingOf(summary.id),
                    summary,
                    current: summary.id === mainSessionId,
                    section: null,
                    archived: archived.has(summary.id),
                    archiveSession,
                    unarchiveSession,
                    renderSlot,
                    openSession,
                    dragging: draggingId === summary.id,
                    onDragStart: beginDrag,
                    onDragEnd: endDrag,
                    canMoveUp: rowIndex > 0,
                    canMoveDown: rowIndex < node.unassigned.length - 1,
                    onMoveUp: () => moveSessionInGroup(wsKey, '', node.unassigned.map((row) => row.id), rowIndex, -1),
                    onMoveDown: () => moveSessionInGroup(wsKey, '', node.unassigned.map((row) => row.id), rowIndex, 1),
                  })))
            )
          )
        );
      });

      const orphanCollapsed = collapsedWorkspaces['__orphan__'] === true;
      if (orphanSessions.length > 0) {
        body.push(h('section', { className: 'dssx-browser-ws dssx-orphan-ws', key: '__orphan__' },
          h('header', { className: 'dssx-browser-ws-head' },
            h('button', {
              type: 'button',
              className: 'dssx-browser-caret',
              'aria-label': orphanCollapsed ? 'expand' : 'collapse',
              onClick: () => toggleKey(collapsedWorkspaces, setCollapsedWorkspaces, '__orphan__'),
            }, h(IconChevron, { open: !orphanCollapsed })),
            h('span', { className: 'dssx-browser-ws-title' }, t('orphan.label')),
            h('span', { className: cx('dssx-browser-count', 'dssx-browser-ws-count') }, orphanSessions.length),
            h('span', { className: 'dssx-row-cost dssx-row-cost-static' }, formatCny(sumCost(orphanSessions)))
          ),
          orphanCollapsed ? null : h('div', { className: 'dssx-browser-groups' },
            h('div', { className: 'dssx-browser-group' },
              h('div', { className: 'dssx-browser-rows' },
                orphanSessions.map((summary) => h(BrowserSessionRow, {
                  key: summary.id,
                  t,
                  cost: costOf(summary.id),
                  contextPercent: contextPercentOf(summary.id),
                  scheduled: scheduledIds.has(String(summary.id)),
                  running: runningOf(summary.id),
                  completed: completedOf(summary.id),
                  pending: pendingOf(summary.id),
                  summary,
                  current: summary.id === mainSessionId,
                  section: null,
                  orphan: true,
                  archived: archived.has(summary.id),
                  archiveSession,
                  unarchiveSession,
                  renderSlot,
                  openSession,
                  dragging: draggingId === summary.id,
                  onDragStart: beginDrag,
                  onDragEnd: endDrag,
                })))
            )
          )
        ));
      }

      const toastNode = contextAlert
        ? h(ContextToast, {
            alert: contextAlert,
            t,
            onDismiss: () => setContextAlert(null),
          })
        : null;
      // A portal keeps the toast clear of the sidebar's overflow/clipping. When the
      // module is unavailable, render it in place (the CSS is position:fixed) rather
      // than calling a missing function.
      const contextToast = toastNode && typeof createPortal === 'function' && typeof document !== 'undefined'
        ? createPortal(toastNode, document.body)
        : toastNode;

      return h(React.Fragment, null,
        h('div', { className: 'dssx-browser' },
          tools,
          h('div', { className: 'dssx-browser-scroll' }, body),
          h('div', { className: 'dssx-browser-foot' },
            h('button', {
              type: 'button',
              className: 'dssx-link-btn dssx-browser-open-panel',
              onClick: () => {
                if (typeof openPanel === 'function') openPanel();
              },
            }, h(PanelIcon, { size: 14 }), t('panel.label')))),
        contextToast
      );
    }

    // ------------------------------------------------------------------
    // styles
    // ------------------------------------------------------------------
    const CSS = [
      '.dssx-panel{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary,#1f1f1f);font-size:13px}',
      '.dssx-head{width:100%;max-width:900px;margin:0 auto;padding:22px 24px 0}',
      '.dssx-head-title{margin:0;font-size:18px;font-weight:600;letter-spacing:-.01em}',
      '.dssx-head-sub{margin:6px 0 0;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-secondary,#6b6b6b)}',
      '.dssx-toolbar{display:flex;align-items:center;gap:12px;padding:16px 24px;flex-wrap:wrap;width:100%;max-width:900px;margin:0 auto}',
      '.dssx-field{display:flex;align-items:center;gap:8px;min-width:0}',
      '.dssx-field-label{font-size:12px;color:var(--dsw-alias-label-secondary,#6b6b6b)}',
      '.dssx-select{max-width:240px;border:1px solid var(--dsw-alias-border-l1,#e3e0da);border-radius:8px;background:var(--dsw-alias-bg-layer-1,#fff);color:inherit;font:inherit;padding:5px 8px;outline:none}',
      '.dssx-select:focus-visible{border-color:var(--dsw-alias-brand-primary,#d97757)}',
      '.dssx-total{font-size:12px;color:var(--dsw-alias-label-secondary,#6b6b6b);margin-left:auto}',
      '.dssx-list{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:10px;padding:0 24px 20px;width:100%;max-width:900px;margin:0 auto}',
      '.dssx-card{border:1px solid var(--dsw-alias-border-l1,#e3e0da);border-radius:10px;background:var(--dsw-alias-bg-layer-1,#fff);overflow:visible}',
      '.dssx-card-head{display:flex;align-items:center;gap:8px;padding:9px 10px}',
      '.dssx-caret{width:22px;height:22px;border:none;background:transparent;border-radius:6px;color:var(--dsw-alias-label-secondary,#6b6b6b);cursor:pointer;font-size:11px;line-height:1;display:inline-flex;align-items:center;justify-content:center;padding:0}',
      '.dssx-caret:hover{background:var(--dsw-alias-interactive-bg-hover,#f2efe9)}',
      '.dssx-dot{width:8px;height:8px;border-radius:50%;display:inline-block;flex:none;box-shadow:inset 0 0 0 1px rgba(0,0,0,.06)}',
      '.dssx-card-title{font-weight:600;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dssx-count{font-size:12px;color:var(--dsw-alias-label-secondary,#6b6b6b);white-space:nowrap}',
      '.dssx-card-actions{display:flex;gap:2px;margin-left:auto;opacity:0;transition:opacity .12s ease}',
      '.dssx-card:hover .dssx-card-actions,.dssx-card-actions:focus-within{opacity:1}',
      '.dssx-icon-btn{width:24px;height:24px;border:none;background:transparent;border-radius:6px;color:var(--dsw-alias-label-secondary,#6b6b6b);cursor:pointer;font-size:12px;line-height:1;display:inline-flex;align-items:center;justify-content:center;padding:0}',
      '.dssx-icon-btn:hover{background:var(--dsw-alias-interactive-bg-hover,#f2efe9);color:var(--dsw-alias-label-primary,#1f1f1f)}',
      '.dssx-icon-btn.dssx-danger{color:var(--dsw-alias-state-error-primary,#c0392b);width:auto;padding:0 8px;font-size:11px}',
      '.dssx-rows{display:flex;flex-direction:column;gap:1px;padding:2px 8px 6px}',
      '.dssx-row{display:flex;align-items:center;gap:6px;padding:2px 4px 2px 26px;border-radius:6px;position:relative}',
      '.dssx-row:hover{background:var(--dsw-alias-interactive-bg-hover,#f2efe9)}',
      '.dssx-row-main{flex:1;min-width:0;display:flex;align-items:center;gap:8px;border:none;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer;padding:5px 2px;border-radius:6px}',
      '.dssx-row-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dssx-row-time{flex:none;font-size:11px;color:var(--dsw-alias-label-secondary,#8a857c)}',
      '.dssx-menu-anchor{position:relative;flex:none}',
      '.dssx-pop{position:absolute;right:0;top:calc(100% + 4px);z-index:60;min-width:190px;max-height:320px;overflow:auto;background:var(--dsw-alias-bg-overlay,#fff);border:1px solid var(--dsw-alias-border-l1,#e3e0da);border-radius:10px;box-shadow:0 12px 32px rgba(30,25,18,.16);padding:4px}',
      '.dssx-pop-label{font-size:11px;color:var(--dsw-alias-label-secondary,#8a857c);padding:6px 8px 4px}',
      '.dssx-pop-item{display:flex;align-items:center;gap:8px;width:100%;padding:6px 8px;border:none;background:transparent;border-radius:7px;color:inherit;font:inherit;text-align:left;cursor:pointer}',
      '.dssx-pop-item:hover{background:var(--dsw-alias-interactive-bg-hover,#f2efe9)}',
      '.dssx-pop-item.dssx-active{background:var(--dsw-alias-interactive-bg-hover,#f2efe9)}',
      '.dssx-pop-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dssx-pop-new{color:var(--dsw-alias-brand-primary,#c25a37);border-top:1px solid var(--dsw-alias-border-l1,#e3e0da);border-radius:0 0 7px 7px;margin-top:2px;padding-top:8px}',
      '.dssx-check{color:var(--dsw-alias-brand-primary,#c25a37);font-size:11px}',
      '.dssx-card-foot{padding:4px 8px 8px 26px}',
      '.dssx-link-btn{border:none;background:transparent;color:var(--dsw-alias-brand-primary,#c25a37);font:inherit;font-size:12px;cursor:pointer;padding:4px 6px;border-radius:6px}',
      '.dssx-link-btn:hover{background:var(--dsw-alias-interactive-bg-hover,#f2efe9)}',
      '.dssx-add-panel{display:flex;flex-direction:column;gap:2px;padding:4px 0}',
      '.dssx-add-item{border:none;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer;padding:5px 6px;border-radius:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dssx-add-item:hover{background:var(--dsw-alias-interactive-bg-hover,#f2efe9)}',
      '.dssx-empty-row{font-size:12px;color:var(--dsw-alias-label-secondary,#8a857c);padding:6px 2px 6px 26px}',
      '.dssx-inline-form{display:flex;align-items:center;gap:6px;min-width:0}',
      '.dssx-inline-rename{flex:1;min-width:0}',
      '.dssx-input{flex:1;min-width:0;border:1px solid var(--dsw-alias-border-l1,#e3e0da);border-radius:7px;background:var(--dsw-alias-bg-base,#fff);color:inherit;font:inherit;padding:5px 8px;outline:none}',
      '.dssx-input:focus{border-color:var(--dsw-alias-brand-primary,#d97757)}',
      '.dssx-btn{border:1px solid var(--dsw-alias-border-l1,#e3e0da);background:var(--dsw-alias-bg-layer-1,#fff);color:inherit;font:inherit;font-size:12px;border-radius:7px;padding:5px 10px;cursor:pointer}',
      '.dssx-btn:hover{background:var(--dsw-alias-interactive-bg-hover,#f2efe9)}',
      '.dssx-btn.dssx-primary{background:var(--dsw-alias-brand-primary,#d97757);border-color:var(--dsw-alias-brand-primary,#d97757);color:#fff}',
      '.dssx-btn.dssx-primary:hover{filter:brightness(1.04)}',
      '.dssx-placeholder{padding:40px 8px;text-align:center;color:var(--dsw-alias-label-secondary,#8a857c);line-height:1.6}',
      '.dssx-foot{padding:8px 24px 14px;font-size:11px;color:var(--dsw-alias-label-secondary,#8a857c);border-top:1px solid var(--dsw-alias-border-l1,#f0ece5);width:100%;max-width:900px;margin:0 auto}',
      '.dssx-menu-item{display:flex;align-items:center;gap:8px;width:100%;padding:8px 12px 7px;margin-top:4px;border:none;border-top:1px solid var(--dsw-alias-border-l1,#e3e0da);background:transparent;color:var(--dsw-alias-label-primary,#1f1f1f);font:inherit;font-size:13px;text-align:left;cursor:pointer;border-radius:0 0 6px 6px}',
      '.dssx-menu-item:hover{background:var(--dsw-alias-interactive-bg-hover,#f2efe9)}',
      '.dssx-hover-row{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--dsw-alias-label-secondary,#6b6b6b)}',
      '.dssx-hover-label{flex:none}',
      '.dssx-hover-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary,#1f1f1f)}',
      '.dssx-mask{position:fixed;inset:0;z-index:90;background:rgba(28,24,19,.38);display:flex;align-items:center;justify-content:center;padding:24px}',
      '.dssx-dialog{width:380px;max-width:100%;max-height:min(560px,calc(100vh - 48px));overflow:auto;background:var(--dsw-alias-bg-overlay,#fff);color:var(--dsw-alias-label-primary,#1f1f1f);border:1px solid var(--dsw-alias-border-l1,#e3e0da);border-radius:14px;box-shadow:0 24px 64px rgba(20,16,12,.28);padding:18px 18px 14px}',
      '.dssx-dialog-title{font-size:15px;font-weight:600}',
      '.dssx-dialog-sub{font-size:12px;color:var(--dsw-alias-label-secondary,#6b6b6b);margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dssx-choice-list{display:flex;flex-direction:column;gap:2px;margin-top:14px}',
      '.dssx-choice{display:flex;align-items:center;gap:8px;border:none;background:transparent;color:inherit;font:inherit;text-align:left;padding:7px 8px;border-radius:8px;cursor:pointer}',
      '.dssx-choice:hover{background:var(--dsw-alias-interactive-bg-hover,#f2efe9)}',
      '.dssx-choice.dssx-active{background:var(--dsw-alias-interactive-bg-hover,#f2efe9)}',
      '.dssx-choice-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dssx-dialog-new{display:flex;gap:6px;margin-top:14px;padding-top:14px;border-top:1px solid var(--dsw-alias-border-l1,#e3e0da)}',
      '.dssx-dialog-foot{display:flex;justify-content:flex-end;margin-top:14px}',
      '.dssx-rename-form{margin-top:14px}',
      '.dssx-dialog-error{margin-top:8px;font-size:12px;line-height:18px;color:var(--dsw-alias-state-error-primary,#c0392b)}',
      '.dssx-browser{display:flex;flex-direction:column;min-height:0;height:100%;padding-top:2px;background:var(--dsw-specific-sidebar-fill,transparent)}',
      '.dssx-browser-tools{display:flex;align-items:center;gap:4px;padding:8px 8px 2px}',
      '.dssx-browser-tools-title{flex:1;min-width:0;font-size:16px;line-height:22px;font-weight:600;color:var(--dsw-alias-label-secondary,#6b6b6b);padding-left:4px}',
      '.dssx-browser-tool{width:28px;height:28px;flex:none;border:none;background:transparent;border-radius:6px;color:var(--dsw-alias-label-secondary,#6b6b6b);cursor:pointer;font-size:14px;line-height:1;display:inline-flex;align-items:center;justify-content:center;padding:0;opacity:.8;transition:opacity .12s ease}',
      '.dssx-browser-tool:hover{background:var(--dsw-alias-interactive-bg-hover,#f2efe9);color:var(--dsw-alias-label-primary,#1f1f1f);opacity:1}',
      '.dssx-browser-tool.dssx-active{background:var(--dsw-alias-interactive-bg-hover,#f2efe9);color:var(--dsw-alias-brand-primary,#c25a37);opacity:1}',
      '.dssx-browser-tool.dssx-ws-delete{opacity:0;color:var(--dsw-alias-state-error-primary,#d93025);transition:opacity .12s ease,background-color .12s ease}',
      '.dssx-browser-ws-head:hover .dssx-browser-tool.dssx-ws-delete,.dssx-browser-tool.dssx-ws-delete:focus-visible{opacity:1}',
      '.dssx-browser-tool.dssx-ws-delete:hover{background:rgba(217,48,37,.10);color:var(--dsw-alias-state-error-primary,#d93025)}',
      '.dssx-browser-tool.dssx-ws-delete.dssx-danger{opacity:1;background:rgba(217,48,37,.10);color:var(--dsw-alias-state-error-primary,#c0392b)}',
      '.dssx-browser-tool.dssx-ws-delete.dssx-danger:hover{background:rgba(217,48,37,.16);color:var(--dsw-alias-state-error-primary,#c0392b)}',
      '.dssx-browser-scroll{flex:1;min-height:0;overflow:auto;padding:0 6px 10px;scrollbar-width:thin;scrollbar-color:var(--dsw-alias-border-l2,#d6d0c6) transparent}',
      '.dssx-browser-scroll::-webkit-scrollbar{width:8px}',
      '.dssx-browser-scroll::-webkit-scrollbar-track{background:transparent}',
      '.dssx-browser-scroll::-webkit-scrollbar-thumb{background:var(--dsw-alias-border-l2,#d6d0c6);border-radius:4px}',
      '.dssx-browser-scroll::-webkit-scrollbar-thumb:hover{background:var(--dsw-alias-label-secondary,#a39d92)}',
      '.dssx-unassigned-group{margin-top:4px;padding-top:4px;border-top:1px dashed var(--dsw-alias-border-l1,#e3e0da)}',
      '.dssx-browser-ws{margin-top:10px}',
      '.dssx-browser-ws-head{display:flex;align-items:center;gap:5px;padding:5px 6px;border-radius:6px}',
      '.dssx-browser-ws-head:hover{background:var(--dsw-alias-interactive-bg-hover,#f2efe9)}',
      '.dssx-browser-caret{width:22px;height:22px;flex:none;border:none;background:transparent;border-radius:5px;color:var(--dsw-alias-label-secondary,#8a857c);cursor:pointer;font-size:10px;line-height:1;display:inline-flex;align-items:center;justify-content:center;padding:0}',
      '.dssx-browser-caret:hover{background:var(--dsw-alias-interactive-bg-hover,#f2efe9)}',
      '.dssx-browser-ws-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;line-height:20px;font-weight:600;color:var(--dsw-alias-label-primary,#1f1f1f);letter-spacing:.01em}',
      '.dssx-browser-count{flex:none;font-size:12px;color:var(--dsw-alias-label-secondary,#a39d92)}',
      '.dssx-browser-ws-count{font-size:11px;line-height:15px;min-width:20px;padding:0 6px;border-radius:999px;background:var(--dsw-alias-bg-layer-2,#efeae2);text-align:center}',
      '.dssx-browser-groups{padding-left:8px}',
      '.dssx-browser-group{margin:2px 0}',
      '.dssx-browser-group-head{display:flex;align-items:center;gap:5px;padding:3px 6px 3px 4px;border-radius:6px}',
      '.dssx-browser-group-head:hover{background:var(--dsw-alias-interactive-bg-hover,#f2efe9)}',
      '.dssx-browser-group-actions{display:flex;align-items:center;gap:1px;flex:none;opacity:0;transition:opacity .12s ease}',
      '.dssx-browser-group-head:hover .dssx-browser-group-actions,.dssx-browser-group-actions:focus-within,.dssx-browser-group-actions.dssx-visible{opacity:1}',
      '.dssx-browser-group-actions .dssx-browser-tool{width:24px;height:24px;opacity:1}',
      '.dssx-browser-group-actions .dssx-browser-tool.dssx-ws-delete{opacity:1}',
      '.dssx-color-row{display:flex;align-items:center;gap:6px;padding:3px 8px 6px 30px;flex-wrap:wrap}',
      '.dssx-color-swatch{width:16px;height:16px;border-radius:50%;border:1px solid var(--dsw-alias-border-l1,#e3e0da);cursor:pointer;padding:0}',
      '.dssx-color-swatch.dssx-active{outline:2px solid var(--dsw-alias-brand-primary,#d97757);outline-offset:1px}',
      '.dssx-browser-group-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;line-height:20px;color:var(--dsw-alias-label-secondary,#6b6b6b)}',
      '.dssx-unassigned-name{color:var(--dsw-alias-label-secondary,#a39d92);font-size:12px;line-height:17px;font-weight:600}',
      '.dssx-browser-rows{display:flex;flex-direction:column;gap:1px}',
      '.dssx-browser-row{display:flex;align-items:center;gap:2px;padding:1px 3px 1px 2px;border-radius:6px;position:relative;cursor:pointer}',
      '.dssx-browser-row:hover{background:var(--dsw-alias-interactive-bg-hover,#f2efe9)}',
      '.dssx-browser-row.dssx-current{background:var(--dsw-alias-bg-layer-2,#f4f1eb)}',
      '.dssx-browser-row.dssx-current:hover{background:var(--dsw-alias-interactive-bg-hover,#efeae2)}',
      '.dssx-browser-row.dssx-dragging{opacity:.45}',
      '.dssx-browser-group.dssx-drop-target{outline:2px solid var(--dsw-alias-brand-primary,#d97757);outline-offset:-2px;border-radius:8px;background:var(--dsw-alias-interactive-bg-hover,#f2efe9);transition:outline-color .12s ease}',
      '.dssx-browser-seat{min-width:16px;flex:none;display:inline-flex;align-items:center;justify-content:center;gap:4px}',
      '.dssx-marker{display:inline-flex;flex:none;color:var(--dsw-alias-label-tertiary,#a39d92);transition:color .3s ease}',
      '.dssx-marker-on,.dssx-browser-row:hover .dssx-marker{color:var(--dsw-alias-brand-primary,#d97757)}',
      '.dssx-marker-dot{transform-origin:13px 15px;transform:rotate(180deg);transition:transform .5s cubic-bezier(.3,.9,.4,1)}',
      '.dssx-marker-on .dssx-marker-dot{transform:rotate(0deg)}',
      '.dssx-marker-arrow{transform-origin:13px 15px;transform:translateX(0) rotate(0deg);transition:transform .4s cubic-bezier(.3,.9,.4,1)}',
      '.dssx-marker-on .dssx-marker-arrow,.dssx-browser-row:hover .dssx-marker:not(.dssx-marker-on) .dssx-marker-arrow{transform:translateX(3px) rotate(90deg)}',
      '.dssx-marker-arrow-scale{transform-origin:13px 3px;transform:scale(.7);transition:transform .4s cubic-bezier(.3,.9,.4,1)}',
      '.dssx-marker-on .dssx-marker-arrow-scale,.dssx-browser-row:hover .dssx-marker:not(.dssx-marker-on) .dssx-marker-arrow-scale{transform:scale(1.9)}',
      '.dssx-marker-arrow-squash{transform-origin:13px 0px;transform:scaleY(1);transition:transform .4s cubic-bezier(.3,.9,.4,1)}',
      '.dssx-marker-on .dssx-marker-arrow-squash,.dssx-browser-row:hover .dssx-marker:not(.dssx-marker-on) .dssx-marker-arrow-squash{transform:scaleY(.55)}',
      '.dssx-marker-arrow-mini{opacity:0;transition:opacity .3s ease}',
      '.dssx-marker-on .dssx-marker-arrow-mini,.dssx-browser-row:hover .dssx-marker:not(.dssx-marker-on) .dssx-marker-arrow-mini{opacity:1}',
      // Status change: the ring spins one full turn while each arc fills from its
      // gap edge to the opposite gap (state colours are desaturated 35%).
      '.dssx-marker-enter{transform-origin:13px 15px;animation:dssx-marker-spin 1s ease-out}',
      '@keyframes dssx-marker-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}',
      '.dssx-marker-sweep{stroke-dasharray:var(--dssx-arc,40) var(--dssx-arc,40);animation:dssx-marker-fill 1s ease-out}',
      '@keyframes dssx-marker-fill{from{stroke-dasharray:0 var(--dssx-arc,40)}}',
      // Exit: the old ring reverses the enter animation (arcs retract from the gap
      // edges, spin back) before the new colour enters.
      '.dssx-marker-exit{transform-origin:13px 15px;animation:dssx-marker-spin-out 1s ease-in}',
      '@keyframes dssx-marker-spin-out{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}',
      '.dssx-marker-exit-sweep{stroke-dasharray:var(--dssx-arc,40) var(--dssx-arc,40);animation:dssx-marker-fill-out 1s ease-in}',
      '@keyframes dssx-marker-fill-out{from{stroke-dasharray:var(--dssx-arc,40) var(--dssx-arc,40)}to{stroke-dasharray:0 var(--dssx-arc,40)}}',
      '@media (prefers-reduced-motion: reduce){.dssx-marker-enter{animation:none}.dssx-marker-sweep{animation:none}.dssx-marker-exit{animation:none}.dssx-marker-exit-sweep{animation:none}}',
      '.dssx-ctx-ring{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px}',
      '.dssx-ctx-spin{transform-origin:7px 7px;animation:dssx-ctx-spin .8s linear infinite}',
      '@keyframes dssx-ctx-spin{to{transform:rotate(360deg)}}',
      '@media (prefers-reduced-motion: reduce){.dssx-ctx-spin{animation:none}}',
      '.dssx-clock{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;flex:none;color:var(--dsw-alias-label-tertiary,#a39d92)}',
      '.dssx-browser-open{flex:1;min-width:0;display:flex;align-items:center;gap:6px;border:none;background:transparent;color:inherit;font:inherit;font-size:15px;line-height:22px;text-align:left;cursor:pointer;padding:4px 2px;border-radius:6px}',
      '.dssx-browser-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dssx-browser-time{flex:none;margin-left:6px;font-size:11px;line-height:18px;color:var(--dsw-alias-label-tertiary,#a39d92)}',
      '.dssx-browser-actions{display:flex;align-items:center;gap:1px;flex:none;opacity:0}',
      '.dssx-browser-row:hover .dssx-browser-actions,.dssx-browser-actions:focus-within{opacity:1}',
      '.dssx-browser-tail{position:relative;display:flex;align-items:center;gap:1px;flex:none}',
      '.dssx-row-cost{position:absolute;right:0;top:50%;transform:translateY(-50%);z-index:1;font-size:12px;line-height:18px;font-weight:600;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary,#5f5b55);background:linear-gradient(rgba(0,0,0,.32),rgba(0,0,0,.32)) left top/4px 1px no-repeat,linear-gradient(rgba(0,0,0,.32),rgba(0,0,0,.32)) left top/1px 4px no-repeat,linear-gradient(rgba(0,0,0,.32),rgba(0,0,0,.32)) right top/4px 1px no-repeat,linear-gradient(rgba(0,0,0,.32),rgba(0,0,0,.32)) right top/1px 4px no-repeat,linear-gradient(rgba(0,0,0,.32),rgba(0,0,0,.32)) left bottom/4px 1px no-repeat,linear-gradient(rgba(0,0,0,.32),rgba(0,0,0,.32)) left bottom/1px 4px no-repeat,linear-gradient(rgba(0,0,0,.32),rgba(0,0,0,.32)) right bottom/4px 1px no-repeat,linear-gradient(rgba(0,0,0,.32),rgba(0,0,0,.32)) right bottom/1px 4px no-repeat,rgba(0,0,0,.07);border-radius:4px;padding:0 4px;white-space:nowrap;pointer-events:none;transition:opacity .12s ease}',
      '.dssx-row-cost-static{position:static;transform:none;pointer-events:auto}',
      '.dssx-browser-row:hover .dssx-row-cost,.dssx-browser-group-head:hover .dssx-row-cost,.dssx-browser-ws-head:hover .dssx-row-cost,.dssx-browser-tail:focus-within .dssx-row-cost{opacity:0}',
      '.dssx-browser-ws-head .dssx-browser-tail .dssx-browser-tool{opacity:0;transition:opacity .12s ease}',
      '.dssx-browser-ws-head:hover .dssx-browser-tail .dssx-browser-tool,.dssx-browser-ws-head .dssx-browser-tail:focus-within .dssx-browser-tool{opacity:.8}',
      '.dssx-browser-ws-head:hover .dssx-browser-tail .dssx-browser-tool:hover,.dssx-browser-ws-head:hover .dssx-browser-tail .dssx-browser-tool:focus-visible{opacity:1}',
      '.dssx-browser-actions .dssx-icon-btn{width:26px;height:26px}',
      '.dssx-browser-actions .dssx-icon-btn:disabled{opacity:.3;cursor:default;background:transparent}',
      '.dssx-browser-group-actions .dssx-browser-tool:disabled{opacity:.3;cursor:default;background:transparent}',
      '.dssx-browser-empty-row{padding:4px 6px 4px 24px;font-size:13px;color:var(--dsw-alias-label-secondary,#a39d92)}',
      '.dssx-browser-empty{padding:24px 10px;text-align:center;font-size:13px;line-height:1.6;color:var(--dsw-alias-label-secondary,#a39d92)}',
      '.dssx-browser-foot{padding:6px 8px;border-top:1px solid var(--dsw-alias-border-l1,#f0ece5);font-size:13px}',
      '.dssx-browser-open-panel{display:inline-flex;align-items:center;gap:5px;font-size:12px;padding:2px 4px}',
      '.dssx-browser-rail{display:flex;justify-content:center;padding:6px 0}',
      '.dssx-rail-btn{width:30px;height:30px;border:none;background:transparent;border-radius:7px;color:var(--dsw-alias-label-secondary,#6b6b6b);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0}',
      '.dssx-rail-btn:hover{background:var(--dsw-alias-interactive-bg-hover,#f2efe9);color:var(--dsw-alias-label-primary,#1f1f1f)}',
      '.dssx-rowmenu{position:fixed;z-index:95;min-width:200px;max-height:360px;overflow:auto;background:var(--dsw-alias-bg-overlay,#fff);border:1px solid var(--dsw-alias-border-l1,#e3e0da);border-radius:10px;box-shadow:0 12px 32px rgba(30,25,18,.18);padding:4px}',
      /* Frame resize handles are shipped invisible (8px transparent, cursor only). Widen the hit area and reveal a brand bar on hover/drag. */
      '[data-side="sidebar"][class*="_handle"],[data-side="rightbar"][class*="_handle"]{width:16px!important;margin-left:-8px!important;background:transparent}',
      'html[data-windows-titlebar] [data-side="sidebar"][class*="_handle"]::before{left:7px!important}',
      '[data-side="sidebar"][class*="_handle"]:hover,[data-side="rightbar"][class*="_handle"]:hover,[data-side="sidebar"][class*="_handle"][data-dragging],[data-side="rightbar"][class*="_handle"][data-dragging]{background:linear-gradient(to right,transparent 5px,color-mix(in srgb,var(--dsh-claude-custom-canvas-dark,#161616) 30%,transparent) 5px,color-mix(in srgb,var(--dsh-claude-custom-canvas-dark,#161616) 30%,transparent) 11px,transparent 11px)}',
      '[data-side="sidebar"][class*="_handle"]::after,[data-side="rightbar"][class*="_handle"]::after{content:"";position:absolute;top:calc(50% - 21.5px);left:4px;width:8px;height:43px;border-radius:7px;background-color:var(--dsh-claude-custom-accent,#d97757);background-repeat:no-repeat;background-position:center;background-size:8px 8px;opacity:0;pointer-events:none;transition:opacity .12s ease}',
      '[data-side="sidebar"][class*="_handle"]::after{background-image:url(data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%2016%2016%22%20fill=%22none%22%20stroke=%22%23ffffff%22%20stroke-width=%222%22%20stroke-linecap=%22round%22%20stroke-linejoin=%22round%22%3E%3Cpath%20d=%22M4.5%204.5l4%203.5-4%203.5%22/%3E%3Cpath%20d=%22M9.5%204.5l4%203.5-4%203.5%22/%3E%3C/svg%3E)}',
      '[data-side="rightbar"][class*="_handle"]::after{background-image:url(data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%2016%2016%22%20fill=%22none%22%20stroke=%22%23ffffff%22%20stroke-width=%222%22%20stroke-linecap=%22round%22%20stroke-linejoin=%22round%22%3E%3Cpath%20d=%22M11.5%204.5l-4%203.5%204%203.5%22/%3E%3Cpath%20d=%22M6.5%204.5l-4%203.5%204%203.5%22/%3E%3C/svg%3E)}',
      '[data-side="sidebar"][class*="_handle"]:hover::after,[data-side="rightbar"][class*="_handle"]:hover::after,[data-side="sidebar"][class*="_handle"][data-dragging]::after,[data-side="rightbar"][class*="_handle"][data-dragging]::after{opacity:1}',
      '.dssx-context-toast{position:fixed;right:18px;bottom:18px;z-index:320;width:min(340px,calc(100vw - 36px));display:flex;flex-direction:column;gap:6px;padding:12px 14px;border-radius:12px;background:var(--dsw-alias-bg-overlay,#fff);color:var(--dsw-alias-label-primary,#1f1f1f);border:1px solid var(--dsw-alias-border-l1,#e3e0da);box-shadow:0 18px 48px rgba(20,16,12,.22)}',
      '.dssx-context-toast.dssx-context-toast-warn{border-color:var(--dsw-alias-state-warning-primary,#d98e2b);box-shadow:0 18px 48px rgba(20,16,12,.22),inset 3px 0 0 var(--dsw-alias-state-warning-primary,#d98e2b)}',
      '.dssx-context-toast-title{font-size:13px;font-weight:600;line-height:18px}',
      '.dssx-context-toast-body{font-size:12px;line-height:17px;color:var(--dsw-alias-label-secondary,#6b6b6b)}',
      '.dssx-context-toast-foot{display:flex;justify-content:flex-end;margin-top:2px}',
    ].join('\n');

    function installStyles() {
      if (typeof document === 'undefined') return null;
      const existing = document.querySelector('style[data-plugin-css="' + CSS_ID + '"]');
      if (existing) {
        if (existing.textContent !== CSS) existing.textContent = CSS;
        return null;
      }
      const style = document.createElement('style');
      style.dataset.plugin = '@local/dsh-workspace-frontend';
      style.dataset.pluginCss = CSS_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
      return style;
    }

    // ------------------------------------------------------------------
    // plugin body
    // ------------------------------------------------------------------
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'session-groups: dictionaries');
      ctx.effect(() => {
        const style = installStyles();
        return () => {
          if (style && style.parentNode) style.parentNode.removeChild(style);
        };
      }, 'session-groups: styles');

      const renameSession = async (sessionId, title) => {
        const result = await ctx.sessions.using(sessionId, { source: 'workspaceOperation' }, (reference) => reference.binding.session.rename(title));
        if (!result.ok) throw new Error(result.error && result.error.message ? result.error.message : 'rename failed');
      };

      /**
       * Sessions that currently carry an active Host reminder. The catalog is the
       * one Host read that returns every Session binding at once, so a single call
       * covers the whole sidebar instead of one round trip per row.
       *
       * `catalog()` answers with a RemoteResult envelope, not the bare list: the
       * records live on `.value` and a failed read must leave the previous marks
       * alone, so this returns null instead of an empty set on failure.
       */
      const scheduleSessions = async () => {
        const result = await ctx.remote.schedule.catalog();
        if (!result || result.ok !== true || !Array.isArray(result.value)) return null;
        const ids = new Set();
        for (const entry of result.value) {
          if (!entry || entry.status !== 'active' || !entry.sessionId) continue;
          ids.add(String(entry.sessionId));
        }
        return ids;
      };

      /**
       * Follow Host-side schedule mutations. Reading the catalog alone would leave
       * a newly created reminder invisible until the next poll.
       */
      const onScheduleChanged = (listener) => {
        try {
          const off = ctx.remote.$on('schedule/changed', listener);
          return typeof off === 'function' ? off : () => {};
        } catch (error) {
          return () => {};
        }
      };

      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist',
        id: 'session-groups',
        order: 20,
        label: () => ctx.locale.bind(NS)('panel.label'),
      }, PanelIcon));

      ctx.slots.inject('main', () => ctx.slots.register({
        name: 'main',
        key: 'session-groups',
        locale: NS,
        inject: () => ({
          openSession: (sessionId) => {
            ctx.uiWorkspace.openSession(sessionId);
          },
        }),
      }, SessionGroupsPanel));

      ctx.slots.inject('sidebar.workspaces', () => ctx.slots.register({
        name: 'sidebar.workspaces',
        priority: -1,
        locale: NS,
        inject: () => ({
          openSession: (sessionId) => {
            ctx.uiWorkspace.openSession(sessionId);
          },
          startSession: (workspaceId) => {
            ctx.uiWorkspace.startSession(workspaceId);
          },
          // A group-row "+" opens a session and files it under that group: the Host
          // hands the new Session id to `openWorkspace`'s beforeOpen callback, the
          // one hook `startSession` itself uses (it returns nothing).
          startSessionInGroup: (workspaceId, sectionId) => {
            const openWorkspace = ctx.uiWorkspace && ctx.uiWorkspace.openWorkspace;
            if (typeof openWorkspace !== 'function') {
              ctx.uiWorkspace.startSession(workspaceId);
              return;
            }
            let pending;
            try {
              pending = openWorkspace.call(ctx.uiWorkspace, workspaceId, (sessionId) => {
                assignSession(workspaceId, sessionId, sectionId || '');
              });
            } catch (error) {
              ctx.uiWorkspace.startSession(workspaceId);
              return;
            }
            if (pending && typeof pending.catch === 'function') pending.catch(() => {});
          },
          archiveSession: (sessionId) => {
            ctx.uiWorkspace.archiveSession(sessionId).catch(() => {});
          },
          unarchiveSession: (sessionId) => {
            ctx.uiWorkspace.unarchiveSession(sessionId).catch(() => {});
          },
          addWorkspace: async () => {
            const picked = await ctx.uiWorkspace.pickDirectory();
            if (!picked) return;
            await ctx.workspaces.create({ path: picked });
          },
          deleteWorkspace: async (workspaceId) => {
            await ctx.workspaces.delete(workspaceId);
          },
          openPanel: () => {
            ctx.layout.selectPanel('session-groups');
          },
          refreshProjections: (sessionId) => {
            ctx.sessions.refreshProjections(sessionId).catch(() => {});
          },
          scheduleSessions,
          onScheduleChanged,
        }),
      }, SessionGroupsBrowser));

      ctx.slots.inject('sidebar.workspaces.session.menu.item', () => ctx.slots.register({
        name: 'sidebar.workspaces.session.menu.item',
        id: 'session-groups.move',
        order: 500,
        locale: NS,
      }, MoveToSectionMenuItem));

      ctx.slots.inject('sidebar.session.row.hover', () => ctx.slots.register({
        name: 'sidebar.session.row.hover',
        id: 'session-groups.hover',
        order: 20,
        locale: NS,
      }, SectionHover));

      ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay',
        id: 'session-groups.move-dialog',
        locale: NS,
      }, MoveToSectionDialog));

      ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay',
        id: 'session-groups.rename-dialog',
        locale: NS,
        inject: () => ({ renameSession }),
      }, RenameSessionDialog));
    }

    return {
      inject: ['slots', 'locale', 'uiWorkspace', 'layout', 'workspaces', 'sessions', 'remote', 'remote.schedule'],
      apply,
    };
  },
});
