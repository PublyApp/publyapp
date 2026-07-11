import { useEffect, useRef } from 'react';

export const AUTH_SYNC_CHANNEL = 'publyapp:auth-sync';
export const THEME_SYNC_CHANNEL = 'publyapp:theme-sync';
export const LOCALE_SYNC_CHANNEL = 'publyapp:locale-sync';

// Stable per-tab id so a tab ignores the messages it broadcasts itself.
// BroadcastChannel only skips the *same channel instance* that called
// postMessage — postBroadcast() below opens a throwaway channel, so a
// listener subscribed via useBroadcastSync in the same tab would otherwise
// receive its own broadcast (for logout, that would race the sender to
// /login before its own cookie-clear has actually completed).
const TAB_ID =
	typeof crypto !== 'undefined' && 'randomUUID' in crypto
		? crypto.randomUUID()
		: String(performance.now());

type Envelope<T> = { tab: string; data: T };

export const postBroadcast = <T>(channelName: string, data: T): void => {
	if (typeof BroadcastChannel === 'undefined') {
		return;
	}

	try {
		const channel = new BroadcastChannel(channelName);
		channel.postMessage({ tab: TAB_ID, data } satisfies Envelope<T>);
		channel.close();
	} catch {
		// Channel unavailable (teardown / unsupported) — the broadcast is a
		// best-effort UX nicety, not a correctness requirement, so ignore.
	}
};

/**
 * Subscribes to a same-origin BroadcastChannel for the component's lifetime.
 * Envelopes this tab posted itself are dropped via TAB_ID. SSR-safe: does
 * nothing when BroadcastChannel isn't available (server, unsupported browser).
 */
export const useBroadcastSync = <T>(
	channelName: string,
	onMessage: (data: T) => void,
): void => {
	// Ref-based equivalent of useEffectEvent (not yet available in our React
	// 19.1 pin): keeps the subscription effect below stable across renders
	// while always calling the latest onMessage/closed-over values.
	const onMessageRef = useRef(onMessage);
	useEffect(() => {
		onMessageRef.current = onMessage;
	});

	useEffect(() => {
		if (typeof BroadcastChannel === 'undefined') {
			return;
		}

		const channel = new BroadcastChannel(channelName);
		const listener = (event: MessageEvent) => {
			const env = event.data as Envelope<T> | null;
			if (!env || env.tab === TAB_ID) {
				return;
			}
			onMessageRef.current(env.data);
		};

		channel.addEventListener('message', listener);
		return () => {
			channel.removeEventListener('message', listener);
			channel.close();
		};
	}, [channelName]);
};
