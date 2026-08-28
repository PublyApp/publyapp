import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '~/components/ui/badge';

/**
 * Shared scaffolding for the tenant workspace pages: a page heading, a
 * labelled field-row layout, a read-only value display and the read-only
 * affordance badge. The account pages (profile, security, notifications)
 * are display-only until their update APIs ship; the stub pages reuse the
 * heading so every workspace page opens the same way.
 */

export const WorkspacePageHeader = ({ titleKey }: { titleKey: string }) => {
	const { t } = useTranslation('common');

	return (
		<div className="space-y-1">
			<h1 className="text-[22px] font-semibold leading-7 tracking-[-0.01em] text-foreground">
				{t(titleKey)}
			</h1>
		</div>
	);
};

export const ReadOnlyBadge = () => {
	const { t } = useTranslation('common');

	return (
		<Badge variant="outline" data-testid="account-read-only-badge">
			{t('read-only')}
		</Badge>
	);
};

export const ReadOnlyFieldRow = ({
	label,
	description,
	children,
}: {
	label: string;
	description?: string;
	children: ReactNode;
}) => (
	<div className="grid items-start gap-1.5 py-2 sm:grid-cols-[220px_1fr] sm:gap-6">
		<div className="min-w-0">
			<p className="text-sm font-medium text-foreground">{label}</p>
			{description ? (
				<p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
			) : null}
		</div>
		<div className="min-w-0">{children}</div>
	</div>
);

export const ReadOnlyValue = ({
	children,
	placeholder,
}: {
	children?: ReactNode;
	/** Rendered (muted) when no real value exists yet — read-only surfaces
	 * never invent data, they say so. */
	placeholder?: string;
}) => {
	const { t } = useTranslation('common');

	if (children) {
		return <p className="pt-0.5 text-sm text-foreground">{children}</p>;
	}
	return (
		<p className="pt-0.5 text-sm text-muted-foreground">
			{placeholder ?? t('not-available-yet')}
		</p>
	);
};
