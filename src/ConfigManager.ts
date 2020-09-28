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
	overwriteExisting: boolean;
}

export default class ConfigManager {
	static ROOT_DIR = path.resolve(`${__dirname}/../${__filename.endsWith("ts") ? "" : "../"}`);
	static LOCATION = path.resolve(`${process.env.APPDATA || (process.platform === "darwin" ? process.env.HOME + "/Library/Preferences" : process.env.HOME + "/.config")}/E621Downloader/config.yaml`);
	static DEFAULT_LOCATION = path.resolve(`${ConfigManager.ROOT_DIR}/config.default.yaml`);
	static loadFile() { return fs.readFileSync(this.LOCATION); }

	static setup() {
		if (!fs.existsSync(this.LOCATION)) {
			const d = path.dirname(this.LOCATION);
			if (!fs.existsSync(d)) {
				console.log(`Creating configuration directory "${d}"`);
				fs.mkdirpSync(d);
			}
			console.log(`Copying default config file "${this.DEFAULT_LOCATION}" to "${this.LOCATION}"`);
			fs.copyFileSync(this.DEFAULT_LOCATION, this.LOCATION);
		}
	}

	static get() {
		this.setup();
		const f = this.loadFile();
		const c = YAML.safeLoad(f.toString()) as Config;
		c.saveDirectory = path.resolve(c.saveDirectory.startsWith(".") ? `${this.ROOT_DIR}/${c.saveDirectory}` : c.saveDirectory);

		return c;
	}

	static edit(values: DeepPartial<Config>) {
		const v = this.get();
		const c = { ...v, ...values };
		if (JSON.stringify(v) === JSON.stringify(c)) return;
		fs.writeFileSync(this.LOCATION, YAML.safeDump(c));
	}
}
