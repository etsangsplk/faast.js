import Axios from "axios";
import * as fs from "fs";
import humanStringify from "human-stringify";
import { Readable } from "stream";
import { FunctionCall, FunctionReturn, packer } from "./functionserver";
import { CloudFunctions, initializeGoogleAPIs } from "./google";
import { serverFile } from "./server";

export interface CloudOptions {
    region?: string;
    zipFile?: string;
    description?: string;
    entryPoint?: string;
    timeout?: number;
    availableMemoryMb?: number;
    labels?: { [key: string]: string };
    verbose?: boolean;
}

let cloudFunctionsApi: CloudFunctions | undefined;
let trampoline!: string;
let sha256!: string;
let verbose: boolean = false;

function log(msg: string) {
    verbose && console.log(msg);
}

function group() {
    // verbose && console.group();
}

function groupEnd() {
    // verbose && console.groupEnd();
}

export async function initCloudify({
    region = "us-central1",
    description = "cloudify trampoline function",
    entryPoint = "trampoline",
    timeout = 60,
    availableMemoryMb = 256,
    labels = {},
    verbose: verboseFlag = false
}: CloudOptions = {}) {
    verbose = verboseFlag;
    if (cloudFunctionsApi) {
        return;
    }

    const { archive, hash: sha256 } = await packer(serverFile(), { verbose });
    const google = await initializeGoogleAPIs();
    const project = await google.auth.getDefaultProjectId();
    cloudFunctionsApi = new CloudFunctions(google, project, verbose);

    log(`Create cloud function`);

    const trampolineName = "cloudify-trampoline-" + sha256.slice(0, 24);
    trampoline = cloudFunctionsApi.functionPath(region, trampolineName);
    const locationPath = cloudFunctionsApi.locationPath(region);

    log(`  trampoline: ${trampoline}`);
    log(`  location: ${locationPath}`);
    const uploadUrlResponse = await cloudFunctionsApi.generateUploaddUrl(locationPath);
    const uploadResult = await uploadZip(uploadUrlResponse.uploadUrl!, archive);
    log(`Upload zip file response: ${uploadResult.statusText}`);

    verbose && console.log(`hash: ${sha256}`);

    await checkExistingTrampolineFunction();

    log(`Creating cloud function`);
    const sha256a = sha256.slice(0, 32);
    const sha256b = sha256.slice(32);

    const functionRequest = {
        name: trampoline,
        description: description,
        entryPoint: entryPoint,
        timeout: `${timeout}s`,
        availableMemoryMb: availableMemoryMb,
        sourceUploadUrl: uploadUrlResponse.uploadUrl,
        httpsTrigger: {},
        labels: { ...labels, sha256a, sha256b }
    };

    log(`Create function`);
    group();
    log(`location: ${locationPath}`);
    log(humanStringify(functionRequest));
    groupEnd();
    await cloudFunctionsApi
        .createFunction(locationPath, functionRequest)
        .catch(err => console.error(`Error: ${err.message}`));
}

async function checkExistingTrampolineFunction() {
    // It should be rare to get a trampoline collision because we include
    // part of the sha256 hash as part of the name, but we check just in
    // case.
    const existingFunc = await cloudFunctionsApi!
        .getFunction(trampoline)
        .catch(_ => undefined);
    if (existingFunc) {
        const {
            labels: { sha256a, sha256b }
        } = existingFunc;
        const previousHash = sha256a + sha256b;
        if (previousHash && previousHash === sha256) {
            log(`Function unchanged, hash matches: ${previousHash}`);
            return;
        } else {
            throw new Error(`Cloudify trampoline function exists but hashes differ!`);
        }
    }
}

async function uploadZip(url: string, zipStream: Readable) {
    return await Axios.put(url, zipStream, {
        headers: {
            "content-type": "application/zip",
            "x-goog-content-length-range": "0,104857600"
        }
    });
}

