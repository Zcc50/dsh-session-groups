# Session Groups for DeepSeek Harness

Split one workspace into custom **session groups**, so unrelated projects living in the same workspace stay apart.

DeepSeek Harness / 会话分组：把同一个工作区里的会话拆成自定义分组，让互不相关的项目各自归位。

## Features

- **Sidebar groups** — the sidebar session list becomes `workspace → group → session`. Sessions are grouped by hand, not by folder, so several projects can share one workspace.
- **Panel entry** — a "Session groups" entry in the left sidebar opens a management board: pick a workspace, create/rename/reorder/delete groups, and move sessions between them.
- **Session menu** — each session row's "…" menu offers *Open*, *Rename*, *Move to group…*, *Archive/Unarchive*, and *Copy session ID*.
- **Automatic default workspace title** — a stored `default-workspace` title renders as a localized "Default workspace".
- **Local-only data** — group definitions and assignments live in the browser's `localStorage` (`dsh.session-groups.v1`), keyed by workspace. Nothing is written to the session log.

## Install

This bundle is a Client-only DeepSeek Harness plugin. It has no runtime dependencies and needs no build step.

```sh
# clone or download this repository, then point the harness plugin manager at the directory
plugin_manager install_bundle  target: <absolute path to this directory>
```

Or paste the absolute path into a DSH session and ask the agent to install it. Restart / refresh the page afterwards. The sidebar entry appears under the sidebar's global panel icons.

## Compatibility

Built and verified against DeepSeek Harness 0.2.1-rc.3.

It relies on these public extension points:

- Client slots: `sidebar.panellist`, `main`, `sidebar.workspaces` (shadowing, `priority: -1`), `sidebar.workspaces.session.menu.item`, `sidebar.session.row.leading`, `sidebar.session.row.hover`, `shell.overlay`
- Standard hooks: `useWorkspaces` (`sessionIds`, `archivedSessionIds`, `pinnedSessionIds`), `useSessions` (`byId`, `retainedBy.mainView`)
- Services: `ctx.uiWorkspace` (`openSession`, `startSession`, `archiveSession`, `unarchiveSession`, `pickDirectory`), `ctx.workspaces.create`, `ctx.layout.selectPanel`, `ctx.sessions.using`

Theme colours come from `--dsw-alias-*` tokens, so the plugin follows any installed skin (including `dsh-claude-style`) for palette-level customisation. Skins that target the shipped browser's DOM classes do not reach the custom sidebar list.

## Limitations

- No drag-and-drop ordering, no hover detail cards, no content search, no workspace-tree nesting.
- Session menu is the five built-in actions above; pin and fork are not exposed yet.
- One blank session (the current one) is shown; archived sessions are hidden unless toggled.

## Data migration

Groups are stored per browser, per workspace:

```js
// export (Console)
copy(localStorage.getItem('dsh.session-groups.v1'))
// import (Console, then reload)
localStorage.setItem('dsh.session-groups.v1', `paste JSON here`);
location.reload();
```

## License

MIT
