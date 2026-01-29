import config from "../config/index";

import createConnectionPool, {sql} from "@databases/mysql";
import jsonStringify from 'fast-safe-stringify'
import * as fs from 'fs';
import * as path from 'path';


const conn = createConnectionPool({
    connectionString: `mysql://${config.mysql.user}:${config.mysql.password}@${config.mysql.host}:${config.mysql.port}/logs?connectionLimit=3&waitForConnections=true`,
    // Connection pool configuration
    bigIntMode: 'number',
    poolSize: 3, // Smaller pool for logger
    maxUses: 200, // Increase max uses significantly to reduce recycling
    idleTimeoutMilliseconds: 120_000, // 2 minutes to reduce connection churn
    queueTimeoutMilliseconds: 60_000,
    onError: (err) => {
        // Suppress "packets out of order" warnings as they're harmless during connection cleanup
        if (!err.message?.includes('packets out of order')) {
            console.error(`MySQL logger connection pool error: ${err.message}`);
        }
    },
});

function log(level: string, message: string, meta?: any) {
    let time = new Date().toISOString();
    let hhMMTime = time.slice(11, 19);
    // colorize time to have ansi blue color
    hhMMTime = `\x1b[34m${hhMMTime}\x1b[0m`;

    // colorize level to have ansi red color for errors
    meta = meta ? jsonStringify(meta) : ''

    if (level === 'error') {
        level = `\x1b[31m${level}\x1b[0m`;
        meta = `\x1b[35m${meta}\x1b[0m`;
    } else if (level === 'info') {
        level = `\x1b[32m${level}\x1b[0m`;
        meta = `\x1b[35m${meta}\x1b[0m`;
    } else if (level === 'debug') {
        level = `\x1b[90m${level}\x1b[0m`;
        message = `\x1b[90m${message}\x1b[0m`;
        meta = `\x1b[90m${meta}\x1b[0m`;
    } else if (level === 'warn') {
        level = `\x1b[33m${level}\x1b[0m`;
        meta = `\x1b[35m${meta}\x1b[0m`;
    }

    console.log(`${hhMMTime} [${level}]: ${message} ${meta}`);
}

function safeToStringMessage(message: any): string {
    if (typeof message === 'string') return message;
    if (message && typeof message === 'object') {
        if (message.message && typeof message.message === 'string') return message.message;
        try {
            return jsonStringify(message).slice(0, 2000);
        } catch {
            return String(message);
        }
    }
    return String(message);
}

function safeMeta(meta: any): any {
    if (!meta) return {};
    return meta;
}

function storeInDB(level: string, message: any, meta?: any){
    try {
        const msg = safeToStringMessage(message);
        const metaObj = safeMeta(meta);
        const metaStr = jsonStringify(metaObj).slice(0, 2000);
        // Fire and forget; avoid awaiting in hot path. Catch errors to avoid unhandled rejection.
        conn.query(sql`INSERT INTO \`logs\` (level, message, meta, timestamp) VALUES (${level}, ${msg}, ${metaStr}, NOW())`).catch(e => {
            // fallback console output only
            console.error('Failed to persist log to DB', e);
        });
    } catch (e) {
        console.error('Unexpected failure preparing log for DB', e);
    }
}

function formatStack(stack?: string): string {
    if (!stack) return '';
    // Remove first line if it duplicates the error message already printed.
    const lines = stack.split('\n');
    if (lines.length > 1 && lines[0].startsWith('Error')) {
        lines.shift();
    }
    // Grey color for stack lines
    return lines.map(l => `\x1b[90m${l}\x1b[0m`).join('\n');
}

function printStackIfAny(possibleError: any) {
    if (possibleError && typeof possibleError === 'object' && typeof possibleError.stack === 'string') {
        console.log(formatStack(possibleError.stack));
    }
}

function extractFirstProjectFrame(stack?: string): {file?: string, line?: number, column?: number} {
    if (!stack) return {};
    const lines = stack.split('\n');
    for (const l of lines) {
        // Match: at FunctionName (/app/src/some/file.ts:123:45)
        const m = l.match(/\(([^()]+\.ts):(\d+):(\d+)\)/);
        if (m) {
            return {file: m[1], line: parseInt(m[2], 10), column: parseInt(m[3], 10)};
        }
        // Alternate format: at /app/src/file.ts:123:45
        const m2 = l.match(/\s(at\s)?([^()]+\.ts):(\d+):(\d+)/);
        if (m2) {
            return {file: m2[2], line: parseInt(m2[3], 10), column: parseInt(m2[4], 10)};
        }
    }
    return {};
}

