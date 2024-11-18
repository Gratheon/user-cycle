import {expect} from '@jest/globals';
// import fetch from 'node-fetch';

// port from docker-compose.test.yml
const URL = 'http://localhost:4000/graphql';

describe('register', () => {
    it('should register a user', async () => {

        let email = "artkurapov+"+ new Date().getTime() + "@gmail.com"

        // register first time
        let body = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'internal-router-signature': 'test-signature',
            },
            body: JSON.stringify({
                operationName: 'register',
                query: "mutation register($first_name: String, $last_name: String, $email: String!, $password: String!) {\n  register(\n    first_name: $first_name\n    last_name: $last_name\n    email: $email\n    password: $password\n  ) {\n    __typename\n    ... on Error {\n      code\n    }\n    ... on UserSession {\n      key\n    }\n  }\n}",
                variables: {
                    "email": email, // <-- valid email
                    "first_name": "james",
                    "last_name": "bond",
                    "password": "Test1234"
                }
            })
        }

        let response = await fetch(URL, body);

        const result = await response.json();


        // Check if the response was successful
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }


        // @ts-ignore
        expect(result?.data.register.key).toBeDefined()
    });

    it('should login on duplicate registration', async () => {

        let email = "artkurapov+"+ new Date().getTime() + "@gmail.com"

        // register first time
        let body = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'internal-router-signature': 'test-signature',
            },
            body: JSON.stringify({
                operationName: 'register',
                query: "mutation register($first_name: String, $last_name: String, $email: String!, $password: String!) {\n  register(\n    first_name: $first_name\n    last_name: $last_name\n    email: $email\n    password: $password\n  ) {\n    __typename\n    ... on Error {\n      code\n    }\n    ... on UserSession {\n      key\n    }\n  }\n}",
                variables: {
                    "email": email, // <-- valid email
                    "first_name": "james",
                    "last_name": "bond",
                    "password": "Test1234"
                }
            })
        }
        await fetch(URL, body);
        let response = await fetch(URL, body);

        const result = await response.json();


        // Check if the response was successful
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }


        // @ts-ignore
        expect(result?.data.register.key).toBeDefined()
    });

    it('should fail with INVALID_EMAIL on invalid email', async () => {
        // make POST request
        // Send a POST request to the API endpoint
        const response = await fetch(URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'internal-router-signature': 'test-signature',
            },
            body: JSON.stringify({
                operationName: 'register',
                query: "mutation register($first_name: String, $last_name: String, $email: String!, $password: String!) {\n  register(\n    first_name: $first_name\n    last_name: $last_name\n    email: $email\n    password: $password\n  ) {\n    __typename\n    ... on Error {\n      code\n    }\n    ... on UserSession {\n      key\n    }\n  }\n}",
                variables: {
                    "email": "artk@aa", // <-- invalid email
                    "first_name": "james",
                    "last_name": "bond",
                    "password": "aaaa123"}
            })
        });

        // Check if the response was successful
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        // Parse the response data as JSON
        const result = await response.json();

        // @ts-ignore
        expect(result?.data).toEqual({
            "register": {
                "__typename": "Error",
                "code": "INVALID_EMAIL",
            },
        });
    });

    it('should fail with SIMPLE_PASSWORD on empty password', async () => {
        // make POST request
        // Send a POST request to the API endpoint
        const response = await fetch(URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'internal-router-signature': 'test-signature',
            },
            body: JSON.stringify({
                operationName: 'register',
                query: "mutation register($first_name: String, $last_name: String, $email: String!, $password: String!) {\n  register(\n    first_name: $first_name\n    last_name: $last_name\n    email: $email\n    password: $password\n  ) {\n    __typename\n    ... on Error {\n      code\n    }\n    ... on UserSession {\n      key\n    }\n  }\n}",
                variables: {
                    "email": "artkurapov+valid-test@gmail.com",
                    "first_name": "james",
                    "last_name": "bond",
                    "password": "" // <-- empty password
                }
            })
        });

        // Check if the response was successful
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        // Parse the response data as JSON
        const result = await response.json();

        // @ts-ignore
        expect(result?.data).toEqual({
            "register": {
                "__typename": "Error",
                "code": "SIMPLE_PASSWORD",
            },
        });
    });

    it('should fail with EMAIL_TAKEN if email already registered', async () => {

        let email = "artkurapov+"+ new Date().getTime() + "@gmail.com"

        // register first time
        await fetch(URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'internal-router-signature': 'test-signature',
            },
            body: JSON.stringify({
                operationName: 'register',
                query: "mutation register($first_name: String, $last_name: String, $email: String!, $password: String!) {\n  register(\n    first_name: $first_name\n    last_name: $last_name\n    email: $email\n    password: $password\n  ) {\n    __typename\n    ... on Error {\n      code\n    }\n    ... on UserSession {\n      key\n    }\n  }\n}",
                variables: {
                    "email": email, // <-- valid email
                    "first_name": "james",
                    "last_name": "bond",
                    "password": "Test1234"
                }
            })
        });

        // try to register second time

        const response = await fetch(URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'internal-router-signature': 'test-signature',
            },
            body: JSON.stringify({
                operationName: 'register',
                query: "mutation register($first_name: String, $last_name: String, $email: String!, $password: String!) {\n  register(\n    first_name: $first_name\n    last_name: $last_name\n    email: $email\n    password: $password\n  ) {\n    __typename\n    ... on Error {\n      code\n    }\n    ... on UserSession {\n      key\n    }\n  }\n}",
                variables: {
                    "email": email,
                    "first_name": "james",
                    "last_name": "bond",
                    "password": "Test5678" // <-- different password to not get logged in
                }
            })
        });

        const result = await response.json();


        // Check if the response was successful
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }


        // @ts-ignore
        expect(result?.data).toEqual({
            "register": {
                "__typename": "Error",
                "code": "EMAIL_TAKEN",
            },
        });
    });
});