import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import windowStateKeeper from "electron-window-state";
import ConfigManager, { ConfigProperties } from "./ConfigManager";
import Logger from "./Logger";
import Utility from "./Utility";
import * as fs from "fs-extra";
import Analytics from "./Analytics";
import "source-map-support/register";
const args = (process.argv0.indexOf("electron") !== -1 ? process.argv.slice(2) : process.argv.slice(1)).map(v => v.toLowerCase());
const dev = args.includes("--dev");
Logger.debug("Main", `Log File: ${ConfigManager.get().logFile}`);
Logger.debug("Main", `Development Mode: ${dev ? "Yes" : "No"}`);

if (require("electron-squirrel-startup")) app.quit();

function checkLock() {
	if (fs.existsSync(`${ConfigManager.DIR}/lock`)) {
		const c = dialog.showMessageBoxSync({
			type: "error",
			buttons: [
				"Close Application",
				"Open Folder",
				"Delete Lock & Continue"
			],
			title: "Application Is Locked",
			message: `Only one instance may be running at a time to avoid conflicts.`,
			detail: `Close the other instance of this application, or delete the lockfile "${ConfigManager.DIR}/lock" if that doesn't work.\n\nI do not recommend continuing.`,
			defaultId: 0
		});
		switch (c) {
			default: break;
			case 1: shell.openPath(ConfigManager.DIR); break;
			case 2: fs.unlinkSync(`${ConfigManager.DIR}/lock`); break;
		}
		if (![2].includes(c)) process.exit(-1);
	} else {
		fs.writeFileSync(`${ConfigManager.DIR}/lock`, "");
		Logger.debug("Main", `Wrote lockfile "${ConfigManager.DIR}/lock".`);
		process.on("exit", () => {
			if (fs.existsSync(`${ConfigManager.DIR}/lock`)) {
				fs.unlinkSync(`${ConfigManager.DIR}/lock`);
				Logger.debug("Main", `Removed lockfile "${ConfigManager.DIR}/lock".`);
			} else {
				Logger.debug("Main", `Lockfile "${ConfigManager.DIR}/lock" does not exist. Maybe it was prematurely deleted?`);
			}
		});
	}
}

function askAnalytics() {
	const c = dialog.showMessageBoxSync({
		type: "info",
		buttons: [
			"Accept",
			"Deny"
		],
		title: "Anonymous Analytics Agreement",
		message: "We may send anonymous analytics about how you use our app.",
		detail: "We may send anonymous analytics about what tags you search, and how many posts are downloaded total to get an overall look of app usage. These are completely anonymous, and can be turned off at any time by going to the settings menu.",
		defaultId: 0
	});
	switch (c) {
		case 0: {
			ConfigManager.edit({
				analytics: true,
				analyticsId: Analytics.getId()
			});
			break;
		}

		default: ConfigManager.edit({
			analytics: false
		});
	}
}

let window: BrowserWindow, state: windowStateKeeper.State;

ipcMain
	.on("autocomplete-request", async (ev, tag: string, id: string) => {
		Logger.debug("Main", `Received autocomplete request with the id "${id}" for the tag "${tag}"`);
		const v = await Utility.autocompleteRequest(tag);
		return ev.reply("autocomplete-response", id, v);
	})
	.on("config", (ev, config: ConfigProperties) => {
		Logger.debug("Main", ["Config Update", require("util").inspect(config, { depth: null })]);
		ConfigManager.edit(config);
		return ev.reply("config", ConfigManager.get());
	})
	.on("start", (ev, tags: string[], folder: string) => Utility.startDownload(ev, tags, folder, window))
	.on("log", (ev, type: string, ...messages: string[]) =>
		Logger[type]?.("CLIENT", messages)
	)
	.on("show-update", (ev, version: string) => fs.writeFileSync(`${ConfigManager.DIR}/version-check`, version))
	.on("setup", async(ev) => {
		const v = await Utility.getRelease();
		ev.reply("setup", ConfigManager.get(), ConfigManager.get(true), v);
	})
	.on("open-dev-tools", (ev) => window.webContents.openDevTools());

app
	.on("ready", async () => {
		checkLock();
		// the default value is "PROMPT", but it's not allowed after this check
		if ((ConfigManager.get().analytics as unknown as "PROMPT") === "PROMPT") askAnalytics();
		Analytics.track("ready");
		state = windowStateKeeper({
			defaultWidth: 800,
			defaultHeight: 600
		});
		// Create the browser window.
		window = new BrowserWindow({
			x: state.x,
			y: state.y,
			width: state.width,
			height: state.height,
			webPreferences: {
				nodeIntegration: true,
				worldSafeExecuteJavaScript: true,
				enableRemoteModule: true,
				contextIsolation: false
			},
			icon: `${__dirname}/assets/icons/png/256x256.png`
		});
		window.removeMenu();
		state.manage(window);
		window.loadFile(`${ConfigManager.ROOT_DIR}/src/pages/index.html`);
		window.setBackgroundColor("#333");
		if (dev) window.webContents.openDevTools();
	})
	.on("window-all-closed", () => {
		if (process.platform !== "darwin") app.quit();
	});
