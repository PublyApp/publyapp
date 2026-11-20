import { IconPlugConnected } from '@tabler/icons-react';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import QueryDisplay, {
	type QueryDisplayQuery,
} from '~/components/query-display';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { StatusPill } from '~/components/ui/product-page';
import { classifyError } from '~/lib/error-kind';
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

const AggregatorsShell = ({ children }: { children: ReactNode }) => {
	const { t } = useTranslation(['settings']);

	return (
		<Card data-testid="tenant-settings-aggregators">
			<CardHeader>
				<CardTitle>{t('aggregators-title')}</CardTitle>
			</CardHeader>
			<CardContent>{children}</CardContent>
		</Card>
	);
};

/** Loading and error states keep the card's chrome, except for a member refused
 * the list (no social-accounts verb): for them the card is simply absent, like
 * the actions of a read-only holder. */
const AggregatorsError = ({
	error,
	query,
}: {
	error: unknown;
	query: QueryDisplayQuery;
}) =>
	classifyError(error, true) === 'forbidden' ? null : (
		<AggregatorsShell>
			<QueryDisplay query={query} forceRender="error" />
		</AggregatorsShell>
	);

/** Aggregator keys on Integrations: generic, one row per aggregator the API
 * lists, key hint only. Nothing here names a specific aggregator. */
export const AggregatorsCard = ({
	tenantId,
	canManage,
}: {
	tenantId: string;
	canManage: boolean;
}) => {
	const query = useAggregatorsQuery({ tenantId });
	const [editing, setEditing] = useState<AggregatorRow | null>(null);
	const [removing, setRemoving] = useState<AggregatorRow | null>(null);

	return (
		<QueryDisplay
			query={query}
			ErrorSlot={AggregatorsError}
			LoadingSlot={
				<AggregatorsShell>
					<QueryDisplay query={query} forceRender="loading" />
				</AggregatorsShell>
			}
		>
			{({ data }) => (
				<AggregatorsShell>
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
				</AggregatorsShell>
			)}
		</QueryDisplay>
	);
};
