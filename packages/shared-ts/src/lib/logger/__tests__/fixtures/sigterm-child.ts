import { StdoutJsonLoggerAdapter } from '../../adapters/stdout-json-logger-adapter';

const adapter = new StdoutJsonLoggerAdapter();
adapter.write({ level: 'info', message: 'first line', time: new Date(0) });
adapter.write({ level: 'info', message: 'second line', time: new Date(0) });

// The parent signals us only once this marker is out; the busy loop then keeps
// the same tick running, so the two lines are still in the adapter's buffer.
process.stderr.write('ready\n');
setInterval(() => undefined, 1000);
let spins = 0;
const stop = Date.now() + 1000;
while (Date.now() < stop) {
	spins += 1;
}
process.stderr.write(`spun=${spins > 0}\n`);
