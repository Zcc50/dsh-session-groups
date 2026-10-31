/**
 * Task List — Client plugin half, static prototype.
 *
 * The panel is portalled into the live conversation body (the flex column that
 * holds the chat scroll area and the composer seat), anchored 16px in from the
 * centre column's left edge. The chat view area receives the matching
 * padding-left so the conversation keeps its own space instead of running under
 * the panel; the composer itself is untouched because the panel ends above it.
 *
 * Interaction follows the workspace-frontend plugin: status groups with folding
 * headers, a selected row that the keyboard drives, sibling folding under each
 * parent, and a right-edge handle that resizes the panel (width remembered in
 * localStorage).
 *
 * Everything here is still presentation state: the demo rows cycle through the
 * four states in memory only. No Host store, no session log, no persistence of
 * tasks yet.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-task-list',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    // createPortal lives on react-dom; taking it off React yields undefined and
    // the panel host then throws inside the conversation slot.
    let createPortal = null;
    try {
      const ReactDOM = require('react-dom');
      if (ReactDOM && typeof ReactDOM.createPortal === 'function') createPortal = ReactDOM.createPortal;
    } catch (error) {
      createPortal = null;
    }
    const useState = React.useState;
    const useEffect = React.useEffect;
    const useLayoutEffect = React.useLayoutEffect;
    const useRef = React.useRef;

    const NS = 'taskList';
    const CSS_ID = '@local/dsh-task-list/panel.css';
    const PANEL_WIDTH = 340;
    const MIN_WIDTH = 280;
    const MAX_WIDTH = 480;
    const WIDTH_KEY = 'dsh.task-list.width.v1';
    const PANEL_GAP = 16;
    const PANEL_TOP = 8;
    const STATUS_ORDER = ['pending', 'in_progress', 'review', 'completed'];

    const zh = {
      'panel.title': '任务列表',
      'panel.progress': '{done}/{total}',
      'panel.footer': '数据已接入',
      'panel.create': '新建任务',
      'panel.createSub': '新建子任务',
      'panel.notesEdit': '编辑备注',
      'panel.notesPlaceholder': '备注：原因、细节、链接',
      'panel.notesSave': '保存备注',
      'row.more': '更多操作',
      'notice.external': '已被外部更新，你的版本已保留',
      'notice.corrupt': '任务文件损坏，已备份并重建空列表',
      'notice.empty': '还没有任务',
      'notice.emptyHint': '用右上角 + 新建第一个任务',
      'notice.createHint': '回车创建，Esc 取消',
      'notice.loading': '加载中…',
      'notice.noSession': '没有会话，面板未连接',
      'notice.error': '操作失败',
      'panel.resize': '拖动调整面板宽度',
      'row.expand': '展开',
      'row.collapse': '收起',
      'row.moveUp': '上移',
      'row.moveDown': '下移',
      'row.rename': '重命名',
      'row.renamePlaceholder': '输入任务名称',
      'row.delete': '删除',
      'row.deleteConfirm': '再点一次删除',
      'row.block': '标记阻塞',
      'row.unblock': '解除阻塞',
      'row.pin': '钉为焦点',
      'row.unpin': '取消焦点',
      'panel.pause': '暂停全部任务',
      'panel.resume': '恢复全部任务',
      'row.pauseScope': '暂停该父任务下的子任务',
      'row.resumeScope': '恢复该父任务下的子任务',
      'row.paused': '已暂停',
      'confirm': '确定',
      'cancel': '取消',
      'status.pending': '待办',
      'status.in_progress': '进行中',
      'status.review': '待确认',
      'status.completed': '完成',
      'status.abandoned': '废弃',
      'section.abandoned': '废弃',
      'section.abandonedEmpty': '暂无废弃任务',
      'section.completed': '已完成',
      'row.complete': '标为完成',
      'row.abandon': '废弃任务',
      'row.restore': '恢复任务',
      'status.cycle': '点按切换状态',
      'status.derived': '状态由子任务自动决定',
    };

    const en = {
      'panel.title': 'Tasks',
      'panel.progress': '{done}/{total}',
      'panel.footer': 'Connected',
      'panel.create': 'New task',
      'panel.createSub': 'New subtask',
      'panel.notesEdit': 'Edit notes',
      'panel.notesPlaceholder': 'Notes: reason, detail, links',
      'panel.notesSave': 'Save notes',
      'row.more': 'More actions',
      'notice.external': 'Updated elsewhere; your version was kept',
      'notice.corrupt': 'The task file was corrupt: backed up and restarted empty',
      'notice.empty': 'No tasks yet',
      'notice.emptyHint': 'Use + in the header to add the first task',
      'notice.createHint': 'Enter to create, Esc to cancel',
      'notice.loading': 'Loading…',
      'notice.noSession': 'No session: the panel is not connected',
      'notice.error': 'Operation failed',
      'panel.resize': 'Drag to resize the panel',
      'row.expand': 'Expand',
      'row.collapse': 'Collapse',
      'row.moveUp': 'Move up',
      'row.moveDown': 'Move down',
      'row.rename': 'Rename',
      'row.renamePlaceholder': 'Task name',
      'row.delete': 'Delete',
      'row.deleteConfirm': 'Click again to delete',
      'row.block': 'Mark blocked',
      'row.unblock': 'Clear blocked',
      'row.pin': 'Pin as focus',
      'row.unpin': 'Unpin',
      'panel.pause': 'Pause all tasks',
      'panel.resume': 'Resume all tasks',
      'row.pauseScope': 'Pause the subtasks of this group',
      'row.resumeScope': 'Resume the subtasks of this group',
      'row.paused': 'Paused',
      'confirm': 'OK',
      'cancel': 'Cancel',
      'status.pending': 'To do',
      'status.in_progress': 'In progress',
      'status.review': 'Needs review',
      'status.completed': 'Done',
      'status.abandoned': 'Abandoned',
      'section.abandoned': 'Abandoned',
      'section.abandonedEmpty': 'No abandoned tasks',
      'section.completed': 'Completed',
      'row.complete': 'Mark done',
      'row.abandon': 'Abandon task',
      'row.restore': 'Restore task',
      'status.cycle': 'Click to cycle state',
      'status.derived': 'Derived from subtasks',
    };

    // ------------------------------------------------------------------
    // data bridge — the panel reads and writes one same-origin route served
    // by the Host half. `toTree` is the only place the stored flat list
    // (parentId links) becomes the nested shape the renderer walks.
    // ------------------------------------------------------------------
    const API_PATH = '/task-list/api/tasks';

    function toTree(flat) {
      const list = Array.isArray(flat) ? flat : [];
      const byId = new Map();
      const roots = [];
      for (const task of list) {
        if (!task || typeof task.id !== 'string') continue;
        byId.set(task.id, { ...task, children: [] });
      }
      for (const task of list) {
        const node = task ? byId.get(task.id) : null;
        if (!node) continue;
        const parent = task.parentId && byId.has(task.parentId) ? byId.get(task.parentId) : null;
        if (parent) parent.children.push(node);
        else roots.push(node);
      }
      const sortLevel = (items) => {
        items.sort((a, b) => (a.order - b.order) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
        for (const item of items) sortLevel(item.children);
      };
      sortLevel(roots);
      return roots;
    }

    function errorText(error) {
      return error && error.message ? String(error.message) : String(error);
    }

    function readResponse(response) {
      return response.json().then((body) => {
        if (!response.ok || !body || body.ok !== true) {
          throw new Error((body && body.error) || ('HTTP ' + response.status));
        }
        return body;
      }, () => {
        throw new Error('HTTP ' + response.status);
      });
    }

    function readList(sessionId) {
      return fetch(API_PATH + '?sessionId=' + encodeURIComponent(sessionId), { cache: 'no-store' })
        .then(readResponse);
    }

    /** The Host's file stamp; 0 when the file does not exist yet. */
    function stampOf(body) {
      return body && typeof body.updatedAt === 'number' ? body.updatedAt : 0;
    }

    function sendOp(sessionId, op) {
      return fetch(API_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId, ...op }),
        cache: 'no-store',
      }).then(readResponse);
    }

    // Optimistic insert for the create flow; the server response replaces it
    // with the real task a moment later.
    function insertLocal(tasks, node, parentId) {
      if (!parentId) return [...tasks, node];
      return mapRows(tasks, (task) => (
        task.id === parentId ? { ...task, children: [...(task.children || []), node] } : task
      ));
    }

    const CSS = [
      '.dstl-panel{position:absolute;z-index:6;left:16px;box-sizing:border-box;display:flex;flex-direction:column;width:340px;background:var(--dsw-alias-bg-layer-1,#ffffff);border:1px solid var(--dsw-alias-border-l1,#e3e0da);border-radius:14px;box-shadow:0 10px 30px rgba(20,16,12,.08);font-family:var(--dsw-font-family,inherit);color:var(--dsw-alias-label-primary,#1f1f1f);overflow:hidden}',
      '.dstl-head{display:flex;align-items:center;gap:8px;padding:11px 10px 9px 12px;flex:none}',
      '.dstl-ring{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;flex:none}',
      '.dstl-head-title{flex:1;min-width:0;font-size:14px;font-weight:600;line-height:20px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.dstl-icon-btn{flex:none;width:24px;height:24px;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#6b6b6b);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0}',
      '.dstl-icon-btn:hover{background:var(--dsw-alias-interactive-bg-hover,#f2efe9);color:var(--dsw-alias-label-primary,#1f1f1f)}',
      '.dstl-icon-btn:disabled{opacity:.35;cursor:default;background:transparent}',
      '.dstl-list{flex:1;min-height:0;overflow-y:auto;padding:0 6px 8px;outline:none;scrollbar-width:thin;scrollbar-color:var(--dsw-alias-border-l2,#d6d0c6) transparent}',
      '.dstl-list::-webkit-scrollbar{width:8px}',
      '.dstl-list::-webkit-scrollbar-thumb{background:var(--dsw-alias-border-l2,#d6d0c6);border-radius:4px}',
      '.dstl-item{position:relative;display:block}',
      '.dstl-item-in{animation:dstl-item-in .34s cubic-bezier(.2,.8,.2,1) both}',
      '@keyframes dstl-item-in{from{opacity:0;transform:translateX(-16px)}to{opacity:1;transform:none}}',
      '.dstl-item-out{animation:dstl-item-out .34s cubic-bezier(.2,.8,.2,1) both}',
      '@keyframes dstl-item-out{from{opacity:1;transform:none}to{opacity:0;transform:translateX(-16px)}}',
      '.dstl-row{position:relative;display:flex;align-items:center;gap:7px;padding:5px 6px;border-radius:8px;cursor:pointer}',
      '.dstl-row:hover{background:var(--dsw-alias-interactive-bg-hover,#f2efe9)}',
      '.dstl-row.dstl-selected{background:var(--dsw-alias-bg-layer-2,#f4f1eb)}',
      '.dstl-row.dstl-selected:hover{background:var(--dsw-alias-interactive-bg-hover,#f2efe9)}',
      '.dstl-item-head{margin-top:6px}',
      '.dstl-item-head:first-child{margin-top:0}',
      '.dstl-row-head .dstl-title-text{font-size:13.5px;font-weight:600}',
      '.dstl-row-task .dstl-title-text{color:var(--dsw-alias-label-secondary,#6b6b6b)}',
      '.dstl-row-card{background:transparent}',
      '.dstl-status-section{display:flex;align-items:center;gap:6px;padding-top:3px;padding-bottom:3px;padding-right:6px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary,#a39d92);letter-spacing:.03em}',
      '.dstl-status-section-empty{opacity:.45}',
      '.dstl-section-box{margin:2px 0 5px;padding:2px 3px 4px;border:1px solid var(--dsw-alias-border-l1,#e3e0da);border-radius:10px;background:var(--dsw-alias-bg-layer-2,#faf9f7);transition:height .24s cubic-bezier(.2,.8,.2,1),padding .24s ease,margin .24s ease,border-width .24s ease,opacity .24s ease,transform .24s cubic-bezier(.2,.8,.2,1)}',
      '.dstl-section-box-empty{border-style:dashed;background:transparent}',
      '.dstl-section-box-drop{outline:2px solid var(--dsw-alias-brand-primary,#d97757);outline-offset:-2px;background:var(--dsw-alias-interactive-bg-hover,#f2efe9)}',
      '.dstl-status-section-name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      // Standing "abandoned" dock: fixed below the scrolling list, so the live
      // tasks scroll underneath it and never cover it. The header row copies a
      // section head (caret + ring + title + count) and folds the dock, which
      // keeps a long tail of written-off work out of the way.
      '.dstl-abandoned-dock{flex:none;min-height:0;max-height:40vh;overflow-y:auto;overflow-x:hidden;border-top:1px solid var(--dsw-alias-border-l1,#e3e0da);background:var(--dsw-alias-bg-layer-1,#ffffff);padding:2px 6px 6px;scrollbar-width:thin;scrollbar-color:var(--dsw-alias-border-l2,#d6d0c6) transparent;transition:max-height .26s cubic-bezier(.2,.8,.2,1),opacity .22s ease,transform .26s cubic-bezier(.2,.8,.2,1),padding .22s ease,border-color .22s ease}',
      // Pinning the completed body lifts the abandoned dock away entirely: it
      // folds its height to zero and slides up, so the completed body owns the
      // bottom strip. Un-pinning brings it back down.
      '.dstl-abandoned-dock.dstl-abandoned-hidden{max-height:0;opacity:0;overflow:hidden;padding-top:0;padding-bottom:0;border-top-color:transparent;transform:translateY(-6px);pointer-events:none}',
      '.dstl-abandoned-dock-empty{background:transparent}',
      '.dstl-abandoned-head{position:sticky;top:0;z-index:2;background:var(--dsw-alias-bg-layer-1,#ffffff);margin:0 0 2px;padding:4px 6px}',
      '.dstl-abandoned-slot{flex:none;width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;margin-top:1px}',
      '.dstl-abandoned-name{flex:1;min-width:0;display:flex;align-items:center;gap:6px;padding:0;border:none;background:transparent;color:var(--dsw-alias-label-primary,#1f1f1f);font-size:13px;line-height:20px;font-weight:600;text-align:left;cursor:pointer}',
      '.dstl-abandoned-body{padding:0;transition:height .24s cubic-bezier(.2,.8,.2,1),padding .24s ease,margin .24s ease,border-width .24s ease,opacity .24s ease,transform .24s cubic-bezier(.2,.8,.2,1)}',
      '.dstl-abandoned-hint{padding:2px 4px 4px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,#a39d92)}',
      // The completed dock mirrors the abandoned one, minus the counter and the
      // empty hint. It sits above the abandoned dock and collapses to zero
      // height until the pointer enters the bottom dock area; a click pins it
      // open and folds the abandoned body down to its title row.
      '.dstl-docks{flex:none;display:flex;flex-direction:column;min-height:0}',
      '.dstl-complete-dock{flex:none;min-height:0;max-height:0;overflow:hidden;padding:0 6px;opacity:0;transform:translateY(8px);border-top:1px solid transparent;background:var(--dsw-alias-bg-layer-1,#ffffff);transition:max-height .26s cubic-bezier(.2,.8,.2,1),padding .26s ease,opacity .2s ease,transform .26s cubic-bezier(.2,.8,.2,1),border-color .2s ease}',
      '.dstl-complete-dock.dstl-complete-revealed{max-height:220px;padding:2px 6px 6px;opacity:1;transform:none;border-top-color:var(--dsw-alias-border-l1,#e3e0da)}',
      '.dstl-complete-dock.dstl-complete-open{max-height:50vh;overflow-y:auto;scrollbar-width:thin;scrollbar-color:var(--dsw-alias-border-l2,#d6d0c6) transparent}',
      '.dstl-complete-body{padding:0}',
      '.dstl-row-card[draggable="true"]{cursor:grab}',
      '.dstl-row-card.dstl-dragging{opacity:.45}',
      '.dstl-group-count{flex:none;margin-top:2px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary,#a39d92);font-variant-numeric:tabular-nums;transition:opacity .12s ease}',
      '.dstl-row:hover .dstl-group-count,.dstl-row:focus-within .dstl-group-count{opacity:0}',
      '.dstl-row-caret{flex:none;width:14px;height:16px;margin-top:2px;padding:0;border:none;border-radius:4px;background:transparent;color:var(--dsw-alias-label-secondary,#a39d92);display:inline-flex;align-items:center;justify-content:center;cursor:pointer}',
      '.dstl-row-caret:hover{color:var(--dsw-alias-label-primary,#1f1f1f)}',
      '.dstl-row-caret-empty{cursor:default}',
      '.dstl-resizer{position:absolute;top:0;right:0;bottom:0;z-index:2;width:9px;cursor:col-resize;touch-action:none}',
      '.dstl-resizer::after{content:"";position:absolute;top:50%;right:2px;transform:translateY(-50%);width:3px;height:42px;border-radius:2px;background:var(--dsw-alias-brand-primary,#d97757);opacity:0;transition:opacity .12s ease}',
      '.dstl-resizer:hover::after,.dstl-resizer[data-dragging]::after{opacity:1}',
      '.dstl-status-slot{position:relative;flex:none;width:40px;min-height:20px;display:inline-flex;align-items:center;justify-content:center}',
      // Fold arrow, three layers copied from the workspace marker: the outer
      // group turns around the ring centre (0° up, 180° down, 90° right on
      // hover); inside it the arrow scales .7 → 1.9 around its own middle,
      // squashes scaleY 1 → .55 around its tip, and an inner notch fades in.
      '.dstl-marker-arrow{transform-origin:20px 15px;transform:translateX(0) rotate(0deg);transition:transform .4s cubic-bezier(.3,.9,.4,1)}',
      // Down pose ends below the ring (180° around the ring centre), same size and
      // shape as the up pose — no pop, no extra scaling.
      '.dstl-marker-open .dstl-marker-arrow{transform:rotate(180deg)}',
      // Hover the whole row, not just the ring: the arrow swings right, scales up,
      // squashes, and the inner notch appears. It no longer steps out 3px.
      '.dstl-row:hover .dstl-status .dstl-marker-arrow{transform:translateX(0) rotate(90deg)}',
      '.dstl-marker-arrow-scale{transform-origin:20px 3px;transform:scale(.7);transition:transform .4s cubic-bezier(.3,.9,.4,1)}',
      '.dstl-row:hover .dstl-status .dstl-marker-arrow-scale{transform:scale(1.9)}',
      '.dstl-marker-arrow-squash{transform-origin:20px 0px;transform:scaleY(1);transition:transform .4s cubic-bezier(.3,.9,.4,1)}',
      '.dstl-row:hover .dstl-status .dstl-marker-arrow-squash{transform:scaleY(.55)}',
      '.dstl-marker-arrow-mini{opacity:0;transition:opacity .3s ease}',
      '.dstl-row:hover .dstl-status .dstl-marker-arrow-mini{opacity:1}',
      '.dstl-block-dot{position:absolute;right:-1px;top:-1px;width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-state-error-primary,#c0392b);box-shadow:0 0 0 1.5px var(--dsw-alias-bg-layer-1,#ffffff)}',
      '.dstl-focus-mark{flex:none;display:inline-flex;align-items:center;margin-top:4px;color:var(--dsw-alias-brand-primary,#d97757)}',
      '.dstl-icon-on{color:var(--dsw-alias-brand-primary,#d97757)}',
      '.dstl-toggle{position:relative;display:inline-flex;width:12px;height:12px;align-items:center;justify-content:center}',
      '.dstl-toggle-glyph{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;transition:opacity .18s ease,transform .18s cubic-bezier(.2,.8,.2,1)}',
      '.dstl-toggle .dstl-toggle-pause{opacity:1;transform:rotate(0deg) scale(1)}',
      '.dstl-toggle .dstl-toggle-play{opacity:0;transform:rotate(-90deg) scale(.45)}',
      '.dstl-toggle.dstl-toggle-paused .dstl-toggle-pause{opacity:0;transform:rotate(90deg) scale(.45)}',
      '.dstl-toggle.dstl-toggle-paused .dstl-toggle-play{opacity:1;transform:rotate(0deg) scale(1)}',
      '.dstl-row.dstl-paused{opacity:.5}',
      '.dstl-row.dstl-paused .dstl-title-text{text-decoration:line-through;text-decoration-color:var(--dsw-alias-label-tertiary,#a39d92)}',
      '.dstl-status{flex:none;width:40px;min-height:20px;margin-top:0;padding:0;border:none;border-radius:50%;background:transparent;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box}',
      '.dstl-status[aria-disabled="true"]{cursor:default}',
      '.dstl-marker-enter{transform-origin:8px 8px;animation:dstl-marker-spin 1s ease-out}',
      '@keyframes dstl-marker-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}',
      '.dstl-marker-sweep{stroke-dasharray:var(--dstl-arc,40) var(--dstl-arc,40);animation:dstl-marker-fill 1s ease-out}',
      '@keyframes dstl-marker-fill{from{stroke-dasharray:0 var(--dstl-arc,40)}}',
      '.dstl-marker-exit{transform-origin:8px 8px;animation:dstl-marker-spin-out 1s ease-in}',
      '@keyframes dstl-marker-spin-out{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}',
      '.dstl-marker-exit-sweep{stroke-dasharray:var(--dstl-arc,40) var(--dstl-arc,40);animation:dstl-marker-fill-out 1s ease-in}',
      '@keyframes dstl-marker-fill-out{from{stroke-dasharray:var(--dstl-arc,40) var(--dstl-arc,40)}to{stroke-dasharray:0 var(--dstl-arc,40)}}',
      '@media (prefers-reduced-motion: reduce){.dstl-marker-enter,.dstl-marker-sweep,.dstl-marker-exit,.dstl-marker-exit-sweep,.dstl-item-in,.dstl-item-out{animation:none}.dstl-row-actions,.dstl-marker-arrow,.dstl-section-box,.dstl-complete-dock{transition:none}}',
      // A card row has no priority tick between the ring and the title, so it
      // pulls the slot's inner blank back and leaves a 4px breath.
      '.dstl-row-card .dstl-status-slot{margin-right:-11px}',
      // The abandoned dock reuses the same rhythm: a written-off root sits 6px
      // off its ring like a section head, a child the same 4px as a card.
      '.dstl-abandoned-root .dstl-title{margin-left:-11px;transition:transform .2s ease,margin-left .2s ease}',
      '.dstl-abandoned-sub .dstl-status-slot{margin-right:-11px}',
      '.dstl-abandoned-kids{overflow:hidden;transition:height .24s cubic-bezier(.2,.8,.2,1),margin .24s ease,opacity .24s ease,transform .24s cubic-bezier(.2,.8,.2,1)}',
      '.dstl-title{flex:1;min-width:0;display:flex;align-items:center;gap:4px;padding:0;border:none;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer;transition:transform .2s ease}',
      // Only the section head (parent row / the abandoned dock title) pulls its
      // text back toward the ring; subtask and written-off rows keep the plain
      // gap so their titles do not jump. -11px leaves a 6px breath between the
      // ring and the text.
      '.dstl-row-head .dstl-title{margin-left:-11px;transition:transform .2s ease,margin-left .2s ease}',
      '.dstl-row-head .dstl-abandoned-name{margin-left:-11px;transition:transform .2s ease}',
      // The arrow swings right on hover; the head title steps aside so the arrow
      // never covers it. For rows that own an action strip the step is a margin
      // (layout), not a transform: the strip takes flex width now, so a
      // transform would slide the text under the buttons.
      '.dstl-row-head:hover .dstl-title{margin-left:6px}',
      '.dstl-row-head:hover .dstl-abandoned-name{transform:translateX(17px)}',
      '.dstl-abandoned-root:hover .dstl-title{margin-left:6px}',
      '.dstl-title-text{font-size:13px;line-height:20px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.dstl-title-done .dstl-title-text{color:var(--dsw-alias-label-secondary,#8a857c);text-decoration:line-through}',
      '.dstl-caret{flex:none;color:var(--dsw-alias-label-secondary,#a39d92)}',
      // The strip is a flex child of the row, not an absolute overlay: at rest it
      // collapses to zero width so the title owns the whole row; on hover it
      // grows and the title (flex:1, min-width:0) shrinks with it, so a long
      // name is ellipsised before the buttons, never covered by them.
      '.dstl-row-actions{flex:none;display:flex;align-items:center;gap:1px;max-width:0;margin-left:0;overflow:hidden;opacity:0;transition:max-width .18s cubic-bezier(.2,.8,.2,1),opacity .12s ease,margin-left .18s ease}',
      '.dstl-row:hover .dstl-row-actions,.dstl-row:focus-within .dstl-row-actions{opacity:1;max-width:170px;margin-left:4px}',
      '.dstl-row-actions .dstl-icon-btn{width:22px;height:22px}',
      '.dstl-row-actions .dstl-icon-btn:disabled{opacity:.3;cursor:default;background:transparent}',
      '.dstl-icon-btn.dstl-danger{color:var(--dsw-alias-state-error-primary,#c0392b);background:rgba(217,48,37,.08);width:26px}',
      '.dstl-row.dstl-renaming{cursor:default}',
      '.dstl-inline-form{flex:1;min-width:0;display:flex;align-items:center;gap:6px}',
      '.dstl-input{flex:1;min-width:0;border:1px solid var(--dsw-alias-border-l1,#e3e0da);border-radius:7px;background:var(--dsw-alias-bg-base,#fff);color:inherit;font:inherit;font-size:13px;padding:4px 8px;outline:none}',
      '.dstl-input:focus{border-color:var(--dsw-alias-brand-primary,#d97757)}',
      '.dstl-btn{flex:none;border:1px solid var(--dsw-alias-border-l1,#e3e0da);border-radius:7px;background:var(--dsw-alias-bg-layer-1,#fff);color:inherit;font:inherit;font-size:12px;padding:4px 8px;cursor:pointer}',
      '.dstl-btn:hover{background:var(--dsw-alias-interactive-bg-hover,#f2efe9)}',
      '.dstl-btn.dstl-primary{background:var(--dsw-alias-brand-primary,#d97757);border-color:var(--dsw-alias-brand-primary,#d97757);color:#ffffff}',
      '.dstl-notes{display:flex;align-items:flex-start;gap:4px;margin:0 8px 4px 29px;padding:5px 8px;border-left:2px solid var(--dsw-alias-border-l1,#e3e0da);font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,#6b6b6b)}',
      '.dstl-notes-text{flex:1;min-width:0;margin:0;white-space:pre-wrap;word-break:break-word}',
      '.dstl-notes-edit-btn{flex:none;width:20px;height:20px;padding:0;border:none;border-radius:5px;background:transparent;color:var(--dsw-alias-label-tertiary,#a39d92);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;opacity:0;transition:opacity .12s ease}',
      '.dstl-notes:hover .dstl-notes-edit-btn,.dstl-notes-edit-btn:focus-visible{opacity:1}',
      '.dstl-notes-edit{display:flex;flex-direction:column;gap:6px;margin:0 8px 6px 29px;padding:6px 8px;border-left:2px solid var(--dsw-alias-brand-primary,#d97757)}',
      '.dstl-textarea{width:100%;box-sizing:border-box;resize:vertical;min-height:60px;border:1px solid var(--dsw-alias-border-l1,#e3e0da);border-radius:7px;background:var(--dsw-alias-bg-base,#fff);color:inherit;font:inherit;font-size:12.5px;line-height:18px;padding:6px 8px;outline:none}',
      '.dstl-textarea:focus{border-color:var(--dsw-alias-brand-primary,#d97757)}',
      '.dstl-notes-actions{display:flex;justify-content:flex-end;gap:6px}',
      '.dstl-foot{flex:none;display:flex;align-items:center;gap:6px;padding:7px 12px;border-top:1px solid var(--dsw-alias-border-l1,#e3e0da);font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary,#8a857c)}',
      '.dstl-foot-dot{flex:none;width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-warn-primary,#d98e2b)}',
      '.dstl-foot-dot-error{background:var(--dsw-alias-state-error-primary,#c0392b)}',
      '.dstl-foot-text{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dstl-empty{display:flex;flex-direction:column;gap:4px;padding:22px 14px;text-align:center}',
      '.dstl-empty-title{font-size:12.5px;color:var(--dsw-alias-label-secondary,#8a857c)}',
      '.dstl-empty-hint{font-size:11.5px;color:var(--dsw-alias-label-tertiary,#a39d92)}',
      '.dstl-create{margin-bottom:2px}',
      '.dstl-row-create{background:var(--dsw-alias-bg-layer-2,#f4f1eb)}',
      '.dstl-create-slot{color:var(--dsw-alias-label-tertiary,#a39d92)}',
      '.dstl-external{flex:none;width:6px;height:6px;margin-top:7px;border-radius:50%;background:var(--dsw-alias-state-warn-primary,#d98e2b)}',
      '.dstl-menu-open .dstl-row-actions{opacity:1;max-width:170px;margin-left:4px}',
      '.dstl-menu{position:absolute;right:6px;top:calc(100% - 2px);z-index:5;min-width:132px;padding:4px;display:flex;flex-direction:column;gap:1px;background:var(--dsw-alias-bg-layer-1,#ffffff);border:1px solid var(--dsw-alias-border-l1,#e3e0da);border-radius:9px;box-shadow:0 8px 22px rgba(20,16,12,.14)}',
      '.dstl-menu-item{display:flex;align-items:center;gap:8px;width:100%;padding:6px 8px;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary,#1f1f1f);font:inherit;font-size:12.5px;line-height:18px;text-align:left;cursor:pointer;white-space:nowrap}',
      '.dstl-menu-item:hover{background:var(--dsw-alias-interactive-bg-hover,#f2efe9)}',
      '.dstl-menu-item.dstl-menu-on{color:var(--dsw-alias-brand-primary,#d97757)}',
      '.dstl-menu-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}',
    ].join('\n');

    // ------------------------------------------------------------------
    // styles and helpers
    // ------------------------------------------------------------------
    function installStyles() {
      if (typeof document === 'undefined') return null;
      const existing = document.querySelector('style[data-plugin-css="' + CSS_ID + '"]');
      if (existing) {
        if (existing.textContent !== CSS) existing.textContent = CSS;
        return null;
      }
      const style = document.createElement('style');
      style.dataset.plugin = '@local/dsh-task-list';
      style.dataset.pluginCss = CSS_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
      return style;
    }

    function bindText(t) {
      return (key, vars) => {
        let text = t ? t(key) : undefined;
        if (text === undefined || text === null || text === '') text = zh[key] || key;
        if (vars) {
          for (const name of Object.keys(vars)) text = text.split('{' + name + '}').join(String(vars[name]));
        }
        return text;
      };
    }

    function mapRows(list, visit) {
      return list.map((task) => {
        const next = visit(task);
        if (!next.children || next.children.length === 0) return { ...next, children: [] };
        return { ...next, children: mapRows(next.children, visit) };
      });
    }

    // Progress counts leaf tasks: a parent with children is a container, not an
    // extra item, so finishing every actionable row reaches exactly 100%.
    function findTask(list, id) {
      for (const task of list) {
        if (task.id === id) return task;
        const found = findTask(task.children || [], id);
        if (found) return found;
      }
      return null;
    }

    /** Every id in the tree, parents before their children. */
    function collectTaskIds(list, out) {
      for (const task of list) {
        out.push(task.id);
        if (task.children && task.children.length > 0) collectTaskIds(task.children, out);
      }
      return out;
    }

    /** Every task object in the tree, parents before their children. */
    function collectTasks(list, out) {
      for (const task of list) {
        out.push(task);
        if (task.children && task.children.length > 0) collectTasks(task.children, out);
      }
      return out;
    }

    // Run/pause switch on the local tree; mirrors setPaused in the Host store.
    // `all` covers every task, `subtree` the direct children of `parentId`, and
    // finished tasks are left alone.
    function setPausedLocal(list, scope, parentId, paused) {
      const flag = paused === true;
      return mapRows(list, (task) => {
        if (task.status === 'completed' || task.status === 'abandoned') return task;
        if (scope === 'subtree' && task.parentId !== parentId) return task;
        return { ...task, paused: flag };
      });
    }

    // A blocked parent blocks its unfinished children too. The optimistic paint
    // keeps the same rule as the Host write, so nothing flickers on the reply.
    function setBlockedLocal(list, id, blocked, scope) {
      const flag = blocked === true;
      return mapRows(list, (task) => {
        const isTarget = task.id === id;
        const isChild = scope === 'subtree' && task.parentId === id
          && task.status !== 'completed' && task.status !== 'abandoned';
        if (!isTarget && !isChild) return task;
        if (isTarget && task.status === 'abandoned') return task;
        return { ...task, blocked: flag };
      });
    }

    // Write a task off (or restore it). `abandonedFrom` mirrors the Host rule:
    // the abandoned state remembers where it came from, and restoring uses it
    // so the task lands back in the section it left.
    function abandonTask(list, id) {
      return mapRows(list, (task) => {
        if (task.id !== id || task.status === 'abandoned') return task;
        return { ...task, status: 'abandoned', abandonedFrom: task.status };
      });
    }

    function restoreTask(list, id) {
      return mapRows(list, (task) => {
        if (task.id !== id || task.status !== 'abandoned') return task;
        return { ...task, status: task.abandonedFrom || 'pending', abandonedFrom: null };
      });
    }

    // One focus per session: pinning a task clears every other pin.
    function toggleFocus(list, id) {
      const target = findTask(list, id);
      if (!target) return list;
      const next = target.focused !== true;
      return mapRows(list, (task) => ({ ...task, focused: task.id === id ? next : false }));
    }

    function countTasks(list) {
      return list.reduce((sum, task) => {
        if (task.status === 'abandoned') return sum;
        const children = (task.children || []).filter((child) => child.status !== 'abandoned');
        if (children.length === 0) return sum + 1;
        return sum + countTasks(children);
      }, 0);
    }

    function countDone(list) {
      return list.reduce((sum, task) => {
        if (task.status === 'abandoned') return sum;
        const children = (task.children || []).filter((child) => child.status !== 'abandoned');
        if (children.length === 0) return sum + (task.status === 'completed' ? 1 : 0);
        return sum + countDone(children);
      }, 0);
    }

    // A parent's status is derived from its children: none done -> pending, some
    // done -> in progress, all done -> completed. Abandoned children are
    // skipped: writing a subtask off neither completes the parent nor holds it
    // open. The stored status is ignored while the task has live children, so a
    // parent can never disagree with its own subtree.
    function deriveStatus(task) {
      const children = (task.children || []).filter((child) => child.status !== 'abandoned');
      if (children.length === 0) return task.status;
      const total = countTasks(children);
      if (total === 0) return task.status;
      const done = countDone(children);
      if (done >= total) return 'completed';
      // No done child but one already moving still means the parent is running.
      const active = children.some((child) => deriveStatus(child) !== 'pending');
      if (done === 0 && !active) return 'pending';
      return 'in_progress';
    }

    function clampWidth(value) {
      const width = Math.round(Number(value));
      if (!Number.isFinite(width)) return PANEL_WIDTH;
      return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width));
    }

    function readStoredWidth() {
      try {
        const raw = window.localStorage.getItem(WIDTH_KEY);
        if (raw === null) return PANEL_WIDTH;
        return clampWidth(raw);
      } catch (error) {
        return PANEL_WIDTH;
      }
    }

    function storeWidth(width) {
      try {
        window.localStorage.setItem(WIDTH_KEY, String(width));
      } catch (error) {
        /* storage unavailable: the width stays in memory for this page */
      }
    }

    function removeFromTree(list, id) {
      return list
        .filter((task) => task.id !== id)
        .map((task) => ((task.children && task.children.length > 0)
          ? { ...task, children: removeFromTree(task.children, id) }
          : task));
    }

    // Structure: a top-level task with children is a section head; the four
    // status sections belong to that head and every child card lands in the one
    // matching its status. Subtasks never render a container row of their own,
    // so one set of sections governs all siblings. Rows stay flat so the
    // keyboard and the card animation share one visible order.
    //
    // Abandoned tasks leave that structure entirely: they never open a section
    // and never sit under their parent's sections. The returned `abandoned`
    // list is flat on purpose — only the root of an abandoned subtree is listed,
    // so restoring the root brings its children back with it.
    //
    // Completed standalone tasks and fully-done phases leave the same way and
    // are read in the completed dock. A done child under a running phase still
    // stays in its status section, so the phase keeps its shape.
    function buildList(list, collapsedParents) {
      const rows = [];
      const abandoned = [];
      const completed = [];
      // Both standing docks share one shape: the root of a whole-subtree move is
      // the only listed head, its direct children hang under it, and deeper
      // history stays in the store. `collapsed` is tri-state like the live list.
      const dockRows = (kind, target, tasks, underDock) => {
        for (const task of tasks) {
          const children = underDock
            ? []
            : (task.children || []).filter((child) => kind === 'abandoned' || child.status !== 'abandoned');
          target.push({
            kind,
            task,
            // The dock title is the section head; every docked row sits one
            // level under it, so its ring never lines up with the title's ring.
            depth: underDock ? 2 : 1,
            hasChildren: children.length > 0,
            childCount: children.length,
            collapsed: collapsedParents[task.id] === true,
          });
          // Two levels only, same as the live list: the docked parent plus its
          // direct children. Deeper history stays in the store. The children
          // stay in this flat list even while folded: the renderer hides them,
          // and the fold animation needs their nodes until it closes the height.
          if (!underDock) dockRows(kind, target, children, true);
        }
      };
      const collectAbandoned = (tasks, underDock) => dockRows('abandoned', abandoned, tasks, underDock);
      const collectCompleted = (tasks, underDock) => dockRows('completed', completed, tasks, underDock);
      for (const task of list) {
        if (task.status === 'abandoned') {
          collectAbandoned([task], false);
          continue;
        }
        const children = (task.children || []).filter((child) => child.status !== 'abandoned');
        const hasChildren = children.length > 0;
        // A subtask abandoned on its own still has a live parent; it must show
        // up in the standing area even though the parent keeps its sections.
        for (const child of task.children || []) {
          if (child.status === 'abandoned') collectAbandoned([child], false);
        }
        if (task.status === 'completed' || (hasChildren && deriveStatus(task) === 'completed')) {
          collectCompleted([task], false);
          continue;
        }
        rows.push({
          kind: hasChildren ? 'head' : 'row',
          task,
          depth: 0,
          hasChildren,
          childCount: children.length,
          // A finished phase is collapsed by default so it stops pushing the
          // active work down; an explicit toggle (true/false) always wins and
          // lasts until the page reloads.
          collapsed: hasChildren
            ? (collapsedParents[task.id] === undefined
              ? deriveStatus(task) === 'completed'
              : collapsedParents[task.id] === true)
            : false,
        });
        const collapsed = rows[rows.length - 1].collapsed;
        if (!hasChildren || collapsed) continue;
        for (const status of STATUS_ORDER) {
          const inSection = children.filter((child) => child.status === status);
          rows.push({
            kind: 'status',
            task,
            depth: 1,
            status,
            ownerId: task.id,
            count: inSection.length,
          });
          for (const child of inSection) {
            rows.push({ kind: 'card', task: child, depth: 2, status, ownerId: task.id });
          }
        }
      }
      return { rows, abandoned, completed };
    }

    function cycleStatus(list, id) {
      return mapRows(list, (task) => {
        if (task.id !== id) return task;
        // Parents are read-only: their ring shows the derived aggregate.
        if ((task.children || []).length > 0) return task;
        const index = STATUS_ORDER.indexOf(task.status);
        const next = STATUS_ORDER[(index + 1) % STATUS_ORDER.length];
        return { ...task, status: next };
      });
    }

    function setTaskStatus(list, id, status) {
      if (!STATUS_ORDER.includes(status)) return list;
      return mapRows(list, (task) => (task.id === id ? { ...task, status } : task));
    }

    function renameTask(list, id, title) {
      const text = typeof title === 'string' ? title.trim() : '';
      if (text === '') return list;
      return mapRows(list, (task) => (task.id === id ? { ...task, title: text } : task));
    }

    function siblingsOf(list, id) {
      if (list.some((task) => task.id === id)) return list;
      for (const task of list) {
        if (!task.children || task.children.length === 0) continue;
        const found = siblingsOf(task.children, id);
        if (found) return found;
      }
      return null;
    }

    function canMove(list, id, delta) {
      const siblings = siblingsOf(list, id);
      if (!siblings) return false;
      const index = siblings.findIndex((task) => task.id === id);
      const target = index + delta;
      return index >= 0 && target >= 0 && target < siblings.length;
    }

    function moveTask(list, id, delta) {
      const siblings = siblingsOf(list, id);
      if (!siblings) return list;
      const index = siblings.findIndex((task) => task.id === id);
      const target = index + delta;
      if (index < 0 || target < 0 || target >= siblings.length) return list;
      const reordered = siblings.slice();
      const [moved] = reordered.splice(index, 1);
      reordered.splice(target, 0, moved);
      const swap = (items) => {
        if (items === siblings) return reordered;
        return items.map((task) => ((task.children && task.children.length > 0)
          ? { ...task, children: swap(task.children) }
          : task));
      };
      return swap(list);
    }

    // ------------------------------------------------------------------
    // icons — copied from @local/dsh-workspace-frontend (same 16px grid,
    // 1.3 stroke, round caps) so both plugins read as one product.
    // ------------------------------------------------------------------
    function IconChevron(props) {
      const size = typeof props.size === 'number' ? props.size : 13;
      const rotation = props.dir === 'left' ? 180 : props.open === false ? 0 : 90;
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 16 16',
        'aria-hidden': 'true',
        className: props.className,
        style: { display: 'block', transform: 'rotate(' + rotation + 'deg)', transition: 'transform .12s ease' },
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
        width: size, height: size, viewBox: '0 0 16 16', 'aria-hidden': 'true',
        fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round',
        style: { display: 'block' },
      },
        h('path', { d: 'M8 13V3' }),
        h('path', { d: 'M4.2 6.8L8 3l3.8 3.8' }));
    }

    function IconArrowDown(props) {
      const size = typeof props.size === 'number' ? props.size : 14;
      return h('svg', {
        width: size, height: size, viewBox: '0 0 16 16', 'aria-hidden': 'true',
        fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round',
        style: { display: 'block' },
      },
        h('path', { d: 'M8 3v10' }),
        h('path', { d: 'M4.2 9.2L8 13l3.8-3.8' }));
    }

    function IconEdit(props) {
      const size = typeof props.size === 'number' ? props.size : 14;
      return h('svg', {
        width: size, height: size, viewBox: '0 0 16 16', 'aria-hidden': 'true',
        fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round',
        style: { display: 'block' },
      },
        h('path', { d: 'M10.8 3.2l2 2L5.4 12.6H3.4v-2z' }),
        h('path', { d: 'M9.6 4.4l2 2' }));
    }

    function IconPlay(props) {
      const size = typeof props.size === 'number' ? props.size : 13;
      return h('svg', {
        width: size, height: size, viewBox: '0 0 16 16', 'aria-hidden': 'true',
        fill: 'currentColor',
        style: { display: 'block' },
      },
        h('path', { d: 'M6 4.2l6.2 3.8L6 11.8z' }));
    }

    function IconPause(props) {
      const size = typeof props.size === 'number' ? props.size : 13;
      return h('svg', {
        width: size, height: size, viewBox: '0 0 16 16', 'aria-hidden': 'true',
        fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round',
        style: { display: 'block' },
      },
        h('path', { d: 'M6 4v8' }),
        h('path', { d: 'M10 4v8' }));
    }

    // One button for two states: running shows Pause, paused shows Play, and
    // the two glyphs cross-fade through a quarter turn so the change reads as a
    // morph instead of a swap.
    function PlayPauseGlyph(props) {
      const paused = props.paused === true;
      return h('span', { className: 'dstl-toggle' + (paused ? ' dstl-toggle-paused' : '') },
        h('span', { className: 'dstl-toggle-glyph dstl-toggle-pause' }, h(IconPause, { size: 12 })),
        h('span', { className: 'dstl-toggle-glyph dstl-toggle-play' }, h(IconPlay, { size: 12 })));
    }

    function IconPlus(props) {      const size = typeof props.size === 'number' ? props.size : 14;
      return h('svg', {
        width: size, height: size, viewBox: '0 0 16 16', 'aria-hidden': 'true',
        fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round',
        style: { display: 'block' },
      },
        h('path', { d: 'M8 3.4v9.2' }),
        h('path', { d: 'M3.4 8h9.2' }));
    }

    function IconMore(props) {
      const size = typeof props.size === 'number' ? props.size : 14;
      return h('svg', {
        width: size, height: size, viewBox: '0 0 16 16', 'aria-hidden': 'true',
        fill: 'currentColor',
        style: { display: 'block' },
      },
        h('circle', { cx: 3.2, cy: 8, r: 1.25 }),
        h('circle', { cx: 8, cy: 8, r: 1.25 }),
        h('circle', { cx: 12.8, cy: 8, r: 1.25 }));
    }

    function IconNotes(props) {
      const size = typeof props.size === 'number' ? props.size : 14;
      return h('svg', {
        width: size, height: size, viewBox: '0 0 16 16', 'aria-hidden': 'true',
        fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round',
        style: { display: 'block' },
      },
        h('path', { d: 'M4 2.6h5.2L12 5.4v8H4z' }),
        h('path', { d: 'M6 6.4h4M6 8.6h4M6 10.8h2.4' }));
    }

    function IconClose(props) {
      const size = typeof props.size === 'number' ? props.size : 14;
      return h('svg', {
        width: size, height: size, viewBox: '0 0 16 16', 'aria-hidden': 'true',
        fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round',
        style: { display: 'block' },
      }, h('path', { d: 'M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6' }));
    }

    function IconTrash(props) {
      const size = typeof props.size === 'number' ? props.size : 14;
      return h('svg', {
        width: size, height: size, viewBox: '0 0 16 16', 'aria-hidden': 'true',
        fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round',
        style: { display: 'block' },
      },
        h('path', { d: 'M3 4.7h10' }),
        h('path', { d: 'M6.2 4.7V3.2h3.6v1.5' }),
        h('path', { d: 'M4.3 4.7l.5 8.1a1 1 0 0 0 1 .9h4.4a1 1 0 0 0 1-.9l.5-8.1' }),
        h('path', { d: 'M6.6 7v3.8M9.4 7v3.8' }));
    }

    function IconBlock(props) {
      const size = typeof props.size === 'number' ? props.size : 14;
      return h('svg', {
        width: size, height: size, viewBox: '0 0 16 16', 'aria-hidden': 'true',
        fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round',
        style: { display: 'block' },
      },
        h('circle', { cx: 8, cy: 8, r: 5.2 }),
        h('path', { d: 'M4.4 4.4l7.2 7.2' }));
    }

    function IconUndo(props) {
      const size = typeof props.size === 'number' ? props.size : 14;
      return h('svg', {
        width: size, height: size, viewBox: '0 0 16 16', 'aria-hidden': 'true',
        fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round',
        style: { display: 'block' },
      },
        h('path', { d: 'M4.6 5.6L2.4 8l2.2 2.4' }),
        h('path', { d: 'M2.6 8h5.8a3.1 3.1 0 0 1 0 6.2H6.2' }));
    }

    function IconPin(props) {
      const size = typeof props.size === 'number' ? props.size : 14;
      return h('svg', {
        width: size, height: size, viewBox: '0 0 16 16', 'aria-hidden': 'true',
        fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round',
        style: { display: 'block' },
      },
        h('circle', { cx: 8, cy: 5.2, r: 2.2 }),
        h('path', { d: 'M8 7.4v4.4' }),
        h('path', { d: 'M6.3 11.6h3.4' }));
    }

    function InlineInput(props) {
      const inputRef = useRef(null);
      useEffect(() => {
        const node = inputRef.current;
        if (node && typeof node.focus === 'function') node.focus();
        if (node && typeof node.select === 'function') node.select();
      }, []);
      return h('input', {
        ref: inputRef,
        className: 'dstl-input',
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
    // status marker — copied from the workspace-frontend SessionMarker: two
    // stacked rings (outer r6.2/2.2, inner r3.6/1.1) split on the "/" diagonal,
    // four inner tick dots, and the exit/enter pair of ring animations. The
    // session-only arrow is dropped; the status colour fills the whole ring.
    // ------------------------------------------------------------------
    const STATUS_COLOR = {
      pending: 'var(--dsw-alias-label-tertiary,#a39d92)',
      in_progress: 'var(--dsw-alias-brand-primary,#d97757)',
      review: 'var(--dsw-alias-state-warn-primary,#d98e2b)',
      completed: 'hsl(120, 55%, 50%)',
      // Written-off work: the ring goes red so it reads as "stopped", not as a
      // progress state. The two-part exit/enter animation is unchanged.
      abandoned: 'var(--dsw-alias-state-danger-primary,#d8473a)',
    };

    function TaskMarker(props) {
      const color = STATUS_COLOR[props.status] || null;
      const markerState = color || 'idle';
      const firstRender = useRef(true);
      const prevState = useRef(markerState);
      const timers = useRef({ out: 0, in: 0 });
      const [anim, setAnim] = useState({ phase: 'idle', color: markerState });

      useEffect(() => {
        if (firstRender.current) {
          firstRender.current = false;
          prevState.current = markerState;
          const from = props.prevStatus ? (STATUS_COLOR[props.prevStatus] || null) : null;
          if (from && from !== markerState) {
            // The row changed section and remounted; replay the two-part
            // animation the in-place path would have played: old colour exits,
            // new colour enters.
            setAnim({ phase: 'exit', color: from });
            timers.current.out = window.setTimeout(() => {
              setAnim({ phase: 'enter', color: markerState });
              timers.current.in = window.setTimeout(() => {
                setAnim({ phase: 'idle', color: markerState });
              }, 1000);
            }, 1000);
            return;
          }
          // A row that is entering the list plays the same ring fill it would
          // play on a status change; the row itself slides in from the left.
          if (props.enterOnMount === true) {
            setAnim({ phase: 'enter', color: markerState });
            timers.current.in = window.setTimeout(() => {
              setAnim({ phase: 'idle', color: markerState });
            }, 1000);
          }
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
      const spinClass = phase === 'exit' ? 'dstl-marker-exit' : (phase === 'enter' ? 'dstl-marker-enter' : undefined);
      // A foldable parent carries the workspace marker's arrow above the ring.
      // Up while folded, down while open (the 180° turn around the ring centre
      // is the mirror of the up pose), right while hovered. The turn is only
      // the outer layer: the arrow also scales up and squashes on the way, and
      // a small inner notch fades in — the same three-part animation the
      // workspace header uses.
      const arrow = props.arrow === true;
      const open = props.open === true;
      const dotCx = arrow ? 20 : 8;
      const dotCy = arrow ? 15 : 8;
      const outerR = arrow ? 8.75 : 6.2;
      const innerR = arrow ? 5 : 3.6;
      const outerSpan = arrow ? 84 : 78;
      const innerSpan = 63;
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
      const muted = 'var(--dsw-alias-label-tertiary,#a39d92)';
      const accent = 'var(--dsw-alias-brand-primary,#d97757)';
      const outerMutedArc = arcPath(outerR, 225 - outerSpan, 225 + outerSpan);
      const outerAccentArc = arcPath(outerR, 45 - outerSpan, 45 + outerSpan);
      const innerMutedArc = arcPath(innerR, 315 - innerSpan, 315 + innerSpan);
      const innerAccentArc = arcPath(innerR, 135 - innerSpan, 135 + innerSpan);
      const innerDots = [];
      [315 - innerSpan, 315 + innerSpan, 135 - innerSpan, 135 + innerSpan].forEach((deg, index) => {
        const [x, y] = polar(innerR, deg);
        innerDots.push(h('circle', {
          key: 'innerDot' + index,
          cx: p(x),
          cy: p(y),
          r: arrow ? 0.7 : 0.55,
          fill: 'none',
          stroke: displayColor || (index < 2 ? muted : accent),
          strokeWidth: arrow ? 0.45 : 0.4,
        }));
      });
      const arcLen = (r, spanDeg) => (2 * Math.PI * r * spanDeg) / 360;
      const outerArcLen = arcLen(outerR, outerSpan * 2);
      const innerArcLen = arcLen(innerR, innerSpan * 2);
      const sweepStyle = (len) => (phase === 'idle' ? undefined : { '--dstl-arc': len.toFixed(2) + 'px' });
      const sweepClass = phase === 'exit' ? 'dstl-marker-exit-sweep' : (phase === 'enter' ? 'dstl-marker-sweep' : undefined);

      return h('svg', {
        className: props.folding ? 'dstl-marker-folding' : (open ? 'dstl-marker-open' : undefined),
        width: arrow ? 40 : 20,
        height: arrow ? 34 : 20,
        viewBox: arrow ? '0 -2 40 34' : '0 0 16 16',
        'aria-hidden': 'true',
        style: { display: 'block', overflow: 'visible' },
      },
        arrow ? h('g', { className: 'dstl-marker-arrow' },
          h('g', { className: 'dstl-marker-arrow-scale' },
            h('g', { className: 'dstl-marker-arrow-squash' },
              h('path', { d: 'M 20 0 L 16.5 6 L 20 2 L 23.5 6 Z', fill: displayColor || accent })),
            h('path', {
              d: 'M 20 -3.4 L 18.4 -1.2 L 20 -1.7 L 21.6 -1.2 Z',
              fill: displayColor || accent,
              className: 'dstl-marker-arrow-mini',
            }))) : null,
        h('g', {
          className: spinClass,
          key: 'anim-' + phase + '-' + anim.color,
          // The enter/exit spin must turn around the ring centre. The class
          // hard-codes 8px 8px for the small 16×16 viewBox; a parent ring lives
          // in 40×32 around (20,16), so it has to be overridden here or the
          // whole ring swings around the top-left corner.
          style: { transformOrigin: arrow ? '20px 15px' : '8px 8px' },
        },
          h('path', { d: outerMutedArc, fill: 'none', stroke: displayColor || muted, strokeWidth: arrow ? 2.5 : 1.9, strokeLinecap: 'butt', className: sweepClass, style: sweepStyle(outerArcLen) }),
          h('path', { d: outerAccentArc, fill: 'none', stroke: displayColor || accent, strokeWidth: arrow ? 2.5 : 1.9, strokeLinecap: 'butt', className: sweepClass, style: sweepStyle(outerArcLen) }),
          h('path', { d: innerMutedArc, fill: 'none', stroke: displayColor || muted, strokeWidth: arrow ? 1.25 : 1.1, strokeLinecap: 'round', className: sweepClass, style: sweepStyle(innerArcLen) }),
          h('path', { d: innerAccentArc, fill: 'none', stroke: displayColor || accent, strokeWidth: arrow ? 1.25 : 1.1, strokeLinecap: 'round', className: sweepClass, style: sweepStyle(innerArcLen) }),
          ...innerDots));
    }

    // Header progress ring: same geometry as the workspace-frontend ContextRing
    // (14 viewBox rendered at 20px, outer r5.5 track + one arc per percent,
    // inner r3.2 split into two halves), but it reads completion instead of
    // context occupancy. The outer arc grows with progress and shades from pale
    // grey to the ring green; the inner halves reach green at 40% and 80%. No
    // spinning: this ring only grows.
    const RING_GREY = { saturation: 12, lightness: 78 };
    const RING_GREEN = { saturation: 55, lightness: 50 };

    function ringColor(t) {
      const clamped = Math.max(0, Math.min(1, t));
      const saturation = RING_GREY.saturation + (RING_GREEN.saturation - RING_GREY.saturation) * clamped;
      const lightness = RING_GREY.lightness + (RING_GREEN.lightness - RING_GREY.lightness) * clamped;
      return 'hsl(120, ' + saturation.toFixed(1) + '%, ' + lightness.toFixed(1) + '%)';
    }

    function TaskProgressRing(props) {
      const percent = Math.max(0, Math.min(100, Number(props.percent) || 0));
      const cx = 7;
      const cy = 7;
      const radius = 5.5;
      const innerRadius = 3.2;
      const startDeg = -90;
      const gapHalf = 27;
      const polar = (r, deg) => {
        const rad = (deg * Math.PI) / 180;
        return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
      };
      const segments = [];
      const drawn = Math.round(percent);
      for (let i = 0; i < drawn; i += 1) {
        const from = startDeg + (360 * i) / 100;
        const to = startDeg + (360 * (i + 1)) / 100 + 0.06;
        const [sx, sy] = polar(radius, from);
        const [ex, ey] = polar(radius, to);
        segments.push(h('path', {
          key: 'seg' + i,
          d: 'M' + sx.toFixed(2) + ' ' + sy.toFixed(2) + 'A' + radius + ' ' + radius + ' 0 0 1 ' + ex.toFixed(2) + ' ' + ey.toFixed(2),
          fill: 'none',
          stroke: ringColor((i + 0.5) / 100),
          strokeWidth: 1.6,
        }));
      }
      const arc = (sx, sy, ex, ey) => 'M' + sx.toFixed(3) + ' ' + sy.toFixed(3)
        + 'A' + innerRadius + ' ' + innerRadius + ' 0 0 1 ' + ex.toFixed(3) + ' ' + ey.toFixed(3);
      const [leftStartX, leftStartY] = polar(innerRadius, 90 + gapHalf);
      const [leftEndX, leftEndY] = polar(innerRadius, 270 - gapHalf);
      const [rightStartX, rightStartY] = polar(innerRadius, 270 + gapHalf);
      const [rightEndX, rightEndY] = polar(innerRadius, 90 - gapHalf);
      const leftColor = ringColor(percent / 40);
      const rightColor = ringColor(percent / 80);
      return h('span', { className: 'dstl-ring', title: props.title || '' },
        h('svg', { width: 24, height: 24, viewBox: '0 0 14 14', 'aria-hidden': 'true', style: { display: 'block' } },
          h('circle', { cx, cy, r: radius, fill: 'none', stroke: 'var(--dsw-alias-border-l2,#d6d0c6)', strokeWidth: 1.6 }),
          h('g', null, segments),
          h('path', { d: arc(leftStartX, leftStartY, leftEndX, leftEndY), fill: 'none', stroke: leftColor, strokeWidth: 1, strokeLinecap: 'round' }),
          h('path', { d: arc(rightStartX, rightStartY, rightEndX, rightEndY), fill: 'none', stroke: rightColor, strokeWidth: 1, strokeLinecap: 'round' }),
          h('circle', { cx: leftStartX, cy: leftStartY, r: 0.55, fill: 'none', stroke: leftColor, strokeWidth: 0.35 }),
          h('circle', { cx: leftEndX, cy: leftEndY, r: 0.55, fill: 'none', stroke: leftColor, strokeWidth: 0.35 }),
          h('circle', { cx: rightStartX, cy: rightStartY, r: 0.55, fill: 'none', stroke: rightColor, strokeWidth: 0.35 }),
          h('circle', { cx: rightEndX, cy: rightEndY, r: 0.55, fill: 'none', stroke: rightColor, strokeWidth: 0.35 })));
    }

    // ------------------------------------------------------------------
    // rows
    // ------------------------------------------------------------------
    function TaskRow(props) {
      const task = props.task;
      const t = props.t;
      const hasNotes = typeof task.notes === 'string' && task.notes.length > 0;
      const open = props.notesOpen.has(task.id);
      const renaming = props.renaming === true;
      const isHead = props.variant === 'head';
      // Only a section head aggregates its children. A card keeps its own state
      // even when stale data still hangs tasks under it — the two-level list
      // never renders those, and mixing the two would desync ring and section.
      const autoStatus = isHead;
      const isCard = props.variant === 'card';
      // Abandoned and completed rows live in the standing docks: no sections,
      // one flat list. `dockKind` tells the two docks apart (ring behaviour and
      // which menu entries are allowed).
      const abandoned = props.variant === 'abandoned' || task.status === 'abandoned';
      const dockKind = props.dockKind || (abandoned ? 'abandoned' : null);
      // A child the parent dragged into the dock keeps its own status in the
      // store (writing a phase off does not rewrite its subtree), but it has to
      // read as abandoned here — otherwise it shows a green done ring.
      const displayStatus = isHead
        ? deriveStatus(task)
        : dockKind === 'abandoned' ? 'abandoned'
          : dockKind === 'completed' ? deriveStatus(task)
            : task.status;
      const caretOpen = props.collapsedChildren !== true;
      // The fold lives on the status ring itself: a small arrow inside the ring
      // points up while folded, down while open, and right under the pointer.
      // The old caret column is gone.
      const folds = props.hasChildren === true;

      // Four primary actions stay inline; the four low-frequency ones (blocked,
      // focus, notes, rename) live behind "…" so the strip stops covering the
      // title while it is hovered.
      const menuItem = (Icon, label, active, run) => h('button', {
        type: 'button',
        className: 'dstl-menu-item' + (active ? ' dstl-menu-on' : ''),
        role: 'menuitem',
        onClick: (event) => {
          event.stopPropagation();
          props.onCloseMenu();
          run();
        },
      }, h(Icon, { size: 13 }), h('span', { className: 'dstl-menu-label' }, label));

      // Every row except a card carries the action strip; a card now *is* the
      // subtask's only row, so it needs its own actions too. Completed rows get
      // no strip at all: the completed dock adds no extra entries of its own.
      const actions = renaming || dockKind === 'completed' ? null : h('div', { className: 'dstl-row-actions' },
        // A parent row owns the run/pause switch of its own subtasks. One
        // button: Pause while they run, Play while they are paused.
        isHead ? h('button', {
          type: 'button',
          className: 'dstl-icon-btn' + (props.scopePaused ? '' : ' dstl-icon-on'),
          title: props.scopePaused ? t('row.resumeScope') : t('row.pauseScope'),
          'aria-label': props.scopePaused ? t('row.resumeScope') : t('row.pauseScope'),
          onClick: (event) => {
            event.stopPropagation();
            if (props.scopePaused) props.onResumeScope(task.id);
            else props.onPauseScope(task.id);
          },
        }, h(PlayPauseGlyph, { paused: props.scopePaused })) : null,
        // Reordering an abandoned row has no visible effect: the standing area
        // is flat, so the move buttons would be dead ends.
        abandoned || dockKind === 'completed' ? null : h('button', {
          type: 'button',
          className: 'dstl-icon-btn',
          title: t('row.moveUp'),
          'aria-label': t('row.moveUp'),
          disabled: !props.canUp,
          onClick: (event) => {
            event.stopPropagation();
            props.onMoveUp(task.id);
          },
        }, h(IconArrowUp, { size: 13 })),
        abandoned || dockKind === 'completed' ? null : h('button', {
          type: 'button',
          className: 'dstl-icon-btn',
          title: t('row.moveDown'),
          'aria-label': t('row.moveDown'),
          disabled: !props.canDown,
          onClick: (event) => {
            event.stopPropagation();
            props.onMoveDown(task.id);
          },
        }, h(IconArrowDown, { size: 13 })),
        // A card is a subtask: the list stays two levels deep, so it gets no "+".
        // Neither does an abandoned row: written-off work does not grow.
        isCard || abandoned || dockKind === 'completed' ? null : h('button', {
          type: 'button',
          className: 'dstl-icon-btn',
          title: t('panel.createSub'),
          'aria-label': t('panel.createSub'),
          onClick: (event) => {
            event.stopPropagation();
            props.onStartCreate(task.id);
          },
        }, h(IconPlus, { size: 13 })),
        h('button', {
          type: 'button',
          className: 'dstl-icon-btn' + (props.menuOpen ? ' dstl-icon-on' : ''),
          title: t('row.more'),
          'aria-label': t('row.more'),
          'aria-expanded': props.menuOpen === true,
          onClick: (event) => {
            event.stopPropagation();
            props.onToggleMenu(task.id);
          },
        }, h(IconMore, { size: 14 })),
        h('button', {
          type: 'button',
          className: 'dstl-icon-btn' + (props.deletePending ? ' dstl-danger' : ''),
          title: props.deletePending ? t('row.deleteConfirm') : t('row.delete'),
          'aria-label': props.deletePending ? t('row.deleteConfirm') : t('row.delete'),
          onClick: (event) => {
            event.stopPropagation();
            props.onRequestDelete(task.id);
          },
        }, props.deletePending ? h(IconClose, { size: 13 }) : h(IconTrash, { size: 14 })));

      const menu = props.menuOpen ? h('div', { className: 'dstl-menu', role: 'menu' },
        abandoned && task.status === 'abandoned'
          ? menuItem(IconUndo, t('row.restore'), false, () => props.onRestore(task.id))
          : abandoned ? null : menuItem(IconBlock, t('row.abandon'), false, () => props.onAbandon(task.id)),
        task.status === 'abandoned' ? null : menuItem(IconBlock, task.blocked === true ? t('row.unblock') : t('row.block'), task.blocked === true,
          () => props.onToggleBlocked(task.id)),
        menuItem(IconPin, task.focused === true ? t('row.unpin') : t('row.pin'), task.focused === true,
          () => props.onToggleFocus(task.id)),
        menuItem(IconNotes, t('panel.notesEdit'), false, () => props.onStartNotes(task.id)),
        menuItem(IconEdit, t('row.rename'), false, () => props.onStartRename(task.id))) : null;

      const main = renaming
        ? h('div', { className: 'dstl-inline-form' },
          h(InlineInput, {
            value: props.renameDraft,
            placeholder: t('row.renamePlaceholder'),
            onChange: props.onRenameChange,
            onCommit: props.onRenameCommit,
            onCancel: props.onRenameCancel,
          }),
          h('button', { type: 'button', className: 'dstl-btn dstl-primary', onClick: props.onRenameCommit }, t('confirm')),
          h('button', { type: 'button', className: 'dstl-btn', onClick: props.onRenameCancel }, t('cancel')))
        : h('button', {
          type: 'button',
          className: 'dstl-title' + (displayStatus === 'completed' ? ' dstl-title-done' : ''),
          title: hasNotes ? task.notes : task.title,
          onClick: (event) => {
            event.stopPropagation();
            props.onSelect(task.id);
            if (folds) {
              props.onToggleChildren(task.id);
              return;
            }
            if (hasNotes) props.onToggleNotes(task.id);
            else if (!autoStatus && dockKind !== 'completed') props.onCycle(task.id);
          },
        },
          h('span', { className: 'dstl-title-text' }, task.title),
          hasNotes ? h(IconChevron, { size: 12, open, className: 'dstl-caret' }) : null);

      // Dragging a card is the reverse of clicking its status ring: the status
      // sections accept it as a drop target and rewrite the status on drop.
      const dragProps = isCard ? {
        draggable: true,
        onDragStart: (event) => {
          if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', task.id);
          }
          props.onCardDragStart(task.id);
        },
        onDragEnd: () => props.onCardDragEnd(),
      } : {};
      // Cards render beside their section, not inside it, so a card has to
      // forward the same drop handlers and stand in for the section it lives in.
      const dropProps = isCard ? {
        onDragOver: props.onRowDragOver,
        onDragLeave: props.onRowDragLeave,
        onDrop: props.onRowDrop,
      } : {};

      const row = h('div', {
        className: 'dstl-row'
          + (isHead ? ' dstl-row-head' : '')
          + (isCard ? ' dstl-row-card' : '')
          + (abandoned ? (props.depth === 2 ? ' dstl-abandoned-sub' : ' dstl-abandoned-root') : '')
          + (props.selected ? ' dstl-selected' : '')
          + (renaming ? ' dstl-renaming' : '')
          + (task.paused === true ? ' dstl-paused' : '')
          + (props.dragActive ? ' dstl-dragging' : ''),
        'data-task-id': task.id,
        ref: props.rowRef,
        // The whole row is the fold handle for a parent; a subtask row only
        // selects itself.
        onClick: () => {
          props.onSelect(task.id);
          if (folds) props.onToggleChildren(task.id);
        },
        ...dragProps,
        ...dropProps,
      },
        h('span', { className: 'dstl-status-slot' },
          h('button', {
            type: 'button',
            className: 'dstl-status' + (abandoned ? ' dstl-status-abandoned' : ''),
            title: folds
              ? (abandoned ? t('status.abandoned') : t('status.derived')) + ' · ' + (caretOpen ? t('row.collapse') : t('row.expand'))
              : abandoned ? t('status.abandoned') + (task.status === 'abandoned' ? ' · ' + t('row.restore') : '')
                : t('status.' + task.status) + ' · ' + t('status.cycle'),
            'aria-label': folds
              ? (abandoned ? t('status.abandoned') : t('status.derived')) + ' · ' + (caretOpen ? t('row.collapse') : t('row.expand'))
              : abandoned ? t('status.abandoned') + (task.status === 'abandoned' ? ' · ' + t('row.restore') : '')
                : t('status.' + task.status),
            'aria-expanded': folds ? caretOpen : undefined,
            onClick: (event) => {
              event.stopPropagation();
              props.onSelect(task.id);
              if (folds) props.onToggleChildren(task.id);
              else if (abandoned) {
                // Only a root written off on its own can be restored; a child
                // the parent dragged into the dock has no state of its own.
                if (task.status === 'abandoned') props.onRestore(task.id);
              } else if (dockKind !== 'completed') props.onCycle(task.id);
            },
          }, h(TaskMarker, {
            status: displayStatus,
            arrow: folds,
            open: caretOpen,
            folding: props.folding === true,
            enterOnMount: props.entering === true,
            prevStatus: props.prevStatus,
          })),
          task.blocked === true ? h('span', { className: 'dstl-block-dot', 'aria-hidden': 'true' }) : null),
        task.focused === true ? h('span', { className: 'dstl-focus-mark', title: t('row.unpin'), 'aria-hidden': 'true' }, h(IconPin, { size: 11 })) : null,
        task.externalUpdateAt ? h('span', { className: 'dstl-external', title: t('notice.external'), 'aria-hidden': 'true' }) : null,
        main,
        isHead ? h('span', { className: 'dstl-group-count' }, props.childCount) : null,
        actions);

      const notesBlock = (() => {
        // A section head is a container, not a row with notes of its own.
        if (!open || renaming || isHead) return null;
        if (props.notesEditing === true) {
          return h('div', { className: 'dstl-notes-edit' },
            h('textarea', {
              className: 'dstl-textarea',
              value: props.notesDraft,
              placeholder: t('panel.notesPlaceholder'),
              rows: 3,
              onChange: (event) => props.onNotesChange(event.target.value),
              onKeyDown: (event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  props.onNotesCancel();
                } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  props.onNotesCommit();
                }
              },
            }),
            h('div', { className: 'dstl-notes-actions' },
              h('button', { type: 'button', className: 'dstl-btn dstl-primary', onClick: props.onNotesCommit }, t('panel.notesSave')),
              h('button', { type: 'button', className: 'dstl-btn', onClick: props.onNotesCancel }, t('cancel'))));
        }
        return h('div', { className: 'dstl-notes' },
          h('p', { className: 'dstl-notes-text' }, task.notes || ''),
          h('button', {
            type: 'button',
            className: 'dstl-notes-edit-btn',
            title: t('panel.notesEdit'),
            'aria-label': t('panel.notesEdit'),
            onClick: (event) => {
              event.stopPropagation();
              props.onStartNotes(task.id);
            },
          }, h(IconEdit, { size: 12 })));
      })();

      return h('div', {
        className: 'dstl-item' + (isHead ? ' dstl-item-head' : '')
          + (props.menuOpen ? ' dstl-menu-open' : '')
          + (props.entering ? ' dstl-item-in' : ''),
        role: 'listitem',
        style: props.depth > 0 ? { paddingLeft: 18 * props.depth } : undefined,
      }, row, menu, notesBlock);
    }

    // One status section under an expanded task container; the task card
    // renders inside the section that matches its current status. The section
    // is also the drop target when the card is dragged to another status.
    function StatusSection(props) {
      const t = props.t;
      return h('div', {
        className: 'dstl-status-section'
          + (props.empty === true ? ' dstl-status-section-empty' : ''),
        style: { paddingLeft: 18 * props.depth + 6 },
        role: 'group',
        'aria-label': t('status.' + props.status),
        onDragOver: props.onDragOver,
        onDragLeave: props.onDragLeave,
        onDrop: props.onDrop,
      },
        h('span', { className: 'dstl-status-section-name' }, t('status.' + props.status)));
    }

    // ------------------------------------------------------------------
    // panel
    // ------------------------------------------------------------------
    function findHostBody() {
      if (typeof document === 'undefined') return null;
      // The conversation body always carries this attribute, welcome screen
      // included; the scroll-body probe below is only a fallback for hosts
      // that have not tagged it.
      const tagged = document.querySelector('[data-conversation-content]');
      if (tagged !== null && tagged.isConnected) return tagged;
      const centerCol = document.querySelector('[class*="_centerCol"]');
      if (centerCol !== null) {
        const scroll = centerCol.querySelector('[class*="_scrollBody"]');
        if (scroll && scroll.parentElement) {
          let node = scroll.parentElement;
          for (let depth = 0; node && depth < 3; depth += 1) {
            if (node.querySelector('[class*="_composerSeat"]')) return node;
            node = node.parentElement;
          }
        }
        // Welcome screens are rendered by the skin and have no conversation
        // body: the centre column itself hosts the floating panel.
        return centerCol;
      }
      return null;
    }

    function TaskPanelHost(props) {
      const t = bindText(props && props.t);
      const sessionId = props && props.sessionId ? String(props.sessionId) : '';
      const [tasks, setTasks] = useState([]);
      const [loaded, setLoaded] = useState(false);
      const [notice, setNotice] = useState('');
      const [notesOpen, setNotesOpen] = useState(() => new Set());
      const [hostBody, setHostBody] = useState(null);
      const [composerHeight, setComposerHeight] = useState(96);
      const [selectedId, setSelectedId] = useState(null);
      const [collapsedParents, setCollapsedParents] = useState({});
      // Both docks start folded to their title row. The abandoned one is the
      // resting dock (always visible); the completed one waits until the pointer
      // reaches the bottom strip.
      const [abandonedCollapsed, setAbandonedCollapsed] = useState(true);
      const [abandonedFolding, setAbandonedFolding] = useState(false);
      const [abandonedEntering, setAbandonedEntering] = useState(false);
      // The completed dock stays out of the way until the pointer reaches the
      // bottom docks; a click pins it open and folds the abandoned body down to
      // its title row, so only one dock body is expanded at a time.
      const [completedHover, setCompletedHover] = useState(false);
      const [completedOpen, setCompletedOpen] = useState(false);
      const [completedEntering, setCompletedEntering] = useState(false);
      const completedEnterTimer = useRef(0);
      const abandonedBodyRef = useRef(null);
      const abandonedTimer = useRef(0);
      const abandonedEnterTimer = useRef(0);
      const [dragTaskId, setDragTaskId] = useState(null);
      const [dropTarget, setDropTarget] = useState(null);
      const [renamingId, setRenamingId] = useState(null);
      const [renameDraft, setRenameDraft] = useState('');
      const [pendingDeleteId, setPendingDeleteId] = useState(null);
      const [panelWidth, setPanelWidth] = useState(readStoredWidth);
      const [resizing, setResizing] = useState(false);
      const [creating, setCreating] = useState(null);
      const [createDraft, setCreateDraft] = useState('');
      const [notesEditingId, setNotesEditingId] = useState(null);
      const [notesDraft, setNotesDraft] = useState('');
      const [menuOpenId, setMenuOpenId] = useState(null);
      const [entering, setEntering] = useState(() => new Set());
      // The parent whose sections just opened: its status rows and cards slide
      // in from the left, while every other row glides vertically via FLIP.
      const [expandedSection, setExpandedSection] = useState(null);
      // The parent whose sections are closing: its rows stay mounted for one
      // beat playing the entrance animation in reverse, then the fold lands and
      // the squeezed rows FLIP upward.
      // The parent whose sections are closing: its caret flips immediately while
      // the boxes shrink away, so the arrow never lags behind the click.
      const [pendingFold, setPendingFold] = useState(null);
      const collapseTimer = useRef(0);
      const expandTimer = useRef(0);
      const widthRef = useRef(panelWidth);
      const listRef = useRef(null);
      const resizeStart = useRef(null);
      const applyRef = useRef(null);
      const cardRefs = useRef(new Map());
      const flipRects = useRef(new Map());
      // Record every card box before a render that can move cards, so the FLIP
      // layout effect can glide them from where they were. Ring clicks, drops
      // and agent writes adopted by the poll all go through here.
      const snapshotRects = () => {
        const rects = new Map();
        for (const [taskId, node] of cardRefs.current) {
          if (node && node.isConnected) rects.set(taskId, node.getBoundingClientRect());
        }
        flipRects.current = rects;
      };
      const dragTaskIdRef = useRef(null);
      const dragLeaveTimer = useRef(0);
      // Event handlers need the list as it is right now: the optimistic update
      // and its rollback both read it, and a closure would see a stale copy.
      const tasksRef = useRef(tasks);
      tasksRef.current = tasks;
      // `updatedAt` of the copy on screen, and whether a local write is in
      // flight. The poll below only adopts a newer Host stamp and never races
      // an optimistic write.
      const lastSyncRef = useRef(0);
      const writingRef = useRef(false);
      // Ids the panel has already shown; a fresh page primes them so only rows
      // that appear afterwards animate in.
      const primedRef = useRef(false);
      const seenIdsRef = useRef(new Set());
      // Status each task had on the previous render. A card moves into another
      // section box when its status changes, so React remounts it; the ring
      // needs the old state to replay the exit half of its animation.
      const prevStatusRef = useRef(new Map());

      // Load the session's list once per session; the Host list is the truth,
      // so a failed write rolls back to whatever it last sent.
      useEffect(() => {
        if (!sessionId) {
          setLoaded(true);
          setNotice(t('notice.noSession'));
          return undefined;
        }
        let alive = true;
        setLoaded(false);
        readList(sessionId).then((body) => {
          if (!alive) return;
          setTasks(toTree(body.tasks));
          lastSyncRef.current = stampOf(body);
          setLoaded(true);
          setNotice(body.corrupt === true ? t('notice.corrupt') : '');
        }).catch((error) => {
          if (!alive) return;
          setLoaded(true);
          setNotice(errorText(error));
        });
        return () => {
          alive = false;
        };
      }, [sessionId]);

      // One write path: paint the optimistic tree, send the op, then adopt the
      // list the Host returns. A rejection restores the pre-op copy. The box
      // snapshot happens here so every write path — ring click, drag, delete,
      // rename, create — can glide cards instead of jumping them.
      const runOp = (optimistic, op) => {
        if (!sessionId) return;
        const before = tasksRef.current;
        snapshotRects();
        if (optimistic) setTasks(optimistic(before));
        writingRef.current = true;
        sendOp(sessionId, op).then((body) => {
          setTasks(toTree(body.tasks));
          lastSyncRef.current = stampOf(body);
          setNotice('');
        }).catch((error) => {
          setTasks(before);
          setNotice(errorText(error));
        }).finally(() => {
          writingRef.current = false;
        });
      };

      // Agent writes land in the Host store, not in this React tree, so the
      // panel polls the session file and adopts it when the stamp moves. The
      // poll pauses while the tab is hidden, while a local write is in flight,
      // and while a row is mid-edit (a swap there would eat the draft).
      useEffect(() => {
        if (!sessionId) return undefined;
        let alive = true;
        const tick = () => {
          if (!alive || document.visibilityState === 'hidden') return;
          if (writingRef.current) return;
          if (notesEditingId !== null || creating !== null || renamingId !== null) return;
          readList(sessionId).then((body) => {
            if (!alive) return;
            const stamp = stampOf(body);
            if (stamp === lastSyncRef.current) return;
            snapshotRects();
            setTasks(toTree(body.tasks));
            lastSyncRef.current = stamp;
            setNotice(body.corrupt === true ? t('notice.corrupt') : '');
          }).catch(() => {
            /* a failed poll keeps the list that is on screen */
          });
        };
        const timer = window.setInterval(tick, 1500);
        const onVisible = () => {
          if (document.visibilityState === 'visible') tick();
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
          alive = false;
          window.clearInterval(timer);
          document.removeEventListener('visibilitychange', onVisible);
        };
      }, [sessionId, notesEditingId, creating, renamingId]);

      // Rows that appear after the first paint slide in from the left and play
      // the ring fill. The first load only records what it showed, so opening
      // the page does not animate the whole list; agent writes picked up by the
      // poll count as new rows and do animate.
      useEffect(() => {
        if (!loaded) return undefined;
        const ids = collectTaskIds(tasks, []);
        if (!primedRef.current) {
          primedRef.current = true;
          seenIdsRef.current = new Set(ids);
          return undefined;
        }
        const fresh = ids.filter((id) => !seenIdsRef.current.has(id));
        if (fresh.length === 0) return undefined;
        for (const id of fresh) seenIdsRef.current.add(id);
        setEntering(new Set(fresh));
        const timer = window.setTimeout(() => setEntering(new Set()), 420);
        return () => window.clearTimeout(timer);
      }, [tasks, loaded]);

      // The "…" menu closes on any click outside itself and on Escape. Menu
      // items stop propagation, so their own click is not swallowed here.
      useEffect(() => {
        if (menuOpenId === null) return undefined;
        const close = () => setMenuOpenId(null);
        document.addEventListener('click', close);
        document.addEventListener('keydown', close);
        return () => {
          document.removeEventListener('click', close);
          document.removeEventListener('keydown', close);
        };
      }, [menuOpenId]);

      // Track the live conversation body: the panel must follow session switches
      // and disappear when the conversation unmounts.
      useEffect(() => {
        if (typeof document === 'undefined') return undefined;
        let frame = 0;
        let disposed = false;
        const sync = () => {
          if (disposed) return;
          const next = findHostBody();
          setHostBody((previous) => (previous === next ? previous : next));
        };
        const schedule = () => {
          if (frame !== 0) return;
          frame = requestAnimationFrame(() => {
            frame = 0;
            sync();
          });
        };
        sync();
        const observer = new MutationObserver(schedule);
        observer.observe(document.body, { childList: true, subtree: true });
        return () => {
          disposed = true;
          observer.disconnect();
          if (frame !== 0) cancelAnimationFrame(frame);
        };
      }, []);

      // The panel is absolutely positioned inside its host. The centre column is
      // a flex child with `position: static`, so when it hosts the welcome-screen
      // panel it needs a containing block of its own.
      useEffect(() => {
        if (!hostBody) return undefined;
        if (window.getComputedStyle(hostBody).position !== 'static') return undefined;
        const before = hostBody.style.position;
        hostBody.style.position = 'relative';
        return () => {
          hostBody.style.position = before;
        };
      }, [hostBody]);

      // Measure the composer seat so the panel stops above it.
      useEffect(() => {
        if (!hostBody) return undefined;
        const composer = hostBody.querySelector('[class*="_composerSeat"]');
        const measure = () => {
          if (!hostBody.isConnected) {
            setHostBody(null);
            return;
          }
          if (composer) setComposerHeight(composer.getBoundingClientRect().height || 96);
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(hostBody);
        if (composer) observer.observe(composer);
        return () => observer.disconnect();
      }, [hostBody]);

      // Layout rule: with the right bar open the conversation sits in the band
      // between this panel and that bar — one gap after the panel, one gap
      // before the right bar, and the content width follows the leftover space.
      // With the right bar closed the host's default layout comes back, so the
      // panel floats over the conversation instead of squeezing it.
      useEffect(() => {
        if (!hostBody) return undefined;
        const view = hostBody.querySelector('[class*="_viewArea"]');
        if (!view) return undefined;
        let seat = hostBody.querySelector('[class*="_composerSeat"]');
        const beforeLeft = view.style.paddingLeft;
        const beforeRight = view.style.paddingRight;
        const beforeWidth = view.style.getPropertyValue('--dsh-chat-content-width');
        const beforeSeatLeft = seat ? seat.style.paddingLeft : '';
        const beforeSeatRight = seat ? seat.style.paddingRight : '';
        const beforeSeatWidth = seat ? seat.style.getPropertyValue('--dsh-chat-content-width') : '';
        const restore = () => {
          view.style.paddingLeft = beforeLeft;
          view.style.paddingRight = beforeRight;
          if (beforeWidth) view.style.setProperty('--dsh-chat-content-width', beforeWidth);
          else view.style.removeProperty('--dsh-chat-content-width');
          if (!seat) seat = hostBody.querySelector('[class*="_composerSeat"]');
          if (seat) {
            seat.style.paddingLeft = beforeSeatLeft;
            seat.style.paddingRight = beforeSeatRight;
            if (beforeSeatWidth) seat.style.setProperty('--dsh-chat-content-width', beforeSeatWidth);
            else seat.style.removeProperty('--dsh-chat-content-width');
          }
          const rail = document.querySelector('.dsh-claude-turn-rail');
          if (rail) rail.style.transform = '';
        };
        // The host wraps the composer card in its own padded column, so the card
        // starts a little right of the text column. Measure both and cancel the
        // difference on the seat instead of hard-coding the host's padding.
        const alignComposer = (left) => {
          if (!seat) return;
          const column = view.querySelector('[class*="_column"]') || view.firstElementChild;
          const card = hostBody.querySelector('[data-composer-card]') || hostBody.querySelector('[class*="_composerCard"]');
          if (!column || !card) return;
          const delta = Math.round(column.getBoundingClientRect().left - card.getBoundingClientRect().left);
          if (delta !== 0) seat.style.paddingLeft = (left + delta) + 'px';
        };
        // The skin docks its turn rail against the column it was built for; with
        // the column moved, push the rail back out to the right bar.
        const alignRail = () => {
          const rail = document.querySelector('.dsh-claude-turn-rail');
          if (!rail) return;
          rail.style.transform = '';
          const bar = document.querySelector('[data-rightbar-col]') || document.querySelector('[class*="_rightbarCol"]');
          if (bar === null || !bar.isConnected || bar.getBoundingClientRect().width <= 1) return;
          const dx = Math.round(bar.getBoundingClientRect().left - 12 - rail.getBoundingClientRect().right);
          if (Math.abs(dx) >= 1) rail.style.transform = 'translateY(-50%) translateX(' + dx + 'px)';
        };
        const rightbarOpen = () => {
          const bar = document.querySelector('[data-rightbar-col]') || document.querySelector('[class*="_rightbarCol"]');
          return bar !== null && bar.isConnected && bar.getBoundingClientRect().width > 1;
        };
        const apply = () => {
          if (!view.isConnected) {
            setHostBody(null);
            return;
          }
          if (!rightbarOpen()) {
            restore();
            return;
          }
          // The view area carries the padding for the text column; the sticky
          // composer seat needs the same three properties of its own, or the
          // composer keeps the host's default centring and slides under the
          // panel.
          const left = PANEL_GAP + widthRef.current + PANEL_GAP;
          const content = Math.max(1, Math.round(view.clientWidth - left - PANEL_GAP));
          view.style.paddingLeft = left + 'px';
          view.style.paddingRight = PANEL_GAP + 'px';
          view.style.setProperty('--dsh-chat-content-width', content + 'px');
          if (!seat) seat = hostBody.querySelector('[class*="_composerSeat"]');
          if (seat) {
            seat.style.paddingLeft = left + 'px';
            seat.style.paddingRight = PANEL_GAP + 'px';
            seat.style.setProperty('--dsh-chat-content-width', content + 'px');
          }
          alignComposer(left);
          alignRail();
        };
        applyRef.current = apply;
        apply();
        // The centre column resizes when the right bar opens or closes and when
        // the sidebar is dragged; the view area follows it, so one observer on
        // the view keeps the band exact. Our own padding cannot feed back into
        // this: it changes the content box but converges on the second pass.
        const observer = new ResizeObserver(apply);
        observer.observe(view);
        return () => {
          observer.disconnect();
          applyRef.current = null;
          restore();
        };
      }, [hostBody]);

      // Dragging the panel edge changes its width without rebuilding the
      // observer above; the gap is recomputed from the live width ref instead.
      useEffect(() => {
        if (applyRef.current) applyRef.current();
      }, [panelWidth]);

      // FLIP for the card animation: `cycle` recorded the old boxes, React has
      // already moved the card into its new section, so play from the old box.
      // Folding and unfolding a phase also snapshots first, which is what makes
      // the squeezed rows glide vertically instead of jumping.
      useLayoutEffect(() => {
        const before = flipRects.current;
        if (before.size === 0) return;
        flipRects.current = new Map();
        for (const [taskId, rect] of before) {
          const node = cardRefs.current.get(taskId);
          if (!node || !node.isConnected) continue;
          const next = node.getBoundingClientRect();
          const dx = rect.left - next.left;
          const dy = rect.top - next.top;
          if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
          if (typeof node.animate !== 'function') continue;
          node.animate(
            [{ transform: 'translate(' + dx.toFixed(1) + 'px, ' + dy.toFixed(1) + 'px)' }, { transform: 'translate(0, 0)' }],
            { duration: 240, easing: 'cubic-bezier(.2,.8,.2,1)' },
          );
        }
      }, [tasks, collapsedParents, completedOpen, abandonedCollapsed]);

      // Remember the statuses on screen so the next render can tell a card that
      // changed section (remounted) from one that simply appeared.
      useEffect(() => {
        const map = new Map();
        for (const task of collectTasks(tasks, [])) map.set(task.id, task.status);
        prevStatusRef.current = map;
      }, [tasks]);

      // A drag that ends outside any status section (or over the browser chrome)
      // still has to clear the drag state; the section handlers cannot see it.
      useEffect(() => {
        const reset = () => {
          dragTaskIdRef.current = null;
          setDragTaskId(null);
          setDropTarget(null);
          if (dragLeaveTimer.current) {
            window.clearTimeout(dragLeaveTimer.current);
            dragLeaveTimer.current = 0;
          }
        };
        document.addEventListener('dragend', reset);
        document.addEventListener('drop', reset);
        return () => {
          document.removeEventListener('dragend', reset);
          document.removeEventListener('drop', reset);
        };
      }, []);

      if (!createPortal || !hostBody) return null;

      const total = countTasks(tasks);
      const done = countDone(tasks);
      // How many tasks were explicitly written off. A written-off parent may
      // list its children under it, so this stays the authored count, not the
      // number of rows.
      const abandonedCount = collectTasks(tasks, []).filter((task) => task.status === 'abandoned').length;
      // On the welcome screen the composer sits in the middle of the page, so
      // measuring it would leave the panel a stub; the home panel runs full
      // height instead.
      const heroMode = props && props.heroMode === true;
      const bottom = heroMode ? PANEL_GAP : Math.round(composerHeight) + PANEL_GAP;

      // Measuring the card boxes before a status change lets the card glide to
      // its new section instead of jumping. `runOp` takes the snapshot; this
      // path only decides the next state.
      const cycle = (id) => {
        const target = findTask(tasksRef.current, id);
        // An abandoned task has left the progress ladder: its ring restores it
        // instead of cycling through states it no longer belongs to.
        if (target && target.status === 'abandoned') {
          restore(id);
          return;
        }
        // A top-level section head folds instead of cycling: Enter and the row
        // click both go through here.
        const isSectionHead = target
          && (target.parentId === null || target.parentId === undefined)
          && (target.children || []).length > 0;
        if (!target) return;
        if (isSectionHead) {
          toggleChildren(id);
          return;
        }
        const index = STATUS_ORDER.indexOf(target.status);
        const next = STATUS_ORDER[(index + 1) % STATUS_ORDER.length];
        runOp((previous) => cycleStatus(previous, id), { op: 'status', id, status: next });
      };
      const abandon = (id) => {
        const target = findTask(tasksRef.current, id);
        if (!target || target.status === 'abandoned') return;
        runOp((previous) => abandonTask(previous, id), { op: 'status', id, status: 'abandoned' });
      };
      // Restore writes the state the task had before it was written off; the
      // Host keeps the same value in `abandonedFrom`.
      const restore = (id) => {
        const target = findTask(tasksRef.current, id);
        if (!target || target.status !== 'abandoned') return;
        const status = target.abandonedFrom || 'pending';
        // A fold made inside the dock must not follow the task back into the
        // live list, where it would come back collapsed.
        setCollapsedParents((previous) => {
          if (previous[id] === undefined) return previous;
          const next = { ...previous };
          delete next[id];
          return next;
        });
        runOp((previous) => restoreTask(previous, id), { op: 'status', id, status });
      };
      const toggleNotes = (id) => setNotesOpen((previous) => {
        const next = new Set(previous);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      const select = (id) => {
        setSelectedId(id);
        // Clicking anywhere else gives up a pending delete confirmation, the
        // same way the workspace browser drops its pending group delete.
        if (pendingDeleteId !== null && pendingDeleteId !== id) setPendingDeleteId(null);
        if (listRef.current) listRef.current.focus();
      };
      // Collapse state is tri-state: an id absent from the map means "follow the
      // default" (finished phases start closed), true/false is the user's
      // explicit choice.
      //
      // Opening a phase records every box first (so the rows it pushes can FLIP),
      // then slides the section boxes in from the left the way a brand-new task
      // does. Closing has to move the rows below at the same time: the boxes
      // animate their own height down to zero, so the list closes the gap
      // smoothly instead of waiting for the fold.
      const sectionBoxes = (id) => Array.prototype.filter.call(
        document.querySelectorAll('.dstl-section-box, .dstl-abandoned-kids'),
        (node) => node.dataset.sectionOwner === id,
      );
      const collapseBoxes = (id) => {
        for (const node of sectionBoxes(id)) {
          // `height:0` alone leaves padding, border and margin standing (the box
          // is content-box), which is the 14px that used to pop when the node
          // unmounted. Collapse all four so the space goes away continuously.
          node.style.height = node.offsetHeight + 'px';
          node.style.overflow = 'hidden';
          void node.offsetHeight;
          node.style.height = '0px';
          node.style.paddingTop = '0px';
          node.style.paddingBottom = '0px';
          node.style.paddingLeft = '0px';
          node.style.paddingRight = '0px';
          node.style.marginTop = '0px';
          node.style.marginBottom = '0px';
          node.style.borderWidth = '0px';
          node.style.opacity = '0';
          node.style.transform = 'translateX(-16px)';
        }
      };
      const restoreBoxes = (id) => {
        for (const node of sectionBoxes(id)) {
          node.style.height = '';
          node.style.overflow = '';
          node.style.padding = '';
          node.style.margin = '';
          node.style.borderWidth = '';
          node.style.opacity = '';
          node.style.transform = '';
        }
      };
      const toggleChildren = (id) => {
        const task = findTask(tasksRef.current, id);
        const current = collapsedParents[id] !== undefined
          ? collapsedParents[id] === true
          // A written-off parent starts open: it is not a finished phase.
          : task !== null && task.status !== 'abandoned' && deriveStatus(task) === 'completed';
        window.clearTimeout(collapseTimer.current);
        window.clearTimeout(expandTimer.current);
        if (current === true) {
          // Expand: the caret flips immediately with the layout.
          setPendingFold(null);
          restoreBoxes(id);
          snapshotRects();
          setCollapsedParents((previous) => ({ ...previous, [id]: false }));
          setExpandedSection(id);
          expandTimer.current = window.setTimeout(() => setExpandedSection(null), 420);
          return;
        }
        // Collapse: flip the caret now, shrink the boxes out from under it, and
        // unmount them once the height transition has taken the space away.
        setPendingFold(id);
        setExpandedSection(null);
        collapseBoxes(id);
        collapseTimer.current = window.setTimeout(() => {
          setCollapsedParents((previous) => ({ ...previous, [id]: true }));
          setPendingFold(null);
        }, 260);
      };

      const startRename = (id) => {
        const siblings = siblingsOf(tasks, id);
        const target = siblings ? siblings.find((task) => task.id === id) : null;
        if (!target) return;
        setSelectedId(id);
        setRenamingId(id);
        setRenameDraft(target.title);
        setPendingDeleteId(null);
      };
      const cancelRename = () => {
        setRenamingId(null);
        setRenameDraft('');
      };
      const commitRename = () => {
        if (renamingId === null) return;
        const target = renamingId;
        const text = renameDraft.trim();
        setRenamingId(null);
        setRenameDraft('');
        if (text === '') return;
        runOp((previous) => renameTask(previous, target, text), { op: 'update', id: target, patch: { title: text } });
      };
      const requestDelete = (id) => {
        if (pendingDeleteId !== id) {
          setPendingDeleteId(id);
          return;
        }
        setPendingDeleteId(null);
        if (selectedId === id) setSelectedId(null);
        if (renamingId === id) cancelRename();
        runOp((previous) => removeFromTree(previous, id), { op: 'delete', id });
      };

      const onToggleBlocked = (id) => {
        const target = findTask(tasksRef.current, id);
        if (!target) return;
        const blocked = target.blocked !== true;
        // A parent that owns subtasks blocks them along with itself.
        const scope = (target.children || []).length > 0 ? 'subtree' : 'task';
        runOp((previous) => setBlockedLocal(previous, id, blocked, scope), { op: 'block', id, blocked, scope });
      };
      const onToggleFocus = (id) => {
        const target = findTask(tasksRef.current, id);
        if (!target) return;
        runOp((previous) => toggleFocus(previous, id), { op: 'focus', id: target.focused === true ? null : id });
      };
      // Create flow: the header "+" makes a top-level task, a row's "+" makes a
      // child of that row. The draft row renders at the top of the list, then the
      // Host list replaces the optimistic node.
      const startCreate = (parentId) => {
        setCreating({ parentId: parentId || null });
        setCreateDraft('');
        setRenamingId(null);
        setPendingDeleteId(null);
      };
      const cancelCreate = () => {
        setCreating(null);
        setCreateDraft('');
      };
      const commitCreate = () => {
        if (!creating) return;
        const title = createDraft.trim();
        const parentId = creating.parentId;
        cancelCreate();
        if (title === '') return;
        runOp(
          (previous) => insertLocal(previous, {
            id: 'draft-' + Date.now().toString(36),
            title,
            notes: '',
            priority: 'medium',
            status: 'pending',
            blocked: false,
            focused: false,
            order: 1e9,
            children: [],
          }, parentId),
          { op: 'create', input: { title, parentId } },
        );
        if (parentId) setCollapsedParents((previous) => ({ ...previous, [parentId]: false }));
      };

      const startNotes = (id) => {
        const target = findTask(tasksRef.current, id);
        setSelectedId(id);
        setNotesEditingId(id);
        setNotesDraft(target ? target.notes || '' : '');
        setNotesOpen((previous) => new Set(previous).add(id));
      };
      const cancelNotes = () => {
        setNotesEditingId(null);
        setNotesDraft('');
      };
      const commitNotes = () => {
        if (notesEditingId === null) return;
        const id = notesEditingId;
        const notes = notesDraft;
        setNotesEditingId(null);
        setNotesDraft('');
        runOp(
          (previous) => mapRows(previous, (task) => (task.id === id ? { ...task, notes } : task)),
          { op: 'update', id, patch: { notes } },
        );
      };

      // Drag-and-drop: the card follows the pointer, a status section under it
      // highlights, and dropping rewrites the status. The card then glides into
      // the new section through the same FLIP path as the ring click.
      const finishDrag = () => {
        dragTaskIdRef.current = null;
        setDragTaskId(null);
        if (dragLeaveTimer.current) {
          window.clearTimeout(dragLeaveTimer.current);
          dragLeaveTimer.current = 0;
        }
        setDropTarget(null);
      };

      const onCardDragStart = (id) => {
        dragTaskIdRef.current = id;
        setDragTaskId(id);
        setSelectedId(id);
      };

      const onCardDragEnd = () => {
        finishDrag();
      };

      // A status section belongs to the parent task, so it accepts any of that
      // parent's children — not only a card whose id equals the section owner.
      const childOf = (parentId, childId) => {
        const parent = findTask(tasksRef.current, parentId);
        return Boolean(parent) && (parent.children || []).some((child) => child.id === childId);
      };

      const onStatusDragOver = (event, parentId, status) => {
        const draggedId = dragTaskIdRef.current;
        if (!draggedId || !childOf(parentId, draggedId)) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        if (dragLeaveTimer.current) {
          window.clearTimeout(dragLeaveTimer.current);
          dragLeaveTimer.current = 0;
        }
        setDropTarget((previous) => (
          previous && previous.parentId === parentId && previous.status === status
            ? previous
            : { parentId, status }
        ));
      };

      const onStatusDragLeave = (event, parentId, status) => {
        if (!dropTarget || dropTarget.parentId !== parentId || dropTarget.status !== status) return;
        if (dragLeaveTimer.current) window.clearTimeout(dragLeaveTimer.current);
        dragLeaveTimer.current = window.setTimeout(() => {
          dragLeaveTimer.current = 0;
          setDropTarget(null);
        }, 60);
      };

      const onStatusDrop = (event, parentId, status) => {
        const draggedId = dragTaskIdRef.current;
        if (!draggedId || !childOf(parentId, draggedId)) return;
        event.preventDefault();
        finishDrag();
        const dragged = findTask(tasksRef.current, draggedId);
        if (!dragged || dragged.status === status) return;
        runOp((previous) => setTaskStatus(previous, draggedId, status), { op: 'status', id: draggedId, status });
      };

      // `abandoned` is the standing area's flat list; it is part of the keyboard
      // order and the FLIP snapshots, so it rides along with `rows`.
      const { rows, abandoned, completed } = buildList(tasks, collapsedParents);
      const visibleRows = rows.filter((row) => row.kind !== 'status')
        .concat(abandoned.filter((row) => row.depth === 1
          || collapsedParents[row.task.parentId] !== true
          || pendingFold === row.task.parentId));
      const globalPaused = collectTasks(tasks, []).some((task) => task.paused === true && task.status !== 'completed');

      const onListKeyDown = (event) => {
        if (selectedId === null) return;
        const index = visibleRows.findIndex((row) => row.task.id === selectedId);
        if (index < 0) return;
        if (event.key === 'ArrowDown') {
          if (index < visibleRows.length - 1) {
            event.preventDefault();
            setSelectedId(visibleRows[index + 1].task.id);
          }
        } else if (event.key === 'ArrowUp') {
          if (index > 0) {
            event.preventDefault();
            setSelectedId(visibleRows[index - 1].task.id);
          }
        } else if (event.key === 'Enter') {
          event.preventDefault();
          cycle(selectedId);
        } else if (event.key === 'Delete' || event.key === 'Backspace') {
          event.preventDefault();
          const target = selectedId;
          setSelectedId(null);
          runOp((previous) => removeFromTree(previous, target), { op: 'delete', id: target });
        } else if (event.key === 'Escape') {
          event.preventDefault();
          setSelectedId(null);
        }
      };

      // Width drag: pointer capture keeps the move events on the handle even
      // when the pointer leaves it; the ref carries the live width so the
      // padding effect does not have to rebuild its observer per frame.
      const onResizeDown = (event) => {
        if (typeof event.button === 'number' && event.button !== 0) return;
        event.preventDefault();
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch (error) {
          /* pointer capture may be refused; the move handler still runs */
        }
        resizeStart.current = { pointerId: event.pointerId, x: event.clientX, width: widthRef.current };
        setResizing(true);
      };

      const onResizeMove = (event) => {
        const start = resizeStart.current;
        if (!start || start.pointerId !== event.pointerId) return;
        const next = clampWidth(start.width + (event.clientX - start.x));
        if (next === widthRef.current) return;
        widthRef.current = next;
        setPanelWidth(next);
      };

      const onResizeEnd = (event) => {
        const start = resizeStart.current;
        if (!start || start.pointerId !== event.pointerId) return;
        resizeStart.current = null;
        setResizing(false);
        try {
          event.currentTarget.releasePointerCapture(event.pointerId);
        } catch (error) {
          /* already released */
        }
        storeWidth(widthRef.current);
      };

      const renderRow = (row) => {
        if (row.kind === 'status') {
          return h(StatusSection, {
            key: 'status:' + row.task.id + ':' + row.status,
            status: row.status,
            depth: row.depth,
            empty: row.count === 0,
            t,
            onDragOver: (event) => onStatusDragOver(event, row.ownerId, row.status),
            onDragLeave: (event) => onStatusDragLeave(event, row.ownerId, row.status),
            onDrop: (event) => onStatusDrop(event, row.ownerId, row.status),
          });
        }
        // Abandoned and completed rows share the dock look (indent, no action
        // strip); `dockKind` is what actually tells their rings apart.
        const variant = row.kind === 'head' ? 'head'
          : row.kind === 'card' ? 'card'
            : row.kind === 'row' ? 'row' : 'abandoned';
        const dockKind = row.kind === 'abandoned' ? 'abandoned'
          : row.kind === 'completed' ? 'completed' : undefined;
        return h(TaskRow, {
          key: row.kind + ':' + row.task.id,
          task: row.task,
          depth: row.depth,
          variant,
          dockKind,
          childCount: row.childCount,
          hasChildren: row.hasChildren,
          entering: (row.kind === 'abandoned' || row.kind === 'completed') && row.depth === 2
            ? true
            : entering.has(row.task.id),
          // The status this card had last render, so a remount across section
          // boxes can replay the ring animation instead of snapping in.
          prevStatus: prevStatusRef.current.get(row.task.id),
          scopePaused: row.kind === 'head'
            ? collectTasks(row.task.children || [], []).some((child) => child.paused === true && child.status !== 'completed')
            : false,
          onPauseScope: (id) => runOp(
            (previous) => setPausedLocal(previous, 'subtree', id, true),
            { op: 'pause', scope: 'subtree', id, paused: true },
          ),
          onResumeScope: (id) => runOp(
            (previous) => setPausedLocal(previous, 'subtree', id, false),
            { op: 'pause', scope: 'subtree', id, paused: false },
          ),
          collapsedChildren: row.collapsed === true || pendingFold === row.task.id,
          folding: pendingFold === row.task.id,
          selected: selectedId === row.task.id,
          renaming: renamingId === row.task.id,
          renameDraft,
          canUp: canMove(tasks, row.task.id, -1),
          canDown: canMove(tasks, row.task.id, 1),
          deletePending: pendingDeleteId === row.task.id,
          dragActive: dragTaskId === row.task.id,
          onCardDragStart,
          onCardDragEnd,
          // A card is its own drop target for the section it sits in; dropping
          // on the card means the same status the section row would accept.
          onRowDragOver: variant === 'card' ? (event) => onStatusDragOver(event, row.ownerId, row.task.status) : undefined,
          onRowDragLeave: variant === 'card' ? (event) => onStatusDragLeave(event, row.ownerId, row.task.status) : undefined,
          onRowDrop: variant === 'card' ? (event) => onStatusDrop(event, row.ownerId, row.task.status) : undefined,
          // Every row (head, top-level, card) registers its box: folding a phase
          // pushes the rows below it, and FLIP has to glide those too, not just
          // the cards.
          rowRef: (node) => {
            if (node) cardRefs.current.set(row.task.id, node);
            else cardRefs.current.delete(row.task.id);
          },
          t,
          notesOpen,
          onSelect: select,
          onCycle: cycle,
          onAbandon: abandon,
          onRestore: restore,
          onToggleNotes: toggleNotes,
          onToggleChildren: toggleChildren,
          onToggleBlocked,
          onToggleFocus,
          onStartNotes: startNotes,
          onStartCreate: startCreate,
          menuOpen: menuOpenId === row.task.id,
          onToggleMenu: (id) => setMenuOpenId((previous) => (previous === id ? null : id)),
          onCloseMenu: () => setMenuOpenId(null),
          notesEditing: notesEditingId === row.task.id,
          notesDraft,
          onNotesChange: setNotesDraft,
          onNotesCommit: commitNotes,
          onNotesCancel: cancelNotes,
          onMoveUp: (id) => runOp((previous) => moveTask(previous, id, -1), { op: 'move', id, direction: 'up' }),
          onMoveDown: (id) => runOp((previous) => moveTask(previous, id, 1), { op: 'move', id, direction: 'down' }),
          onStartRename: startRename,
          onRenameChange: setRenameDraft,
          onRenameCommit: commitRename,
          onRenameCancel: cancelRename,
          onRequestDelete: requestDelete,
        });
      };

      // The docks keep one flat list for keyboard order, but a docked parent
      // renders its direct children inside a box, so the fold can animate the
      // height the way a live section box does. Both docks use the same classes
      // on purpose: they follow exactly the same folding rules.
      const renderDockRows = (list) => {
        const kidsByParent = new Map();
        for (const row of list) {
          if (row.depth !== 2) continue;
          const parentId = row.task.parentId;
          if (!kidsByParent.has(parentId)) kidsByParent.set(parentId, []);
          kidsByParent.get(parentId).push(row);
        }
        return list
          .filter((row) => row.depth === 1)
          .map((row) => {
            const kids = kidsByParent.get(row.task.id) || [];
            if (kids.length === 0) return renderRow(row);
            const folded = row.collapsed === true && pendingFold !== row.task.id;
            return h('div', { key: 'dock-group:' + row.task.id, className: 'dstl-abandoned-group' },
              renderRow(row),
              folded ? null : h('div', {
                className: 'dstl-abandoned-kids',
                'data-section-owner': row.task.id,
              }, kids.map(renderRow)));
          });
      };

      // A status section owns the cards below it in `rows`, so the render groups
      // them into one box: the section name and its cards read as a single block
      // instead of one frame per row. `rows` itself stays flat for the keyboard
      // order and the FLIP snapshots.
      const rowNodes = [];
      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        if (row.kind !== 'status') {
          rowNodes.push(renderRow(row));
          continue;
        }
        const group = [renderRow(row)];
        let next = index + 1;
        while (next < rows.length && rows[next].kind === 'card') {
          group.push(renderRow(rows[next]));
          next += 1;
        }
        index = next - 1;
        const boxActive = dropTarget !== null
          && dropTarget.parentId === row.ownerId
          && dropTarget.status === row.status;
        // The section box is the thing that slides: the name row and every card
        // inside it ride along, so the background frame is never left behind.
        const boxAnim = expandedSection === row.ownerId ? ' dstl-item-in' : '';
        rowNodes.push(h('div', {
          key: 'box:' + row.ownerId + ':' + row.status,
          'data-section-owner': row.ownerId,
          className: 'dstl-section-box'
            + (row.count === 0 ? ' dstl-section-box-empty' : '')
            + (boxActive ? ' dstl-section-box-drop' : '')
            + boxAnim,
        }, group));
      }

      const createRow = creating ? h('div', { className: 'dstl-item dstl-create' },
        h('div', { className: 'dstl-row dstl-row-create' },
          h('span', { className: 'dstl-status-slot dstl-create-slot', 'aria-hidden': 'true' }, h(IconPlus, { size: 13 })),
          h('div', { className: 'dstl-inline-form' },
            h(InlineInput, {
              value: createDraft,
              placeholder: (creating.parentId ? t('panel.createSub') : t('panel.create')) + ' · ' + t('notice.createHint'),
              onChange: setCreateDraft,
              onCommit: commitCreate,
              onCancel: cancelCreate,
            })))) : null;

      const listBody = rowNodes.length === 0 && loaded
        ? h('div', { className: 'dstl-empty' },
          h('span', { className: 'dstl-empty-title' }, t('notice.empty')),
          h('span', { className: 'dstl-empty-hint' }, t('notice.emptyHint')))
        : rowNodes;

      // The standing "abandoned" dock sits outside the scrolling list: normal
      // tasks scroll under it and never cover it. Its header copies a section
      // head (caret + red ring + title + count), so the dock folds exactly like
      // a parent task and a long tail of written-off work stays out of the way.
      // Folding the dock mirrors the section boxes: the body measures itself,
      // shrinks to zero (rows ride up with it), and only unmounts after the
      // height transition. Expanding slides the rows in from the left.
      const toggleAbandoned = () => {
        // Snapshot before the switch so the completed dock and the live rows it
        // was squeezing glide instead of jumping.
        snapshotRects();
        window.clearTimeout(abandonedTimer.current);
        window.clearTimeout(abandonedEnterTimer.current);
        if (abandonedCollapsed === true) {
          const node = abandonedBodyRef.current;
          if (node) {
            node.style.height = '';
            node.style.overflow = '';
            node.style.opacity = '';
            node.style.transform = '';
          }
          setAbandonedCollapsed(false);
          setAbandonedEntering(true);
          // The two docks swap: opening the abandoned body closes the completed
          // one, so only one body is ever expanded. The closed one stays put
          // until the pointer leaves the dock strip.
          setCompletedOpen(false);
          abandonedEnterTimer.current = window.setTimeout(() => setAbandonedEntering(false), 420);
          return;
        }
        const node = abandonedBodyRef.current;
        if (node) {
          node.style.height = node.offsetHeight + 'px';
          node.style.overflow = 'hidden';
          void node.offsetHeight;
          node.style.height = '0px';
          node.style.opacity = '0';
          node.style.transform = 'translateX(-16px)';
        }
        setAbandonedFolding(true);
        abandonedTimer.current = window.setTimeout(() => {
          setAbandonedCollapsed(true);
          setAbandonedFolding(false);
        }, 260);
      };

      const toggleCompleted = () => {
        // Snapshot before the switch so the dock that slides away (and the rows
        // it was squeezing) glides instead of jumping.
        snapshotRects();
        if (completedOpen) {
          setCompletedOpen(false);
          return;
        }
        setCompletedOpen(true);
        // Only one dock can be expanded: expanding this one folds the other, so
        // the one that slides back on hover always returns as a closed header.
        // It stays visible while the pointer is still inside the dock strip and
        // only slides away on mouseleave.
        setAbandonedCollapsed(true);
        setCompletedEntering(true);
        window.clearTimeout(completedEnterTimer.current);
        completedEnterTimer.current = window.setTimeout(() => setCompletedEntering(false), 420);
        // Only one dock owns the bottom strip: the abandoned dock slides away
        // (see the `dstl-abandoned-hidden` class) without touching its own fold.
      };

      // The completed dock reads exactly like the abandoned one — same rows,
      // same fold, same subtree hand-over — minus the counter and the empty
      // hint. It sits above the abandoned dock and only slides out when the
      // pointer is inside the bottom dock area; a click pins it open.
      const completedDock = h('div', {
        className: 'dstl-complete-dock'
          + (completedHover || completedOpen ? ' dstl-complete-revealed' : '')
          + (completedOpen ? ' dstl-complete-open' : ''),
      },
        h('div', {
          className: 'dstl-row dstl-row-head dstl-abandoned-head',
          onClick: toggleCompleted,
        },
          h('span', { className: 'dstl-status-slot' },
            h('button', {
              type: 'button',
              className: 'dstl-status',
              title: t('section.completed') + ' · ' + (completedOpen ? t('row.collapse') : t('row.expand')),
              'aria-label': t('section.completed') + ' · ' + (completedOpen ? t('row.collapse') : t('row.expand')),
              'aria-expanded': completedOpen,
              onClick: (event) => {
                event.stopPropagation();
                toggleCompleted();
              },
            }, h(TaskMarker, {
              status: 'completed',
              arrow: true,
              open: completedOpen,
            }))),
          h('button', {
            type: 'button',
            className: 'dstl-abandoned-name',
            onClick: (event) => {
              event.stopPropagation();
              toggleCompleted();
            },
          }, h('span', { className: 'dstl-title-text' }, t('section.completed')))),
        completedOpen
          ? h('div', {
            className: 'dstl-complete-body' + (completedEntering ? ' dstl-item-in' : ''),
          }, renderDockRows(completed))
          : null);

      const abandonedDock = h('div', {
        className: 'dstl-abandoned-dock'
          + (abandoned.length === 0 ? ' dstl-abandoned-dock-empty' : '')
          + (completedOpen && !completedHover ? ' dstl-abandoned-hidden' : ''),
      },
        h('div', {
          className: 'dstl-row dstl-row-head dstl-abandoned-head',
          onClick: toggleAbandoned,
        },
          h('span', { className: 'dstl-status-slot' },
            h('button', {
              type: 'button',
              className: 'dstl-status',
              title: t('section.abandoned') + ' · ' + (abandonedCollapsed ? t('row.expand') : t('row.collapse')),
              'aria-label': t('section.abandoned') + ' · ' + (abandonedCollapsed ? t('row.expand') : t('row.collapse')),
              'aria-expanded': abandonedCollapsed !== true,
              onClick: (event) => {
                event.stopPropagation();
                toggleAbandoned();
              },
            }, h(TaskMarker, {
              status: 'abandoned',
              arrow: true,
              open: abandonedCollapsed !== true,
              folding: abandonedFolding,
            }))),
          h('button', {
            type: 'button',
            className: 'dstl-abandoned-name',
            onClick: (event) => {
              event.stopPropagation();
              toggleAbandoned();
            },
          }, h('span', { className: 'dstl-title-text' }, t('section.abandoned'))),
          h('span', { className: 'dstl-group-count' }, abandonedCount)),
        abandoned.length === 0
          ? h('div', { className: 'dstl-abandoned-hint' }, t('section.abandonedEmpty'))
          : (abandonedCollapsed === true
            ? null
            : h('div', {
              className: 'dstl-abandoned-body' + (abandonedEntering ? ' dstl-item-in' : ''),
              ref: abandonedBodyRef,
            }, renderDockRows(abandoned))));

      // One hover area for both docks: moving from the abandoned title row up
      // to the completed title row must not blink the completed dock away.
      const docks = h('div', {
        className: 'dstl-docks',
        onMouseEnter: () => setCompletedHover(true),
        onMouseLeave: () => setCompletedHover(false),
      }, completedDock, abandonedDock);

      return createPortal(h('section', {
        className: 'dstl-panel',
        role: 'complementary',
        'aria-label': t('panel.title'),
        style: { top: PANEL_TOP, bottom, width: panelWidth, userSelect: resizing ? 'none' : undefined },
      },
        h('header', { className: 'dstl-head' },
          h(TaskProgressRing, {
            percent: total > 0 ? (done / total) * 100 : 0,
            title: t('panel.progress', { done, total }),
          }),
          h('span', { className: 'dstl-head-title' }, t('panel.title')),
          h('button', {
            type: 'button',
            className: 'dstl-icon-btn' + (globalPaused ? '' : ' dstl-icon-on'),
            title: globalPaused ? t('panel.resume') : t('panel.pause'),
            'aria-label': globalPaused ? t('panel.resume') : t('panel.pause'),
            onClick: () => runOp(
              (previous) => setPausedLocal(previous, 'all', null, !globalPaused),
              { op: 'pause', scope: 'all', paused: !globalPaused },
            ),
          }, h(PlayPauseGlyph, { paused: globalPaused })),
          h('button', {
            type: 'button',
            className: 'dstl-icon-btn',
            title: heroMode ? t('notice.noSession') : t('panel.create'),
            'aria-label': heroMode ? t('notice.noSession') : t('panel.create'),
            disabled: heroMode || undefined,
            onClick: () => startCreate(null),
          }, h(IconPlus, { size: 14 }))),
        h('div', {
          className: 'dstl-list',
          role: 'list',
          tabIndex: 0,
          ref: listRef,
          onKeyDown: onListKeyDown,
        }, createRow, listBody),
        docks,
        h('footer', { className: 'dstl-foot' },
          h('span', {
            className: 'dstl-foot-dot' + (notice ? ' dstl-foot-dot-error' : ''),
            'aria-hidden': 'true',
          }),
          h('span', { className: 'dstl-foot-text', title: notice || t('panel.footer') },
            notice || (loaded ? t('panel.footer') : t('notice.loading')))),
        h('div', {
          className: 'dstl-resizer',
          'data-dragging': resizing || undefined,
          title: t('panel.resize'),
          onPointerDown: onResizeDown,
          onPointerMove: onResizeMove,
          onPointerUp: onResizeEnd,
          onPointerCancel: onResizeEnd,
          onLostPointerCapture: onResizeEnd,
        })),
      hostBody);
    }

    // ------------------------------------------------------------------
    // home screen bridge
    // ------------------------------------------------------------------
    // The welcome screen is rendered by the skin, and the session-scoped
    // `conversation.input.dock` slot does not exist before the first message:
    // this bridge mounts the same panel on the home page and steps aside the
    // moment a real dock appears.
    function HeroTaskPanel(props) {
      const [onHome, setOnHome] = useState(false);
      useEffect(() => {
        if (typeof document === 'undefined') return undefined;
        const check = () => {
          // The skin tags its welcome screen; without that marker the bridge
          // stays off, so settings and other routes never get a stray panel.
          const home = document.querySelector('[data-dsh-claude-home-hero]');
          const dock = document.querySelector('[data-slot="conversation.input.dock"]');
          setOnHome(home !== null && dock === null);
        };
        check();
        const observer = new MutationObserver(check);
        observer.observe(document.body, { childList: true, subtree: true, attributes: true });
        return () => observer.disconnect();
      }, []);
      return onHome ? h(TaskPanelHost, { ...props, heroMode: true }) : null;
    }

    // ------------------------------------------------------------------
    // plugin body
    // ------------------------------------------------------------------
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'task-list: dictionaries');
      ctx.effect(() => {
        const style = installStyles();
        return () => {
          if (style && style.parentNode) style.parentNode.removeChild(style);
        };
      }, 'task-list: styles');

      ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
        name: 'conversation.input.dock',
        id: 'task-list.panel',
        order: 10,
        locale: NS,
      }, TaskPanelHost));

      // Root-level bridge for the welcome screen (see HeroTaskPanel).
      ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay',
        id: 'task-list.home',
        order: 10,
        locale: NS,
      }, HeroTaskPanel));
    }

    return {
      inject: ['slots', 'locale'],
      apply,
    };
  },
});