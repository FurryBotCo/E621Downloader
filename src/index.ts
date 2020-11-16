import { app, BrowserWindow, ipcMain } from "electron";
import windowStateKeeper from "electron-window-state";
import ConfigManager, { ConfigProperties } from "./ConfigManager";
import Logger from "./Logger";
import Utility from "./Utility";
import * as fs from "fs-extra";
const args = (process.argv0.indexOf("electron") !== -1 ? process.argv.slice(2) : process.argv.slice(1)).map(v => v.toLowerCase());
const dev = args.includes("--dev");
Logger.debug("Main", `Log File: ${ConfigManager.get().logFile}`);
Logger.debug("Main", `Development Mode: ${dev ? "Yes" : "No"}`);

if (require("electron-squirrel-startup")) app.quit();

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
