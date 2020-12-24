import * as fs from "fs-extra";
import YAML from "js-yaml";
import path from "path";
import Logger from "./Logger";
import Utility from "./Utility";
import deasync from "deasync";
import * as https from "https";
import { app } from "electron";

type DeepPartial<T> = {
	[P in keyof T]?: DeepPartial<T[P]>;
};

export interface ConfigProperties {
	key: string;
	username: string;
	saveDirectory: string;
	logFile: string;
	overwriteExisting: boolean;
	useCache: boolean;
	skipFlash: boolean;
	skipVideo: boolean;
	globalBlacklistNoticeShown: boolean;
	blacklistedTags: string[];
	analyticsId: null | string;
	analytics: boolean;
	threads: 1 | 2 | 3;
}

export default class ConfigManager {
	static ROOT_DIR = path.resolve(`${__dirname}/../${__filename.endsWith("ts") ? "" : "../"}`);
	static DOC_DIR = `${app.getPath("documents")}/E621Downloader`;
	static CONFIG_DIR = app.getPath("userData");
	static FILE = `${ConfigManager.CONFIG_DIR}/config.yaml`;
	static DEFAULT_FILE = `${ConfigManager.CONFIG_DIR}/config.default.yaml`;
	static loadFile() { return fs.readFileSync(this.FILE); }
	static loadDefault() { return fs.readFileSync(this.DEFAULT_FILE); }
	private static _cache: ConfigProperties;

	static setFileLocation(file: string) {
		this.FILE = file;
	}

	static setDefaultFileLocation(file: string) {
		this.DEFAULT_FILE = file;
	}

	static setConfigDir(dir: string) {
		this.CONFIG_DIR = dir;
	}

	static async getDefaults(): Promise<ConfigProperties>
	static async getDefaults(cb: (err: Error | null, res: ConfigProperties) => void): Promise<void>
	static async getDefaults(cb?: (err: Error | null, res: ConfigProperties) => void): Promise<ConfigProperties | void> {
		if (fs.existsSync(this.DEFAULT_FILE)) {
			const v = YAML.safeLoad(this.loadDefault().toString()) as ConfigProperties;
			return cb ? cb(null, v) : v;
		}
		await new Promise<void>((a, b) => {
			return https
				.request({
					hostname: "raw.githubusercontent.com",
					path: "/FurryBotCo/E621Downloader/master/config.default.yaml",
					protocol: "https:",
					port: 443
				}, (res) => {
					const data: Buffer[] = [];

					res
						.on("data", (d) => data.push(d))
						.on("error", (err) => b(err))
						.on("end", () => {
							const v = Buffer.concat(data);
							const j = YAML.safeLoad(v.toString()) as ConfigProperties;
							fs.writeFileSync(this.DEFAULT_FILE, v.toString());
							cb ? cb(null, j) : j;
							a();
						});
				})
				.end();
		});

	}

	static get getDefaultsSync(): () => ConfigProperties {
		return deasync(this.getDefaults.bind(this));
	}

	static setup() {
		this.getDefaultsSync();
		if (this._cache) return this._cache;
		if (!fs.existsSync(this.FILE)) {
			if (!fs.existsSync(this.CONFIG_DIR)) {
				Logger.debug("ConfigManager", `Creating configuration directory "${this.CONFIG_DIR}"`);
				fs.mkdirpSync(this.CONFIG_DIR);
			}
			if (!fs.existsSync(this.DOC_DIR)) {
				Logger.debug("ConfigManager", `Creating document directory "${this.DOC_DIR}"`);
				fs.mkdirpSync(this.DOC_DIR);
			}
			Logger.debug("ConfigManager", `Copying default config file "${this.DEFAULT_FILE}" to "${this.FILE}"`);
			fs.copyFileSync(this.DEFAULT_FILE, this.FILE);
		} else {
			// attempt to load to make sure it's good
			try {

				const f = this.loadFile();
				// tslint:disable-next-line no-unused-expression
				YAML.safeLoad(f.toString()) as ConfigProperties;
			} catch (e) {
				Logger.error("ConfigManager", e);
				Logger.log("ConfigManager", `Recreating config file due to read error`);
				fs.unlinkSync(this.FILE);
				this.setup();
			}
		}
	}

	static parseDirectory(dir: string) {
		if (dir.startsWith(".")) {
			dir = `${this.CONFIG_DIR}/${dir.slice(1)}`;
		}
		const v = { ...process.env, ROOT: this.ROOT_DIR, CONFIG: this.CONFIG_DIR, DOC: this.DOC_DIR };
		for (const k of Object.keys(v)) dir = dir.replace(new RegExp(`%${k}%`, "gi"), v[k]!);
		return path.resolve(dir);
	}

	static get(raw?: boolean) {
		let c: ConfigProperties;
		if (new Error().stack?.indexOf("Logger") !== -1) {
			c = this.getDefaultsSync();
		} else {
			this.setup();
			const f = this.loadFile();
			c = YAML.safeLoad(f.toString()) as ConfigProperties;
		}
		if (!raw) {
			c.saveDirectory = this.parseDirectory(c.saveDirectory);
			c.logFile = this.parseDirectory(c.logFile);
		}

		return Utility.mergeObjects(c, this.getDefaultsSync());
	}

	static edit(values: DeepPartial<ConfigProperties>) {
		const v = this.get();
		const c = { ...v, ...values };
		if (JSON.stringify(v) === JSON.stringify(c)) return;
		fs.writeFileSync(this.FILE, YAML.safeDump(c));
	}
}
