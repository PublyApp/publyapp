import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import process from 'node:process';

import { IMAGE_SERVICES, imageReference } from './ci-e2e-images.ts';

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
		'{{.Manifest.Digest}}',
	]);
	const digest = result.status === 0 ? result.stdout.trim() : '';
	if (DIGEST.test(digest)) {
		return digest;
	}
	return undefined;
};

/**
 * Only the OIDC certificate is unmanipulable; the SLSA predicate (and its
 * `gitCommit`) is user-controllable, so the jq selector never reads it.
 */
const CERTIFICATE_JQ =
	'[.[] | .verificationResult.signature.certificate.sourceRepositoryDigest] | unique';

export const certificateSourceCommits = (stdout: string): string[] => {
	try {
		const commits = JSON.parse(stdout) as unknown;
		if (!Array.isArray(commits)) {
			return [];
		}
		return commits.filter(
			(commit): commit is string => typeof commit === 'string',
		);
	} catch {
		return [];
	}
};

export const imageTrusted = (
	reference: string,
	digest: string,
	repository: string,
	tree: string,
	run: Run,
): boolean => {
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
		CERTIFICATE_JQ,
	]);
	if (verify.status !== 0) {
		return false;
	}
	return certificateSourceCommits(verify.stdout).some(
		(commit) =>
			run('gh', [
				'api',
				`repos/${repository}/git/commits/${commit}`,
				'--jq',
				'.tree.sha',
			]).stdout.trim() === tree,
	);
};

type ImageService = (typeof IMAGE_SERVICES)[number];
export type ImageDigests = Partial<Record<ImageService, string>>;
const miss = (reason: string) => ({
	reuse: false,
	digests: {},
	reason,
});

export const decideImageReuse = (
	namespace: string,
	tag: string,
	tree: string,
	fork: boolean,
	repository: string,
	run: Run,
) => {
	if (fork) {
		return miss('build: fork images travel as artifacts, never through GHCR');
	}
	const digests: ImageDigests = {};
	for (const service of IMAGE_SERVICES) {
		const reference = imageReference(namespace, tag, service);
		const digest = registryDigest(reference, run);
		if (digest === undefined) {
			return miss(`build: ${reference} is not present — building as today`);
		}
		if (!imageTrusted(reference, digest, repository, tree, run)) {
			return miss(
				`build: ${reference}@${digest} has no certificate for tree ${tree} — building rather than reusing an unverified image`,
			);
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
	if (!value) {
		throw new Error(`${name} is not set — the e2e image trust step needs it.`);
	}
	return value;
};

const writeOutput = (name: string, value: string) => {
	const output = process.env.GITHUB_OUTPUT;
	if (!output) {
		throw new Error('GITHUB_OUTPUT is not set — the decision goes nowhere.');
	}
	appendFileSync(output, `${name}=${value}\n`);
};

const pin = (reference: string, digest: string, run: Run): boolean =>
	run('docker', ['pull', `${reference}@${digest}`]).status === 0 &&
	run('docker', ['tag', `${reference}@${digest}`, reference]).status === 0;

export const pullVerifiedImages = (
	namespace: string,
	tag: string,
	digests: ImageDigests,
	run: Run,
): boolean =>
	IMAGE_SERVICES.every((service) =>
		pin(imageReference(namespace, tag, service), digests[service] ?? '', run),
	);

const main = (run: Run) => {
	const command = process.argv[2];
	const namespace = required('E2E_IMAGE_NS');
	const tag = required('E2E_IMAGE_TAG');
	if (!tag.startsWith(TREE_TAG_PREFIX)) {
		throw new Error(`E2E_IMAGE_TAG ${tag} is not a ${TREE_TAG_PREFIX} tag`);
	}
	if (command === 'decide') {
		const decision = decideImageReuse(
			namespace,
			tag,
			tag.slice(TREE_TAG_PREFIX.length),
			process.env.E2E_FORK === 'true',
			required('GITHUB_REPOSITORY'),
			run,
		);
		console.log(decision.reason);
		if (
			decision.reuse &&
			!pullVerifiedImages(namespace, tag, decision.digests, run)
		) {
			console.log(
				'build: a verified image could not be pulled — rebuilding instead of reusing a partial stack',
			);
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
