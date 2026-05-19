import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import map from 'lodash/map';
import { useEffect, useRef, useState } from 'react';

import type { AuditLogDetail } from '@org/client-ts/src/models';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';
import { copyToClipboard } from '#app/lib/clipboard.ts';

type AuditLogContextField = 'ip' | 'userAgent' | 'targetId' | 'eventId';

type AuditLogContextGridLayout = 'two-column' | 'single-column';

type AuditLogContextGridProps = {
	auditLog: AuditLogDetail;
	fields: AuditLogContextField[];
	layout?: AuditLogContextGridLayout;
};

type Cell = {
	key: AuditLogContextField;
	labelKey: string;
	value: string;
	mono: boolean;
};

const dash = '-';

export const AuditLogContextGrid = ({
	auditLog,
	fields,
	layout = 'two-column',
}: AuditLogContextGridProps) => {
	const { t } = useTranslate();
	const [copiedField, setCopiedField] = useState<AuditLogContextField | null>(
		null,
	);
	const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		return () => {
			if (copiedTimeoutRef.current) {
				clearTimeout(copiedTimeoutRef.current);
			}
		};
	}, []);

	const allCells: Record<AuditLogContextField, Cell> = {
		ip: {
			key: 'ip',
			labelKey: 'ip-address',
			value: auditLog.ipAddress || dash,
			mono: true,
		},
		userAgent: {
			key: 'userAgent',
			labelKey: 'user-agent',
			value: auditLog.userAgent || dash,
			mono: false,
		},
		targetId: {
			key: 'targetId',
			labelKey: 'target-id',
			value: auditLog.targetId ?? dash,
			mono: true,
		},
		eventId: {
			key: 'eventId',
			labelKey: 'event-id',
			value: auditLog.id ?? dash,
			mono: true,
		},
	};

	const visible = map(fields, (f) => allCells[f]);

	const handleCopyValue = async (cell: Cell) => {
		if (cell.value === dash) {
			return;
		}

		const didCopy = await copyToClipboard(cell.value, {
			promptLabel: t('copy'),
		});

		if (!didCopy) {
			return;
		}

		setCopiedField(cell.key);

		if (copiedTimeoutRef.current) {
			clearTimeout(copiedTimeoutRef.current);
		}

		copiedTimeoutRef.current = setTimeout(() => {
			setCopiedField(null);
		}, 1600);
	};

	const cellSize = layout === 'single-column' ? { xs: 12 } : { xs: 12, sm: 6 };

	return (
		<Grid container spacing={2}>
			{map(visible, (cell) => {
				const label = String(t(cell.labelKey as never));
				const isCopyable = cell.value !== dash;
				const isCopied = copiedField === cell.key;

				return (
					<Grid key={cell.key} size={cellSize}>
						<Typography
							variant="caption"
							sx={{
								color: 'text.secondary',
								textTransform: 'uppercase',
								letterSpacing: 0.4,
								display: 'block',
								mb: 0.5,
							}}
						>
							{label}
						</Typography>
						{isCopyable ? (
							<Tooltip
								title={isCopied ? `${t('copied')}: ${cell.value}` : cell.value}
								placement="top"
								enterDelay={400}
								arrow
							>
								<Box
									component="button"
									type="button"
									aria-label={`${t('copy')} ${label}: ${cell.value}`}
									onClick={() => {
										void handleCopyValue(cell);
									}}
									sx={{
										m: 0,
										p: 0,
										border: 0,
										width: 1,
										minWidth: 0,
										display: 'inline-flex',
										alignItems: 'center',
										gap: 0.75,
										bgcolor: 'transparent',
										color: cell.mono ? 'text.secondary' : 'text.primary',
										fontFamily: cell.mono ? 'monospace' : 'inherit',
										fontSize: cell.mono ? '0.8rem' : 'inherit',
										textAlign: 'left',
										cursor: 'copy',
										'&:focus-visible': {
											outline: '2px solid',
											outlineColor: 'primary.main',
											outlineOffset: 2,
											borderRadius: 0.5,
										},
									}}
								>
									<Typography
										component="span"
										variant={cell.mono ? 'caption' : 'body2'}
										noWrap
										sx={{
											minWidth: 0,
											flexGrow: 1,
											fontFamily: 'inherit',
											fontSize: 'inherit',
											color: 'inherit',
										}}
									>
										{cell.value}
									</Typography>
									<Iconify
										icon={
											isCopied ? 'solar:check-circle-bold' : 'solar:copy-bold'
										}
										width={15}
										aria-hidden
										sx={{
											flexShrink: 0,
											color: isCopied ? 'success.main' : 'text.disabled',
										}}
									/>
								</Box>
							</Tooltip>
						) : (
							<Box
								sx={{
									overflow: 'hidden',
									textOverflow: 'ellipsis',
									whiteSpace: 'nowrap',
									fontFamily: cell.mono ? 'monospace' : undefined,
									fontSize: cell.mono ? '0.8rem' : undefined,
									color: cell.mono ? 'text.secondary' : 'text.primary',
								}}
							>
								{cell.value}
							</Box>
						)}
					</Grid>
				);
			})}
		</Grid>
	);
};
