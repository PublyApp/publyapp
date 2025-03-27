# PFV Vite App

An API for converting HTML to PDF.

## Requirements

- Node.js 22 | recommended: install node with a version manager:
  - [fnm](https://github.com/Schniz/fnm) (cross-platform)
  - [nvm](https://github.com/nvm-sh/nvm) (mac/Linux only)
  - [nvm-windows](https://github.com/coreybutler/nvm-windows) (available for windows)
- pnpm: once node is installed, run: `npm install -g pnpm`
- mongodb: [Install MongoDB Community Edition](https://www.mongodb.com/docs/manual/administration/install-community/)

## Installation

```bash
pnpm install
```

## Usage

open two terminals, and run each command in a separate terminal:

```bash
# run in the first terminal
pnpm dev:server

# run in the second terminal
pnpm dev:front
```

Now open your browser and go to `http://localhost:6181` to see the app.
