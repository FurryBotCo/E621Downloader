import { app, BrowserWindow, ipcMain } from "electron";
import windowStateKeeper from "electron-window-state";
import ConfigManager, { ConfigProperties } from "./ConfigManager";
import Logger from "./Logger";
import Utility from "./Utility";

Logger.debug("Main", `Log File: ${ConfigManager.get().logFile}`);

require("update-electron-app")()
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
	.on("log", (ev, type: string, ...messages: string[]) => {
		Logger[type]?.("CLIENT", messages);
	});

app
	.on("ready", () => {
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
				enableRemoteModule: true
			},
			icon: `${__dirname}/assets/icons/png/256x256.png`
		});
		window.removeMenu();
		state.manage(window);
		window.loadFile(`${ConfigManager.ROOT_DIR}/src/pages/index.html`);
		window.setBackgroundColor("#333");

		window.webContents.on("dom-ready", () => {
			window.webContents.executeJavaScript(`window.config = ${JSON.stringify(ConfigManager.get())};`);
			window.webContents.executeJavaScript(`window.rawConfig = ${JSON.stringify(ConfigManager.get(true))};`);
		});
	})
	.on("window-all-closed", () => {
		if (process.platform !== "darwin") app.quit();
	});
