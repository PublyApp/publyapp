export {};
// import events from 'events';
// import fs from 'fs';

// import { sleep } from '@devist/shared/utils/any.utils';

// import { controller } from '@/server/controller';

// const promiseWithResolvers = <T = unknown>() => {
// 	let resolve: (value: T) => void = null as never;
// 	let reject: (reason?: any) => void = null as never;

// 	const promise = new Promise<T>((res, rej) => {
// 		resolve = res;
// 		reject = rej;
// 	});

// 	while (!resolve || !reject) {
// 		// hang the process
// 	}

// 	return { promise, resolve, reject };
// };

// // Parse.Cloud.job('testPostJob', async (req) => {
// // 	let abortHandler: (this: AbortSignal, event: Event) => void;

// // 	try {
// // 		const { resolve, reject } = promiseWithResolvers();

// // 		// eslint-disable-next-line prefer-arrow/prefer-arrow-functions, func-names
// // 		abortHandler = function (this: AbortSignal, event: Event) {
// // 			fs.writeFileSync('event.json', JSON.stringify(event, null, 2));
// // 			// throw new Error('🛑🛑🛑🛑🛑🛑🛑🛑🛑🛑🛑🛑');
// // 			reject();
// // 		};
// // 		// const { promise, resolve, reject } = Promise.withResolvers();

// // 		// controller.signal.onabort = function (this, event) {
// // 		// 	// console.dir(event);
// // 		// 	// throw new Error('XXXXX AAAAAAAAAAAAAAA');
// // 		// 	fs.writeFileSync('event.json', JSON.stringify(event, null, 2));
// // 		// 	reject();
// // 		// };
// // 		controller.signal.addEventListener('abort', abortHandler);

// // 		// fs.writeFileSync('jobReq', JSON.stringify(req, null, 2));
// // 		req.message('start');
// // 		await sleep(20000);
// // 		req.message('finished');

// // 		controller.signal.addEventListener('abort', abortHandler);
// // 		resolve('ok');
// // 	} catch (error) {
// // 		controller.signal.removeEventListener('abort', abortHandler!);
// // 		console.log('🤡🤡🤡🤡🤡🤡🤡🤡', error);
// // 	}
// // });

// Parse.Cloud.job('testPostJob', async (req) => {
// 	try {
// 		// const emitter = new events.EventEmitter();

// 		// emitter.addListener('abort', () => {
// 		// 	throw new Error('abort');
// 		// });

// 		// controller.signal.onabort = () => {
// 		// 	emitter.emit('abort');
// 		// };

// 		const promise = new Promise((resolve, reject) => {
// 			controller.signal.addEventListener('abort', () => {
// 				reject();
// 			});

// 			(async () => {
// 				req.message('start');
// 				await sleep(15000);
// 				req.message('finished');
// 			})()
// 				.then((v) => {
// 					console.log('✅✅✅✅✅✅✅✅✅✅✅✅', v);
// 				})
// 				.catch((r) => {
// 					console.log('🛑🛑🛑🛑🛑🛑🛑🛑🛑🛑🛑🛑', r);
// 				});
// 		}).catch((r) => {
// 			console.log('☣️☣️☣️☣️☣️☣️☣️☣️☣️', r);
// 		});

// 		// eslint-disable-next-line @typescript-eslint/return-await
// 		// return promise.catch((r) => {
// 		// });
// 	} catch (error) {
// 		console.log('🛑🛑🛑🛑🛑🛑🛑🛑🛑', error);
// 	}
// });
