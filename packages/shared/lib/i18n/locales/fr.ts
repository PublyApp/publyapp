import common from '../json/common.fr.json' with { type: 'json' };
import responseMessage from '../json/response-message.fr.json' with {
	type: 'json',
};
import zod from '../json/zod.fr.json' with { type: 'json' };
import type { LooseResource } from './en';

const resourceFR = {
	common,
	zod,
	responseMessage,
} as const satisfies LooseResource;

export default resourceFR;
