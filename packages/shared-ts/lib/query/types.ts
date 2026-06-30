import type { ApiFailure } from '../api-failure/types';

export interface ClientAccessor<TApiClient = unknown> {
	getOrCreateClient: (tenantId: string) => TApiClient;
	getOrCreateStaffClient: () => TApiClient;
	getOrCreateAnonymousClient: () => TApiClient;
}

export type QueryScope = 'tenant' | 'staff' | 'anonymous' | 'auth';

export type OnLogout = (failure: ApiFailure) => void;

export type OnToast = (failure: ApiFailure, context: { scope: QueryScope }) => void;

export type ResolveTenant = () => string | undefined;

export type QueryErrorHandlers = {
	onLogout?: OnLogout;
	onToast?: OnToast;
	resolveTenant?: ResolveTenant;
};

export type QueryFactoryOptions<TApiClient = unknown> = {
	clientAccessor: ClientAccessor<TApiClient>;
	handlers?: QueryErrorHandlers;
};
