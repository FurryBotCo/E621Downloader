function debugLog() {
	const v = process.versions;
	console.debug(`API URL "${window.apiURL}"`);
	console.debug("Node Version:", v.node);
	console.debug("Chrome Version:", v.chrome);
	console.debug("Electron Version:", v.electron);
}
