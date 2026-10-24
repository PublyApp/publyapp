import {
	isUntypedArray,
	isUntypedBoolean,
	isUntypedNumber,
	isUntypedObject,
	isUntypedString,
} from '@microsoft/kiota-abstractions';
import type { UntypedNode } from '@microsoft/kiota-abstractions';

/** What an `UntypedNode` serializes to: plain JSON. */
export type JsonValue =
	| string
	| number
	| boolean
	| null
	| JsonValue[]
	| JsonObject;

interface JsonObject {
	[key: string]: JsonValue;
}

/**
 * Reads an `UntypedNode` (the open JSON fields of the generated request
 * bodies, which is what Kiota sends) back into plain JSON, so a test can
 * assert the wire payload with `toEqual`. A missing node reads as `null`.
 */
export const untypedNodeToJson = (
	node: UntypedNode | null | undefined,
): JsonValue => {
	if (node === null || node === undefined) {
		return null;
	}
	if (isUntypedArray(node)) {
		return node.getValue().map(untypedNodeToJson);
	}
	if (isUntypedObject(node)) {
		return Object.fromEntries(
			Object.entries(node.getValue()).map(([key, value]) => [
				key,
				untypedNodeToJson(value),
			]),
		);
	}
	if (
		isUntypedString(node) ||
		isUntypedNumber(node) ||
		isUntypedBoolean(node)
	) {
		return node.getValue();
	}
	return null;
};
