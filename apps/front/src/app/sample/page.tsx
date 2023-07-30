import { getServerAuth } from '../../utils/parseAuth';

const Sample = async () => {
	const session = await getServerAuth();
	if (!session) return <div>not authed</div>;
	return <div>page</div>;
};

export default Sample;
