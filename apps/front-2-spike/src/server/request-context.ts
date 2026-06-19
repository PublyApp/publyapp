import { createServerFn } from '@tanstack/react-start';
import { getRequestHeader } from '@tanstack/react-start/server';

export const getCookieHeader = createServerFn({ method: 'GET' }).handler(() =>
	getRequestHeader('cookie'),
);
