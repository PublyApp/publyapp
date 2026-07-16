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

		expect(props.style).toEqual({
			zIndex: 'var(--publy-z-toast)',
			width: 'min(360px, calc(100vw - 24px))',
			maxWidth: '360px',
			'--normal-bg': 'var(--publy-surface-raised)',
			'--normal-bg-hover': 'var(--publy-surface-hover)',
			'--normal-border': 'var(--publy-border)',
			'--normal-border-hover': 'var(--publy-border-strong)',
			'--normal-text': 'var(--publy-foreground)',
			'--success-bg': 'var(--publy-surface-raised)',
			'--success-border': 'var(--publy-alert-success-border)',
			'--success-text': 'var(--publy-foreground)',
			'--error-bg': 'var(--publy-surface-raised)',
			'--error-border': 'var(--publy-alert-danger-border)',
			'--error-text': 'var(--publy-foreground)',
			'--warning-bg': 'var(--publy-surface-raised)',
			'--warning-border': 'var(--publy-alert-warning-border)',
			'--warning-text': 'var(--publy-foreground)',
			'--info-bg': 'var(--publy-surface-raised)',
			'--info-border': 'var(--publy-alert-info-border)',
			'--info-text': 'var(--publy-foreground)',
		});

		expect(props.closeButton).toBe(true);
		expect(props.richColors).toBe(true);
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
