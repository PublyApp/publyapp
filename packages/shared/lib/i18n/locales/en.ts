import common from '../json/common.en.json' with { type: 'json' };
import responseMessage from '../json/response-message.en.json' with {
	type: 'json',
};
import zod from '../json/zod.en.json' with { type: 'json' };

const resourceEN = {
	common,
	zod,
	responseMessage,
} as const;

export type Resource = typeof resourceEN;
export type LooseResource = ToPrimitive<Resource>;

export default resourceEN;
