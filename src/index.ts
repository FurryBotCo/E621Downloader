import { app, BrowserWindow, ipcMain } from "electron";
import windowStateKeeper from "electron-window-state";
import * as https from "https";
import pkg from "../package.json";
import ConfigManager from "./ConfigManager";
const config = ConfigManager.get();
require("electron-reload")(ConfigManager.ROOT_DIR);

if (require("electron-squirrel-startup")) app.quit();

let window: BrowserWindow, state: windowStateKeeper.State;

ipcMain
	.on("autocomplete-request", async (ev, tag, id) => {
		console.debug(`Recieved autocomplete request with the id "${id}"`);
		https.request({
			method: "GET",
			host: "e621.net",
			path: `/tags/autocomplete.json?search%5Bname_matches%5D=${tag}`,
			headers: {
				"User-Agent": `E621Downloader/${pkg.version} (https://github/DonovanDMC/E621Downloader)`
			}
		}, (r) => {
			const data: any[] = [];

			if (r.statusCode !== 200) return ev.reply("autocomplete-response", id, {
				error: true,
				data: {
					name: "Error",
					message: `Non 200-OK status code: ${r.statusCode}-${r.statusMessage}`,
					stack: ""
				}
			});

			r.on("error", (err) => ev.reply("autocomplete-response", id, {
				error: true,
				data: {
					name: err.stack,
					message: err.message,
					stack: err.stack
				}
			}))
				.on("data", (d) => data.push(d))
				.on("end", () => {
					const d: {
						id: null; // I have *never* seen this not be null
						name: string;
						post_count: number;
						category: number;
						antecedent_name: string | null;
					}[] = JSON.parse(Buffer.concat(data).toString());
					ev.reply("autocomplete-response", id, {
						error: false,
						data: [
							...d.map(v => ({
								name: v.name,
								count: v.post_count,
								category: v.category
							})),
							...d.filter(v => v.antecedent_name !== null).map(v => ({
								name: v.antecedent_name,
								count: v.post_count,
								category: v.category
							}))
						]
					});
				});
		})
			.end();
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
				worldSafeExecuteJavaScript: true
			}
		});

		state.manage(window);
		window.loadFile(`${ConfigManager.ROOT_DIR}/src/pages/index.html`);

		window.webContents.on("dom-ready", () => {
			window.webContents.executeJavaScript(`window.config = ${JSON.stringify(config)};`);
		});
	})
	.on("window-all-closed", () => {
		if (process.platform !== "darwin") app.quit();
	});
