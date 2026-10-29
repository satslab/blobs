# Blobs

Blobs is an open-source fork of [T3 Code](https://github.com/pingdotgg/t3code) for running coding agents through a local web app or desktop app.

It supports Claude Code, Codex, Cursor, Grok Build, OpenCode, and Google Antigravity, with persistent bots, memory, routines, and Discord integration.

Website: [blobs.satslab.xyz](https://blobs.satslab.xyz).

## Installation

Install and authenticate at least one supported coding provider before starting Blobs. Provider setup is covered in the [user guides](./docs/README.md).

### Desktop

Download the app for your platform from [GitHub Releases](https://github.com/satslab/blobs/releases):

- macOS: `.dmg`
- Windows: `.exe`
- Linux: `.deb` or `.AppImage`

### Command line

The install scripts download the self-contained CLI from GitHub Releases. Node.js is not required.

macOS or Linux:

```sh
curl -fsSL https://blobs.satslab.xyz/install.sh | sh
```

Windows PowerShell:

```powershell
irm https://blobs.satslab.xyz/install.ps1 | iex
```

Run `blobs` to start the server and open the local web app. Use `blobs service install` to run it in the background, `blobs update` to update it, and `blobs --help` for command options.

npm publishing is paused. Use the GitHub release downloads or install scripts above.

Blobs uses an existing `~/.t3` data directory, or `~/.blobs` when `~/.t3` is absent.
Set `BLOBS_HOME` or pass `--base-dir` to choose another directory.

## Some notes

We are very very early in this project. Expect bugs.

We are (mostly) not accepting contributions yet. Small fixes may be considered. Big features will not be.

## Documentation

Full docs live in [docs/](./docs). There's no docs site yet.

- [FAQ](./docs/user/faq.md)
- [Install and first run](./docs/user/install.md)
- [Permission modes](./docs/user/permission-modes.md)
- [Keyboard shortcuts](./docs/user/keybindings.md)
- [Project settings](./docs/user/project-settings.md)
- [Appearance preferences](./docs/user/appearance.md)
- [Remote access from a phone or another machine](./docs/user/remote-access.md)
- [Connect Claude Code, Codex, ChatGPT and other agents over MCP](./docs/user/outside-agents.md)
- [Keeping app and server in sync](./docs/user/updating.md)
- [Source control integrations](./docs/user/source-control.md)
- Multiple accounts: [Codex](./docs/user/providers-codex.md) · [Claude](./docs/user/providers-claude.md)
- [Run Blobs as a background service](./docs/user/background-service.md)

Building from source? Start at [docs/internals/overview.md](./docs/internals/overview.md).

## If you REALLY want to contribute still.... read this first

### Install `vp`

Blobs uses Vite+ so you'll need to install the global `vp` command-line tool.

#### macOS / Linux

```bash
curl -fsSL https://vite.plus | bash
```

#### Windows

```bash
irm https://vite.plus/ps1 | iex
```

Checkout their getting started guide for more information: https://viteplus.dev/guide/

### Install dependencies

```bash
vp i
```

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before reporting a bug or opening a PR.
