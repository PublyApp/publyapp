import { useTranslation } from 'react-i18next';
import { StatusPill } from '~/components/ui/product-page';
import type { SocialAccountRow } from '~/lib/query/social-accounts';

/** Epic C §3 pill for connected-account status. Tone comes from the row
 * mapper (revoked is deliberately grey, not red); the test id is hyphenated
 * from the wire status so specs can pin per-status assertions. */
export const IntegrationsStatusPill = ({ row }: { row: SocialAccountRow }) => {
	const { t } = useTranslation(['settings']);

	return (
		<StatusPill tone={row.tone}>
			<span data-testid={`status-pill-${row.statusWire.replace(/_/g, '-')}`}>
				{t(row.statusLabelKey)}
			</span>
		</StatusPill>
	);
};
