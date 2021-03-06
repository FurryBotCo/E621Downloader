/// <reference types="electron" />
import * as pkg from "../package.json";
import * as https from "https";
import * as fs from "fs-extra";
import ConfigManager from "./ConfigManager";
import URL from "url";
import path from "path";
import { performance } from "perf_hooks";
import { dialog, shell } from "electron";
import Logger from "./Logger";
import Downloader from "./Downloader";

interface MsResponse {
	ms: number;
	s: number;
	m: number;
	h: number;
	d: number;
	w: number;
	mn: number;
	y: number;
}

export default class Utility {
	private constructor() { }

	/**
	 * Convert milliseconds into readable time.
	 * @static
	 * @param {number} time
	 * @param {boolean} [words]
	 * @returns {(Promise<string | T.MsResponse>)}
	 * @memberof Time
	 */
	static ms(time: number, words: true, seconds?: boolean): string;
	static ms(time: number, words?: false, seconds?: boolean): MsResponse;
	static ms(time: number, words = false, seconds = true): string | MsResponse {
		if (time < 0) throw new TypeError("Negative time provided.");
		if (time === 0) return words ? "0 seconds" : "0s";
		time = Math.ceil(time / 1000) * 1000;
		const r: {
			s?: number;
		} & {
				[k in "m" | "h" | "d" | "w" | "mn" | "y"]: number;
			} = {
			s: 0,
			m: 0,
			h: 0,
			d: 0,
			w: 0,
			mn: 0,
			y: 0
		};

		while (time >= 1e3) { r.s!++; time -= 1e3; }
		while (r.s! >= 60) { r.m++; r.s! -= 60; }
		while (r.m >= 60) { r.h++; r.m -= 60; }
		while (r.h >= 24) { r.d++; r.h -= 24; }
		// while (r.d >= 7) { r.w++; r.d -= 7; }
		// while (r.w >= 4 && r.d >= 2) { r.mn++; r.w -= 4; r.d -= 2; }
		while (r.d >= 30) { r.mn++; r.d -= 30; }
		while (r.mn >= 12) { r.y++; r.mn -= 12; }
		if (time > 0) r.s! += time / 1000;

		Object.keys(r).map(k => r[k] = Math.floor(r[k]));

		const str: string[] = [];
		if (r.s! > 0) str.push(`${r.s} second${r.s === 1 ? "" : "s"}`);
		if (r.m > 0) str.push(`${r.m} minute${r.m === 1 ? "" : "s"}`);
		if (r.h > 0) str.push(`${r.h} hour${r.h === 1 ? "" : "s"}`);
		if (r.d > 0) str.push(`${r.d} day${r.d === 1 ? "" : "s"}`);
		// if (r.w > 0) str.push(`${r.w} week${r.w === 1 ? "" : "s"}`);
		if (r.mn > 0) str.push(`${r.mn} month${r.mn === 1 ? "" : "s"}`);
		if (r.y > 0) str.push(`${r.y} year${r.y === 1 ? "" : "s"}`);

		if (words && str.length > 1) str[0] = `and ${str[0]}`;

		if (!seconds) {
			if (words) {
				const e = str.find(v => v.indexOf("second") !== -1);
				if (e) {
					str.splice(str.indexOf(e), 1);
					if (str.length < 1) str.push("less than 1 minute");
				}
			} else {
				delete r.s;
			}
		}

		return words ? str.reverse().join(", ") : Object.keys(r).filter(k => r[k] > 0).map(k => `${Math.floor(r[k])}${k}`).reverse().reduce((a, b) => a + b, "");
	}

