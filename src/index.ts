import { app, BrowserWindow } from "electron";
import windowStateKeeper from "electron-window-state";
import ConfigManager from "./ConfigManager";
const config = ConfigManager.get();
require("electron-reload")(`${__dirname}/../../`);
import "./api";

if (require("electron-squirrel-startup")) app.quit();

let window: BrowserWindow, state: windowStateKeeper.State;

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
				worldSafeExecuteJavaScript: true
			}
		});

		state.manage(window);
		window.loadFile(`${ConfigManager.ROOT_DIR}/src/index.html`);

		window.webContents.on("dom-ready", () => {
			window.webContents.executeJavaScript(`window.config = ${JSON.stringify(config)};`);
			window.webContents.openDevTools();
		});
	})
	.on("window-all-closed", () => {
		if (process.platform !== "darwin") app.quit();
	});
