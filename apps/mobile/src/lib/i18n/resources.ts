// Only the namespaces the mobile app uses: the `en`/`fr` barrels would bundle
// all 15 (marketing and staff copy included).
import commonEn from '@org/shared-ts/lib/i18n/json/common.en.json' with { type: 'json' };
import commonFr from '@org/shared-ts/lib/i18n/json/common.fr.json' with { type: 'json' };
import responseMessageEn from '@org/shared-ts/lib/i18n/json/response-message.en.json' with { type: 'json' };
import responseMessageFr from '@org/shared-ts/lib/i18n/json/response-message.fr.json' with { type: 'json' };

export const resources = {
	en: { common: commonEn, 'response-message': responseMessageEn },
	fr: { common: commonFr, 'response-message': responseMessageFr },
};
