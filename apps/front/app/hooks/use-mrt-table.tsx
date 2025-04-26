import _, { type MergeWithCustomizer } from 'lodash';
import {
	useMaterialReactTable,
	type MRT_RowData,
	type MRT_TableOptions,
} from 'material-react-table';
import { tablePresets, type PresetKey } from '../lib/mrt-table/table-presets';
import { useMemo } from 'react';

export const useMRTTable = <TData extends MRT_RowData>(
	preset: PresetKey,
	overrides: MRT_TableOptions<TData>,
) => {
	const mergedProps = useMemo(() => {
		return _.mergeWith({}, tablePresets[preset], overrides, customizer);
	}, [preset, overrides]);

	return useMaterialReactTable<TData>(mergedProps);
};

// ----------------------------------------------------------------------

const customizer: MergeWithCustomizer = (
	objValue,
	srcValue,
	key,
	_object,
	_source,
) => {
	if (key === 'sx') {
		if (
			_.isArray(objValue) ||
			_.isArray(srcValue) ||
			_.isFunction(objValue) ||
			_.isFunction(srcValue)
		) {
			throw new Error(
				'sx must be an object (function or array is not allowed)',
			);
		}
	}
	if (_.isArray(objValue)) {
		return objValue.concat(srcValue);
	}
};
