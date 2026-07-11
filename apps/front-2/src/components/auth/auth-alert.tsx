import type { ReactNode } from 'react';
import { cn } from '~/lib/utils';

export type AuthAlertTone = 'danger' | 'amber' | 'blue';

type AuthAlertProps = {
	tone: AuthAlertTone;
	icon: ReactNode;
	children: ReactNode;
	className?: string;
	testId?: string;
};

const TONE_CLASSES: Record<AuthAlertTone, string> = {
	danger:
		'bg-(--publy-alert-danger-bg) border-(--publy-alert-danger-border) text-(--publy-alert-danger-text)',
	amber:
		'bg-(--publy-alert-warning-bg) border-(--publy-alert-warning-border) text-(--publy-alert-warning-text)',
	blue: 'bg-(--publy-alert-info-bg) border-(--publy-alert-info-border) text-(--publy-alert-info-text)',
};

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

export default AuthAlert;
