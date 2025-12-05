import { APP_ID } from '@/shared/lib/constants';
import duration from '@/shared/utils/duration.utils';

export const SIDEBAR_COOKIE_NAME = `${APP_ID}-sidebar_state`;
export const SIDEBAR_COOKIE_MAX_AGE = duration.toSeconds('7d');
export const SIDEBAR_WIDTH = '16rem';

export const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
