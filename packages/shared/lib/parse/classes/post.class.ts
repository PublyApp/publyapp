import { className } from '@/shared/lib/constants';
import type { IPostWithRelations } from '@/shared/types/db/post.types';

export class ParsePost extends Parse.Object<IPostWithRelations> {
	static className = className.POST;

	constructor(attributes?: DeepPartial<IPostWithRelations>) {
		super(ParsePost.className, attributes as IPostWithRelations);
	}
}

Parse.Object.registerSubclass(ParsePost.className, ParsePost);
