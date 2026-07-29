import type { Theme } from '@mui/material';
import type { MRT_RowData, MRT_TableOptions } from 'material-react-table';

import { defaultCursorPreset } from './presets/default-cursor-preset';
import { defaultTablePreset } from './presets/default-preset';
import { minimalCursorPreset } from './presets/minimal-cursor-preset';
import { minimalTablePreset } from './presets/minimal-preset';

export type PresetKey =
	| 'default'
	| 'default-cursor'
	| 'minimal'
	| 'minimal-cursor';
export type TablePreset = Omit<
	MRT_TableOptions<MRT_RowData>,
	'columns' | 'data'
>;

export const tablePresets: Record<PresetKey, (theme: Theme) => TablePreset> = {
	default: defaultTablePreset,
	'default-cursor': defaultCursorPreset,
	minimal: minimalTablePreset,
	'minimal-cursor': minimalCursorPreset,
};
