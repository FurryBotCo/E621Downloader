const { ipcRenderer, remote: { dialog }, shell } = require("electron");
const crypto = require("crypto");
const util = require("util");
ipcRenderer.on("error", (ev, err) => {
	createLogEntry(err, "error");
	ipcRenderer.removeAllListeners("debug");
});


const og = {
	log: console.log,
	error: console.error,
	debug: console.debug,
	info: console.info,
	warn: console.warn
};

function log(type, ...args) {
	og[type]?.(...args);
	ipcRenderer.send("log", type, ...args.map(v => v instanceof Object ? util.inspect(v, { depth: null }) : v));
}

console.log = log.bind(null, "log");
console.error = log.bind(null, "error");
console.debug = log.bind(null, "debug");
console.info = log.bind(null, "info");
console.warn = log.bind(null, "warn");

async function setup() {
	await new Promise((a,b) => {
		ipcRenderer.send("setup");
		ipcRenderer.once("setup", (ev, config, rawConfig,versioning) => {

			Object.defineProperty(window, "config", {
				value: config,
				enumerable: true,
				configurable: false
			});

			Object.defineProperty(window, "rawConfig", {
				value: rawConfig,
				enumerable: true,
				configurable: false
			});

			Object.defineProperty(window, "versioning", {
				value: versioning,
				enumerable: true,
				configurable: false
			});

			return a();
		});
	});
	const v = process.versions;
	console.debug("Node Version:", v.node);
	console.debug("Chrome Version:", v.chrome);
	console.debug("Electron Version:", v.electron);
	console.debug("Current Application Version:", versioning.current?.tag_name);
	console.debug("Latest Application Version:", versioning.latest.tag_name);
	if (versioning.showUpdate) {
		ipcRenderer.send("show-update", versioning.latest.tag_name);
		showNotification("Update Available", `A new update is available.\nVersion: ${versioning.latest.tag_name}\nClick this to open the github page. This will not be shown again for this version.`, versioning.latest.html_url);
	}
}

setup().then(() => typeof setupDone === "function" ? setupDone() : null);

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
	return new Promise((a, b) => {
		const id = crypto.randomBytes(8).toString("hex");
		ipcRenderer.send("autocomplete-request", tag, id);
		const l = ((ev, d, dt) => {
			console.debug(`Received autocomplete response with the id "${d}"`);
			if (d !== id) return;
			else ipcRenderer.off("autocomplete-response", l);
			if (dt.error) {
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
	const l = (ev, type, ...args) => {
		console.log(type, ...args);
		switch (type) {
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
				return createLogEntry(`Downloading to directory:\n"${dir}"`, "info");
				break;
			}

			case "download-start": {
				const [id, ms] = args;
				return createLogEntry(`Starting download of post #${id}`, "info");
				break;
			}

			case "download-finish": {
				const [id, num, amount, timeMS, time] = args;
				return createLogEntry(`[${num}/${amount}] Downloaded post #${id} in ${time}`, "success");
				break;
			}

			case "end": {
				const [tags, amount, timeMS, time] = args;
				console.debug("end");
				ipcRenderer.removeListener("debug", l);
				if (document.hasFocus()) console.debug("Not showing notification as window is focused.");
				else {
					showNotification("E621 Downloader", `Finished downloading ${amount} post(s) with the tag(s) "${tags.join(" ")}" in ${time}.`);
					console.debug("Showed notification.");
				}
				return createLogEntry(`Finished downloading ${amount} posts in ${time}`, "info");
				break;
			}

			case "error": {
				const [message] = args;
				return createLogEntry(message, "error");
			}
		}
	};
	ipcRenderer.on("debug", l);
}

ipcRenderer.on("progress", (ev, current, total) => {
	document.querySelector("progress").value = current;
	document.querySelector("progress").max = total;
});

async function selectSaveDirectory() {
	if (!__filename.endsWith("settings.html")) return;
	else {
		const d = await dialog.showOpenDialog({
			properties: ["openDirectory"],
			defaultPath: config.saveDirectory
		});
		if (!d || d.filePaths.length === 0) return alert("Please select a valid folder.");
		document.querySelector("input[name=saveDirectory]").value = d.filePaths[0];
		return;
	}
}

async function selectLogFile() {
	if (!__filename.endsWith("settings.html")) return;
	else {
		const d = await dialog.showOpenDialog({
			properties: ["openSile"],
			defaultPath: config.logFile
		});
		if (!d || d.filePaths.length === 0) return alert("Please select a valid file.");
		document.querySelector("input[name=logFIle]").value = d.filePaths[0];
		return;
	}
}

function updateSettings(st) {
	ipcRenderer.send("config", st);
}

/**
 * @param {string} title
 * @param {string} body
 * @param {string} [url]
 */
function showNotification(title, body, url) {
	const n = new Notification(title, {
		dir: "ltr",
		body,
		icon: "https://butts-are.cool/e621.png",
		requireInteraction: true,
		silent: false
	});
	if (url) n.onclick = ((e) => {
		e.preventDefault();
		shell.openExternal(url);
	});
}
