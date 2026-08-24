import type * as React from 'react';
import { cn } from '~/lib/utils';

/**
 * Handoff form-page foundations (2d/3c/6a): a centered scrolling column
 * (860px default, 760px for account pages, 960px for two-pane create forms)
 * and the sticky bottom action bar with an optional status line. Values live
 * in app.css (`.publy-form-page`, `.publy-form-action-bar`).
 */

const FormPageLayout = ({
	width = 860,
	className,
	...props
}: React.ComponentProps<'div'> & { width?: 760 | 860 | 960 }) => {
	return (
		<div
			data-slot="form-page"
			data-width={String(width)}
			className={cn('publy-form-page', className)}
			{...props}
		/>
	);
};

const FormActionBar = ({
	status,
	className,
	children,
	...props
}: React.ComponentProps<'div'> & { status?: React.ReactNode }) => {
	return (
		<div
			data-slot="form-action-bar"
			className={cn('publy-form-action-bar', className)}
			{...props}
		>
			{status ? (
				<span
					data-slot="form-action-bar-status"
					className="publy-form-action-bar-status"
				>
					{status}
				</span>
			) : (
				<span aria-hidden="true" />
			)}
			<div className="flex items-center gap-2.5">{children}</div>
		</div>
	);
};

export { FormActionBar, FormPageLayout };
