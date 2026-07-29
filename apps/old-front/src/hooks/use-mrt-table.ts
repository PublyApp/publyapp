import { useTheme } from '@mui/material';
import isArray from 'lodash/isArray';
import isFunction from 'lodash/isFunction';
import isObject from 'lodash/isObject';
import merge from 'lodash/merge';
import mergeWith from 'lodash/mergeWith';
import {
	type MRT_RowData,
	type MRT_TableOptions,
	useMaterialReactTable,
} from 'material-react-table';
import { useMemo } from 'react';

import { type PresetKey, tablePresets } from '../lib/mrt-table/table-presets';

type MergeWithCustomizer = (
	objValue: unknown,
	srcValue: unknown,
	key?: string | number | symbol,
	object?: unknown,
	source?: unknown,
) => unknown;

export const useMRTTable = <TData extends MRT_RowData>(
	preset: PresetKey,
	overrides: MRT_TableOptions<TData>,
) => {
	const theme = useTheme();

	const mergedProps = useMemo(() => {
		return mergeWith({}, tablePresets[preset](theme), overrides, customizer);
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
			isObject(objValue) &&
			!isArray(objValue) &&
			!isFunction(objValue) &&
			isObject(srcValue) &&
			!isArray(srcValue) &&
			!isFunction(srcValue)
		) {
			return merge({}, objValue, srcValue);
		}

		// If both are arrays, concatenate them
		if (isArray(objValue) && isArray(srcValue)) {
			return objValue.concat(srcValue);
		}

		// If one is function and other is object/array, create a function that handles both
		if (isFunction(objValue) || isFunction(srcValue)) {
			return (...args: unknown[]) => {
				const objResult = isFunction(objValue) ? objValue(...args) : objValue;
				const srcResult = isFunction(srcValue) ? srcValue(...args) : srcValue;

				// Merge results if both are objects
				if (
					isObject(objResult) &&
					!isArray(objResult) &&
					isObject(srcResult) &&
					!isArray(srcResult)
				) {
					return merge({}, objResult, srcResult);
				}

				// Concatenate if both are arrays
				if (isArray(objResult) && isArray(srcResult)) {
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
	if (isArray(objValue) && isArray(srcValue)) {
		return objValue.concat(srcValue);
	}

	// Handle functions - create a combined function
	if (isFunction(objValue) && isFunction(srcValue)) {
		return (...args: unknown[]) => {
			const objResult = objValue(...args);
			const srcResult = srcValue(...args);

			// Merge results if both are objects
			if (
				isObject(objResult) &&
				!isArray(objResult) &&
				isObject(srcResult) &&
				!isArray(srcResult)
			) {
				return merge({}, objResult, srcResult);
			}

			// Concatenate if both are arrays
			if (isArray(objResult) && isArray(srcResult)) {
				return objResult.concat(srcResult);
			}

			// Return srcResult if objResult is undefined/null, otherwise return objResult
			return objResult ?? srcResult;
		};
	}

	// Handle objects - merge them
	if (
		isObject(objValue) &&
		!isArray(objValue) &&
		!isFunction(objValue) &&
		isObject(srcValue) &&
		!isArray(srcValue) &&
		!isFunction(srcValue)
	) {
		return merge({}, objValue, srcValue);
	}
};
