function debugLog() {
	const v = process.versions;
	console.debug("Node Version:", v.node);
	console.debug("Chrome Version:", v.chrome);
	console.debug("Electron Version:", v.electron);
}

const { ipcRenderer } = require("electron");
const crypto = require("crypto");

/**
 * @typedef {Object} AutoCompleteEntry
 * @prop {string} name
 * @prop {number} count
 * @prop {number} category
 */

/**
 * @param {string} tag
 * @return {Promise<AutoCompleteEntry[]>}
 */
async function autocompleteTags(tag) {
	return new Promise((a,b) => {
		const id = crypto.randomBytes(32).toString("hex");
		ipcRenderer.send("autocomplete-request", tag, id);
		const l = ((ev, d, dt) => {
			console.debug(`Recived autocomplete response with the id "${d}"`);
			if(d !== id) return;
			else ipcRenderer.off("autocomplete-response", l);
			if(dt.error) {
				const err = new Error(dt.data.message);
				err.message = dt.data.message;
				err.stack = dt.data.stack;
				err.name = dt.data.name;
				b(err);
			} else return a(dt.data);
		});
		ipcRenderer.on("autocomplete-response", l);
	});
}
