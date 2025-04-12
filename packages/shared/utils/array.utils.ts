// ----------------------------------------------------------------------

export const flattenArray = <T>(list: T[], key = "children"): T[] => {
	let children: T[] = [];

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const flatten = list?.map((item: any) => {
		if (item[key] && item[key].length) {
			children = [...children, ...item[key]];
		}

		return item;
	});

	return flatten?.concat(
		children.length ? flattenArray(children, key) : children,
	);
};
