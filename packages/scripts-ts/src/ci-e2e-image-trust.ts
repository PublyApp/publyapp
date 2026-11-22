import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import process from 'node:process';

import { IMAGE_SERVICES, imageReference } from './ci-e2e-images.ts';

// Tree images are reused only with an attestation for the exact digest whose
// source tree is the tag's tree; anything unverifiable is a build.

export const TREE_TAG_PREFIX = 'tree-';
const DIGEST = /^sha256:[0-9a-f]{64}$/;
export type CommandResult = { status: number; stdout: string; stderr: string };
export type Run = (command: string, args: string[]) => CommandResult;

export const execRun: Run = (command, args) => {
	const result = spawnSync(command, args, { encoding: 'utf8' });
	return {
		status: result.status ?? 1,
		stdout: result.stdout ?? '',
		stderr: result.stderr ?? '',
	};
};

export const registryDigest = (
	reference: string,
	run: Run,
): string | undefined => {
	const result = run('docker', [
		'buildx',
		'imagetools',
		'inspect',
		reference,
		'--format',
		'{{json .Manifest.Digest}}',
	]);
	if (result.status !== 0) {
		return undefined;
	}
	try {
		const digest = JSON.parse(result.stdout || '""') as unknown;
		if (typeof digest === 'string' && DIGEST.test(digest)) {
			return digest;
		}
		return undefined;
	} catch {
		return undefined;
	}
};

export const imageTrusted = ({
	reference,
	digest,
	repository,
	tree,
	run,
}: {
	reference: string;
	digest: string;
	repository: string;
	tree: string;
	run: Run;
}): boolean => {
	const verify = run('gh', [
		'attestation',
		'verify',
		`oci://${reference}@${digest}`,
		'--repo',
		repository,
		'--signer-workflow',
		`${repository}/.github/workflows/ci.yml`,
		'--format',
		'json',
		'--jq',
		'[.. | objects | .gitCommit? // empty] | unique',
	]);
	if (verify.status !== 0) {
		return false;
	}
	try {
		return (JSON.parse(verify.stdout) as string[]).some(
			(commit) =>
				run('gh', [
					'api',
					`repos/${repository}/git/commits/${commit}`,
					'--jq',
					'.tree.sha',
				]).stdout.trim() === tree,
		);
	} catch {
		return false;
	}
};

type ImageService = (typeof IMAGE_SERVICES)[number];
export type ImageDigests = { [Service in ImageService]?: string };
export type ReuseDecision = {
	reuse: boolean;
	digests: ImageDigests;
	reason: string;
};

export const decideImageReuse = ({
	namespace,
	tag,
	tree,
	fork,
	repository,
	run,
}: {
	namespace: string;
	tag: string;
	tree: string;
	fork: boolean;
	repository: string;
	run: Run;
}): ReuseDecision => {
	if (fork) {
		return {
			reuse: false,
			digests: {},
			reason: 'build: fork images travel as artifacts, never through GHCR',
		};
	}
	const digests: ImageDigests = {};
	for (const service of IMAGE_SERVICES) {
		const reference = imageReference(namespace, tag, service);
		const digest = registryDigest(reference, run);
		if (digest === undefined) {
			return {
				reuse: false,
				digests: {},
				reason: `build: ${reference} is not present — building as today`,
			};
		}
		if (!imageTrusted({ reference, digest, repository, tree, run })) {
			return {
				reuse: false,
				digests: {},
				reason: `build: ${reference}@${digest} has no attestation for tree ${tree} — building rather than reusing an unverified image`,
			};
		}
		digests[service] = digest;
	}
	return {
		reuse: true,
		digests,
		reason: `reuse: all ${IMAGE_SERVICES.length} images are attested to tree ${tree} — skipping the build`,
	};
};
const required = (name: string): string => {
	const value = process.env[name];
	if (value === undefined || value === '') {
		throw new Error(`${name} is not set — the e2e image trust step needs it.`);
	}
	return value;
};
const writeOutput = (name: string, value: string) => {
	const output = process.env.GITHUB_OUTPUT;
	if (output === undefined) {
		throw new Error('GITHUB_OUTPUT is not set — the decision goes nowhere.');
	}
	appendFileSync(output, `${name}=${value}\n`);
};
const pin = (reference: string, digest: string, run: Run): boolean =>
	run('docker', ['pull', `${reference}@${digest}`]).status === 0 &&
	run('docker', ['tag', `${reference}@${digest}`, reference]).status === 0;

const main = (run: Run) => {
	const command = process.argv[2];
	const namespace = required('E2E_IMAGE_NS');
	const tag = required('E2E_IMAGE_TAG');
	if (!tag.startsWith(TREE_TAG_PREFIX)) {
		throw new Error(`E2E_IMAGE_TAG ${tag} is not a ${TREE_TAG_PREFIX} tag`);
	}
	if (command === 'decide') {
		const decision = decideImageReuse({
			namespace,
			tag,
			tree: tag.slice(TREE_TAG_PREFIX.length),
			fork: process.env.E2E_FORK === 'true',
			repository: required('GITHUB_REPOSITORY'),
			run,
		});
		console.log(decision.reason);
		const front = imageReference(namespace, tag, 'front');
		if (decision.reuse && !pin(front, decision.digests.front ?? '', run)) {
			writeOutput('reuse', 'false');
			writeOutput('digests', '{}');
			return;
		}
		writeOutput('reuse', String(decision.reuse));
		writeOutput('digests', JSON.stringify(decision.digests));
		return;
	}
	if (command === 'pull') {
		const digests = JSON.parse(required('E2E_IMAGE_DIGESTS')) as ImageDigests;
		for (const service of IMAGE_SERVICES) {
			const digest = digests[service] ?? '';
			const reference = imageReference(namespace, tag, service);
			if (!DIGEST.test(digest) || !pin(reference, digest, run)) {
				throw new Error(`cannot pull verified ${reference}@${digest}`);
			}
		}
		return;
	}
	throw new Error('usage: ci-e2e-image-trust.ts <decide|pull>');
};

if (process.argv[1]?.endsWith('ci-e2e-image-trust.ts')) {
	main(execRun);
}
