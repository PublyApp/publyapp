import Chip from '@mui/material/Chip';
import toLower from 'lodash/toLower';
import { useTranslation } from 'react-i18next';

export type StatusChipColor = 'success' | 'warning' | 'error' | 'default';

export type StatusChipProps = {
	status?: string | null;
	unknownLabel?: string;
	colorMap?: Partial<Record<string, StatusChipColor>>;
	sx?: object;
};

// Shared minimal status badge used across "details" pages (tenant/user/etc).
// The caller owns the domain-specific mapping between status value and color.
export const StatusChip = ({
	status,
	unknownLabel,
	colorMap,
	sx,
}: StatusChipProps) => {
	const { t } = useTranslation();

	const label = status
		? t(`status-${toLower(status)}`, { defaultValue: status })
		: (unknownLabel ?? t('status-unknown'));
	const color = colorMap?.[status ?? ''] ?? 'default';

	return <Chip label={label} color={color} size="small" sx={sx} />;
};
