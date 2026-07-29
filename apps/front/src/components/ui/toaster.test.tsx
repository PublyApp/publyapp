import { cleanup, render, screen } from '@testing-library/react';
/** @vitest-environment jsdom */
import * as React from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';

const toasterProps = vi.hoisted(() => ({
	current: null as Record<string, unknown> | null,
}));

vi.mock('sonner', () => ({
	Toaster: (props: Record<string, unknown>) => {
		toasterProps.current = props;
		return React.createElement('div', {
			'aria-label': 'Notifications',
			'data-testid': 'sonner-host',
			'data-position': props.position,
			className: props.className as string,
			style: props.style,
		});
	},
}));

import { AppToaster } from './toaster';

afterEach(() => {
	cleanup();
	toasterProps.current = null;
});

describe('AppToaster', () => {
	test('renders one configured Sonner host for the app shell', () => {
		render(<AppToaster />);

		const hosts = screen.getAllByTestId('sonner-host');
		expect(hosts).toHaveLength(1);
		expect(hosts[0].className).toBe('publy-toaster');
		expect(hosts[0].getAttribute('data-position')).toBe('top-right');

		const props = toasterProps.current;
		expect(props).not.toBeNull();
		if (!props) {
			return;
		}

		// Only what sonner's own UN-layered stylesheet would otherwise own is
		// inline here; every colour is owned by `.publy-toast*` in app.css
		// (#991). `zIndex` must stay the semantic token, never a raw number
		// (#974).
		expect(props.style).toEqual({
			zIndex: 'var(--publy-z-toast)',
			width: 'min(360px, calc(100vw - 24px))',
			maxWidth: '360px',
			fontFamily: 'var(--publy-font-sans)',
		});

		expect(props.closeButton).toBe(true);
		// `richColors` must stay off: its rules are un-layered and would win
		// over app.css's `@layer components` toast colours (#991).
		expect(props.richColors).toBeUndefined();
		expect(props.visibleToasts).toBe(4);
		expect(props.offset).toBe(16);
		expect(Object.keys(props.icons as object)).toEqual([
			'success',
			'error',
			'warning',
			'info',
			'loading',
		]);

		const toastOptions = props.toastOptions as {
			unstyled?: boolean;
			classNames?: Record<string, string>;
		};
		expect(toastOptions.unstyled).toBe(true);
		expect(toastOptions.classNames).toEqual({
			toast: 'publy-toast',
			title: 'publy-toast-title',
			description: 'publy-toast-description',
			loader: 'publy-toast-loader',
			closeButton: 'publy-toast-close-button',
			cancelButton: 'publy-toast-cancel-button',
			actionButton: 'publy-toast-action-button',
			success: 'publy-toast-success',
			error: 'publy-toast-error',
			info: 'publy-toast-info',
			warning: 'publy-toast-warning',
			loading: 'publy-toast-loading',
			default: 'publy-toast-default',
			content: 'publy-toast-content',
			icon: 'publy-toast-icon',
		});
	});
});
