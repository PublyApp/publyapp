import { IconChartBar, IconDownload } from '@tabler/icons-react';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '~/components/ui/select';
import { StateSurface } from '~/components/ui/state-surface';
import { auditLogExportDownloadDescriptor } from '~/lib/audit-log-export-format';
import { downloadFile, formatExportDateStamp } from '~/lib/download-file';
import {
	displayLocalMutationFailure,
	toastLocalMutationResult,
} from '~/lib/mutation-toast';
import {
	useExportStaffAuditLogsMutation,
	type StaffAuditLogExportFormat,
} from '~/lib/query/staff-audit-logs';

import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

const EXPORT_FORMATS: StaffAuditLogExportFormat[] = ['csv', 'json'];

/**
 * The one working report: the server-side audit-log export (the same
 * `GET /staff/audit-logs/export-escaped` call the audit-logs page's drawer
 * makes, unfiltered). Format choice + download; failures surface through the
 * shared mutation-feedback path.
 */
const AuditLogExportCard = ({
	t,
	onAuthFailure,
}: {
	t: (key: string) => string;
	onAuthFailure: () => void;
}) => {
	const [format, setFormat] = useState<StaffAuditLogExportFormat>('csv');
	const exportMutation = useExportStaffAuditLogsMutation();

	const handleExport = async () => {
		let data: ArrayBuffer | undefined;
		try {
			data = await exportMutation.mutateAsync({ format });
		} catch (error) {
			if (shouldLogoutForFailure(error)) {
				onAuthFailure();
				return;
			}

			await displayLocalMutationFailure(error, t('common:export-failed'));
			return;
		}

		if (!data) {
			toastLocalMutationResult.error(t('common:export-failed'));
			return;
		}

		try {
			const descriptor = auditLogExportDownloadDescriptor(format);
			downloadFile({
				data,
				fileName: `audit-logs-${formatExportDateStamp(new Date())}.${descriptor.extension}`,
				mimeType: descriptor.mimeType,
			});
		} catch {
			toastLocalMutationResult.error(t('common:export-failed'));
			return;
		}

		toastLocalMutationResult.success(t('common:export-complete'));
	};

	return (
		<Card data-testid="staff-dashboard-reports-export-card">
			<CardHeader>
				<CardTitle>{t('common:export')}</CardTitle>
			</CardHeader>
			<CardContent>
				<p className="text-sm text-muted-foreground">
					{t('reports-export-description')}
				</p>
				<div className="mt-4 flex flex-wrap items-center gap-3">
					<Select
						value={format}
						onValueChange={(value) =>
							setFormat(value as StaffAuditLogExportFormat)
						}
					>
						<SelectTrigger
							id="staff-dashboard-reports-format"
							className="w-40"
							data-testid="staff-dashboard-reports-format"
						>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{EXPORT_FORMATS.map((candidate) => (
								<SelectItem key={candidate} value={candidate}>
									{candidate.toUpperCase()}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Button
						type="button"
						onClick={() => void handleExport()}
						disabled={exportMutation.isPending}
						data-testid="staff-dashboard-reports-download"
					>
						<IconDownload aria-hidden="true" className="size-4" />
						{exportMutation.isPending ? t('exporting') : t('reports-download')}
					</Button>
				</div>
			</CardContent>
		</Card>
	);
};

/**
 * The staff Dashboard › Reports tab. The only report-shaped API that exists
 * today is the audit-log export, so that is the one working card here;
 * everything else is an explicit coming-later state — never fabricated
 * charts or metrics.
 */
const StaffDashboardReportsTab = () => {
	const { t } = useTranslation(['staff-audit-logs', 'common']);
	const [shouldLogout, setShouldLogout] = useState(false);

	if (shouldLogout) {
		return <LogoutRedirect />;
	}

	return (
		<div className="space-y-5" data-testid="staff-dashboard-reports-panel">
			<AuditLogExportCard t={t} onAuthFailure={() => setShouldLogout(true)} />

			<Card>
				<CardHeader>
					<CardTitle>{t('analytics-reports')}</CardTitle>
				</CardHeader>
				<CardContent>
					<StateSurface
						icon={IconChartBar}
						title={t('reports-coming-later-title')}
						description={t('reports-coming-later-description')}
						testId="staff-dashboard-reports-empty"
					/>
				</CardContent>
			</Card>
		</div>
	);
};

export const Route = createFileRoute('/_authed-layout/staff/dashboard/reports')(
	{
		staticData: {
			crumbs: () => [
				{ kind: 'label', labelKey: 'nav-dashboard', to: '/staff/dashboard' },
				{ kind: 'label', labelKey: 'nav-dashboard-reports' },
			],
			i18nNamespaces: ['staff-audit-logs'],
		},
		component: StaffDashboardReportsTab,
	},
);
