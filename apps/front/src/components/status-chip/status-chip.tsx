import Chip from '@mui/material/Chip';

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
	unknownLabel = 'Unknown',
	colorMap,
	sx,
}: StatusChipProps) => {
	const label = status ?? unknownLabel;
	const color = colorMap?.[label] ?? 'default';

	return <Chip label={label} color={color} size="small" sx={sx} />;
};
