import type { UseQueryResult } from '@tanstack/react-query';
import { createContext, useContext } from 'react';

/**
 * Surface-session-recovery is true when the root shell has switched to the neutral
 * authed shell in a recoverable state after a session validation failure.
 */
const SessionSurfaceRecoveryContext = createContext<boolean | null>(null);

SessionSurfaceRecoveryContext.displayName = 'SessionSurfaceRecoveryContext';

export const SessionSurfaceRecoveryProvider =
	SessionSurfaceRecoveryContext.Provider;

export const useSessionSurfaceRecovery = (): boolean => {
	const value = useContext(SessionSurfaceRecoveryContext);
	if (value == null) {
		throw new Error(
			'useSessionSurfaceRecovery must be used within SessionSurfaceRecoveryProvider',
		);
	}

	return value;
};

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
			'useSessionSurfaceValidation must be used inside SessionSurfaceValidationProvider',
		);
	}

	return value;
};
