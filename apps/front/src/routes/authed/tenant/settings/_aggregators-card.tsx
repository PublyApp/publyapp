import { IconPlugConnected } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import QueryDisplay from '~/components/query-display';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { StatusPill } from '~/components/ui/product-page';
import {
	type AggregatorRow,
	toAggregatorRows,
	useAggregatorsQuery,
	useTestAggregatorKeyMutation,
} from '~/lib/query/aggregators';

import { AggregatorKeyDrawer } from './_aggregator-key-drawer';
import { RemoveAggregatorKeyDialog } from './_remove-aggregator-key-dialog';

const AggregatorRowView = ({
	row,
	canManage,
	tenantId,
	onSetKey,
	onRemoveKey,
}: {
	row: AggregatorRow;
	canManage: boolean;
	tenantId: string;
	onSetKey: (row: AggregatorRow) => void;
	onRemoveKey: (row: AggregatorRow) => void;
}) => {
	const { t } = useTranslation(['settings']);
	const testMutation = useTestAggregatorKeyMutation();
	const { connection } = row;

	return (
		<li
			className="flex flex-wrap items-center justify-between gap-3"
			data-testid={`aggregator-${row.kind}`}
		>
			<div className="space-y-1">
				<p className="font-medium">{row.displayName}</p>
				{connection ? (
					<>
						<StatusPill tone={connection.isActive ? 'success' : 'warning'}>
							{t(
								connection.isActive
									? 'aggregator-status-active'
									: 'aggregator-status-invalid',
							)}
						</StatusPill>
						<p className="text-muted-foreground text-sm">
							{t('aggregator-key-hint', { hint: connection.keyHint })}
						</p>
						{connection.lastError ? (
							<p role="alert" className="text-destructive text-sm">
								{connection.lastError}
							</p>
						) : null}
					</>
				) : (
					<p className="text-muted-foreground text-sm">
						{t('aggregator-not-connected')}
					</p>
				)}
			</div>
			{canManage ? (
				<div className="flex flex-wrap gap-2">
					<Button
						variant={connection ? 'outline' : 'default'}
						onClick={() => onSetKey(row)}
					>
						<IconPlugConnected aria-hidden="true" className="size-4" />
						{connection
							? t('aggregator-update-key')
							: t('aggregator-connect', { name: row.displayName })}
					</Button>
					{connection ? (
						<>
							<Button
								variant="outline"
								disabled={testMutation.isPending}
								onClick={() =>
									testMutation.mutate({ tenantId, kind: row.kind })
								}
							>
								{t('aggregator-test-key')}
							</Button>
							<Button variant="outline" onClick={() => onRemoveKey(row)}>
								{t('aggregator-remove-key')}
							</Button>
						</>
					) : null}
				</div>
			) : null}
		</li>
	);
};

/** Aggregator keys on Integrations: generic, one row per aggregator the API
 * lists, key hint only. Nothing here names a specific aggregator. */
export const AggregatorsCard = ({
	tenantId,
	canManage,
}: {
	tenantId: string;
	canManage: boolean;
}) => {
	const { t } = useTranslation(['settings']);
	const query = useAggregatorsQuery({ tenantId });
	const [editing, setEditing] = useState<AggregatorRow | null>(null);
	const [removing, setRemoving] = useState<AggregatorRow | null>(null);

	return (
		<Card data-testid="tenant-settings-aggregators">
			<CardHeader>
				<CardTitle>{t('aggregators-title')}</CardTitle>
			</CardHeader>
			<CardContent>
				<QueryDisplay query={query}>
					{({ data }) => (
						<ul className="space-y-4">
							{toAggregatorRows(data).map((row) => (
								<AggregatorRowView
									key={row.kind}
									row={row}
									canManage={canManage}
									tenantId={tenantId}
									onSetKey={setEditing}
									onRemoveKey={setRemoving}
								/>
							))}
						</ul>
					)}
				</QueryDisplay>
			</CardContent>
			<AggregatorKeyDrawer
				aggregator={editing}
				tenantId={tenantId}
				onOpenChange={(open) => {
					if (!open) {
						setEditing(null);
					}
				}}
			/>
			<RemoveAggregatorKeyDialog
				aggregator={removing}
				tenantId={tenantId}
				onOpenChange={(open) => {
					if (!open) {
						setRemoving(null);
					}
				}}
			/>
		</Card>
	);
};
