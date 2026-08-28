import type { Locator } from '@playwright/test';

type Box = { x: number; y: number; width: number; height: number };

const boxesMatch = (a: Box, b: Box): boolean =>
	Math.abs(a.x - b.x) < 0.5 &&
	Math.abs(a.y - b.y) < 0.5 &&
	Math.abs(a.width - b.width) < 0.5 &&
	Math.abs(a.height - b.height) < 0.5;

/** A bare sleep. Deliberately NOT `@org/shared-ts`'s `delay`, which logs a
 * warning on every call — inside a polling loop that would emit one line per
 * sample. Named `sleep` so the two never collide (#1682). */
const sleep = (ms: number): Promise<void> =>
	new Promise((resolve) => {
		setTimeout(resolve, ms);
	});

/**
 * Polls `locator.boundingBox()` until it reports the same geometry across
 * `requiredStableSamples` consecutive reads, instead of a fixed sleep timed
 * to "roughly how long the entry animation takes". `toBeVisible()` is
 * satisfied the instant a popup/dialog mounts, while its CSS transform/scale
 * entry animation is still in flight — measuring immediately after produces
 * a geometry read mid-transition (see review-r1-tests.md F26).
 */
export const waitForBoundingBoxToSettle = async (
	locator: Locator,
	options: {
		requiredStableSamples?: number;
		pollIntervalMs?: number;
		timeoutMs?: number;
	} = {},
): Promise<Box> => {
	const {
		requiredStableSamples = 3,
		pollIntervalMs = 50,
		timeoutMs = 5_000,
	} = options;

	const deadline = Date.now() + timeoutMs;
	let previous: Box | null = null;
	let stableCount = 0;

	while (Date.now() < deadline) {
		const box = await locator.boundingBox();
		if (box && previous && boxesMatch(box, previous)) {
			stableCount += 1;
			if (stableCount >= requiredStableSamples) {
				return box;
			}
		} else {
			stableCount = 0;
		}
		previous = box;
		// eslint-disable-next-line no-await-in-loop -- intentional sequential poll
		await sleep(pollIntervalMs);
	}

	throw new Error(
		`bounding box for locator did not settle within ${timeoutMs}ms`,
	);
};
