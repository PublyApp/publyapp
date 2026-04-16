export const normalizeGeneratedHomepageId = (value) => {
	if (typeof value !== 'string' || value.trim().length === 0) {
		return null;
	}

	if (!/^\d+$/.test(value)) {
		return null;
	}

	const id = Number.parseInt(value, 10);

	if (!Number.isSafeInteger(id) || id <= 0) {
		return null;
	}

	return id;
};

export const findGeneratedHomepageManifestEntry = (manifest, value) => {
	let id = null;

	if (typeof value === 'number') {
		if (Number.isSafeInteger(value) && value > 0) {
			id = value;
		}
	} else {
		id = normalizeGeneratedHomepageId(value);
	}

	if (id === null) {
		return null;
	}

	for (const entry of manifest) {
		if (entry.id === id) {
			return entry;
		}
	}

	return null;
};
