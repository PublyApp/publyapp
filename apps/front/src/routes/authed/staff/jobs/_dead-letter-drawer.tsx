import type { ReactNode } from 'react';
import {
	Drawer,
	DrawerBody,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
} from '~/components/ui/drawer';
import { DetailRow } from '~/components/ui/product-page';
import type { StaffDeadLetterRow } from '~/lib/query/staff-jobs';
import { formatDateTime } from '~/utils/format-time';

import type { DeadLetterDetail } from '@org/client-ts/models/index';

import { formatFailureCause } from './_jobs-helpers';
import { isPayloadRedacted, RedactionBanner } from './_redaction-banner';

type Translate = (key: string, options?: Record<string, unknown>) => string;

const PayloadSection = ({
	payload,
	t,
}: {
	payload: string | undefined;
	t: Translate;
}): ReactNode => {
	if (!payload) {
		return null;
	}
	if (isPayloadRedacted(payload)) {
		return <RedactionBanner label={t('staff-jobs:redaction-banner')} />;
	}
	return (
		<pre className="max-h-48 overflow-auto rounded-[var(--publy-radius-sm)] bg-muted p-3 font-mono text-xs">
			{payload}
		</pre>
	);
};

/** The dead-letter detail drawer: payload, attempts, cause and failure date. */
export const DeadLetterDrawer = ({
	row,
	detail,
	locale,
	onClose,
	t,
}: {
	row: StaffDeadLetterRow | null;
	detail: DeadLetterDetail | undefined;
	locale: string;
	onClose: () => void;
	t: Translate;
}) => (
	<Drawer
		open={row !== null}
		onOpenChange={(open) => {
			if (!open) {
				onClose();
			}
		}}
	>
		<DrawerContent data-testid="staff-jobs-dead-letter-drawer">
			<DrawerHeader>
				<DrawerTitle>{t('staff-jobs:dl-drawer-title')}</DrawerTitle>
				<DrawerDescription>{row?.jobType ?? ''}</DrawerDescription>
			</DrawerHeader>
			<DrawerBody>
				{row ? (
					<>
						<PayloadSection payload={detail?.payload ?? undefined} t={t} />
						<DetailRow
							label={t('common:column-attempts')}
							value={detail?.attempts ?? row.attempts}
						/>
						<DetailRow
							label={t('staff-jobs:detail-last-error')}
							value={formatFailureCause(detail?.lastError ?? row.lastError, t)}
						/>
						<DetailRow
							label={t('common:column-failed-at')}
							value={formatDateTime(detail?.failedAt ?? row.failedAt, locale)}
						/>
					</>
				) : null}
			</DrawerBody>
		</DrawerContent>
	</Drawer>
);
