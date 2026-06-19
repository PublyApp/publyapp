import { createServerOnlyFn } from '@tanstack/react-start';
import { getRequestHeader } from '@tanstack/react-start/server';

export const getCookieHeader = createServerOnlyFn(() =>
	getRequestHeader('cookie'),
);
