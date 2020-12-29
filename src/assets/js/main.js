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
	await new Promise((a, b) => {
		ipcRenderer.send("setup");
		ipcRenderer.once("setup", (ev, config, rawConfig, versioning) => {

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


window.cliMode = false;
window.debugLog = true;
ipcRenderer.on("cli-start", (ev, tags, folder, debug) => {
	window.cliMode = true;
	window.debugLog = !!debug;
	start(tags, folder);
});
/**
 * 
 * @param {string[]} tags
 * @param {string} folder
 */
async function start(tags, folder) {
	if (window.active) return createLogEntry("Download already active. Wait for that one to finish.", "error");
	ipcRenderer.send("start", tags, folder);
	window.active = true;
	const l = (ev, type, ...args) => {
		/* if (window.debugLog)  */console.debug(type, ...args);
		switch (type) {
			case "download-start": {
				const [tags, folder, dir, threads, usingAuth] = args;
				createLogEntry(`Using ${threads} threads for downloads.`, "info");
				createLogEntry(`Set download directory to "${dir}"`, "info");
				return createLogEntry(`Starting a search with the tags "${tags.join(" ")}" (using auth: ${usingAuth ? "YES" : "NO"})`, "info");
				break;
			}

			case "thread-spawn": {
				const [id, workerId] = args;
				return createLogEntry(`Spawned thread #${id + 1}`, "info");
				break;
			}

			case "ready": {
				const [id, workerId] = args;
				return createLogEntry(`Thread #${id + 1} is ready.`, "info");
			}

			case "fetch-page": {
				const [page, count, time] = args;
				return createLogEntry(`Got ${count} posts on page #${page} (${ms(time)})`, "info");
			}

			case "fetch-finish": {
				const [total, time] = args;
				resetProgress(total);
				showProgress();
				return createLogEntry(`Finished fetching ${total} posts in ${ms(time)}`, "info");
			}

			case "skip": {
				incrementProgress();
				const { current, total } = getProgress();
				const [id, reason, tag] = args;
				const t =
					reason === "cache" ? "Post is cached." :
						reason === "fileExists" ? "File already exists." :
							reason === "video" ? "Post is a video." :
								reason === "flash" ? "Post is flash." :
									reason === "blacklisted" ? `it having a blacklisted tag (${tag})` :
										reason;
				return createLogEntry(`[${current}/${total}] Skipped post #${id}, reason: ${t}`, "info");
			}

			case "post-finish": {
				const { current, total } = getProgress();
				incrementProgress();
				const [thread, id, time, /*current*/, /*total*/] = args;
				return createLogEntry(`[${current}/${total}] Finished downloading post #${id} in ${ms(time)}`, "info");
			}

			case "thread-done": {
				const [thread, amount, time] = args;
				return createLogEntry(`Thread #${thread} finished downloading ${amount} posts in ${ms(time)}`, "info");
			}

			case "download-done": {
				const [total, time] = args;
				ipcRenderer.removeListener("message", l);
				window.active = false;
				return createLogEntry(`Finished downloading ${total} posts in ${ms(time)}`, "info");
			}

			case "no-posts": {
				const [message] = args;
				ipcRenderer.removeListener("message", l);
				window.active = false;
				resetProgress(1);
				showProgress();
				incrementProgress();
				return createLogEntry(message, "info");
			}
		}
	};
	ipcRenderer.on("message", l);
}

ipcRenderer.on("progress", (ev, current, total) => {
	try {
		document.querySelector("progress").value = current;
		document.querySelector("progress").max = total;
	} catch (e) { }
});

function globalBlacklistNotice() {
	const v = dialog.showMessageBoxSync({
		type: "warning",
		buttons: [
			"Open Info",
			"OK"
		],
		title: "Post Without URL",
		message: "A post without a provided image url was found.",
		detail: "This usually means the post is in e621's global blacklist. You must provide an api key and username in the settings tab to be able to download this content.",
		defaultId: 1
	});
	if (v === 0) window.open("https://e621.net/help/global_blacklist", "E621: Global Blacklist Info", "nodeIntegration=no,contextIsolation=yes");
	updateSettings({
		globalBlacklistNoticeShown: true
	});
}

async function openSaveDirectory() {
	if (!__filename.endsWith("settings.html")) return;
	shell.openPath(config.saveDirectory);
};

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
