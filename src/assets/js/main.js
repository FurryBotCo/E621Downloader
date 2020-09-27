const { ipcRenderer, remote: { dialog } } = require("electron");
const crypto = require("crypto");

function debugLog() {
	const v = process.versions;
	console.debug("Node Version:", v.node);
	console.debug("Chrome Version:", v.chrome);
	console.debug("Electron Version:", v.electron);
}

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
			console.debug(`Received autocomplete response with the id "${d}"`);
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

function checkLogSize() {
	const log = document.querySelector("div#debug").getClientRects();
	const e = document.querySelectorAll("div#debug debug-entry");
	const last = e[e.length - 1]?.getClientRects();
	return last?.[0]?.bottom > log[0].bottom;
}

/**
 * 
 * @param {string[]} tags
 * @param {string} folder
 */
async function start(tags, folder) {
	ipcRenderer.send("start", tags, folder);
	const l = ipcRenderer.on("debug", (ev, type, ...args) => {
		console.log(type, ...args);
		switch(type) {
			case "fetch-begin": {
				const [tags, usingAuth] = args;
				return createLogEntry(`Starting a search with the tags "${tags.join(" ")}" (using auth: ${usingAuth ? "YES" : "NO"})`, "info");
				break;
			}

			case "fetch-start": {
				const [tags, page] = args;
				return createLogEntry(`Processing Page #${page}.`, "info");
				break;
			}

			case "fetch-receive": {
				const [tags, page, amount] = args;
				return createLogEntry(`${amount} posts found on page #${page}.`, "info");
				break;
			}

			case "fetch-finish": {
				const [tags, amount] = args;
				showProgress();
				return createLogEntry(`Got ${amount} total posts.`, "info");
				break;
			}

			case "skip": {
				const [id, reason] = args;
				showProgress();
				return createLogEntry(`Skipped post #${id} (${reason})`, "info");
				break;
			}

			case "dir": {
				const [dir] = args;
				return createLogEntry(`Downloading to directory "${dir}"`, "info");
				break;
			}

			case "download-start": {
				const [id, ms] = args;
				return createLogEntry(`Starting download of post #${id}`, "info");
				break;
			}

			case "download-finish": {
				const [id, num, amount, ms] = args;
				return createLogEntry(`[${num}/${amount}] Downloaded post #${id} in ${ms}ms`, "info");
				break;
			}

			case "end": {
				const [amount, ms] = args;
				return createLogEntry(`Finished downloading ${amount} posts in ${ms}ms`, "info");
				break;
			}
		}
	});
	ipcRenderer.on("end", () => {
		console.log("end");
		ipcRenderer.off("debug", l);
	});
}

ipcRenderer.on("progress", (ev, current, total) => {
	document.querySelector("progress").value = current;
	document.querySelector("progress").max = total;
});

async function selectFolder() {
	if(!__filename.endsWith("settings.html")) return;
	else {
		const d = await dialog.showOpenDialog({
			properties: ["openDirectory"]
		});
		if(!d || d.filePaths.length === 0) return alert("Please select a valid folder.");
		document.querySelector("input[name=saveDirectory]").value = d.filePaths[0];
		return;
	}
}
