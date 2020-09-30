import * as fs from "fs-extra";
import YAML from "js-yaml";
import path from "path";

type DeepPartial<T> = {
	[P in keyof T]?: DeepPartial<T[P]>;
};

interface Config {
	key: string;
	username: string;
	saveDirectory: string;
	logFile: string;
	overwriteExisting: boolean;
}

export default class ConfigManager {
	static ROOT_DIR = path.resolve(`${__dirname}/../${__filename.endsWith("ts") ? "" : "../"}`);
	static DIR = path.resolve(`${process.env.APPDATA || (process.platform === "darwin" ? process.env.HOME + "/Library/Preferences" : process.env.HOME + "/.config")}/E621Downloader`);
	static FILE = `${ConfigManager.DIR}/config.yaml`;
	static DEFAULT_DIR = path.resolve(ConfigManager.ROOT_DIR);
	static DEFAULT_FILE = `${ConfigManager.DEFAULT_DIR}/config.default.yaml`;
	static loadFile() { return fs.readFileSync(this.FILE); }

	static setup() {
		if (!fs.existsSync(this.FILE)) {
			if (!fs.existsSync(this.DIR)) {
				console.log(`Creating configuration directory "${this.DIR}"`);
				fs.mkdirpSync(this.DIR);
			}
			console.log(`Copying default config file "${this.DEFAULT_FILE}" to "${this.FILE}"`);
			fs.copyFileSync(this.DEFAULT_FILE, this.FILE);
		} else {
			let c: Config;
			try {

				const f = this.loadFile();
				c = YAML.safeLoad(f.toString()) as Config;
			} catch (e) {
				console.error(e);
				console.log(`Recreating config file due to read error`);
			}
		}
	}

	static parseDirectory(dir: string) {
		if (dir.startsWith(".")) {
			dir = `${this.DIR}/${dir}`;
		}
		const v = { ...process.env, CONFIG: this.DIR };
		for (const k of Object.keys(v)) dir = dir.replace(new RegExp(process.platform === "win32" ? `%${k}%` : `$${k}`, "gi"), v[k]!);
		return path.resolve(dir);
	}

	static get() {
		this.setup();
		const f = this.loadFile();
		const c = YAML.safeLoad(f.toString()) as Config;
		c.saveDirectory = this.parseDirectory(c.saveDirectory);
		c.logFile = this.parseDirectory(c.logFile);

		return c;
	}

	static edit(values: DeepPartial<Config>) {
		const v = this.get();
		const c = { ...v, ...values };
		if (JSON.stringify(v) === JSON.stringify(c)) return;
		fs.writeFileSync(this.FILE, YAML.safeDump(c));
	}
}
