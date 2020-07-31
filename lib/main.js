"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const tc = __importStar(require("@actions/tool-cache"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const mkdirp_1 = __importDefault(require("mkdirp"));
const ncp_1 = require("ncp");
const which_1 = __importDefault(require("which"));
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const cacheTool = "dub-package-cache";
            const cacheVersion = "dub-cache-v1";
            const doCache = parseBool(core.getInput("cache", { required: false }));
            const dubArgs = core.getInput("args", { required: false }) || "";
            let dubPackagesDirectory;
            if (doCache) {
                dubPackagesDirectory = getDubPackagesDirectory();
            }
            else {
                dubPackagesDirectory = null;
            }
            let dub = which_1.default.sync("dub", { nothrow: true });
            if (!dub)
                return core.setFailed("dub is not installed or was not found in PATH - try installing D using dlang-community/setup-dlang@v1 first!");
            if (dubPackagesDirectory) {
                const cached = tc.find(cacheTool, cacheVersion);
                if (cached) {
                    console.log("Pre-loading cached dub packages");
                    copyCacheDirectory(cached, dubPackagesDirectory);
                }
            }
            yield dubUpgrade(dub, dubArgs);
            if (dubPackagesDirectory) {
                console.log("Storing dub package cache");
                yield tc.cacheDir(dubPackagesDirectory, cacheTool, cacheVersion);
            }
        }
        catch (e) {
            core.setFailed("dub upgrade failed: " + e.toString());
        }
    });
}
function dubUpgrade(dub, dubArgs) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log("Running dub upgrade");
        if (!(yield execDubUpgrade(dub, dubArgs))) {
            console.log("Dub network failure, trying again in 30s...");
            yield delay(30000);
            if (!(yield execDubUpgrade(dub, dubArgs))) {
                console.log("Dub network failure, trying again in 90s...");
                yield delay(90000);
                if (!(yield execDubUpgrade(dub, dubArgs))) {
                    throw new Error("Failed to dub upgrade for 3 times in a row");
                }
            }
        }
    });
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
        proc = child_process_1.spawn('"' + dub + "\" upgrade " + dubArgs, { shell: true });
    }
    catch (e) {
        console.error("Failed starting dub");
        return Promise.reject(e);
    }
    return new Promise((resolve, reject) => {
        var _a, _b;
        let output = "";
        (_a = proc.stdout) === null || _a === void 0 ? void 0 : _a.on("data", (chunk) => {
            process.stdout.write(chunk.toString());
            output += chunk;
        });
        (_b = proc.stderr) === null || _b === void 0 ? void 0 : _b.on("data", (chunk) => {
            process.stderr.write(chunk.toString());
            output += chunk;
        });
        proc.on("close", (code) => {
            if (code == 0) {
                resolve(true);
            }
            else {
                if (output.indexOf("Error querying versions") != -1
                    || output.indexOf("Failed to download") != -1)
                    return resolve(false);
                else
                    return reject("dub exited with error code " + code);
            }
        });
    });
}
function copyCacheDirectory(src, dst) {
    return __awaiter(this, void 0, void 0, function* () {
        yield mkdirp_1.default(path.dirname(dst));
        return yield new Promise((resolve, reject) => {
            ncp_1.ncp(src, dst, {
                clobber: false,
            }, (err) => {
                if (err)
                    reject(err);
                else
                    resolve();
            });
        });
    });
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
        return input === "true" || input === "yes" || input === "on" || input === true;
    else
        return false;
}
main();