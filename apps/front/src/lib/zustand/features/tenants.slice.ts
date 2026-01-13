import { logger } from '@/shared/lib/logger/iso-logger';
import Slice from '../utils/Slice';

export type TenantsSliceValues = {
	createTenantForm: {
		submit: (e?: React.SyntheticEvent) => void | Promise<void>;
		isSubmitting: boolean;
	};
};

export type TenantsSliceActions = {
	dummy: () => void;
};

export type DummySliceState = TenantsSliceValues & TenantsSliceActions;

const defaultValues: TenantsSliceValues = {
	// bear: 0,
	createTenantForm: {
		submit: () => {
			logger.warn('==== submit create new tenant ====');
		},
		isSubmitting: false,
	},
};

const sliceName = 'tenantsSlice' as const;

const tenantsSlice = new Slice<
	typeof sliceName,
	TenantsSliceValues,
	TenantsSliceActions
>({
	name: sliceName,
	defaultValues,
	initializer: (_set) => {
		return {
			...defaultValues,
			dummy: () => {
				logger.warn('==== Dummy ====');
			},
		};
	},
});

export default tenantsSlice;
