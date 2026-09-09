import type { UseQueryResult } from '@tanstack/react-query';
import { createContext, useContext } from 'react';

const SessionSurfaceValidationContext = createContext<UseQueryResult<
	string | null,
	unknown
> | null>(null);

SessionSurfaceValidationContext.displayName = 'SessionSurfaceValidationContext';

export const SessionSurfaceValidationProvider =
	SessionSurfaceValidationContext.Provider;

export const useSessionSurfaceValidation = (): UseQueryResult<
	string | null,
	unknown
> => {
	const value = useContext(SessionSurfaceValidationContext);
	if (!value) {
		throw new Error(
			'useSessionSurfaceValidation must be used within SessionSurfaceValidationProvider',
		);
	}

	return value;
};
