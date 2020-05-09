import someModule from './someModule.js';
import otherModule from './otherModule/otherModule.js';

document.addEventListener('DOMContentLoaded', async function () {
	
	await someModule.init();
	otherModule.init();
	
});