import {
	IconAlertTriangle,
	IconCircleCheck,
	IconCircleX,
	IconInfoCircle,
	IconLoader2,
} from '@tabler/icons-react';
import type { CSSProperties } from 'react';
import { Toaster, type ToasterProps } from 'sonner';

const toastClassNames = {
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
} satisfies NonNullable<
	NonNullable<ToasterProps['toastOptions']>['classNames']
>;

const toastIcons = {
	success: <IconCircleCheck aria-hidden="true" className="size-4" />,
	error: <IconCircleX aria-hidden="true" className="size-4" />,
	warning: <IconAlertTriangle aria-hidden="true" className="size-4" />,
	info: <IconInfoCircle aria-hidden="true" className="size-4" />,
	loading: <IconLoader2 aria-hidden="true" className="size-4 animate-spin" />,
};

type ToastHostStyle = CSSProperties & {
	[property: `--${string}`]: string;
};

const toastHostStyle = {
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
} satisfies ToastHostStyle;

export const AppToaster = () => {
	return (
		<Toaster
			position="top-right"
			closeButton
			richColors
			visibleToasts={4}
			offset={16}
			className="publy-toaster"
			style={toastHostStyle}
			icons={toastIcons}
			toastOptions={{
				unstyled: true,
				classNames: toastClassNames,
			}}
		/>
	);
};
