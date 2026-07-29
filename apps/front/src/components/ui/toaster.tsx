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

/**
 * Everything sonner's own stylesheet applies to the toaster host is
 * un-layered, so `@layer components` in app.css cannot override it on
 * specificity. These three declarations are therefore inline on the host,
 * which does win:
 *
 * - `zIndex` replaces sonner's hardcoded `999999999` with front's semantic
 *   stacking token. Do not inline a raw number here — see #974.
 * - `width`/`maxWidth` replace sonner's `--width` box.
 * - `fontFamily` replaces sonner's own `ui-sans-serif, system-ui, …` stack,
 *   which otherwise stops the toast inheriting the app's `--publy-font-sans`.
 *
 * The `--success-bg`/`--error-border`/… custom properties sonner reads are
 * deliberately absent: they only exist to feed `richColors`, which is off (see
 * below), and every toast colour is now owned by `.publy-toast*` in app.css.
 */
const toastHostStyle = {
	zIndex: 'var(--publy-z-toast)',
	width: 'min(360px, calc(100vw - 24px))',
	maxWidth: '360px',
	fontFamily: 'var(--publy-font-sans)',
} satisfies ToastHostStyle;

export const AppToaster = () => {
	return (
		<Toaster
			position="top-right"
			closeButton
			// `richColors` is deliberately NOT set: its rules are un-layered, so
			// they silently win over app.css's `@layer components` and would own
			// the toast background, border and close-button colours. Variant
			// colour is driven entirely by the `.publy-toast-*` classes.
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
