import { app, BrowserWindow, ipcMain } from "electron";
import windowStateKeeper from "electron-window-state";
import ConfigManager, { ConfigProperties } from "./ConfigManager";
import Logger from "./Logger";
import Utility from "./Utility";
import * as fs from "fs-extra";
import pkg from "../package.json";
import "source-map-support/register";
const args = (process.argv0.indexOf("electron") !== -1 ? process.argv.slice(2) : process.argv.slice(1)).map(v => v.toLowerCase());
import { program } from "commander";
import Refresh from "./Refresh";
require("@electron/remote/main").initialize();

if (([
	"win32",
	"darwin"
] as NodeJS.Platform[]).includes(process.platform)) require("update-electron-app")();
if (require("electron-squirrel-startup")) app.quit();
// Logger.debug("Main->ProcessAguments", process.argv);
// Logger.debug("Main->InternalAguments", args);

program
	// .option("-h, --help", "Show this list.")
	.version(pkg.version, "-v, --version", "Output the current application version.")
	.option("--dev", "Run in development mode.")
	.option("--refresh", "Refresh the cached tags.")
	.parse([process.argv0, process.argv0, ...args]);
const o = program.opts();

ConfigManager.setup();
if (o.refresh) Refresh.run().then(() => process.exit(0));
else {
	Logger.debug("Main", `Log File: ${ConfigManager.get().logFile}`);
	Logger.debug("Main", `Development Mode: ${o.dev ? "Yes" : "No"}`);

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
		.on("show-update", (ev, version: string) => fs.writeFileSync(`${ConfigManager.CONFIG_DIR}/version-check`, version))
		.on("setup", async (ev) => {
			const v = await Utility.getRelease();
			ev.reply("setup", ConfigManager.get(), ConfigManager.get(true), v);
		})
		.on("open-dev-tools", (ev) => window.webContents.openDevTools());

	app
		.on("ready", async () => {
			Utility.checkLock();
			if (!fs.existsSync(`${ConfigManager.CONFIG_DIR}/firstrun`)) {
				fs.writeFileSync(`${ConfigManager.CONFIG_DIR}/firstrun`, "");
			}
			Utility.checkConfig();
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
				icon: `${__dirname}/assets/icons/png/256x256.png`,
				frame: true
			});
			window.removeMenu();
			state.manage(window);
			window.setBackgroundColor("#333");
			if (o.dev) window.webContents.openDevTools();
			window.loadFile(`${ConfigManager.ROOT_DIR}/src/pages/index.html`);
		})
		.on("window-all-closed", () => {
			if (process.platform !== "darwin") app.quit();
		});

}
