import config from "../config/index";

import createConnectionPool, {sql} from "@databases/mysql";
import jsonStringify from 'fast-safe-stringify'


const conn = createConnectionPool(
    `mysql://${config.mysql.user}:${config.mysql.password}@${config.mysql.host}:${config.mysql.port}/logs`
);

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

export const logger = {
    info: (message: string, meta?: any) => {
        const metaObj = safeMeta(meta);
        log('info', safeToStringMessage(message), metaObj);
        storeInDB('info', message, metaObj);
    },
    error: (message: string | Error | any, meta?: any) => {
        const metaObj = safeMeta(meta);
        if (message instanceof Error) {
            const enrichedMeta = {stack: message.stack, name: message.name, ...metaObj};
            log('error', message.message, enrichedMeta);
            storeInDB('error', message.message, enrichedMeta);
            return;
        }
        const msgStr = safeToStringMessage(message);
        log('error', msgStr, metaObj);
        storeInDB('error', msgStr, metaObj);
    },
    errorEnriched: (message: string, error: Error|any, meta?: any) => {
        const metaObj = safeMeta(meta);
        if (error instanceof Error) {
            const enrichedMeta = {stack: error.stack, name: error.name, ...metaObj};
            log('error', `${message}: ${error.message}`, enrichedMeta);
            storeInDB('error', `${message}: ${error.message}`, enrichedMeta);
            return;
        }
        const errStr = safeToStringMessage(error);
        log('error', `${message}: ${errStr}`, metaObj);
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
    console.log("UncaughtException processing: %s", err);
});
