export const authMiddleware = async (/* req, res, next */) => {
	// const { t } = getRequestUtils(req);
	// const authorization = getHeader(req, 'Authorization');
	// if (!authorization) {
	// 	return next(new HttpException(401, t('missing-authorization-header')));
	// }
	// const [type, token] = authorization.split(' ');
	// if (type !== 'Bearer') {
	// 	return next(new HttpException(401, t('invalid-authorization-header')));
	// }
	// const user = await User.findOne({
	// 	where: {
	// 		token,
	// 	},
	// });
	// if (!user) {
	// 	return next(new HttpException(401, t('invalid-token')));
	// }
	// req.user = user;
	// return next();
};
