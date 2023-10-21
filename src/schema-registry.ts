import fs from 'fs';
import { resolve, dirname } from 'path';
import fetch from "cross-fetch";
import { print } from "graphql";
import sha1 from 'sha1';

import config from './config/index';
import { logger } from './logger'

const packageJson = JSON.parse(fs.readFileSync(resolve('package.json'), 'utf8'));

type SchemaRegistryInput ={
	name: string
	url: string
	version: string
	type_defs: string
}
async function postData(url = '', data: SchemaRegistryInput) {
	logger.info(`Pushing schema as version ${data?.version}`)
	// Default options are marked with *
	const response = await fetch(url, {
		method: 'POST',
		//@ts-ignore
		mode: 'cors', // no-cors, *cors, same-origin
		cache: 'no-cache', // *default, no-cache, reload, force-cache, only-if-cached
		credentials: 'same-origin', // include, *same-origin, omit
		headers: {
			'Content-Type': 'application/json'
		},
		redirect: 'follow', // manual, *follow, error
		referrerPolicy: 'no-referrer', // no-referrer, *client
		body: JSON.stringify(data) // body data type must match "Content-Type" header
	});

	logger.info("schema-registry response:")
	logger.info(response)

	if (!response.ok) {
		console.error(`schema-registry respose code ${response.status}: ${response.statusText}`);
		return false;
	}
	return await response.json(); // parses JSON response into native JavaScript objects
}

export async function registerSchema(schema) {
	const url = `${config.schemaRegistryHost}/schema/push`

	try {
		const version = sha1(schema)

		await postData(url, {
			"name": packageJson.name,
			"url": config.selfUrl,
			"version": process.env.ENV_ID === 'dev' ? "latest" : version,
			"type_defs": schema
		});
	} catch (e) {
		console.error(e);
	}
}
