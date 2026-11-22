import { describe, expect, test } from 'vitest';

import {
	type CommandResult,
	type Run,
	certificateSourceCommits,
	decideImageReuse,
	imageTrusted,
	pullVerifiedImages,
	registryDigest,
} from './ci-e2e-image-trust.ts';

const namespace = 'ghcr.io/publyapp/publyapp-e2e';
const tree = 'a'.repeat(40);
const tag = `tree-${tree}`;
const digest = `sha256:${'b'.repeat(64)}`;

const ok = (stdout = ''): CommandResult => ({ status: 0, stdout, stderr: '' });
const fail = (stderr = 'no'): CommandResult => ({
	status: 1,
	stdout: '',
	stderr,
});

const reference = (service: string) => `${namespace}-${service}:${tag}`;

type Handler = (command: string, args: string[]) => CommandResult | undefined;

const runFrom =
	(handler: Handler): Run =>
	(command, args) =>
		handler(command, args) ?? fail(`unexpected ${command} ${args.join(' ')}`);

const verifiedRegistry = (
	commits: string[] = ['c0ffee'],
	digests: Record<string, string> = {},
): Handler => {
	return (command, args) => {
		const service = ['migrate', 'api', 'request-counter', 'front'].find(
			(candidate) => args.join(' ').includes(`-${candidate}:${tag}`),
		);
		if (command === 'docker' && args[0] === 'buildx') {
			return ok(digests[service ?? ''] ?? digest);
		}
		if (command === 'gh' && args[0] === 'attestation') {
			return ok(JSON.stringify(commits));
		}
		if (command === 'gh' && args[0] === 'api') {
			return ok(`${tree}\n`);
		}
		return undefined;
	};
};

describe('registry digest', () => {
	test('reads the buildx imagetools digest without pulling', () => {
		const run = runFrom((command, args) =>
			command === 'docker' && args.includes('imagetools')
				? ok(digest)
				: undefined,
		);
		expect(registryDigest(reference('front'), run)).toBe(digest);
	});

	test('a missing or malformed manifest is no digest', () => {
		expect(registryDigest(reference('front'), () => fail())).toBeUndefined();
		expect(
			registryDigest(
				reference('front'),
				runFrom(() => ok('sha256:short')),
			),
		).toBeUndefined();
	});
});

describe('attestation trust', () => {
	test('trusts a digest only when the certificate source commit tree is the tag tree', () => {
		const matching = runFrom(verifiedRegistry());
		expect(
			imageTrusted(
				reference('front'),
				digest,
				'PublyApp/publyapp',
				tree,
				matching,
			),
		).toBe(true);

		const other = runFrom((command, args) => {
			if (command === 'gh' && args[0] === 'attestation') {
				return ok(JSON.stringify(['c0ffee']));
			}
			if (command === 'gh' && args[0] === 'api') {
				return ok(`${'d'.repeat(40)}\n`);
			}
			return undefined;
		});
		expect(
			imageTrusted(
				reference('front'),
				digest,
				'PublyApp/publyapp',
				tree,
				other,
			),
		).toBe(false);
	});

	test('a forged predicate gitCommit cannot make an unrelated certificate trusted', () => {
		const attackerCommit = 'e'.repeat(40);
		const seen: string[] = [];
		const run = runFrom((command, args) => {
			if (command === 'gh' && args[0] === 'attestation') {
				// gh's --jq only projects the certificate, so the forged
				// predicate never reaches the verifier.
				return ok(JSON.stringify(['c0ffee']));
			}
			if (command === 'gh' && args[0] === 'api') {
				seen.push(args[2] ?? '');
				return ok(
					args[2]?.endsWith(attackerCommit)
						? `${tree}\n`
						: `${'d'.repeat(40)}\n`,
				);
			}
			return undefined;
		});
		expect(
			imageTrusted(reference('front'), digest, 'PublyApp/publyapp', tree, run),
		).toBe(false);
		expect(seen.some((path) => path.endsWith(attackerCommit))).toBe(false);
	});

	test('verifies against the repository and the signing workflow, not a predicate', () => {
		let attestationArgs: string[] = [];
		const run = runFrom((command, args) => {
			if (command === 'gh' && args[0] === 'attestation') {
				attestationArgs = args;
				return ok(JSON.stringify(['c0ffee']));
			}
			if (command === 'gh' && args[0] === 'api') {
				return ok(`${tree}\n`);
			}
			return undefined;
		});
		expect(
			imageTrusted(reference('front'), digest, 'PublyApp/publyapp', tree, run),
		).toBe(true);
		expect(attestationArgs).toContain('--repo');
		expect(attestationArgs).toContain('PublyApp/publyapp');
		expect(attestationArgs).toContain('--signer-workflow');
		expect(attestationArgs).toContain(
			'PublyApp/publyapp/.github/workflows/ci.yml',
		);
		const jq = attestationArgs[attestationArgs.indexOf('--jq') + 1] ?? '';
		expect(jq).toContain(
			'.verificationResult.signature.certificate.sourceRepositoryDigest',
		);
		expect(jq).not.toContain('gitCommit');
	});

	test('malformed verification output yields no trusted source commit', () => {
		expect(certificateSourceCommits('not json')).toEqual([]);
		expect(certificateSourceCommits('{}')).toEqual([]);
		expect(
			certificateSourceCommits(
				JSON.stringify([{ attestation: { predicate: { gitCommit: 'x' } } }]),
			),
		).toEqual([]);
	});

	test('a failed verification is not trusted', () => {
		const run = runFrom((command, args) =>
			command === 'gh' && args[0] === 'attestation'
				? fail('no attestation')
				: undefined,
		);
		expect(
			imageTrusted(reference('front'), digest, 'PublyApp/publyapp', tree, run),
		).toBe(false);
	});
});

