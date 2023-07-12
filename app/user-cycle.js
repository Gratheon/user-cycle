import { ApolloServer } from "apollo-server-fastify";
import { ApolloServerPluginDrainHttpServer, ApolloServerPluginLandingPageGraphQLPlayground } from "apollo-server-core";
import fastify from "fastify";
import { buildSubgraphSchema } from '@apollo/federation';
import Sentry from '@sentry/node';

import config from '../config/config.js';
import { schema } from './schema.js';
import { resolvers } from './resolvers.js';
import { initStorage } from "./storage.js";
import { registerStripe } from "./stripe.js";
import { registerSchema } from "./schema-registry.js";


Sentry.init({
	dsn: config.sentryDsn,
	environment: process.env.ENV_ID,
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
		typeDefs: buildSubgraphSchema(typeDefs),
		resolvers,
		plugins: [
			fastifyAppClosePlugin(app),
			ApolloServerPluginLandingPageGraphQLPlayground(),
			ApolloServerPluginDrainHttpServer({ httpServer: app.server })
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

	const app = fastify({
		logger: true
	});

	app.setErrorHandler(async (error, request, reply) => {
		// Logging locally
		console.log(error);

		Sentry.withScope(function (scope) {
			scope.addEventProcessor(function (event) {
			  return Sentry.addRequestDataToEvent(event, request);
			});
			Sentry.captureException(err);
		});

		reply.status(500).send({ error: "Something went wrong" });
	});
	  
	app.get('/health', (request, reply) => {
		reply.send({ hello: 'world' })
	})

	try {
		await registerSchema(schema);
		console.log('Starting apollo server');
		const path = await startApolloServer(app, schema, resolvers);

		// STRIPE REST API
		registerStripe(app);

		await app.listen(4000, '0.0.0.0');
		console.log(`🚀 Server ready at http://localhost:4000${path}`);
	} catch (e) {
		console.error(e);
	}
})();
