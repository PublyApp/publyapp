import type { IPost } from '@shared/types/post.types';
import { className } from '@shared/utils/constants';

export class Post extends Parse.Object<IPost> {
	constructor(attributes?: IPost) {
		super(className.POST, attributes as IPost);
	}
}

Parse.Object.registerSubclass(className.POST, Post);

// const p = new Post();

// const a = p.get('translation');
