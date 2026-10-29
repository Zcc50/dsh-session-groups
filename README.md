# Workspace Frontend for DeepSeek Harness

Rebuilds the left sidebar of DeepSeek Harness into a grouped **workspace → group → session** browser, and repaints every session row.

DeepSeek Harness / 工作区美化：把左侧栏重做成「工作区 → 分组 → 会话」，并让会话行显示状态、上下文与花费。

## Features

### Grouped sidebar

- The plugin shadows the shipped `sidebar.workspaces` (`priority: -1`) with its own browser: workspaces, then user-defined groups, then sessions. Sessions in no group stay in an **Ungrouped** section at the end of each workspace; sessions in no workspace at all appear in a **No workspace** section.
- Group actions, revealed on hover: new session, move up, move down, change colour (8-colour palette), rename (inline), delete (two-click confirm).
- **A session started from a group's `+` lands in that group**; a collapsed group is expanded first.
- Sessions drag between groups and across workspaces. Same-workspace drops rewrite the group assignment; cross-workspace drops are recorded as a display-level move (Host workspace membership is untouched).
- Manual order: `↑`/`↓` on a group reorders groups, `↑`/`↓` on a session reorders it inside its group. A group ordered by hand stops auto-sorting by time.
- Workspace actions: add workspace (native directory picker), delete workspace (two-click confirm). Deletion removes the Host registration only — sessions and files stay on disk, their rows fall into **No workspace**.

### Session rows

- Whole-row click opens the session.
- Leading ring: blue = a question awaits you, yellow = approval / plan review pending, green = finished while unread. Colour changes play a 1 s exit plus 1 s enter sweep.
- Context ring: green → red gradient by context usage, spins while the session runs; warns once at 20 % and again at 40 %.
- Clock icon when the session has an active scheduled task.
- Per-session cost and relative last-activity time; group and workspace headers show sums.
- Row menu: open, rename, move to group…, archive / unarchive, copy session ID.

### Layout

Resize handles on both sidebar boundaries (a thin line plus a rounded pull tab); drag to resize. Limits come from the Host: left 264–420 px, right up to 70 % of the viewport.

## Install

Client-only plugin bundle — no dependencies, no build step.

```sh
# point the harness plugin manager at this directory
plugin_manager install_bundle  target: <absolute path to this directory>
```

Then refresh the page (`Ctrl+R`). The sidebar is rebuilt immediately and the **Workspace** entry appears in the sidebar icon column.

Group data is local to the browser: `localStorage['dsh.session-groups.v1']` (`sections`, `assignments`, `moves`, `orders`). Nothing is written to the session log.

## Compatibility

Built and verified against DeepSeek Harness 0.2.1-rc.3.

Extension points used:

- Slots: `sidebar.workspaces` (shadowed, `priority: -1`), `sidebar.panellist`, `main`, `sidebar.workspaces.session.menu.item`, `sidebar.session.row.leading`, `sidebar.session.row.hover`, `shell.overlay`
- Hooks: `useWorkspaces`, `useSessions`, `useSessionStatus` (`pendingInteraction.kind`, `completionUnread`), `usePanelInfo`
- Services: `uiWorkspace` (`openSession`, `openWorkspace` + `beforeOpen`, `startSession`, `archiveSession`, `unarchiveSession`, `pickDirectory`), `workspaces.create` / `.delete`, `sessions.using` / `.refreshProjections`, `layout.selectPanel`, `remote.schedule.catalog`
- Theme: `--dsw-alias-*` tokens only, each with a fallback colour. Skins that style the shipped browser by DOM class do not reach this list; token-level theming does.

Session cost is read from `GET /dsh-claude-style/session-cost?id=<sessionId>`, provided by the `dsh-claude-style` skin (`cny` in units of 1e-6 yuan). Without that skin the cost column shows `—`.

## Limitations

- Session order is plugin-local; the Host's own list order is never rewritten.
- No content search in the browser, no workspace nesting, no drag reordering of groups (use `↑`/`↓`).
- The shipped row menu and hover card are not reused; this plugin renders its own.
- **No workspace** may also list subagent sessions if the Host reports them in the session snapshot.

## License

MIT
