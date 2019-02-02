import test, { ExecutionContext, Macro } from "ava";
import { URL } from "url";
import { inspect } from "util";
import { faastify, local } from "../src/faast";
import { readFile } from "../src/fs";
import { sleep } from "../src/shared";
import * as funcs from "./functions";
import { measureConcurrency } from "./util";

const testCleanup: Macro<[local.Options]> = async (
    t: ExecutionContext,
    options: local.Options
) => {
    const cloudFunc = await faastify("local", funcs, "./functions", options);
    const { hello, sleep } = cloudFunc.functions;
    let done = 0;

    hello("there")
        .then(_ => done++)
        .catch(_ => {});

    sleep(1000)
        .then(_ => done++)
        .catch(_ => {});

    await cloudFunc.cleanup();
    t.is(done, 0);
};

const testOrder: Macro<[local.Options]> = async (
    t: ExecutionContext,
    options: local.Options
) => {
    const cloudFunc = await faastify("local", funcs, "./functions", options);
    t.plan(2);

    const a = cloudFunc.functions.emptyReject();
    const b = cloudFunc.functions.sleep(0);
    t.is(await b, undefined);
    try {
        await a;
    } catch (err) {
        t.is(err, undefined);
    } finally {
        await cloudFunc.cleanup();
    }
};

async function testConcurrency(
    t: ExecutionContext,
    {
        options,
        maxConcurrency,
        expectedConcurrency
    }: {
        options: local.Options;
        maxConcurrency: number;
        expectedConcurrency: number;
    }
) {
    const cloudFunc = await faastify("local", funcs, "./functions", options);

    try {
        const N = maxConcurrency;
        const promises = [];
        for (let i = 0; i < N; i++) {
            promises.push(cloudFunc.functions.spin(500));
        }

        const timings = await Promise.all(promises);
        t.is(measureConcurrency(timings), expectedConcurrency);
    } finally {
        await cloudFunc.cleanup();
    }
}

test("local provider cleanup stops executions", testCleanup, {});
test("local provider cleanup stops executions with child process", testCleanup, {
    childProcess: true
});

const orderConfigs = [
    { childProcess: false, concurrency: 1, maxRetries: 0 },
    { childProcess: true, concurrency: 1, maxRetries: 0 },
    { childProcess: false, concurrency: 2, maxRetries: 0 },
    { childProcess: true, concurrency: 2, maxRetries: 0 },
    { childProcess: false, concurrency: 2, maxRetries: 2 },
    { childProcess: true, concurrency: 2, maxRetries: 2 }
];

for (const config of orderConfigs) {
    test(`out of order await (async catch) with ${inspect(config)}`, testOrder, config);
}

async function readFirstLogfile(logDirectoryUrl: string) {
    const logFileUrl = new URL(logDirectoryUrl + "/0.log");
    const buf = await readFile(logFileUrl);
    return buf
        .toString()
        .split("\n")
        .map(m => m.replace(/^\[(\d+)\]/, "[$pid]"));
}

test("local provider console.log and console.warn with child process", async t => {
    const cloudFunc = await faastify("local", funcs, "./functions", {
        childProcess: true,
        concurrency: 1
    });
    try {
        await cloudFunc.functions.consoleLog("Remote console.log output");
        await cloudFunc.functions.consoleWarn("Remote console.warn output");
        await cloudFunc.functions.consoleError("Remote console.error output");

        await cloudFunc.cleanup({ deleteResources: false });
        const messages = await readFirstLogfile(cloudFunc.logUrl());
        t.truthy(messages.find(s => s === "[$pid]: Remote console.log output"));
        t.truthy(messages.find(s => s === "[$pid]: Remote console.warn output"));
        t.truthy(messages.find(s => s === "[$pid]: Remote console.error output"));
    } finally {
        await cloudFunc.cleanup();
    }
});

test("local provider log files should be appended, not truncated, after child process crash", async t => {
    const cloudFunc = await faastify("local", funcs, "./functions", {
        childProcess: true,
        concurrency: 1,
        maxRetries: 1
    });
    try {
        await cloudFunc.functions.consoleLog("output 1");
        try {
            await cloudFunc.functions.processExit();
        } catch (err) {}
        await cloudFunc.functions.consoleWarn("output 2");

        const messages = await readFirstLogfile(cloudFunc.logUrl());

        t.truthy(messages.find(s => s === "[$pid]: output 1"));
        t.truthy(messages.find(s => s === "[$pid]: output 2"));
    } finally {
        await cloudFunc.cleanup();
    }
});

test("local provider concurrent executions with child processes", async t => {
    await testConcurrency(t, {
        options: {
            childProcess: true
        },
        maxConcurrency: 5,
        expectedConcurrency: 5
    });
});

test("local provider no concurrency for cpu bound work without child processes", async t => {
    await testConcurrency(t, {
        options: {
            childProcess: false
        },
        maxConcurrency: 5,
        expectedConcurrency: 1
    });
});

test("local provider cleanup waits for all child processes to exit", async t => {
    const cloudFunc = await faastify("local", funcs, "./functions", {
        childProcess: true
    });
    cloudFunc.functions.spin(5000).catch(_ => {});
    while (true) {
        await sleep(100);
        if (cloudFunc.state.wrappers.length > 0) {
            break;
        }
    }
    t.is(cloudFunc.state.wrappers.length, 1);
    await cloudFunc.cleanup();
    t.is(cloudFunc.state.wrappers.length, 0);
});
