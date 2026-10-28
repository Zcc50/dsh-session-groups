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
  id: '@local/dsh-session-groups',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const createPortal = React.createPortal;
    const useState = React.useState;
    const useEffect = React.useEffect;
    const useMemo = React.useMemo;
    const useRef = React.useRef;

    const NS = 'sessionGroups';
    const STORAGE_KEY = 'dsh.session-groups.v1';
    const CSS_ID = '@local/dsh-session-groups/panel.css';

    const PALETTE = [
      '#D97757', '#6A9B7E', '#5B8DB8', '#B08BBB',
      '#C9A227', '#C96F6F', '#7C8A9A', '#4F9D9D',
    ];

    // ------------------------------------------------------------------
    // locale dictionaries
    // ------------------------------------------------------------------
    const zh = {
      'panel.label': '会话分组',
      'panel.title': '会话分组',
      'panel.subtitle': '把同一个工作区里的会话拆成互不相关的项目组。',
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
      'row.copyId': '复制 Session ID',
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
      'browser.emptyWorkspace': '这个工作区还没有会话',
      'browser.noWorkspace': '还没有工作区',
      'browser.addFirstWorkspace': '添加工作区',
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
    };

    const en = {
      'panel.label': 'Groups',
      'panel.title': 'Session groups',
      'panel.subtitle': "Split one workspace's sessions into custom groups for unrelated projects.",
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
      'row.copyId': 'Copy session ID',
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
      'browser.emptyWorkspace': 'No sessions in this workspace yet',
      'browser.noWorkspace': 'No workspace yet',
      'browser.addFirstWorkspace': 'Add workspace',
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
      return { version: 1, byWorkspace: {} };
    }

    function normalizeState(raw) {
      const out = emptyState();
      if (!raw || typeof raw !== 'object') return out;
      const source = raw.byWorkspace;
      if (!source || typeof source !== 'object') return out;
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

    function removeSection(wsId, sectionId) {
      updateBucket(wsId, (bucket) => {
        if (!bucket.sections.some((section) => section.id === sectionId)) return bucket;
        const assignments = {};
        for (const sessionId of Object.keys(bucket.assignments)) {
          if (bucket.assignments[sessionId] !== sectionId) assignments[sessionId] = bucket.assignments[sessionId];
        }
        return {
          sections: bucket.sections.filter((section) => section.id !== sectionId),
          assignments,
        };
      });
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

    function assignSession(wsId, sessionId, sectionId) {
      updateBucket(wsId, (bucket) => {
        const assignments = Object.assign({}, bucket.assignments);
        if (sectionId) assignments[sessionId] = sectionId;
        else delete assignments[sessionId];
        return { sections: bucket.sections, assignments };
      });
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
      const size = typeof props.size === 'number' ? props.size : 12;
      const open = props.open !== false;
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 12 12',
        'aria-hidden': 'true',
        style: { display: 'block', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .12s ease' },
      }, h('path', {
        d: 'M4.5 2.5 L8 6 L4.5 9.5',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.4,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      }));
    }

    function IconPlus(props) {
      const size = typeof props.size === 'number' ? props.size : 14;
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 14 14',
        'aria-hidden': 'true',
        style: { display: 'block' },
      }, h('path', {
        d: 'M7 2v10M2 7h10',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.4,
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
        h('circle', { cx: 3.5, cy: 8, r: 1.2 }),
        h('circle', { cx: 8, cy: 8, r: 1.2 }),
        h('circle', { cx: 12.5, cy: 8, r: 1.2 })));
    }

    function IconEdit(props) {
      const size = typeof props.size === 'number' ? props.size : 14;
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 14 14',
        'aria-hidden': 'true',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.2,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        style: { display: 'block' },
      },
        h('path', { d: 'M9.5 2.2l2.3 2.3L5.2 11.1H2.9V8.8z' }),
        h('path', { d: 'M8.4 3.3l2.3 2.3' }));
    }

    function IconClose(props) {
      const size = typeof props.size === 'number' ? props.size : 14;
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 14 14',
        'aria-hidden': 'true',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.4,
        strokeLinecap: 'round',
        style: { display: 'block' },
      }, h('path', { d: 'M3.5 3.5l7 7M10.5 3.5l-7 7' }));
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

    function Dot(props) {
      return h('span', { className: 'dssx-dot', style: { background: props.color || 'transparent' } });
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
        h('button', {
          type: 'button',
          role: 'menuitem',
          className: 'dssx-pop-item',
          onClick: () => {
            setMenuPos(null);
            openMoveDialog({ sessionId: summary.id, title: summary.title || '' });
          },
        }, t('menu.moveToSection')),
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
      ];

      return h('div', { className: cx('dssx-browser-row', current && 'dssx-current') },
        h('span', { className: 'dssx-browser-seat' },
          renderSlot ? renderSlot('sidebar.session.row.leading', { sessionId: summary.id }) : null),
        h('button', {
          type: 'button',
          className: 'dssx-browser-open',
          title,
          onClick: () => openSession(summary.id),
        },
          section ? h(Dot, { color: section.color }) : null,
          h('span', { className: 'dssx-browser-name' }, title),
          h('span', { className: 'dssx-browser-time' }, relativeTime(summary.updatedAt, t))
        ),
        h('div', { className: 'dssx-browser-actions' },
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
        ),
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
      const addWorkspace = props.addWorkspace;
      const archiveSession = props.archiveSession;
      const unarchiveSession = props.unarchiveSession;
      const openPanel = props.openPanel;
      const useWorkspaces = workspacesHookOf(props);
      const useSessions = sessionsHookOf(props);

      const workspaceState = useWorkspaces((snapshot) => snapshot);
      const sessionState = useSessions((snapshot) => snapshot);
      const sectionsState = useSectionsState();

      const [showArchived, setShowArchived] = useState(false);
      const [collapsedWorkspaces, setCollapsedWorkspaces] = useState({});
      const [collapsedGroups, setCollapsedGroups] = useState({});
      const [busy, setBusy] = useState(false);

      const items = workspaceState && Array.isArray(workspaceState.items) ? workspaceState.items : [];
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

      const nodes = useMemo(() => {
        const out = [];
        for (const workspace of items) {
          const bucket = sectionsState.byWorkspace[workspace.workspaceId] || EMPTY_BUCKET;
          const rows = [];
          for (const sessionId of Array.isArray(workspace.sessionIds) ? workspace.sessionIds : []) {
            const summary = byId[sessionId];
            if (!summary) continue;
            if (summary.blank && sessionId !== mainSessionId) continue;
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
            const sectionId = bucket.assignments[summary.id];
            const target = sectionId ? bySection.get(sectionId) : undefined;
            if (target) target.rows.push(summary);
            else unassigned.push(summary);
          }
          out.push({ workspace, groups, unassigned });
        }
        return out;
      }, [items, byId, archived, pinned, sectionsState, showArchived, mainSessionId]);

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

      if (items.length === 0) {
        return h('div', { className: 'dssx-browser' }, tools,
          h('div', { className: 'dssx-browser-empty' }, t('browser.noWorkspace')));
      }

      const body = nodes.map((node) => {
        const workspace = node.workspace;
        const wsKey = workspace.workspaceId;
        const wsCollapsed = collapsedWorkspaces[wsKey] === true;
        const count = node.groups.reduce((sum, group) => sum + group.rows.length, 0) + node.unassigned.length;
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
            h('span', { className: 'dssx-browser-count' }, count),
            h('button', {
              type: 'button',
              className: 'dssx-browser-tool',
              title: t('browser.newSession'),
              onClick: () => {
                if (typeof startSession === 'function') startSession(wsKey);
              },
            }, h(IconPlus, { size: 14 }))
          ),
          wsCollapsed ? null : h('div', { className: 'dssx-browser-groups' },
            node.groups.map((group) => {
              const groupKey = wsKey + ':' + group.key;
              const groupCollapsed = collapsedGroups[groupKey] === true;
              return h('div', { className: 'dssx-browser-group', key: group.key },
                h('header', { className: 'dssx-browser-group-head' },
                  h('button', {
                    type: 'button',
                    className: 'dssx-browser-caret',
                    'aria-label': groupCollapsed ? 'expand' : 'collapse',
                    onClick: () => toggleKey(collapsedGroups, setCollapsedGroups, groupKey),
                  }, h(IconChevron, { open: !groupCollapsed })),
                  h(Dot, { color: group.color }),
                  h('span', { className: 'dssx-browser-group-name' }, group.name),
                  h('span', { className: 'dssx-browser-count' }, group.rows.length)
                ),
                groupCollapsed ? null : h('div', { className: 'dssx-browser-rows' },
                  group.rows.length === 0
                    ? h('div', { className: 'dssx-browser-empty-row' }, t('section.empty'))
                    : group.rows.map((summary) => h(BrowserSessionRow, {
                      key: summary.id,
                      t,
                      summary,
                      current: summary.id === mainSessionId,
                      section: group,
                      archived: archived.has(summary.id),
                      archiveSession,
                      unarchiveSession,
                      renderSlot,
                      openSession,
                    })))
              );
            }),
            h('div', { className: 'dssx-browser-group' },
              h('header', { className: 'dssx-browser-group-head' },
                h('span', { className: 'dssx-browser-group-name dssx-unassigned-name' }, t('unassigned')),
                h('span', { className: 'dssx-browser-count' }, node.unassigned.length)
              ),
              h('div', { className: 'dssx-browser-rows' },
                node.unassigned.length === 0
                  ? (node.groups.length === 0 ? h('div', { className: 'dssx-browser-empty-row' }, t('browser.emptyWorkspace')) : null)
                  : node.unassigned.map((summary) => h(BrowserSessionRow, {
                    key: summary.id,
                    t,
                    summary,
                    current: summary.id === mainSessionId,
                    section: null,
                    archived: archived.has(summary.id),
                    archiveSession,
                    unarchiveSession,
                    renderSlot,
                    openSession,
                  })))
            )
          )
        );
      });

      return h('div', { className: 'dssx-browser' },
        tools,
        h('div', { className: 'dssx-browser-scroll' }, body),
        h('div', { className: 'dssx-browser-foot' },
          h('button', {
            type: 'button',
            className: 'dssx-link-btn dssx-browser-open-panel',
            onClick: () => {
              if (typeof openPanel === 'function') openPanel();
            },
          }, h(PanelIcon, { size: 13 }), t('panel.label')))
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
      '.dssx-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex:none;box-shadow:inset 0 0 0 1px rgba(0,0,0,.06)}',
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
      '.dssx-browser{display:flex;flex-direction:column;min-height:0;height:100%;padding-top:2px}',
      '.dssx-browser-tools{display:flex;align-items:center;gap:4px;padding:8px 8px 2px}',
      '.dssx-browser-tools-title{flex:1;min-width:0;font-size:12px;color:var(--dsw-alias-label-secondary,#6b6b6b);padding-left:4px}',
      '.dssx-browser-tool{width:28px;height:28px;flex:none;border:none;background:transparent;border-radius:6px;color:var(--dsw-alias-label-secondary,#6b6b6b);cursor:pointer;font-size:14px;line-height:1;display:inline-flex;align-items:center;justify-content:center;padding:0}',
      '.dssx-browser-tool:hover{background:var(--dsw-alias-interactive-bg-hover,#f2efe9);color:var(--dsw-alias-label-primary,#1f1f1f)}',
      '.dssx-browser-tool.dssx-active{background:var(--dsw-alias-interactive-bg-hover,#f2efe9);color:var(--dsw-alias-brand-primary,#c25a37)}',
      '.dssx-browser-scroll{flex:1;min-height:0;overflow:auto;padding:0 6px 10px}',
      '.dssx-browser-ws{margin-top:6px}',
      '.dssx-browser-ws-head{display:flex;align-items:center;gap:5px;padding:5px 6px;border-radius:6px}',
      '.dssx-browser-ws-head:hover{background:var(--dsw-alias-interactive-bg-hover,#f2efe9)}',
      '.dssx-browser-caret{width:22px;height:22px;flex:none;border:none;background:transparent;border-radius:5px;color:var(--dsw-alias-label-secondary,#8a857c);cursor:pointer;font-size:10px;line-height:1;display:inline-flex;align-items:center;justify-content:center;padding:0}',
      '.dssx-browser-caret:hover{background:var(--dsw-alias-interactive-bg-hover,#f2efe9)}',
      '.dssx-browser-ws-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;line-height:18px;font-weight:600;color:var(--dsw-alias-label-secondary,#6b6b6b);letter-spacing:.01em}',
      '.dssx-browser-count{flex:none;font-size:11px;color:var(--dsw-alias-label-secondary,#a39d92)}',
      '.dssx-browser-groups{padding-left:12px}',
      '.dssx-browser-group{margin:1px 0}',
      '.dssx-browser-group-head{display:flex;align-items:center;gap:5px;padding:3px 6px 3px 4px;border-radius:6px}',
      '.dssx-browser-group-head:hover{background:var(--dsw-alias-interactive-bg-hover,#f2efe9)}',
      '.dssx-browser-group-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;line-height:18px;color:var(--dsw-alias-label-secondary,#6b6b6b)}',
      '.dssx-unassigned-name{color:var(--dsw-alias-label-secondary,#a39d92)}',
      '.dssx-browser-rows{display:flex;flex-direction:column;gap:1px}',
      '.dssx-browser-row{display:flex;align-items:center;gap:2px;padding:1px 3px 1px 24px;border-radius:6px;position:relative}',
      '.dssx-browser-row:hover{background:var(--dsw-alias-interactive-bg-hover,#f2efe9)}',
      '.dssx-browser-row.dssx-current{background:var(--dsw-alias-interactive-bg-hover,#efeae2)}',
      '.dssx-browser-seat{width:16px;flex:none;display:inline-flex;align-items:center;justify-content:center}',
      '.dssx-browser-open{flex:1;min-width:0;display:flex;align-items:center;gap:6px;border:none;background:transparent;color:inherit;font:inherit;font-size:14px;line-height:20px;text-align:left;cursor:pointer;padding:4px 2px;border-radius:6px}',
      '.dssx-browser-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dssx-browser-time{flex:none;font-size:10px;line-height:16px;color:var(--dsw-alias-label-tertiary,#a39d92)}',
      '.dssx-browser-actions{display:flex;align-items:center;gap:1px;flex:none;opacity:0}',
      '.dssx-browser-row:hover .dssx-browser-actions,.dssx-browser-actions:focus-within{opacity:1}',
      '.dssx-browser-actions .dssx-icon-btn{width:26px;height:26px}',
      '.dssx-browser-empty-row{padding:4px 6px 4px 24px;font-size:12px;color:var(--dsw-alias-label-secondary,#a39d92)}',
      '.dssx-browser-empty{padding:24px 10px;text-align:center;font-size:12px;line-height:1.6;color:var(--dsw-alias-label-secondary,#a39d92)}',
      '.dssx-browser-foot{padding:6px 8px;border-top:1px solid var(--dsw-alias-border-l1,#f0ece5);font-size:12px}',
      '.dssx-browser-open-panel{display:inline-flex;align-items:center;gap:5px;font-size:11px;padding:2px 4px}',
      '.dssx-browser-rail{display:flex;justify-content:center;padding:6px 0}',
      '.dssx-rail-btn{width:30px;height:30px;border:none;background:transparent;border-radius:7px;color:var(--dsw-alias-label-secondary,#6b6b6b);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0}',
      '.dssx-rail-btn:hover{background:var(--dsw-alias-interactive-bg-hover,#f2efe9);color:var(--dsw-alias-label-primary,#1f1f1f)}',
      '.dssx-rowmenu{position:fixed;z-index:95;min-width:200px;max-height:360px;overflow:auto;background:var(--dsw-alias-bg-overlay,#fff);border:1px solid var(--dsw-alias-border-l1,#e3e0da);border-radius:10px;box-shadow:0 12px 32px rgba(30,25,18,.18);padding:4px}',
    ].join('\n');

    function installStyles() {
      if (typeof document === 'undefined') return null;
      if (document.querySelector('style[data-plugin-css="' + CSS_ID + '"]')) return null;
      const style = document.createElement('style');
      style.dataset.plugin = '@local/dsh-session-groups';
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
          openPanel: () => {
            ctx.layout.selectPanel('session-groups');
          },
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
      inject: ['slots', 'locale', 'uiWorkspace', 'layout', 'workspaces', 'sessions'],
      apply,
    };
  },
});
