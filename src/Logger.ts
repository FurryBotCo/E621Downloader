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
		const f = ConfigManager.get().logFile
	}
}