describe('reuse decision', () => {
	test('reuses only when all four images are attested to the tag tree', () => {
		const decision = decideImageReuse(
			namespace,
			tag,
			tree,
			false,
			'PublyApp/publyapp',
			runFrom(verifiedRegistry()),
		);
		expect(decision.reuse).toBe(true);
		expect(Object.keys(decision.digests).sort()).toEqual([
			'api',
			'front',
			'migrate',
			'request-counter',
		]);
	});

	test('a missing image rebuilds instead of pulling a partial stack', () => {
		const decision = decideImageReuse(
			namespace,
			tag,
			tree,
			false,
			'PublyApp/publyapp',
			() => fail(),
		);
		expect(decision.reuse).toBe(false);
		expect(decision.reason).toMatch(/not present/);
	});

	test('an unattested or wrong-tree image rebuilds', () => {
		const decision = decideImageReuse(
			namespace,
			tag,
			tree,
			false,
			'PublyApp/publyapp',
			runFrom((command, args) => {
				if (command === 'docker') {
					return ok(digest);
				}
				if (command === 'gh' && args[0] === 'attestation') {
					return fail('no attestation');
				}
				return undefined;
			}),
		);
		expect(decision.reuse).toBe(false);
		expect(decision.reason).toMatch(/no certificate/);
	});

	test('a fork never reuses GHCR images', () => {
		const decision = decideImageReuse(
			namespace,
			tag,
			tree,
			true,
			'PublyApp/publyapp',
			() => fail(),
		);
		expect(decision.reuse).toBe(false);
		expect(decision.reason).toMatch(/fork/);
	});
});

describe('pulling verified images', () => {
	const digests = {
		migrate: digest,
		api: digest,
		'request-counter': digest,
		front: digest,
	};

	test('pulls every image by digest before the build is skipped', () => {
		const pulls: string[] = [];
		const run = runFrom((command, args) => {
			if (command === 'docker' && args[0] === 'pull') {
				pulls.push(args[1] ?? '');
				return ok();
			}
			if (command === 'docker' && args[0] === 'tag') {
				return ok();
			}
			return undefined;
		});
		expect(pullVerifiedImages(namespace, tag, digests, run)).toBe(true);
		expect(pulls.sort()).toEqual(
			['api', 'front', 'migrate', 'request-counter'].map(
				(service) => `${reference(service)}@${digest}`,
			),
		);
	});

	test('one failed pull reports a rebuild instead of reusing a partial stack', () => {
		const run = runFrom((command, args) => {
			if (command === 'docker' && args[0] === 'pull') {
				return args[1]?.includes('-api:') ? fail('registry hiccup') : ok();
			}
			if (command === 'docker' && args[0] === 'tag') {
				return ok();
			}
			return undefined;
		});
		expect(pullVerifiedImages(namespace, tag, digests, run)).toBe(false);
	});
});
