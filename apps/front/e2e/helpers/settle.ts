import type { Locator } from '@playwright/test';

import { sleep } from '@org/shared-ts/utils/any.utils';

type Box = { x: number; y: number; width: number; height: number };

const boxesMatch = (a: Box, b: Box): boolean =>
	Math.abs(a.x - b.x) < 0.5 &&
	Math.abs(a.y - b.y) < 0.5 &&
	Math.abs(a.width - b.width) < 0.5 &&
	Math.abs(a.height - b.height) < 0.5;

/**
 * Re-reads `read()` until `equals` holds across `requiredStableSamples`
 * consecutive reads (null reads never count as stable). Sample stability only
 * proves "nothing changed for a few polls"; pair it with a real readiness
 * signal (awaited response, visible element) when late async content exists.
 */
export const waitForValueToSettle = async <T>(
	read: (remainingMs: number) => Promise<T | null>,
	equals: (a: T, b: T) => boolean,
	options: {
		requiredStableSamples?: number;
		pollIntervalMs?: number;
		timeoutMs?: number;
	} = {},
): Promise<T> => {
	const {
		requiredStableSamples = 3,
		pollIntervalMs = 50,
		timeoutMs = 5_000,
	} = options;

	const deadline = Date.now() + timeoutMs;
	let previous: T | null = null;
	let stableCount = 0;

	while (Date.now() < deadline) {
		// The deadline also bounds the read itself: a read that hangs (e.g. a
		// detached element) must not outlive `timeoutMs`.
		const remainingMs = Math.max(1, deadline - Date.now());
		let timer: ReturnType<typeof setTimeout> | undefined;
		const expired = new Promise<never>((_, reject) => {
			timer = setTimeout(
				() => reject(new Error(`value did not settle within ${timeoutMs}ms`)),
				remainingMs,
			);
		});
		// eslint-disable-next-line no-await-in-loop -- intentional sequential poll
		const value = await Promise.race([read(remainingMs), expired]).finally(() =>
			clearTimeout(timer),
		);
		if (value !== null && previous !== null && equals(value, previous)) {
			stableCount += 1;
			if (stableCount >= requiredStableSamples) {
				return value;
			}
		} else {
			stableCount = 0;
		}
		previous = value;
		// eslint-disable-next-line no-await-in-loop -- intentional sequential poll
		await sleep(pollIntervalMs);
	}

	throw new Error(`value did not settle within ${timeoutMs}ms`);
};

/**
 * Polls `locator.boundingBox()` until it reports the same geometry across
 * `requiredStableSamples` consecutive reads, instead of a fixed sleep timed
 * to "roughly how long the entry animation takes". `toBeVisible()` is
 * satisfied the instant a popup/dialog mounts, while its CSS transform/scale
 * entry animation is still in flight — measuring immediately after produces
 * a geometry read mid-transition (see review-r1-tests.md F26).
 */
export const waitForBoundingBoxToSettle = (
	locator: Locator,
	options: Parameters<typeof waitForValueToSettle>[2] = {},
): Promise<Box> =>
	waitForValueToSettle(
		(remainingMs) => locator.boundingBox({ timeout: remainingMs }),
		boxesMatch,
		options,
	);
