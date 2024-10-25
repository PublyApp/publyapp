import { enUS as enUSCore, frFR as frFRCore } from '@mui/material/locale';
// TODO: adapt to new versions
// import { enUS as enUSDataGrid, frFR as frFRDataGrid } from '@mui/x-data-grid';
// import { enUS as enUSDate, frFR as frFRDate } from '@mui/x-date-pickers';
// eslint-disable-next-line import/extensions
import { enUS as enUSAdapter, fr as frFRAdapter } from 'date-fns/locale/index.js'; // ! important: import of directory not supported error;
import _ from 'lodash';

// import * as materialLocale from '@mui/material/locale';
// import * as dataGrid from '@mui/x-data-grid';
// import * as datePickers from '@mui/x-date-pickers';

import { type AppLocale } from '@/shared/lib/i18n/resources';

// const { enUS: enUSCore, frFR: frFRCore } = materialLocale;
// const { enUS: enUSDataGrid, frFR: frFRDataGrid } = dataGrid;
// const { enUS: enUSDate, frFR: frFRDate } = datePickers;
// const { enUS: enUSAdapter, fr: frFRAdapter } = dateFnLocale;

type SystemValue = /* typeof enUSDate & typeof enUSDataGrid & */ typeof enUSCore;

// PLEASE REMOVE `LOCAL STORAGE` WHEN YOU CHANGE SETTINGS.
// ----------------------------------------------------------------------

export type LangConfig = {
	label: string;
	value: AppLocale;
	systemValue: SystemValue;
	adapterLocale: Locale;
	icon: string;
};

const enLangConfig: LangConfig = {
	label: 'English',
	value: 'en',
	systemValue: _.merge({}, /* enUSDate, enUSDataGrid, */ enUSCore),
	adapterLocale: enUSAdapter,
	icon: 'flagpack:gb-nir',
};

const frLangConfig: LangConfig = {
	label: 'French',
	value: 'fr',
	systemValue: _.merge({}, /* frFRDate, frFRDataGrid, */ frFRCore),
	adapterLocale: frFRAdapter,
	icon: 'flagpack:fr',
};

export const langConfigsMap = new Map<AppLocale, LangConfig>([
	['en', enLangConfig],
	['fr', frLangConfig],
]);

export const allLangConfigs = Array.from(langConfigsMap.values());

export const defaultLangConfig = enLangConfig; // English

// GET MORE COUNTRY FLAGS
// https://icon-sets.iconify.design/flagpack/
// https://www.dropbox.com/sh/nec1vwswr9lqbh9/AAB9ufC8iccxvtWi3rzZvndLa?dl=0
