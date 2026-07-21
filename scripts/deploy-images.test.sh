#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$SCRIPT_DIR/deploy-images.sh"
SHA="0123456789abcdef0123456789abcdef01234567"
TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "$TEST_ROOT"' EXIT

fail() {
	printf 'FAIL: %s\n' "$1" >&2
	exit 1
}

assert_contains() {
	local haystack="$1"
	local needle="$2"
	local message="$3"

	[[ "$haystack" == *"$needle"* ]] || fail "$message"
}

assert_not_contains() {
	local haystack="$1"
	local needle="$2"
	local message="$3"

	[[ "$haystack" != *"$needle"* ]] || fail "$message"
}

make_fakes() {
	local case_root="$1"
	local bin_dir="$case_root/bin"

	mkdir -p "$bin_dir"

	cat > "$bin_dir/git" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == "rev-parse" ]]; then
	printf '%s\n' "$FAKE_SHA"
	exit 0
fi
printf '<%s>' "$@" >> "$FAKE_LOG/git"
printf '\n' >> "$FAKE_LOG/git"
EOF

	cat > "$bin_dir/docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '<%s>' "$@" >> "$FAKE_LOG/docker"
printf '\n' >> "$FAKE_LOG/docker"
EOF

	cat > "$bin_dir/tar" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '<%s>' "$@" >> "$FAKE_LOG/tar"
printf '\n' >> "$FAKE_LOG/tar"
cat >/dev/null
EOF

	cat > "$bin_dir/mktemp" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
mkdir -p "$FAKE_TMP"
printf '%s\n' "$FAKE_TMP"
EOF

	chmod +x "$bin_dir/git" "$bin_dir/docker" "$bin_dir/tar" "$bin_dir/mktemp"
}

run_case() {
	local name="$1"
	shift
	local case_root="$TEST_ROOT/$name"

	mkdir -p "$case_root/log" "$case_root/docker-config"
	make_fakes "$case_root"
	FAKE_SHA="$SHA" \
	FAKE_LOG="$case_root/log" \
	FAKE_TMP="$case_root/tmp dir" \
	DOCKER_CONFIG="$case_root/docker-config" \
	PATH="$case_root/bin:$PATH" \
		bash "$SCRIPT" "$@"
}

test_dry_run_prints_exact_plan_without_side_effects() {
	local output
	output="$(run_case dry-run --dry-run release-candidate)"

	assert_contains "$output" "==> Resolved release-candidate to $SHA" \
		"dry-run must print the resolved SHA"
	assert_contains "$output" \
		"docker buildx build --load --platform linux/amd64 -f \"\$TMP/apps/api/Dockerfile\" --target runtime -t ghcr.io/radandevist/publyapp/api:$SHA \"\$TMP\"" \
		"dry-run must print the API build"
	assert_contains "$output" \
		"docker buildx build --load --platform linux/amd64 -f \"\$TMP/apps/api/Dockerfile\" --target migrate -t ghcr.io/radandevist/publyapp/migrate:$SHA \"\$TMP\"" \
		"dry-run must print the migrate build"
	assert_contains "$output" \
		"docker buildx build --load --platform linux/amd64 -f \"\$TMP/apps/front-2/Dockerfile\" -t ghcr.io/radandevist/publyapp/front-2:$SHA \"\$TMP\"" \
		"dry-run must print the front-2 build"
	assert_contains "$output" "docker push ghcr.io/radandevist/publyapp/api:$SHA" \
		"dry-run must print the API push"
	assert_contains "$output" "docker push ghcr.io/radandevist/publyapp/migrate:$SHA" \
		"dry-run must print the migrate push"
	assert_contains "$output" "docker push ghcr.io/radandevist/publyapp/front-2:$SHA" \
		"dry-run must print the front-2 push"
	[[ ! -e "$TEST_ROOT/dry-run/tmp dir" ]] || fail "dry-run must not create a temp tree"
	[[ ! -e "$TEST_ROOT/dry-run/log/docker" ]] || fail "dry-run must not invoke Docker"
}

test_no_push_builds_from_archive_and_cleans_up() {
	local output docker_log git_log tar_log
	output="$(run_case no-push --no-push release-candidate)"
	docker_log="$(<"$TEST_ROOT/no-push/log/docker")"
	git_log="$(<"$TEST_ROOT/no-push/log/git")"
	tar_log="$(<"$TEST_ROOT/no-push/log/tar")"

	assert_contains "$docker_log" "<buildx><version>" "buildx preflight must run"
	assert_contains "$docker_log" \
		"<buildx><build><--load><--platform><linux/amd64><-f><$TEST_ROOT/no-push/tmp dir/apps/api/Dockerfile><--target><runtime><-t><ghcr.io/radandevist/publyapp/api:$SHA><$TEST_ROOT/no-push/tmp dir>" \
		"API build arguments must be exact and IFS-safe"
	assert_contains "$docker_log" "<--target><migrate><-t><ghcr.io/radandevist/publyapp/migrate:$SHA>" \
		"migrate target and tag must be exact"
	assert_contains "$docker_log" \
		"<-f><$TEST_ROOT/no-push/tmp dir/apps/front-2/Dockerfile><-t><ghcr.io/radandevist/publyapp/front-2:$SHA>" \
		"front-2 Dockerfile and tag must be exact"
	assert_not_contains "$docker_log" "<push>" "--no-push must skip every push"
	assert_contains "$git_log" "<archive><--format=tar><$SHA>" \
		"build source must come from git archive at the resolved SHA"
	assert_contains "$tar_log" "<-x><-C><$TEST_ROOT/no-push/tmp dir>" \
		"archive must extract into the temporary build context"
	assert_contains "$output" "RELEASE_TAG=$SHA" "successful build-only run must print RELEASE_TAG"
	[[ ! -e "$TEST_ROOT/no-push/tmp dir" ]] || fail "temporary build context must be cleaned"
}

test_push_requires_ghcr_auth() {
	local output
	if output="$(run_case missing-auth release-candidate 2>&1)"; then
		fail "push mode must fail without GHCR auth"
	fi

	assert_contains "$output" \
		"Not logged into GHCR. Run: docker login ghcr.io -u radandevist" \
		"missing auth error must be actionable"
	[[ ! -e "$TEST_ROOT/missing-auth/tmp dir" ]] || \
		fail "auth failure must happen before creating the temp tree"
}

test_push_mode_pushes_all_three_images() {
	local docker_log
	printf '{"auths":{"ghcr.io":{}}}\n' > "$TEST_ROOT/push-config.json"
	mkdir -p "$TEST_ROOT/push/docker-config"
	cp "$TEST_ROOT/push-config.json" "$TEST_ROOT/push/docker-config/config.json"
	run_case push release-candidate >/dev/null
	docker_log="$(<"$TEST_ROOT/push/log/docker")"

	assert_contains "$docker_log" "<push><ghcr.io/radandevist/publyapp/api:$SHA>" \
		"push mode must push API"
	assert_contains "$docker_log" "<push><ghcr.io/radandevist/publyapp/migrate:$SHA>" \
		"push mode must push migrate"
	assert_contains "$docker_log" "<push><ghcr.io/radandevist/publyapp/front-2:$SHA>" \
		"push mode must push front-2"
}

test_dry_run_prints_exact_plan_without_side_effects
test_no_push_builds_from_archive_and_cleans_up
test_push_requires_ghcr_auth
test_push_mode_pushes_all_three_images
printf 'PASS: deploy-images tests\n'
