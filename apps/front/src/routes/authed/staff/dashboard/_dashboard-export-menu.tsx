import {
	IconChevronDown,
	IconDownload,
	IconFileTypeCsv,
	IconJson,
} from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { auditLogExportDownloadDescriptor } from '~/lib/audit-logs/audit-log-export-format';
import {
	displayLocalMutationFailure,
	toastLocalMutationResult,
} from '~/lib/mutation-feedback/mutation-toast';
import {
	useExportStaffAuditLogsMutation,
	type StaffAuditLogExportFormat,
} from '~/lib/query/staff-audit-logs';
import { downloadFile, formatExportDateStamp } from '~/utils/download-file';

import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

const FORMATS: ReadonlyArray<{
	format: StaffAuditLogExportFormat;
	label: string;
	hintKey: string;
	icon: typeof IconFileTypeCsv;
}> = [
	{
		format: 'csv',
		label: 'CSV',
		hintKey: 'dashboard-export-csv-hint',
		icon: IconFileTypeCsv,
	},
	{
		format: 'json',
		label: 'JSON',
		hintKey: 'dashboard-export-json-hint',
		icon: IconJson,
	},
];

/**
 * The reports' one « Exporter » button (§5.4): a single outline button opening
 * the standard dropdown (one group titled « Format d'export », one item per
 * format), pending label « Export… », then the audit-log export download and
 * its toast. The old native select + second button pair is gone.
 */
export const DashboardExportMenu = ({
	startDate,
	onAuthFailure,
}: {
	startDate: string;
	onAuthFailure: () => void;
}) => {
	const { t } = useTranslation(['common', 'staff-audit-logs']);
	const exportMutation = useExportStaffAuditLogsMutation();
	const pending = exportMutation.isPending;

	const run = async (format: StaffAuditLogExportFormat) => {
		let data: ArrayBuffer | undefined;
		try {
			data = await exportMutation.mutateAsync({ format, startDate });
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

		const descriptor = auditLogExportDownloadDescriptor(format);
		const fileName = `audit-logs-${formatExportDateStamp(new Date())}.${descriptor.extension}`;
		try {
			downloadFile({
				data,
				fileName,
				mimeType: descriptor.mimeType,
			});
		} catch {
			toastLocalMutationResult.error(t('common:export-failed'));
			return;
		}

		toastLocalMutationResult.success(
			t('dashboard-export-complete', { file: fileName }),
		);
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button
						variant="outline"
						disabled={pending}
						data-testid="staff-dashboard-export-trigger"
					/>
				}
			>
				<IconDownload data-icon="inline-start" aria-hidden="true" />
				{pending ? t('dashboard-exporting') : t('dashboard-export')}
				<IconChevronDown
					data-icon="inline-end"
					aria-hidden="true"
					className="text-muted-foreground"
				/>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="min-w-48">
				<DropdownMenuGroup>
					<DropdownMenuLabel>{t('dashboard-export-format')}</DropdownMenuLabel>
					{FORMATS.map((entry) => (
						<DropdownMenuItem
							key={entry.format}
							data-testid={`staff-dashboard-export-${entry.format}`}
							onClick={() => void run(entry.format)}
						>
							<entry.icon aria-hidden="true" />
							{entry.label}
							<span className="ml-auto text-xs text-muted-foreground">
								{t(entry.hintKey)}
							</span>
						</DropdownMenuItem>
					))}
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
};
