import * as pkg from "../package.json";
import * as https from "https";
import * as fs from "fs-extra";
import ConfigManager from "./ConfigManager";
import URL from "url";
import path from "path";
import { performance } from "perf_hooks";

export default class Utility {
	private constructor() { }

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
		if (page === 1) ev?.reply("debug", "fetch-begin", tags, !auth);
		ev?.reply("debug", "fetch-start", tags, page);
		const posts: {
			id: number;
			url: string;
			ext: string;
		}[] = [];
		return new Promise<typeof posts>((a, b) => {
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
						ev?.reply("debug", "fetch-recieve", tags, page, d.posts.length);

						posts.push(...d.posts.map(p => ({
							id: p.id,
							url: p.file.url,
							ext: p.file.ext
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
			ev?.reply("debug", "skip", id, "no image url");
			return;
		}
		const uri = URL.parse(url);
		const start = performance.now();
		ev?.reply("debug", "download-start", id);
		return new Promise((a, b) => {
			https.request({
				method: "GET",
				hostname: uri.hostname,
				path: uri.path,
				headers: {
					"User-Agent": `E621Downloader/${pkg.version} (https://github.com/DonovanDMC/E621Downloader)`
				}
			}, (res) => {
				const data: any[] = [];

				res
					.on("data", (d) => data.push(d))
					.on("error", (err) => b(err))
					.on("end", async () => {
						const d = Buffer.concat(data);
						fs.writeFileSync(`${dir}/${id}.${ext}`, d);
						const end = performance.now();
						ev?.reply("debug", "download-finish", id, num, total, parseFloat((end - start).toFixed(3)));
						return a();
					});
			})
				.end();
		});
	}

	static async startDownload(ev: Electron.IpcMainEvent, tags: string[], folder: string, window: Electron.BrowserWindow) {
		const start = performance.now();
		const c = ConfigManager.get();
		const dir = path.resolve(`${c.saveDirectory}/${folder}`);
		if (!fs.existsSync(dir)) fs.mkdirpSync(dir);
		let auth: string | null = null;
		if (c.username && c.key) auth = Buffer.from(`${c.username}:${c.key}`).toString("base64");
		const posts = await Utility.getPosts(tags, auth, 1, null, ev);
		let i = 0;
		ev.reply("debug", "dir", dir);
		for (const post of posts) {
			const v = ++i;
			await Utility.downloadImage(post.id, post.url, post.ext, v, posts.length, dir, ev);
			const p = (v / posts.length);
			window.setProgressBar(p);
			ev.reply("progress", v, posts.length);
		}
		const end = performance.now();

		ev.reply("end", posts.length, parseFloat((end - start).toFixed(3)));
	}
}
