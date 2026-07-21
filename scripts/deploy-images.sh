#!/usr/bin/env bash

set -euo pipefail
IFS=$'\n\t'

usage() {
	cat <<'EOF'
Usage: scripts/deploy-images.sh [--no-push] [--dry-run] [REF]

Build the API, migrator, and front-2 deploy images from a pristine archive of REF.

Arguments:
  REF        Git ref to build (default: origin/develop)

Options:
  --no-push  Build images locally without checking GHCR auth or pushing
  --dry-run  Print the commands that would run without changing anything
  -h, --help Show this help

Environment:
  DEPLOY_IMAGES_NO_PUSH=1  Same as --no-push
EOF
}

progress() {
	printf '==> %s\n' "$1"
}

REF="origin/develop"
REF_SET=0
NO_PUSH=0
DRY_RUN=0

if [[ "${DEPLOY_IMAGES_NO_PUSH:-0}" == "1" ]]; then
	NO_PUSH=1
fi

for arg in "$@"; do
	case "$arg" in
		--no-push)
			NO_PUSH=1
			;;
		--dry-run)
			DRY_RUN=1
			;;
		-h | --help)
			usage
			exit 0
			;;
		--*)
			printf 'Unknown option: %s\n' "$arg" >&2
			usage >&2
			exit 2
			;;
		*)
			if [[ "$REF_SET" == "1" ]]; then
				printf 'Only one git ref may be provided.\n' >&2
				usage >&2
				exit 2
			fi
			REF="$arg"
			REF_SET=1
			;;
	esac
done

if ! SHA="$(git rev-parse "$REF")"; then
	printf 'Could not resolve git ref: %s\n' "$REF" >&2
	exit 1
fi

if [[ ! "$SHA" =~ ^[0-9a-fA-F]{40}$ ]]; then
	printf 'Git ref %s did not resolve to a full 40-character SHA: %s\n' "$REF" "$SHA" >&2
	exit 1
fi

IMG="ghcr.io/radandevist/publyapp"
progress "Resolved $REF to $SHA"

if [[ "$DRY_RUN" == "1" ]]; then
	progress 'docker buildx version'
	progress "TMP=\"\$(mktemp -d)\""
	progress "git archive --format=tar \"$SHA\" | tar -x -C \"\$TMP\""
	progress "docker buildx build --load --platform linux/amd64 -f \"\$TMP/apps/api/Dockerfile\" --target runtime -t $IMG/api:$SHA \"\$TMP\""
	progress "docker buildx build --load --platform linux/amd64 -f \"\$TMP/apps/api/Dockerfile\" --target migrate -t $IMG/migrate:$SHA \"\$TMP\""
	progress "docker buildx build --load --platform linux/amd64 -f \"\$TMP/apps/front-2/Dockerfile\" -t $IMG/front-2:$SHA \"\$TMP\""
	if [[ "$NO_PUSH" == "0" ]]; then
		progress "docker push $IMG/api:$SHA"
		progress "docker push $IMG/migrate:$SHA"
		progress "docker push $IMG/front-2:$SHA"
	fi
	printf 'RELEASE_TAG=%s\n' "$SHA"
	printf 'Next: set RELEASE_TAG in Dokploy -> Environment, then redeploy.\n'
	exit 0
fi

progress "Checking Docker Buildx"
if ! docker buildx version >/dev/null 2>&1; then
	printf 'Docker Buildx is required. Ensure Docker is running and buildx is installed.\n' >&2
	exit 1
fi

if [[ "$NO_PUSH" == "0" ]]; then
	DOCKER_CONFIG_DIR="${DOCKER_CONFIG:-$HOME/.docker}"
	if [[ ! -f "$DOCKER_CONFIG_DIR/config.json" ]] || \
		! grep -q 'ghcr.io' "$DOCKER_CONFIG_DIR/config.json"; then
		printf 'Not logged into GHCR. Run: docker login ghcr.io -u radandevist\n' >&2
		exit 1
	fi
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

progress "Exporting pristine source from $SHA"
git archive --format=tar "$SHA" | tar -x -C "$TMP"

progress "Building API runtime image"
docker buildx build --load --platform linux/amd64 \
	-f "$TMP/apps/api/Dockerfile" \
	--target runtime \
	-t "$IMG/api:$SHA" \
	"$TMP"

progress "Building API migrate image"
docker buildx build --load --platform linux/amd64 \
	-f "$TMP/apps/api/Dockerfile" \
	--target migrate \
	-t "$IMG/migrate:$SHA" \
	"$TMP"

progress "Building front-2 image"
docker buildx build --load --platform linux/amd64 \
	-f "$TMP/apps/front-2/Dockerfile" \
	-t "$IMG/front-2:$SHA" \
	"$TMP"

if [[ "$NO_PUSH" == "0" ]]; then
	progress "Pushing API image"
	docker push "$IMG/api:$SHA"
	progress "Pushing migrate image"
	docker push "$IMG/migrate:$SHA"
	progress "Pushing front-2 image"
	docker push "$IMG/front-2:$SHA"
fi

printf 'RELEASE_TAG=%s\n' "$SHA"
printf 'Next: set RELEASE_TAG in Dokploy -> Environment, then redeploy.\n'
