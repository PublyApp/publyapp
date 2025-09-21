import { useTheme } from '@mui/material';
import _, { type MergeWithCustomizer } from 'lodash';
import {
	type MRT_RowData,
	type MRT_TableOptions,
	useMaterialReactTable,
} from 'material-react-table';
import { useMemo } from 'react';
import { type PresetKey, tablePresets } from '../lib/mrt-table/table-presets';

export const useMRTTable = <TData extends MRT_RowData>(
	preset: PresetKey,
	overrides: MRT_TableOptions<TData>,
) => {
	const theme = useTheme();

	const mergedProps = useMemo(() => {
		return _.mergeWith({}, tablePresets[preset](theme), overrides, customizer);
	}, [preset, overrides, theme]);

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
	// Handle sx property specially - merge objects, concatenate arrays, or use function
	if (key === 'sx') {
		// If both are objects, merge them
		if (
			_.isObject(objValue) &&
			!_.isArray(objValue) &&
			!_.isFunction(objValue) &&
			_.isObject(srcValue) &&
			!_.isArray(srcValue) &&
			!_.isFunction(srcValue)
		) {
			return _.merge({}, objValue, srcValue);
		}

		// If both are arrays, concatenate them
		if (_.isArray(objValue) && _.isArray(srcValue)) {
			return objValue.concat(srcValue);
		}

		// If one is function and other is object/array, create a function that handles both
		if (_.isFunction(objValue) || _.isFunction(srcValue)) {
			return (...args: unknown[]) => {
				const objResult = _.isFunction(objValue) ? objValue(...args) : objValue;
				const srcResult = _.isFunction(srcValue) ? srcValue(...args) : srcValue;

				// Merge results if both are objects
				if (
					_.isObject(objResult) &&
					!_.isArray(objResult) &&
					_.isObject(srcResult) &&
					!_.isArray(srcResult)
				) {
					return _.merge({}, objResult, srcResult);
				}

				// Concatenate if both are arrays
				if (_.isArray(objResult) && _.isArray(srcResult)) {
					return objResult.concat(srcResult);
				}

				// Return srcResult if objResult is undefined/null, otherwise return objResult
				return objResult ?? srcResult;
			};
		}

		// For other cases, prefer srcValue over objValue
		return srcValue ?? objValue;
	}

	// Handle arrays - concatenate them
	if (_.isArray(objValue) && _.isArray(srcValue)) {
		return objValue.concat(srcValue);
	}

	// Handle functions - create a combined function
	if (_.isFunction(objValue) && _.isFunction(srcValue)) {
		return (...args: unknown[]) => {
			const objResult = objValue(...args);
			const srcResult = srcValue(...args);

			// Merge results if both are objects
			if (
				_.isObject(objResult) &&
				!_.isArray(objResult) &&
				_.isObject(srcResult) &&
				!_.isArray(srcResult)
			) {
				return _.merge({}, objResult, srcResult);
			}

			// Concatenate if both are arrays
			if (_.isArray(objResult) && _.isArray(srcResult)) {
				return objResult.concat(srcResult);
			}

			// Return srcResult if objResult is undefined/null, otherwise return objResult
			return objResult ?? srcResult;
		};
	}

	// Handle objects - merge them
	if (
		_.isObject(objValue) &&
		!_.isArray(objValue) &&
		!_.isFunction(objValue) &&
		_.isObject(srcValue) &&
		!_.isArray(srcValue) &&
		!_.isFunction(srcValue)
	) {
		return _.merge({}, objValue, srcValue);
	}
};
