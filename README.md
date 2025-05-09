# PFV Vite App

An API for converting HTML to PDF.

## Requirements

- Install bun: [Installation guide](https://bun.sh/docs/installation)

## Installation

```bash
bun install
```

## Usage

open two terminals, and run each command in a separate terminal:

```bash
# run in the first terminal
bun run dev:server

# run in the second terminal
bun run dev:front
```

### Debugging while developing (server only)

run `pnpm dev:server --inspect` then use the VS Code debugger: **Attach by WebSocket URL** configuration and you are good to set breakpoints in the code

Now open your browser and go to `http://localhost:6181` to see the app.

## Hosting

At the time of writing, we host on Hostinger VPS with a dokploy installation.

We may consider the following hosting options once hostinger plans are terminated:

- [Netcup](https://www.netcup.com/en/server/vps)
- Google Cloud Run
