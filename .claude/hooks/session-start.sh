#!/bin/bash
# SessionStart hook for Claude Code cloud sessions only: installs what the
# repo's gates need (dotnet SDK, just, Docker daemon, node and NuGet deps) so
# `just ci`, `just test-api` and the front checks run without manual setup.
# Idempotent: every step checks before acting. Local machines are untouched.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
	exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}"

log() { echo "[session-start] $*" >&2; }

# .NET SDK: global.json pins 10.0.1xx with rollForward latestPatch. The
# dot.net installer host is not reachable from cloud sessions; the Ubuntu
# archive package is (10.0.1xx band, so it satisfies the pin).
if ! command -v dotnet >/dev/null 2>&1; then
	log "installing dotnet-sdk-10.0 (apt)"
	export DEBIAN_FRONTEND=noninteractive
	apt-get update -qq
	apt-get install -y -qq dotnet-sdk-10.0 >/dev/null
fi

# just: the justfile needs a recent just (the apt package is too old to parse
# it), so use the npm-distributed binary.
if ! just --list >/dev/null 2>&1; then
	log "installing just (npm rust-just)"
	if dpkg -s just >/dev/null 2>&1; then
		apt-get remove -y -qq just >/dev/null || true
	fi
	npm install -g rust-just >/dev/null 2>&1
	hash -r
fi

# Docker daemon: Testcontainers (API tests) needs it; cloud containers ship the
# client but do not start the daemon.
if command -v dockerd >/dev/null 2>&1 && ! docker info >/dev/null 2>&1; then
	log "starting dockerd"
	nohup dockerd >/tmp/dockerd.log 2>&1 &
	for _ in $(seq 1 30); do
		docker info >/dev/null 2>&1 && break
		sleep 1
	done
	docker info >/dev/null 2>&1 || log "WARNING: dockerd did not come up (see /tmp/dockerd.log)"
fi

# Local env file the API loads in Development (gitignored).
if [ ! -f .env.development ] && [ -f .env.example ]; then
	log "creating .env.development from .env.example"
	cp .env.example .env.development
fi

# Node workspace deps (also wires the versioned git hooks via `prepare`).
log "pnpm install"
pnpm install --prefer-offline >/dev/null

# NuGet packages and local dotnet tools (Kiota, etc.).
log "dotnet restore + tool restore"
dotnet tool restore >/dev/null
dotnet restore apps/api/Tests/PublyApp.Api.Tests.csproj >/dev/null

log "done"
