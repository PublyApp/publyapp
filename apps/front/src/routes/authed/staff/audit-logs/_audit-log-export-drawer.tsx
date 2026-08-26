import { IconDownload } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import {
	Drawer,
	DrawerBody,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from '~/components/ui/drawer';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '~/components/ui/select';
import { downloadFile, formatExportDateStamp } from '~/lib/download-file';
import {
	displayLocalMutationFailure,
	toastLocalMutationResult,
} from '~/lib/mutation-toast';
import {
	useExportStaffAuditLogsMutation,
	type StaffAuditLogExportFormat,
} from '~/lib/query/staff-audit-logs';
import { shouldLogoutForFailure } from '~/lib/should-logout-for-failure';

export type AuditLogExportFilters = {
	actions?: string[];
	startDate?: string;
	endDate?: string;
};

const EXPORT_FORMATS: StaffAuditLogExportFormat[] = ['csv', 'json'];

/** Server-side filtered export of the audit-log dataset (the `export`
 * endpoint mirrors the list's filters). Excluded from the grid, owned by the
 * list toolbar — see docs/guides/list-pages-search-filter-cursor-pagination.md
 * section 7.1's overlay-ownership rule. */
export const AuditLogExportDrawer = ({
	isOpen,
	filters,
	onOpenChange,
	onAuthFailure,
}: {
	isOpen: boolean;
	filters: AuditLogExportFilters;
	onOpenChange: (isOpen: boolean) => void;
	onAuthFailure: () => void;
}) => {
	const { t } = useTranslation(['staff-audit-logs', 'common']);
	const [format, setFormat] = useState<StaffAuditLogExportFormat>('csv');
	const exportMutation = useExportStaffAuditLogsMutation();
	const isExporting = exportMutation.isPending;

	const handleExport = async () => {
		let data: ArrayBuffer | undefined;
		try {
			data = await exportMutation.mutateAsync({
				format,
				actions: filters.actions,
				startDate: filters.startDate,
				endDate: filters.endDate,
			});
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
			downloadFile({
				data,
				fileName: `audit-logs-${formatExportDateStamp(new Date())}.${format}`,
				mimeType: format === 'csv' ? 'text/csv' : 'application/json',
			});
		} catch {
			toastLocalMutationResult.error(t('common:export-failed'));
			return;
		}

		toastLocalMutationResult.success(t('common:export-complete'));
		onOpenChange(false);
	};

	return (
		<Drawer open={isOpen} onOpenChange={onOpenChange}>
			<DrawerContent data-testid="audit-log-export-drawer">
				<DrawerHeader>
					<DrawerTitle>{t('export')}</DrawerTitle>
					<DrawerDescription>
						{t('export-audit-logs-current-filters')}
					</DrawerDescription>
				</DrawerHeader>
				<DrawerBody>
					<div className="space-y-2">
						<label
							htmlFor="audit-log-export-format"
							className="text-sm font-medium text-foreground"
						>
							{t('format')}
						</label>
						<Select
							value={format}
							onValueChange={(value) =>
								setFormat(value as StaffAuditLogExportFormat)
							}
						>
							<SelectTrigger
								id="audit-log-export-format"
								data-testid="audit-log-export-format-trigger"
								className="w-full"
							>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{EXPORT_FORMATS.map((option) => (
									<SelectItem key={option} value={option}>
										{option.toUpperCase()}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</DrawerBody>
				<DrawerFooter>
					<Button
						type="button"
						variant="ghost"
						onClick={() => onOpenChange(false)}
						disabled={isExporting}
					>
						{t('common:cancel')}
					</Button>
					<Button
						type="button"
						variant="default"
						onClick={() => {
							void handleExport();
						}}
						disabled={isExporting}
					>
						<IconDownload aria-hidden="true" className="size-4" />
						{isExporting ? t('exporting') : t('export')}
					</Button>
				</DrawerFooter>
			</DrawerContent>
		</Drawer>
	);
};
