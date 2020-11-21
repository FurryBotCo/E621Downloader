import { app, BrowserWindow, ipcMain } from "electron";
import windowStateKeeper from "electron-window-state";
import ConfigManager, { ConfigProperties } from "./ConfigManager";
import Logger from "./Logger";
import Utility from "./Utility";
import * as fs from "fs-extra";
import Analytics from "./Analytics";
import pkg from "../package.json";
import "source-map-support/register";
const args = (process.argv0.indexOf("electron") !== -1 ? process.argv.slice(2) : process.argv.slice(1)).map(v => v.toLowerCase());
import { program } from "commander";

Logger.debug("Main->ProcessAguments", process.argv);
Logger.debug("Main->InternalAguments", args);

program
	// .option("-h, --help", "Show this list.")
	.version(pkg.version, "-v, --version", "Output the current application version.")
	.option("--run, --cli", "Run application in cli mode.")
	.option("--dev", "Run in development mode.")
	.option("-c, --config <file>", "Set the path to the config file.")
	.option("--default-config <file>", "Set the path to the default config file.")
	.option("-d, --dir <directory>", "Set the path to the save directory.")
	.option("--tags <tags>", "Set the tags to use in cli mode.")
	.option("--folder-name <folder>", "Set the folder name to use in cli mode. Defaults to first tag.")
	.option("--debug-cli", "Keep debug output on when in cli mode (a lot of spammy logging).")
	.parse([process.argv0, process.argv0, ...args]);
const o = program.opts();
// because of the description override
if (o.help === true) program.help();

Logger.debug("Main", `Log File: ${ConfigManager.get().logFile}`);
Logger.debug("Main", `Development Mode: ${o.dev ? "Yes" : "No"}`);

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
	.on("setup", async (ev) => {
		const v = await Utility.getRelease();
		ev.reply("setup", ConfigManager.get(), ConfigManager.get(true), v);
		if (o.cli) Utility.cliMode(window, o, !!o.debugCli);
	})
	.on("open-dev-tools", (ev) => window.webContents.openDevTools());

app
	.on("ready", async () => {
		Utility.checkLock();
		// the default value is "PROMPT", but it's not allowed after this check
		if ((ConfigManager.get().analytics as unknown as "PROMPT") === "PROMPT") Utility.askAnalytics();
		Analytics.track("ready");
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
			frame: !o.cli
		});
		if (o.cli) window.hide();
		window.removeMenu();
		state.manage(window);
		window.setBackgroundColor("#333");
		if (o.dev) window.webContents.openDevTools();
		window.loadFile(`${ConfigManager.ROOT_DIR}/src/pages/${o.cli ? "cli" : "index"}.html`);
	})
	.on("window-all-closed", () => {
		if (process.platform !== "darwin") app.quit();
	});