	static async autocompleteRequest(tag: string) {
		return new Promise<{ error: boolean; data: any; }>((a, b) => {
			https.request({
				method: "GET",
				host: "e621.net",
				path: `/tags/autocomplete.json?search%5Bname_matches%5D=${tag}`,
				headers: {
					"User-Agent": `E621Downloader/${pkg.version} (https://github/DonovanDMC/E621Downloader)`
				}
			}, (r) => {
				const data: any[] = [];

				if (r.statusCode !== 200) return a({
					error: true,
					data: {
						name: "Error",
						message: `Non 200-OK status code: ${r.statusCode}-${r.statusMessage}`,
						stack: ""
					}
				});

				r.on("error", (err) => a({
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
						a({
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
	}

	static async getPosts(tags: string[], auth: string | null, page: number, lastId?: number | null, ev?: Electron.IpcMainEvent | null) {
		if (page === 1) ev?.reply("debug", "fetch-begin", tags, !!auth);
		ev?.reply("debug", "fetch-start", tags, page);
		const posts: {
			id: number;
			url: string;
			ext: string;
			tags: string[];
		}[] = [];
		// this is because of discoloring in vsc for some reason
		type Posts = typeof posts;
		return new Promise<Posts>((a, b) => {
			https.request({
				method: "GET",
				hostname: "e621.net",
				path: `/posts.json?tags=${encodeURIComponent(tags.join(" "))}${lastId ? `&page=b${lastId}` : ""}&limit=320`,
				headers: {
					"User-Agent": `E621Downloader/${pkg.version} (https://github.com/DonovanDMC/E621Downloader)`,
					...(auth ? ({
						Authorization: `Basic ${auth}`
					}) : ({}))
				}
			}, (res) => {
				const data: any[] = [];

				res
					.on("data", (d) => data.push(d))
					.on("error", (err) => b(err))
					.on("end", async () => {
						const d = JSON.parse(Buffer.concat(data).toString());
						if (d.success === false) {
							console.error(d);
							if (d.message === "SessionLoader::AuthenticationFailure") return ev?.reply("error", "Authentication failed.");
							else return ev?.reply("error", d.message, d);
						}
						ev?.reply("debug", "fetch-receive", tags, page, d.posts.length);

						posts.push(...d.posts.map(p => ({
							id: p.id,
							url: p.file.url,
							ext: p.file.ext,
							tags: Object.keys(p.tags).map(v => p.tags[v]).reduce((a, b) => a.concat(b))
						})));
						if (d.posts.length === 320) {
							await new Promise((c, d) => setTimeout(c, 1e3)); // wait for 1 second (more than needed)
							await Utility.getPosts(tags, auth, page + 1, d.posts[d.posts.length - 1].id, ev).then(v => posts.push(...v));
						}

						if (page === 1) ev?.reply("debug", "fetch-finish", tags, posts.length);

						return a(posts);
					});
			})
				.end();
		});
	}

	static async downloadImage(id: number, url: string, ext: string, num: number, total: number, dir: string, ev?: Electron.IpcMainEvent | null) {
		if (!url) {
			ev?.reply("debug", "skip", id, "no image url", ConfigManager.get().globalBlacklistNoticeShown);
			return;
		} else if (fs.existsSync(`${dir}/${id}.${ext}`) && !ConfigManager.get().overwriteExisting) {
			ev?.reply("debug", "skip", id, "file already exists");
			return;
		}
		const uri = URL.parse(url);
		const start = performance.now();
		ev?.reply("debug", "download-start", id);
		return new Promise<void>((a, b) => {
			https.request({
				method: "GET",
				hostname: uri.hostname,
				path: uri.path,
				headers: {
					"User-Agent": `E621Downloader/${pkg.version} (https://github.com/DonovanDMC/E621Downloader)`
				}
			}, (res) => {
				const data: any[] = [];


				/* process.once("uncaughtException", async (err) => {
					if (err.message.toLowerCase().startsWith("client network socket disconnected")) {
						ev?.reply("error", "Connection was interrupted, trying again..");
						const v = await this.downloadImage(id, url, ext, num, total, dir, ev);
						return a(v);
					}
				}); */
				res
					.on("data", (d) => data.push(d))
					.on("error", (err) => b(err))
					.on("end", async () => {
						const d = Buffer.concat(data);
						fs.writeFileSync(`${dir}/${id}.${ext}`, d);
						const end = performance.now();
						ev?.reply("debug", "download-finish", id, num, total, parseFloat((end - start).toFixed(3)), this.ms(parseFloat((end - start).toFixed(3)), true, true));
						return a();
					});
			})
				.end();
		});
	}

	static async startDownload(ev: Electron.IpcMainEvent, tags: string[], folder: string, window: Electron.BrowserWindow) {
		const start = performance.now();
		const c = ConfigManager.get();
		const dir = path.resolve(`${c.saveDirectory}/${folder.trim()}`);
		if (!fs.existsSync(dir)) fs.mkdirpSync(dir);
		ev.reply("debug", "dir", dir);

		Downloader.start(tags, folder, ev);
	}

	static mergeObjects<A = object, B = object>(a: A, b: B) {
		// avoid references
		const obj = JSON.parse(JSON.stringify(a)) as A & B;
		for (const k of Object.keys(b)) {
			if (b[k] instanceof Array) obj[k] = typeof a[k] === "undefined" ? b[k] : a[k];
			else if (typeof b[k] === "object" && b[k] !== null) {
				if (typeof a[k] !== "object" || a[k] === null) a[k] = {};
				obj[k] = this.mergeObjects(a[k], b[k]);
			} else obj[k] = typeof a[k] === "undefined" ? b[k] : a[k];
		}
		return obj;
	}

	static async getRelease() {
		const {
			data: {
				current,
				latest,
				upToDate
			}
		} = await new Promise<{
			success: boolean;
			data: {
				[k in "current" | "latest"]: {
					// there is A LOT more but we don't care about it here
					url: string;
					name: string;
					tag_name: string;
					description: string;
				};
			} & {
				upToDate: boolean;
			};
		}>((a, b) => {
			https.request({
				method: "GET",
				hostname: "e621.download",
				path: `/updates?version=v${pkg.version}`,
				port: 443,
				protocol: "https:",
				headers: {
					"User-Agent": `E621Downloader/v${pkg.version} (https://e621downloader.furrybot.co)`,
					"Accept": "application/json"
				}
			}, (res) => {
				const data: Buffer[] = [];
				res
					.on("data", (d) => data.push(d))
					.on("error", b)
					.on("end", () => a(JSON.parse(Buffer.concat(data).toString())));
			})
				.end();
		});

		let showUpdate = false;
		if (!upToDate) {
			const f = `${ConfigManager.CONFIG_DIR}/version-check`;
			if (fs.existsSync(f)) {
				const v = fs.readFileSync(f).toString();
				if (v !== latest.tag_name) showUpdate = true;
			} else showUpdate = true;
		}

		return {
			current: current || {
				url: null,
				name: `v${pkg.version}`,
				tag_name: `v${pkg.version}`,
				description: "Unknown Version."
			},
			latest,
			showUpdate,
			upToDate
		};
	}

	static checkLock() {
		if (fs.existsSync(`${ConfigManager.CONFIG_DIR}/lock`)) {
			const c = dialog.showMessageBoxSync({
				type: "error",
				buttons: [
					"Close Application",
					"Open Folder",
					"Delete Lock & Continue"
				],
				title: "Application Is Locked",
				message: `Only one instance may be running at a time to avoid conflicts.`,
				detail: `Close the other instance of this application, or delete the lockfile "${ConfigManager.CONFIG_DIR}/lock" if that doesn't work.\n\nI do not recommend continuing.`,
				defaultId: 0
			});
			switch (c) {
				default: break;
				case 1: shell.openPath(ConfigManager.CONFIG_DIR); break;
				case 2: fs.unlinkSync(`${ConfigManager.CONFIG_DIR}/lock`); break;
			}
			if (![2].includes(c)) process.exit(-1);
		} else {
			fs.writeFileSync(`${ConfigManager.CONFIG_DIR}/lock`, "");
			Logger.debug("Main", `Wrote lockfile "${ConfigManager.CONFIG_DIR}/lock".`);
			process.on("exit", () => {
				if (fs.existsSync(`${ConfigManager.CONFIG_DIR}/lock`)) {
					fs.unlinkSync(`${ConfigManager.CONFIG_DIR}/lock`);
					Logger.debug("Main", `Removed lockfile "${ConfigManager.CONFIG_DIR}/lock".`);
				} else {
					Logger.debug("Main", `Lockfile "${ConfigManager.CONFIG_DIR}/lock" does not exist. Maybe it was prematurely deleted?`);
				}
			});
		}
	}

	static checkConfig() {
		Logger.debug("Utility->ConfigCheck", "Checking stored version against current..");
		if (!fs.existsSync(`${ConfigManager.CONFIG_DIR}/version`)) {
			Logger.debug("Utility->ConfigCheck", "No stored version, assuming up to date.");
			fs.writeFileSync(`${ConfigManager.CONFIG_DIR}/version`, `v${pkg.version}`);
		} else {
			const v = fs.readFileSync(`${ConfigManager.CONFIG_DIR}/version`).toString();
			if (v !== `v${pkg.version}`) {
				Logger.debug("Utility->ConfigCheck", `Stored version (${v}) does not match current (v${pkg.version}), updating..`);
				this.refreshDefaults();
				fs.writeFileSync(`${ConfigManager.CONFIG_DIR}/version`, `v${pkg.version}`);
			} else {
				Logger.debug("Utility->ConfigCheck", "Stored version matches current, not updating.");
			}
		}
	}

	static refreshDefaults() {
		Logger.debug("Utility->RefreshDefaults", "Refreshing default config..");
		if (fs.existsSync(ConfigManager.DEFAULT_FILE)) fs.unlinkSync(ConfigManager.DEFAULT_FILE);
		return ConfigManager.getDefaults();
	}
}
