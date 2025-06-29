import type { Theme } from '@mui/material';
import type { MRT_RowData, MRT_TableOptions } from 'material-react-table';
import { defaultTablePreset } from './presets/default-preset';

export type PresetKey = 'default';
export type TablePreset = Omit<
	MRT_TableOptions<MRT_RowData>,
	'columns' | 'data'
>;

export const tablePresets: Record<PresetKey, (theme: Theme) => TablePreset> = {
	default: defaultTablePreset,
};
