import * as fs from "fs-extra";
import YAML from "js-yaml";
import path from "path";

type DeepPartial<T> = {
	[P in keyof T]?: DeepPartial<T[P]>;
};

interface Config {
	e621: {
		key: string;
		username: string;
	};
	api: {
		host: string;
		port: number;
	};
}

export default class ConfigManager {
	private static LOCATION = path.resolve(`${__dirname}/../config.yaml`);
	static loadFile() { return fs.readFileSync(this.LOCATION); }

	static get() {
		const f = this.loadFile();
		const c = YAML.safeLoad(f.toString());

		return c as Config;
	}

	static edit(values: DeepPartial<Config>) {
		const c = Object.assign(this.get(), values);
		fs.writeFileSync(this.LOCATION, YAML.safeDump(c));
	}
}
