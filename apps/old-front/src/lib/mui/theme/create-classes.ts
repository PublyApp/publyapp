import { themeConfig } from './theme-config';

// ----------------------------------------------------------------------

export const createClasses = (className: string): string => {
	return `${themeConfig.classesPrefix}__${className}`;
};
