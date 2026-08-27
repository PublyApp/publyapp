import type { StaffPermissionCatalogEntry } from '~/lib/query/staff-profiles';

export type StaffPermissionOption = {
	value: string;
	label: string;
	description?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null;

const normalizeOptionalString = (value: unknown): string | undefined => {
	if (typeof value !== 'string') {
		return undefined;
	}

	const trimmed = value.trim();
	if (trimmed.length > 0) return trimmed;
	return undefined;
};

const formatModuleLabel = (moduleKey: string): string =>
	moduleKey
		.trim()
		.replace(/[_-]+/g, ' ')
		.replace(/\b\w/g, (value) => value.toUpperCase());

const buildPermissionDescription = (
	moduleKey: string,
	permission: StaffPermissionCatalogEntry,
): string | undefined => {
	const segments = [formatModuleLabel(moduleKey)];
	const name = normalizeOptionalString(permission.name);
	const description = normalizeOptionalString(permission.description);

	if (name) {
		segments.push(name);
	}

	if (description) {
		segments.push(description);
	}

	if (segments.length > 0) return segments.join(' • ');
	return undefined;
};

// Extracted from the create-form route so the route file stays
// component-only for Fast Refresh (react-doctor `only-export-components`).
export const buildStaffPermissionOptions = (
	catalog: unknown,
): StaffPermissionOption[] => {
	if (!isRecord(catalog)) {
		return [];
	}

	const options: StaffPermissionOption[] = [];

	for (const [moduleKey, permissions] of Object.entries(catalog)) {
		if (!isRecord(permissions)) {
			continue;
		}

		for (const permission of Object.values(permissions)) {
			if (!isRecord(permission)) {
				continue;
			}

			const key = normalizeOptionalString(permission.key);
			if (!key) {
				continue;
			}

			const entry: StaffPermissionCatalogEntry = {
				key,
				name: normalizeOptionalString(permission.name),
				description: normalizeOptionalString(permission.description),
			};

			options.push({
				value: key,
				label: key,
				description: buildPermissionDescription(moduleKey, entry),
			});
		}
	}

	return [...options].sort((left, right) =>
		left.label.localeCompare(right.label),
	);
};
