import {ApolloServer} from "apollo-server-fastify";
import {ApolloServerPluginDrainHttpServer, ApolloServerPluginLandingPageGraphQLPlayground} from "apollo-server-core";
import fastify from "fastify";
import {buildSubgraphSchema} from '@apollo/federation';
import * as Sentry from '@sentry/node';
import gql from "graphql-tag";

import config from './config/index';
import {schema} from './schema';
import {resolvers} from './resolvers';



import {initStorage, isStorageConnected} from "./storage";
import {registerStripe} from "./stripe";
import {registerSchema} from "./schema-registry";
import {logger} from './logger'
import {registerGoogle} from "./google-auth";
import {rootHandler} from './handlers/rootHandler';

// Suppress harmless "packets out of order" warnings from mysql2
// These occur during normal connection pool cleanup and don't indicate errors
const originalStderrWrite = process.stderr.write.bind(process.stderr);
process.stderr.write = ((chunk: any, encoding?: any, callback?: any): boolean => {
    const str = chunk.toString();
    if (str.includes('packets out of order')) {
        // Silently ignore these harmless warnings
        if (typeof encoding === 'function') {
            encoding();
        } else if (callback) {
            callback();
        }
        return true;
    }
    return originalStderrWrite(chunk, encoding, callback);
}) as typeof process.stderr.write;

if (process.env.ENV_ID === 'dev') {
    try {
        // Dynamically install source-map-support so error stacks map to .ts lines in dev
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        require('source-map-support').install({
            handleUncaughtExceptions: false,
            environment: 'node',
            hookRequire: true,
        });
    } catch (e) {
        console.error('Failed to enable source-map-support', e);
    }
}

Sentry.init({
    dsn: config.sentryDsn,
    environment: process.env.ENV_ID,
    tracesSampleRate: 1.0,
});


function fastifyAppClosePlugin(app) {
    return {
        async serverWillStart() {
            return {
                async drainServer() {
                    await app.close();
                }
            };
        }
    };
}

async function startApolloServer(app, typeDefs, resolvers) {
    const server = new ApolloServer({
        schema: buildSubgraphSchema({typeDefs: gql(typeDefs), resolvers}),
        plugins: [
            fastifyAppClosePlugin(app),
            ApolloServerPluginLandingPageGraphQLPlayground(),
            ApolloServerPluginDrainHttpServer({httpServer: app.server})
        ],
        context: (req) => {
            return {
                uid: req.request.raw.headers['internal-userid']
            };
        },
    });

    await server.start();
    app.register(server.createHandler());

    return server.graphqlPath;
}

(async function main() {
    await initStorage(logger);

    // @ts-ignore
    const app = fastify({logger});

    app.register(require('fastify-cookie'), {
        secret: "my-secret", // for cookies signature
        parseOptions: {}     // options for parsing cookies
    })

    app.setErrorHandler(async (error, request, reply) => {
        // Logging locally
        logger.error(error);

        Sentry.withScope(function (scope) {
            scope.addEventProcessor(function (event) {
                //@ts-ignore
                return Sentry.addRequestDataToEvent(event, request);
            });
            //@ts-ignore
            Sentry.captureException(error);
        });

        reply.status(500).send({error: "Something went wrong"});
    });

    app.get('/', rootHandler);

    app.get('/health', (request, reply) => {
        reply.send({
            status: 'ok',
            mysql: isStorageConnected() ? 'connected' : 'disconnected'
        })
    })
    app.get('/account/cancel', (request, reply) => {
        if (process.env.ENV_ID == 'dev') {
            // web-app is running on
            reply.status(301).redirect('http://0.0.0.0:8080/account/cancel');
        } else {
            reply.status(301).redirect('https://app.gratheon.com/account/cancel');
        }
    })

    if (process.env.ENV_ID === 'dev') {
        app.get('/dev-error', async (request, reply) => {
            try {
                // Simulate an application-level error to inspect TS stack frames
                throw new Error('Dev test error from user-cycle.ts');
            } catch (err) {
                logger.error('Triggered /dev-error', err);
                reply.status(500).send({ok: false});
            }
        });
    }

    try {
        await registerSchema(schema);
        logger.info('starting user-cycle apollo server');
        const path = await startApolloServer(app, schema, resolvers);

        // STRIPE REST API
        registerStripe(app);

        // GOOGLE REST API
        registerGoogle(app);

        await app.listen({port: 4000, host: '0.0.0.0'});
        logger.info(`🧑‍🚀 user-cycle service is ready at http://localhost:4000${path}`);
    } catch (e) {
        console.error(e);
    }
})();
