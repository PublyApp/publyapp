import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import Link from '@mui/material/Link';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import capitalize from 'lodash/capitalize';
import { useEffect, useState } from 'react';

import type { AuditLogDetail } from '@org/client-ts/src/models';
import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import DrawerAnchor from '#app/components/drawer-anchor.tsx';
import { EmptyContent } from '#app/components/empty-content/empty-content.tsx';
import { ErrorContent } from '#app/components/empty-content/error-content.tsx';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import { RouterLink } from '#app/components/router-link.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';
import { isProblemFailure, toApiFailure } from '#app/lib/api-failure/index.ts';
import { useGetStaffAuditLog } from '#app/lib/react-query/features/staff/staff-audit-log.hooks.ts';

import { AuditLogActor } from '../../details/_parts/audit-log-actor';
import { AuditLogContextGrid } from '../../details/_parts/audit-log-context-grid';
import { AuditLogHero } from '../../details/_parts/audit-log-hero';
import { AuditLogPayload } from '../../details/_parts/audit-log-payload';
import { useAuditLogInspect } from './use-audit-log-inspect';

export const AuditLogInspectDrawer = () => {
	const { t } = useTranslate();
	const { inspectedLogId, closeInspect } = useAuditLogInspect();
	const open = !!inspectedLogId;

	const auditLogQuery = useGetStaffAuditLog({
		variables: { logId: inspectedLogId ?? '' },
		enabled: open,
	});

	// Hold on to the last successful payload so the closing transition keeps
	// rendering content instead of flashing back to the skeleton when the query
	// flips to disabled.
	const [lastAuditLog, setLastAuditLog] = useState<AuditLogDetail | null>(null);

	useEffect(() => {
		if (auditLogQuery.data) {
			setLastAuditLog(auditLogQuery.data);
		}
	}, [auditLogQuery.data]);

	// When reopening the drawer with a different id, the held-over payload is
	// stale — drop it so the body shows the skeleton until the new query
	// resolves, instead of flashing the previous log.
	const isStaleHoldover =
		lastAuditLog !== null &&
		inspectedLogId !== null &&
		lastAuditLog.id !== inspectedLogId;
	const effectiveAuditLog =
		auditLogQuery.data ?? (isStaleHoldover ? null : lastAuditLog);

	return (
		<Drawer
			open={open}
			onClose={closeInspect}
			anchor="right"
			sx={(theme) => ({
				zIndex: theme.zIndex.modal + 1,
			})}
			slotProps={{
				transition: { appear: true },
				paper: {
					sx: {
						width: 480,
						maxWidth: '100%',
						overflow: 'unset',
					},
				},
			}}
		>
			<DrawerAnchor
				onClick={closeInspect}
				aria-label={t('close')}
				sx={{ left: 0 }}
			>
				<Iconify icon="mingcute:close-line" width={18} />
			</DrawerAnchor>

			<AuditLogInspectDrawerBody
				auditLog={effectiveAuditLog}
				isPending={auditLogQuery.isPending && open}
				error={auditLogQuery.error}
			/>
		</Drawer>
	);
};

type AuditLogInspectDrawerBodyProps = {
	auditLog: AuditLogDetail | null;
	isPending: boolean;
	error: unknown;
};

const AuditLogInspectDrawerBody = ({
	auditLog,
	isPending,
	error,
}: AuditLogInspectDrawerBodyProps) => {
	const { t } = useTranslate();

	if (auditLog?.id) {
		return (
			<Stack spacing={3} sx={{ p: 3, pt: 8 }}>
				<Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
					<Link
						component={RouterLink}
						href={FRONT_PATH_NAMES.staff.auditLogs.details(auditLog.id)}
						underline="hover"
						sx={{
							display: 'inline-flex',
							alignItems: 'center',
							gap: 0.75,
							fontSize: '0.8125rem',
							fontWeight: 600,
						}}
					>
						{capitalize(t('view-details'))}
						<Iconify icon="eva:external-link-outline" width={16} />
					</Link>
				</Box>
				<AuditLogHero auditLog={auditLog} sx={{ p: 0 }} />
				<AuditLogActor auditLog={auditLog} />
				<AuditLogContextGrid
					auditLog={auditLog}
					fields={['ip', 'userAgent', 'targetId', 'eventId']}
					layout="single-column"
				/>
				<AuditLogPayload details={auditLog.details} />
			</Stack>
		);
	}

	if (error) {
		return <AuditLogInspectDrawerError error={error} />;
	}

	if (isPending) {
		return <AuditLogInspectDrawerSkeleton />;
	}

	return null;
};

const AuditLogInspectDrawerSkeleton = () => {
	return (
		<Stack spacing={3} sx={{ p: 3, pt: 8 }}>
			<Skeleton variant="rounded" width={120} height={24} />
			<Skeleton variant="text" width="70%" height={28} />
			<Skeleton variant="text" width="40%" height={16} />
			<Stack direction="row" spacing={1.5} alignItems="center">
				<Skeleton variant="circular" width={36} height={36} />
				<Stack spacing={0.5} sx={{ flex: 1 }}>
					<Skeleton variant="text" width="50%" height={16} />
					<Skeleton variant="text" width="70%" height={14} />
				</Stack>
			</Stack>
			{[1, 2, 3, 4].map((row) => (
				<Stack key={row} spacing={0.5}>
					<Skeleton variant="text" width="30%" height={12} />
					<Skeleton variant="text" width="80%" height={18} />
				</Stack>
			))}
		</Stack>
	);
};

const AuditLogInspectDrawerEmpty = () => {
	const { t } = useTranslate();

	return (
		<Box sx={{ p: 3, pt: 8 }}>
			<EmptyContent
				title={capitalize(
					t('no-items-found', {
						item: t('audit-log'),
						ns: 'response-message',
					}),
				)}
				imgUrl="/assets/icons/empty/ic-content.svg"
			/>
		</Box>
	);
};

const AuditLogInspectDrawerError = ({ error }: { error: unknown }) => {
	const { t } = useTranslate();

	const failure = toApiFailure(error);
	if (
		isProblemFailure(failure) &&
		(failure.status === 404 ||
			(failure.status === 400 && failure.translationKey === 'malformed-id'))
	) {
		return <AuditLogInspectDrawerEmpty />;
	}

	return (
		<Box sx={{ p: 3, pt: 8 }}>
			<ErrorContent
				title={t('error-loading-items', {
					item: t('audit-log'),
					ns: 'response-message',
				})}
			/>
		</Box>
	);
};
