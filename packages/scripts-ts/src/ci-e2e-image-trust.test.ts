import { describe, expect, test } from 'vitest';

import {
	type CommandResult,
	type Run,
	decideImageReuse,
	imageTrusted,
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
			return ok(JSON.stringify(digests[service ?? ''] ?? digest));
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
				? ok(JSON.stringify(digest))
				: undefined,
		);
		expect(registryDigest(reference('front'), run)).toBe(digest);
	});

	test('a missing or malformed manifest is no digest', () => {
		expect(registryDigest(reference('front'), () => fail())).toBeUndefined();
		expect(
			registryDigest(
				reference('front'),
				runFrom(() => ok(JSON.stringify('sha256:short'))),
			),
		).toBeUndefined();
	});
});

describe('attestation trust', () => {
	test('trusts a digest only when an attested commit tree is the tag tree', () => {
		const matching = runFrom(verifiedRegistry());
		expect(
			imageTrusted({
				reference: reference('front'),
				digest,
				repository: 'PublyApp/publyapp',
				tree,
				run: matching,
			}),
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
			imageTrusted({
				reference: reference('front'),
				digest,
				repository: 'PublyApp/publyapp',
				tree,
				run: other,
			}),
		).toBe(false);
	});

	test('a failed verification is not trusted', () => {
		const run = runFrom((command, args) =>
			command === 'gh' && args[0] === 'attestation'
				? fail('no attestation')
				: undefined,
		);
		expect(
			imageTrusted({
				reference: reference('front'),
				digest,
				repository: 'PublyApp/publyapp',
				tree,
				run,
			}),
		).toBe(false);
	});
});

describe('reuse decision', () => {
	test('reuses only when all four images are attested to the tag tree', () => {
		const decision = decideImageReuse({
			namespace,
			tag,
			tree,
			fork: false,
			repository: 'PublyApp/publyapp',
			run: runFrom(verifiedRegistry()),
		});
		expect(decision.reuse).toBe(true);
		expect(Object.keys(decision.digests).sort()).toEqual([
			'api',
			'front',
			'migrate',
			'request-counter',
		]);
	});

	test('a missing image rebuilds instead of pulling a partial stack', () => {
		const decision = decideImageReuse({
			namespace,
			tag,
			tree,
			fork: false,
			repository: 'PublyApp/publyapp',
			run: () => fail(),
		});
		expect(decision.reuse).toBe(false);
		expect(decision.reason).toMatch(/not present/);
	});

	test('an unattested or wrong-tree image rebuilds', () => {
		const decision = decideImageReuse({
			namespace,
			tag,
			tree,
			fork: false,
			repository: 'PublyApp/publyapp',
			run: runFrom((command, args) => {
				if (command === 'docker') {
					return ok(JSON.stringify(digest));
				}
				if (command === 'gh' && args[0] === 'attestation') {
					return fail('no attestation');
				}
				return undefined;
			}),
		});
		expect(decision.reuse).toBe(false);
		expect(decision.reason).toMatch(/no attestation/);
	});

	test('a fork never reuses GHCR images', () => {
		const decision = decideImageReuse({
			namespace,
			tag,
			tree,
			fork: true,
			repository: 'PublyApp/publyapp',
			run: () => fail(),
		});
		expect(decision.reuse).toBe(false);
		expect(decision.reason).toMatch(/fork/);
	});
});
