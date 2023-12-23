import { functionName } from '../../constants';

import { cloudRunner } from './_cloudRunner';

export const getUsers = cloudRunner<{ lol: string }>(functionName.createAITool);
