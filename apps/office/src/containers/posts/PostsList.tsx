import { useQuery } from '@tanstack/react-query';

const PostsList = () => {
	const { data } = useQuery({
		queryKey: ['posts'],
		queryFn: async () => {
			return Parse.Cloud.run('findPost');
		},
	});
	return (
		<>
			<div>PostsList</div>
			{data?.map((post: any) => {
				return <pre>{JSON.stringify(post.toJSON(), null, 2)}</pre>;
			})}
		</>
	);
};

export default PostsList;
