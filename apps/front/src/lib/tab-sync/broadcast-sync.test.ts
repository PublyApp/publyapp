/** @vitest-environment jsdom */
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

type Listener = (event: MessageEvent) => void;

// jsdom (29.1.1) does not implement BroadcastChannel, so this mock stands in
// for it. It replicates the one spec behavior the helper depends on:
// postMessage() never delivers back to the *same* channel instance that sent
// it, but it does deliver to every other instance on the same channel name —
// including another instance opened in the "same tab" — which is exactly why
// useBroadcastSync needs its own TAB_ID filter.
class MockBroadcastChannel {
	static channelsByName = new Map<string, Set<MockBroadcastChannel>>();

	name: string;
	private listeners = new Set<Listener>();

	constructor(name: string) {
		this.name = name;
		const peers =
			MockBroadcastChannel.channelsByName.get(name) ??
			new Set<MockBroadcastChannel>();
		peers.add(this);
		MockBroadcastChannel.channelsByName.set(name, peers);
	}

	postMessage(data: unknown): void {
		const peers = MockBroadcastChannel.channelsByName.get(this.name);
		if (!peers) {
			return;
		}

		for (const peer of peers) {
			if (peer === this) {
				continue;
			}
			const event = { data } as MessageEvent;
			for (const listener of peer.listeners) {
				listener(event);
			}
		}
	}

	addEventListener(_type: 'message', listener: Listener): void {
		this.listeners.add(listener);
	}

	removeEventListener(_type: 'message', listener: Listener): void {
		this.listeners.delete(listener);
	}

	close(): void {
		MockBroadcastChannel.channelsByName.get(this.name)?.delete(this);
	}
}

const CHANNEL = 'publyapp:test-channel';

describe('broadcast-sync', () => {
	beforeEach(() => {
		vi.resetModules();
		MockBroadcastChannel.channelsByName.clear();
		vi.stubGlobal('BroadcastChannel', MockBroadcastChannel);
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	test('delivers a broadcast from another tab to the listener', async () => {
		const { useBroadcastSync } = await import('./broadcast-sync');
		const onMessage = vi.fn();
		renderHook(() => useBroadcastSync(CHANNEL, onMessage));

		// A fresh module instance simulates a genuinely separate tab: resetting
		// the module registry re-runs the top-level TAB_ID assignment, so this
		// "other tab" gets its own id and is never self-filtered.
		vi.resetModules();
		const otherTab = await import('./broadcast-sync');
		otherTab.postBroadcast(CHANNEL, { hello: 'world' });

		expect(onMessage).toHaveBeenCalledWith({ hello: 'world' });
	});

	test('drops an envelope this same tab broadcast (self-filter)', async () => {
		const { postBroadcast, useBroadcastSync } =
			await import('./broadcast-sync');
		const onMessage = vi.fn();
		renderHook(() => useBroadcastSync(CHANNEL, onMessage));

		postBroadcast(CHANNEL, { hello: 'self' });

		expect(onMessage).not.toHaveBeenCalled();
	});

	test('closes its channel and stops receiving after unmount', async () => {
		const { useBroadcastSync } = await import('./broadcast-sync');
		const onMessage = vi.fn();
		const { unmount } = renderHook(() => useBroadcastSync(CHANNEL, onMessage));
		unmount();

		vi.resetModules();
		const otherTab = await import('./broadcast-sync');
		otherTab.postBroadcast(CHANNEL, { hello: 'after-unmount' });

		expect(onMessage).not.toHaveBeenCalled();
	});

	test('postBroadcast is a no-op when BroadcastChannel is unavailable', async () => {
		vi.stubGlobal('BroadcastChannel', undefined);
		const { postBroadcast } = await import('./broadcast-sync');

		expect(() => postBroadcast(CHANNEL, { hello: 'ssr' })).not.toThrow();
	});

	test('useBroadcastSync subscribes without throwing when BroadcastChannel is unavailable', async () => {
		vi.stubGlobal('BroadcastChannel', undefined);
		const { useBroadcastSync } = await import('./broadcast-sync');
		const onMessage = vi.fn();

		expect(() =>
			renderHook(() => useBroadcastSync(CHANNEL, onMessage)),
		).not.toThrow();
	});
});
