import type { ReactNode } from 'react';
import { cn } from '~/lib/utils';

type AuthAlertTone = 'danger' | 'amber' | 'blue' | 'success';

type AuthAlertProps = {
	tone: AuthAlertTone;
	icon: ReactNode;
	children: ReactNode;
	className?: string;
	testId?: string;
};

const TONE_CLASSES = {
	danger:
		'bg-(--publy-alert-danger-bg) border-(--publy-alert-danger-border) text-(--publy-alert-danger-text)',
	amber:
		'bg-(--publy-alert-warning-bg) border-(--publy-alert-warning-border) text-(--publy-alert-warning-text)',
	blue: 'bg-(--publy-alert-info-bg) border-(--publy-alert-info-border) text-(--publy-alert-info-text)',
	success:
		'bg-(--publy-alert-success-bg) border-(--publy-alert-success-border) text-(--publy-alert-success-text)',
} satisfies Record<AuthAlertTone, string>;

/** Inline single-line notice (danger/amber/blue) used above or inside auth forms (A1–A6). */
export const AuthAlert = ({
	tone,
	icon,
	children,
	className,
	testId,
}: AuthAlertProps) => {
	return (
		<div
			role="alert"
			data-testid={testId}
			data-tone={tone}
			className={cn(
				'flex items-start gap-2 rounded-[var(--publy-radius-medium-control)] border px-3 py-2.5 text-[13px] leading-snug',
				TONE_CLASSES[tone],
				className,
			)}
		>
			<span aria-hidden="true" className="mt-0.5 shrink-0 [&_svg]:size-4">
				{icon}
			</span>
			<span>{children}</span>
		</div>
	);
};