function buildCodeFrame(frame: {file?: string, line?: number, column?: number}): string {
    if (!frame.file || frame.line == null) return '';
    try {
        const filePath = frame.file.startsWith('/') ? frame.file : path.join(process.cwd(), frame.file);
        if (!fs.existsSync(filePath)) return '';
        const content = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
        const start = Math.max(0, frame.line - 3);
        const end = Math.min(content.length, frame.line + 2);
        const lines: string[] = [];
        for (let i = start; i < end; i++) {
            const prefix = (i + 1 === frame.line) ? '\x1b[31m>\x1b[0m' : ' '; // highlight culprit line
            const num = String(i + 1).padStart(4,' ');
            let codeLine = content[i];
            if (i + 1 === frame.line && frame.column) {
                // Add caret marker under column
                const caretPad = ' '.repeat(frame.column - 1);
                codeLine += `\n     ${caretPad}\x1b[31m^\x1b[0m`;
            }
            lines.push(`${prefix} ${num} | ${codeLine}`);
        }
        return lines.join('\n');
    } catch {return '';}
}

function hasProjectTsFrame(stack?: string): boolean {
    if (!stack) return false;
    return stack.split('\n').some(l => l.includes('/src/') && l.includes('.ts'));
}

function printStackEnhanced(possibleError: any) {
    if (!possibleError) return;
    const stack = possibleError.stack;
    if (typeof stack !== 'string') return;
    let outputStack = stack;
    if (process.env.ENV_ID === 'dev' && !hasProjectTsFrame(stack)) {
        // Capture a callsite stack to show where logger.error was invoked
        const callsite = new Error('__callsite__');
        if (callsite.stack) {
            const filtered = callsite.stack
                .split('\n')
                .filter(l => l.includes('/src/') && l.includes('.ts'))
                .slice(0, 5) // keep it short
                .join('\n');
            if (filtered) {
                outputStack += '\n\nCaptured callsite (added by logger):\n' + filtered;
            }
        }
    }
    console.log(formatStack(outputStack));
    if (process.env.ENV_ID === 'dev') {
        const frame = extractFirstProjectFrame(outputStack);
        const codeFrame = buildCodeFrame(frame);
        if (codeFrame) {
            console.log('\n\x1b[36mCode frame:\x1b[0m\n' + codeFrame + '\n');
        }
    }
}

function buildCauseChain(err: any): string[] {
    const chain: string[] = [];
    const visited = new Set<any>();
    let current = err;
    while (current && typeof current === 'object' && !visited.has(current)) {
        visited.add(current);
        if (current !== err) {
            const title = current.name ? `${current.name}: ${current.message}` : safeToStringMessage(current);
            chain.push(title);
        }
        current = current.cause;
    }
    return chain;
}

export const logger = {
    info: (message: string, meta?: any) => {
        const metaObj = safeMeta(meta);
        log('info', safeToStringMessage(message), metaObj);
        storeInDB('info', message, metaObj);
    },
    error: (message: string | Error | any, meta?: any) => {
        const metaObj = safeMeta(meta);
        if (message instanceof Error) {
            const causeChain = buildCauseChain(message);
            const enrichedMeta = {stack: message.stack, name: message.name, causeChain, ...metaObj};
            log('error', message.message, enrichedMeta);
            if (message.stack) {
                printStackEnhanced(message);
            }
            if (causeChain.length) {
                console.log('\x1b[35mCause chain:\x1b[0m ' + causeChain.join(' -> '));
            }
            storeInDB('error', message.message, enrichedMeta);
            return;
        }
        const msgStr = safeToStringMessage(message);
        log('error', msgStr, metaObj);
        printStackEnhanced(message);
        storeInDB('error', msgStr, metaObj);
    },
    errorEnriched: (message: string, error: Error|any, meta?: any) => {
        const metaObj = safeMeta(meta);
        if (error instanceof Error) {
            const causeChain = buildCauseChain(error);
            const enrichedMeta = {stack: error.stack, name: error.name, causeChain, ...metaObj};
            log('error', `${message}: ${error.message}`, enrichedMeta);
            if (error.stack) {
                printStackEnhanced(error);
            }
            if (causeChain.length) {
                console.log('\x1b[35mCause chain:\x1b[0m ' + causeChain.join(' -> '));
            }
            storeInDB('error', `${message}: ${error.message}`, enrichedMeta);
            return;
        }
        const errStr = safeToStringMessage(error);
        log('error', `${message}: ${errStr}`, metaObj);
        printStackEnhanced(error);
        storeInDB('error', `${message}: ${errStr}`, metaObj);
    },
    warn: (message: string, meta?: any) => {
        const metaObj = safeMeta(meta);
        log('warn', safeToStringMessage(message), metaObj);
        storeInDB('warn', message, metaObj);
    },

    // do not store debug logs in DB
    debug: (message: string, meta?: any) => {
        log('debug', safeToStringMessage(message), safeMeta(meta));
    },
};


process.on('uncaughtException', function (err) {
    logger.error('UncaughtException', err);
});

process.on('unhandledRejection', function (reason: any) {
    logger.error('UnhandledRejection', reason);
});
