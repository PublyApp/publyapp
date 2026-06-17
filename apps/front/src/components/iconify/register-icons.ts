import { addCollection, type IconifyJSON } from '@iconify/react';
import forEach from 'lodash/forEach';

import allIcons from './icon-sets';

// ----------------------------------------------------------------------

export const iconSets: IconifyJSON[] = [];
const iconSetByPrefix = new Map<string, IconifyJSON>();

for (const [key, value] of Object.entries(allIcons)) {
	const [prefix, iconName] = key.split(':');
	const existingPrefix = iconSetByPrefix.get(prefix);

	if (existingPrefix) {
		existingPrefix.icons[iconName] = value;
	} else {
		const iconSet = {
			prefix,
			icons: {
				[iconName]: value,
			},
		};

		iconSets.push(iconSet);
		iconSetByPrefix.set(prefix, iconSet);
	}
}

export const allIconNames = Object.keys(allIcons) as IconifyName[];

export type IconifyName = keyof typeof allIcons;

// ----------------------------------------------------------------------

let areIconsRegistered = false;

export const registerIcons = () => {
	if (areIconsRegistered) {
		return;
	}

	forEach(iconSets, (iconSet) => {
		const iconSetConfig = {
			...iconSet,
			width: (iconSet.prefix === 'carbon' && 32) || 24,
			height: (iconSet.prefix === 'carbon' && 32) || 24,
		};

		addCollection(iconSetConfig);
	});

	areIconsRegistered = true;
};
