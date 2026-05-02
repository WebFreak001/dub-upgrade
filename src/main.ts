import * as core from "@actions/core";
import * as cache from "@actions/cache";
import { ChildProcess, spawn } from "child_process";
import which from "which";
import { hashAll, getDubPackagesDirectory, parseBool } from "./util.js";

export async function main(): Promise<void> {
  try {
    const doCache: boolean = parseBool(
      core.getInput("cache", { required: false }),
    );
    const dubArgs: string = core.getInput("args", { required: false }) || "";

    let dubPackagesDirectory: string | null;
    if (doCache) {
      dubPackagesDirectory = getDubPackagesDirectory();
    } else {
      dubPackagesDirectory = null;
    }

    if (doCache && !dubPackagesDirectory) {
      console.warn(
        "Could not determine dub packages directory, not caching global packages!",
      );
    }

    let cacheDirs: string[] | null;
    if (doCache) {
      if (dubPackagesDirectory) cacheDirs = [dubPackagesDirectory, "**/.dub"];
      else cacheDirs = ["**/.dub"];
    } else {
      cacheDirs = null;
    }

    let dub = which.sync("dub", { nothrow: true });
    if (!dub)
      return core.setFailed(
        "dub is not installed or was not found in PATH - try installing D using dlang-community/setup-dlang@v1 first!",
      );

    if (cacheDirs) {
      const cacheKey = `dub-package-cache-${process.platform}-${await hashAll(dubArgs)}`;
      await cache.restoreCache(cacheDirs, cacheKey, [
        "dub-package-cache-" + process.platform,
      ]);
    }

    await dubUpgrade(dub, dubArgs);

    if (cacheDirs) {
      core.saveState("CACHE_DIRS", JSON.stringify(cacheDirs));
      core.saveState("DUB_ARGS", dubArgs);
    }
  } catch (e) {
    core.setFailed("dub upgrade failed: " + e);
  }
}

export async function dubUpgrade(dub: string, dubArgs: string): Promise<void> {
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
function execDubUpgrade(dub: string, dubArgs: string): Promise<boolean> {
  // I guess the dub path could contain spaces and break that way, but there
  // doesn't seem to be any escaping utility in the nodejs standard library,
  // so meh, quotes should be enough.
  let proc: ChildProcess;
  try {
    proc = spawn('"' + dub + '" upgrade ' + dubArgs, { shell: true });
  } catch (e) {
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
    proc.on("close", (code, signal) => {
      if (code == 0) {
        resolve(true);
      } else {
        if (
          output.indexOf("Error querying versions") != -1 ||
          output.indexOf("Failed to download") != -1
        ) {
          return resolve(false);
        } else {
          const exitDesc = signal ? `signal ${signal}` : `error code ${code}`;
          return reject("dub exited with " + exitDesc);
        }
      }
    });
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main();
