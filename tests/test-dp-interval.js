const { join } = require('path');

const BEE = require('@beyond-js/bee');
BEE('http://localhost:1110', { inspect: 4000 });

(async () => {
	const { DynamicProcessor } = await bimport('@beyond-js/dynamic-processor/main');
	const DynamicInterval = require('./interval');

	const dp = new (DynamicInterval(DynamicProcessor))();
	await dp.ready;
	console.log('Ready at:', dp.timer);
	console.log('---');

	dp.on('change', () => console.log(`Event 'change' received at ${dp.timer}. Destroyed: ${dp.destroyed}`));
	setTimeout(() => {
		console.log('Stopping dynamic interval');
		dp.destroy();
	}, 5000);
})().catch(exc => console.error(exc.stack));
