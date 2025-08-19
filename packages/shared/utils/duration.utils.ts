import _ from 'lodash';
import ms from 'ms';

const toMilliseconds = (humaReadableDuration: string) => {
	return _.divide(ms(humaReadableDuration), 1);
};

const toSeconds = (humaReadableDuration: string) => {
	return _.divide(ms(humaReadableDuration), 1000);
};

const toMinutes = (humaReadableDuration: string) => {
	return _.divide(ms(humaReadableDuration), 60_000);
};

const toHours = (humaReadableDuration: string) => {
	return _.divide(ms(humaReadableDuration), 3_600_000);
};

const duration = {
	toMilliseconds,
	toSeconds,
	toMinutes,
	toHours,
};

export default duration;
