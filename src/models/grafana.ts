import config from '../config';
import {logger} from "../logger";

const authHeader = 'Basic ' + Buffer.from(`${config.grafanaUser}:${config.grafanaPassword}`).toString('base64');

export async function createGrafanaUser(email, password, name) {
    const orgResponse = await createOrg(name);

    logger.info(`Created org`, orgResponse);

    const response = await fetch(
        `http://${config.grafanaUrl}/api/admin/users`, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': authHeader
        },
        body: JSON.stringify( {
            name,
            email,
            login: email,
            password,
            OrgId: orgResponse?.orgId
        })
    });

    if (!response.ok) {
        throw new Error(`Error: ${response.statusText}`);
    }

    const userCreation = await response.json();
    logger.info(`Created user`, userCreation);
    return userCreation
}

export async function createOrg(name) {
    const response = await fetch(
        `http://${config.grafanaUrl}/api/orgs`, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': authHeader
        },
        body: JSON.stringify({ name })
    });

    if (!response.ok) {
        throw new Error(`Error: ${response.statusText}`);
    }

    return await response.json();
}