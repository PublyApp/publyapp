import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { useStartMastodonConnectMutation } from '~/lib/query/mastodon-connect';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';

import type { ReconnectMismatch } from './_use-mastodon-callback';

/** A reconnect came back signed in as another account (#2186). Nothing was linked
 * and the account being reconnected is untouched (still needing a reconnect); the
 * user chooses between leaving it that way and connecting the other account as a
 * new one. Never a silent switch. */
export const ReconnectMismatchDialog = ({
	mismatch,
	tenantId,
	onClose,
}: {
	mismatch: ReconnectMismatch | null;
	tenantId: string;
	onClose: () => void;
}) => {
	const { t } = useTranslation(['settings', 'common']);
	const startMutation = useStartMastodonConnectMutation();
	const [error, setError] = useState<string | null>(null);

	const connectAsNew = async () => {
		if (mismatch === null) {
			return;
		}
		setError(null);
		try {
			// A plain connect (no reconnect target): the instance already knows the
			// signed-in account, so the user only has to approve it.
			const authorizeUrl = await startMutation.mutateAsync({
				tenantId,
				instance: mismatch.instance,
				provider: mismatch.provider,
			});
			window.location.assign(authorizeUrl);
		} catch (failure) {
			setError(
				getFailureMessage(toApiFailure(failure), {
					fallback: t('common:an-error-occurred'),
				}),
			);
		}
	};

	return (
		<ConfirmDialog
			isOpen={mismatch !== null}
			title={t('settings:mastodon-mismatch-title')}
			description={t('settings:mastodon-mismatch-description', {
				actual: mismatch?.actualHandle ?? '',
				expected: mismatch?.expectedHandle ?? '',
			})}
			confirmLabel={t('settings:mastodon-mismatch-connect-new', {
				actual: mismatch?.actualHandle ?? '',
			})}
			cancelLabel={t('settings:mastodon-mismatch-keep', {
				expected: mismatch?.expectedHandle ?? '',
			})}
			tone="primary"
			isPending={startMutation.isPending}
			onConfirm={() => void connectAsNew()}
			onOpenChange={(open) => {
				if (!open) {
					setError(null);
					onClose();
				}
			}}
		>
			{error === null ? null : (
				<p role="alert" className="text-destructive text-sm">
					{error}
				</p>
			)}
		</ConfirmDialog>
	);
};
