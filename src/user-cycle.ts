import "./tracer"; // must come before importing any instrumented module.
import {ApolloServer} from "apollo-server-fastify";
import {ApolloServerPluginDrainHttpServer, ApolloServerPluginLandingPageGraphQLPlayground} from "apollo-server-core";
import fastify from "fastify";
import {buildSubgraphSchema} from '@apollo/federation';
import * as Sentry from '@sentry/node';
import {RewriteFrames} from "@sentry/integrations";
import gql from "graphql-tag";

import config from './config/index';
import {schema} from './schema';
import {resolvers} from './resolvers';
import {initStorage} from "./storage";
import {registerStripe} from "./stripe";
import {registerSchema} from "./schema-registry";
import {logger} from './logger'
import {registerGoogle} from "./google-auth";

Sentry.init({
    dsn: config.sentryDsn,
    environment: process.env.ENV_ID,
    tracesSampleRate: 1.0,
    integrations: [
        new RewriteFrames({
            // @ts-ignore
            root: global.__dirname,
        }),
    ],
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
    await initStorage();

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
            Sentry.captureException(err);
        });

        reply.status(500).send({error: "Something went wrong"});
    });

    app.get('/health', (request, reply) => {
        reply.send({hello: 'world'})
    })
    app.get('/account/cancel', (request, reply) => {
        if (process.env.ENV_ID == 'dev') {
            // web-app is running on
            reply.redirect(301, 'http://0.0.0.0:8080/account/cancel');
        } else {
            reply.redirect(301, 'https://app.gratheon.com/account/cancel');
        }
    })

    try {
        await registerSchema(schema);
        logger.info('starting user-cycle apollo server');
        const path = await startApolloServer(app, schema, resolvers);

        // STRIPE REST API
        registerStripe(app);

        // GOOGLE REST API
        registerGoogle(app);

        await app.listen(4000, '0.0.0.0');
        logger.info(`🚀 user-cycle service is ready at http://localhost:4000${path}`);
    } catch (e) {
        console.error(e);
    }
})();
