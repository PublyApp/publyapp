import { isUntypedNode, type UntypedNode } from '@microsoft/kiota-abstractions';

/**
 * Safely extracts a value from a property that may be an UntypedNode.
 * Kiota generates some properties as `T | UntypedNode` union types.
 * This utility handles both cases and returns the actual value.
 *
 * @param value - The value which may be a primitive or an UntypedNode
 * @returns The extracted value
 */
export const getUntypedValue = <T>(
	value: T | UntypedNode | null | undefined,
): T | null | undefined => {
	if (value === null || value === undefined) {
		return value;
	}

	if (isUntypedNode(value)) {
		return value.getValue() as T;
	}

	return value;
};

/**
 * Safely extracts a number from a property that may be an UntypedNode.
 * Returns the default value if the property is null/undefined.
 *
 * @param value - The value which may be a number or an UntypedNode
 * @param defaultValue - The default value to return if null/undefined
 * @returns The extracted number or default value
 */
export const getUntypedNumber = (
	value: number | UntypedNode | null | undefined,
	defaultValue = 0,
): number => {
	const extracted = getUntypedValue(value);
	return typeof extracted === 'number' ? extracted : defaultValue;
};

/**
 * Safely extracts a string from a property that may be an UntypedNode.
 * Returns the default value if the property is null/undefined.
 *
 * @param value - The value which may be a string or an UntypedNode
 * @param defaultValue - The default value to return if null/undefined
 * @returns The extracted string or default value
 */
export const getUntypedString = (
	value: string | UntypedNode | null | undefined,
	defaultValue = '',
): string => {
	const extracted = getUntypedValue(value);
	return typeof extracted === 'string' ? extracted : defaultValue;
};

/**
 * Safely extracts an array from a property that may be an UntypedNode.
 * Returns an empty array if the property is null/undefined.
 *
 * @param value - The value which may be an array or an UntypedNode
 * @returns The extracted array or empty array
 */
export const getUntypedArray = <T>(
	value: T[] | UntypedNode | null | undefined,
): T[] => {
	const extracted = getUntypedValue(value);
	return Array.isArray(extracted) ? extracted : [];
};