// prettier-ignore
export function cloudify<T0, R>(fn: (a0: T0) => Promise<R>): typeof fn;
// prettier-ignore
export function cloudify<T0, T1, R>( fn: (a0: T0, a1: T1) => Promise<R> ): typeof fn;
// prettier-ignore
export function cloudify<T0, T1, T2, R>( fn: (a0: T0, a1: T1, a2: T2) => Promise<R> ): typeof fn;
// prettier-ignore
export function cloudify<T0, T1, T2, T3, R>( fn: (a0: T0, a1: T1, a2: T2, a3: T3) => Promise<R> ): typeof fn;
// prettier-ignore
export function cloudify<T0, T1, T2, T3, T4, R>( fn: (a0: T0, a1: T1, a2: T2, a3: T3, a4: T4) => Promise<R> ): typeof fn;
// prettier-ignore
export function cloudify<T0, T1, T2, T3, T4, T5, R>( fn: (a0: T0, a1: T1, a2: T2, a3: T3, a4: T4, a5: T5) => Promise<R> ): typeof fn;
// prettier-ignore
export function cloudify<T0, T1, T2, T3, T4, T5, T6, R>( fn: (a0: T0, a1: T1, a2: T2, a3: T3, a4: T4, a5: T5, a6: T6) => Promise<R> ): typeof fn;
// prettier-ignore
export function cloudify<T0, T1, T2, T3, T4, T5, T6, T7, R>( fn: (a0: T0, a1: T1, a2: T2, a3: T3, a4: T4, a5: T5, a6: T6, a7: T7) => Promise<R> ): typeof fn;
// prettier-ignore
export function cloudify<T0, T1, T2, T3, T4, T5, T6, T7, T8, R>( fn: ( a0: T0, a1: T1, a2: T2, a3: T3, a4: T4, a5: T5, a6: T6, a7: T7, a8: T8 ) => Promise<R> ): typeof fn;
// prettier-ignore
export function cloudify<T0, R>(fn: (a0: T0) => R): (arg: T0) => Promise<R>;
// prettier-ignore
export function cloudify<T0, T1, R>(fn: (a0: T0, a1: T1) => R): (a0: T0, a1: T1) => Promise<R>;
// prettier-ignore
export function cloudify<T0, T1, T2, R>(fn: (a0: T0, a1: T1, a2: T2) => R): (a0: T0, a1: T1, a2: T2) => Promise<R>;
// prettier-ignore
export function cloudify<T0, T1, T2, T3, R>(fn: (a0: T0, a1: T1, a2: T2, a3: T3) => R): (a0: T0, a1: T1, a2: T2, a3: T3) => Promise<R>;
// prettier-ignore
export function cloudify<T0, T1, T2, T3, T4, R>(fn: (a0: T0, a1: T1, a2: T2, a3: T3, a4: T4) => R): (a0: T0, a1: T1, a2: T2, a3: T3, a4: T4) => Promise<R>;
// prettier-ignore
export function cloudify<T0, T1, T2, T3, T4, T5, R>(fn: (a0: T0, a1: T1, a2: T2, a3: T3, a4: T4, a5: T5) => R): (a0: T0, a1: T1, a2: T2, a3: T3, a4: T4, a5: T5) => Promise<R>;
// prettier-ignore
export function cloudify<T0, T1, T2, T3, T4, T5, T6, R>(fn: (a0: T0, a1: T1, a2: T2, a3: T3, a4: T4, a5: T5, a6: T6) => R): (a0: T0, a1: T1, a2: T2, a3: T3, a4: T4, a5: T5, a6: T6) => Promise<R>;
// prettier-ignore
export function cloudify<T0, T1, T2, T3, T4, T5, T6, T7, R>(fn: (a0: T0, a1: T1, a2: T2, a3: T3, a4: T4, a5: T5, a6: T6, a7: T7) => R): (a0: T0, a1: T1, a2: T2, a3: T3, a4: T4, a5: T5, a6: T6, a7: T7) => Promise<R>;
// prettier-ignore
export function cloudify<T0, T1, T2, T3, T4, T5, T6, T7, T8, R>(fn: (a0: T0, a1: T1, a2: T2, a3: T3, a4: T4, a5: T5, a6: T6, a7: T7, a8: T8) => R): (a0: T0, a1: T1, a2: T2, a3: T3, a4: T4, a5: T5, a6: T6, a7: T7, a8: T8) => Promise<R>;

/**
 *
 * @param {(...args: any[]) => R} fn Parameters can be any value that can be JSON.stringify'd
 * @returns {(...args: any[]) => Promise<R>} A return value that can be JSON.stringify'd
 * @memberof CloudFactory
 */
export function cloudify<R>(fn: (...args: any[]) => R): (...args: any[]) => Promise<R> {
    return async (...args: any[]) => {
        if (!cloudFunctionsApi) {
            await initCloudify();
            if (!cloudFunctionsApi) {
                throw new Error(`Could not initialize cloud functions api`);
            }
        }
        let callArgs: FunctionCall = {
            name: fn.name,
            args
        };
        const callArgsStr = JSON.stringify(callArgs);
        log(`Calling cloud function "${fn.name}" with args: ${callArgsStr}`);
        const response = await cloudFunctionsApi.callFunction(trampoline, callArgsStr);
        if (response.error) {
            throw new Error(response.error);
        }
        log(`  returned: ${response.result}`);
        let returned: FunctionReturn = JSON.parse(response.result!);
        if (returned.type === "error") {
            throw new Error(returned.message);
        }
        return returned.value as R;
    };
}

export async function cleanupCloudify() {
    if (!cloudFunctionsApi) {
        return;
    }
    await cloudFunctionsApi.deleteFunction(trampoline);
}

async function testPacker() {
    const output = fs.createWriteStream("dist.zip");

    const { archive, hash } = await packer(serverFile(), {
        verbose: true
    });
    archive.pipe(output);
    console.log(`hash: ${hash}`);
}

console.log(`process.argv: ${process.argv}`);
if (process.argv.length > 2 && process.argv[2] === "--test") {
    testPacker();
}