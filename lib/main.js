"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const cache = __importStar(require("@actions/cache"));
const glob = __importStar(require("@actions/glob"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const which_1 = __importDefault(require("which"));
const crypto_1 = __importDefault(require("crypto"));
async function main() {
    try {
        const doCache = parseBool(core.getInput("cache", { required: false }));
        const onlyStore = parseBool(core.getInput("store", { required: false }));
        const dubArgs = core.getInput("args", { required: false }) || "";
        let dubPackagesDirectory;
        if (doCache) {
            dubPackagesDirectory = getDubPackagesDirectory();
        }
        else {
            dubPackagesDirectory = null;
        }
        if (doCache && !dubPackagesDirectory) {
            console.warn("Could not determine dub packages directory, not caching global packages!");
        }
        let cacheDirs;
        if (doCache) {
            if (dubPackagesDirectory)
                cacheDirs = [dubPackagesDirectory, "**/.dub"];
            else
                cacheDirs = ["**/.dub"];
        }
        else {
            cacheDirs = null;
        }
        async function storeCache() {
            if (cacheDirs) {
                let cacheKey = `dub-package-cache-${process.platform}-${await hashAll(dubArgs, dubPackagesDirectory, onlyStore)}`;
                try {
                    await cache.saveCache(cacheDirs, cacheKey);
                }
                catch (e) {
                    console.log("Did not upload cache (probably already recent version)");
                }
            }
        }
        if (onlyStore) {
            await storeCache();
            return;
        }
        let dub = which_1.default.sync("dub", { nothrow: true });
        if (!dub)
            return core.setFailed("dub is not installed or was not found in PATH - try installing D using dlang-community/setup-dlang@v1 first!");
        let cacheKey = `dub-package-cache-${process.platform}-${hash(dubArgs)}`;
        if (cacheDirs) {
            await cache.restoreCache(cacheDirs, cacheKey, [
                "dub-package-cache-" + process.platform,
            ]);
        }
        await dubUpgrade(dub, dubArgs);
        await storeCache();
    }
    catch (e) {
        core.setFailed("dub upgrade failed: " + e);
    }
}
async function dubUpgrade(dub, dubArgs) {
    console.log("Running dub upgrade");
    if (!(await execDubUpgrade(dub, dubArgs))) {
        console.log("Dub network failure, trying again in 30s...");
        await delay(30000);
        if (!(await execDubUpgrade(dub, dubArgs))) {
            console.log("Dub network failure, trying again in 90s...");
            await delay(90000);
            if (!(await execDubUpgrade(dub, dubArgs))) {
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
function execDubUpgrade(dub, dubArgs) {
    // I guess the dub path could contain spaces and break that way, but there
    // doesn't seem to be any escaping utility in the nodejs standard library,
    // so meh, quotes should be enough.
    let proc;
    try {
        proc = (0, child_process_1.spawn)('"' + dub + '" upgrade ' + dubArgs, { shell: true });
    }
    catch (e) {
        console.error("Failed starting dub");
        return Promise.reject(e);
    }
    return new Promise((resolve, reject) => {
        let output = "";
        proc.stdout?.on("data", (chunk) => {
            process.stdout.write(chunk.toString());
            output += chunk;
        });
        proc.stderr?.on("data", (chunk) => {
            process.stderr.write(chunk.toString());
            output += chunk;
        });
        proc.on("close", (code) => {
            if (code == 0) {
                resolve(true);
            }
            else {
                if (output.indexOf("Error querying versions") != -1 ||
                    output.indexOf("Failed to download") != -1)
                    return resolve(false);
                else
                    return reject("dub exited with error code " + code);
            }
        });
    });
}
function hash(data) {
    const shasum = crypto_1.default.createHash("sha1");
    shasum.update(data);
    return shasum.digest("base64");
}
async function hashAll(data, dubDir, buildCache) {
    if (dubDir) {
        if (fs.existsSync(dubDir) && fs.statSync(dubDir).isDirectory())
            data += "\n" + fs.readdirSync(dubDir).join("\n");
        else
            data += "\ndub folder doesn't exist";
    }
    const globber = await glob.create("**/dub.selections.json");
    for await (const file of globber.globGenerator()) {
        data += "\n" + hash(fs.readFileSync(file).toString());
    }
    if (buildCache)
        data += "\nput in build cache!";
    const shasum = crypto_1.default.createHash("sha1");
    shasum.update(data);
    return shasum.digest("base64");
}
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function getDubPackagesDirectory() {
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
function parseBool(input) {
    if (input)
        return (input === "true" || input === "yes" || input === "on" || input === true);
    else
        return false;
}
main();
