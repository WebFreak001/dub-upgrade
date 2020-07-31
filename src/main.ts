import * as core from "@actions/core";
import * as tc from "@actions/tool-cache";
import * as fs from "fs";
import * as path from "path";
import { ChildProcess, spawn } from "child_process";
import mkdirp from "mkdirp";
import { ncp } from "ncp";
import which from "which";

async function main(): Promise<void> {
	try {
		const cacheTool = "dub-package-cache";
		const cacheVersion = "dub-cache-v1";

		const doCache: boolean = parseBool(core.getInput("cache", { required: false }));
		const dubArgs: string = core.getInput("args", { required: false }) || "";

		let dubPackagesDirectory: string | null;
		if (doCache) {
			dubPackagesDirectory = getDubPackagesDirectory();
		} else {
			dubPackagesDirectory = null;
		}


		let dub = which.sync("dub", { nothrow: true });
		if (!dub)
			return core.setFailed("dub is not installed or was not found in PATH - try installing D using dlang-community/setup-dlang@v1 first!");

		if (dubPackagesDirectory) {
			const cached = tc.find(cacheTool, cacheVersion);
			if (cached) {
				console.log("Pre-loading cached dub packages");
				copyCacheDirectory(cached, dubPackagesDirectory);
			}
		}

		await dubUpgrade(dub, dubArgs);

		if (dubPackagesDirectory) {
			console.log("Storing dub package cache");
			await tc.cacheDir(dubPackagesDirectory, cacheTool, cacheVersion);
		}
	} catch (e) {
		core.setFailed("dub upgrade failed: " + e.toString());
	}
}

async function dubUpgrade(dub: string, dubArgs: string): Promise<void> {
	console.log("Running dub upgrade");
	if (!await execDubUpgrade(dub, dubArgs)) {
		console.log("Dub network failure, trying again in 30s...");
		await delay(30000);

		if (!await execDubUpgrade(dub, dubArgs)) {
			console.log("Dub network failure, trying again in 90s...");
			await delay(90000);

			if (!await execDubUpgrade(dub, dubArgs)) {
				throw new Error("Failed to dub upgrade for 3 times in a row");
			}
		}
	}
}

/**
 * Runs `dub upgrade` and returns `true` if success or `false` on network
 * failure. Throws exception in any other error case.
 * 
 * @param dub Path to dub executable
 * @param dubArgs Additional dub shell arguments to append to dub upgade
 */
function execDubUpgrade(dub: string, dubArgs: string): Promise<boolean> {
	// I guess the dub path could contain spaces and break that way, but there
	// doesn't seem to be any escaping utility in the nodejs standard library,
	// so meh, quotes should be enough.
	let proc: ChildProcess;
	try {
		proc = spawn('"' + dub + "\" upgrade " + dubArgs, { shell: true });
	} catch (e) {
		console.error("Failed starting dub");
		return Promise.reject(e);
	}

	return new Promise((resolve, reject) => {
		let output = "";
		proc.stdout?.on("data", (chunk) => {
			console.log(chunk.toString());
			output += chunk;
		});
		proc.stderr?.on("data", (chunk) => {
			console.log(chunk.toString());
			output += chunk;
		});
		proc.on("close", (code) => {
			if (code == 0) {
				resolve(true);
			} else {
				if (output.indexOf("Error querying versions") != -1
					|| output.indexOf("Failed to download") != -1)
					return resolve(false);
				else
					return reject("dub exited with error code " + code);
			}
		});
	});
}

async function copyCacheDirectory(src: string, dst: string): Promise<void> {
	await mkdirp(path.dirname(dst));
	return await new Promise((resolve, reject) => {
		ncp(src, dst, {
			clobber: false, // don't replace existing because we only do this for cache -> local copying
		}, (err) => {
			if (err)
				reject(err);
			else
				resolve();
		});
	});
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function getDubPackagesDirectory(): string | null {
	switch (process.platform) {
		// posix
		case "linux":
		case "freebsd":
		case "openbsd":
		case "netbsd":
		case "darwin":
		case "android":
		case "sunos":
		case "aix":
			let home = process.env["HOME"];
			if (home) {
				return path.join(home, ".dub", "packages");
			}
			else {
				console.warn("Package cache not supported: could not find HOME variable");
				return null;
			}
		// windows
		case "win32":
			let appdata = process.env["LOCALAPPDATA"];
			if (appdata) {
				return path.join(appdata, "dub", "packages");
			}
			else {
				console.warn("Package cache not supported: could not find LOCALAPPDATA variable");
				return null;
			}
		default:
			console.warn("Package cache not supported: unknown platform " + process.platform);
			return null;
	}
}

function parseBool(input: any | undefined): boolean {
	if (input)
		return input === "true" || input === "yes" || input === "on" || input === true;
	else
		return false;
}

main();
