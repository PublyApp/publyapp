import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import {
	type AggregatorRow,
	useRemoveAggregatorKeyMutation,
} from '~/lib/query/aggregators';

/** Removing the key erases it: the confirmation names the aggregator and states
 * the consequence (the key must be pasted again; publishing through it stops). */
export const RemoveAggregatorKeyDialog = ({
	aggregator,
	onOpenChange,
	tenantId,
}: {
	/** The aggregator whose key would be removed; `null` keeps the dialog closed. */
	aggregator: AggregatorRow | null;
	onOpenChange: (isOpen: boolean) => void;
	tenantId: string;
}) => {
	const { t } = useTranslation('settings');
	const removeMutation = useRemoveAggregatorKeyMutation();
	const name = aggregator?.displayName ?? '';

	return (
		<ConfirmDialog
			isOpen={aggregator !== null}
			title={t('aggregator-remove-title', { name })}
			description={t('aggregator-remove-consequences', { name })}
			confirmLabel={t('aggregator-remove-key')}
			tone="danger"
			isPending={removeMutation.isPending}
			onConfirm={async () => {
				if (aggregator === null) {
					return;
				}
				await removeMutation.mutateAsync({
					tenantId,
					kind: aggregator.kind,
				});
				onOpenChange(false);
			}}
			onOpenChange={onOpenChange}
		/>
	);
};
