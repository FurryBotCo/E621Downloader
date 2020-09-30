import * as fs from "fs-extra";
import ConfigManager from "./ConfigManager";

export default class Logger {
	private constructor() { }

	static log(message: string) { return this._log("log", message); }
	static info(message: string) { return this._log("info", message); }
	static debug(message: string) { return this._log("debug", message); }
	static error(message: string) { return this._log("error", message); }
	static warn(message: string) { return this._log("warn", message); }

	private static _log(type: string, message: string) {
		const f = ConfigManager.get().logFile;
		const d = new Date();
		const format = ((type: string, d = new Date()) => `[${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}][${d.toString().split(" ")[4]}][${type.toUpperCase()}]`);
		fs.appendFileSync(f, `${format(type, d)}: ${message}`);
		console.log(format(type, d), ":", message);
	}
}
