# user-cycle

Gratheon.com user data related service, responsible for:

- registration & login
- billing
- translations of web-app labels (would be good to move to separate service)

## URLs

| Environment | URL                             |
| ----------- | ------------------------------- |
| Local       | http://localhost:4000           |
| Prod        | https://user-cycle.gratheon.com |

## Development

To run, you need [nvm](https://github.com/nvm-sh/nvm) and [just](https://github.com/casey/just):

```
just start
```

### API

| Method | URL          | Description             |
| ------ | ------------ | ----------------------- |
| POST   | /graphql     | GraphQL API             |
| POST   | /webhook     | Stripe webhook          |
| GET    | /health      | Health check            |
| GET    | /user/cancel | Redirect from stripe UI |

### Stripe

- https://stripe.com/docs/billing/subscriptions/build-subscriptions
- https://dashboard.stripe.com/test/webhooks/create?endpoint_location=local

## Architecture

```mermaid
flowchart LR
    web-app("<a href='https://github.com/Gratheon/web-app'>web-app</a>") --> graphql-router

    graphql-router --> user-cycle("<a href='https://github.com/Gratheon/user-cycle'>user-cycle</a>") --"CRUD on user"--> mysql
    user-cycle --> stripe
    user-cycle --"register schema"--> graphql-schema-registry
    graphql-router --> graphql-schema-registry

    web-app--"translate text" --> user-cycle --"translate phrases"--> clarifai
    user-cycle--"get/set translations"--> mysql

    user-cycle--"send emails"--> sendgrid
```

## Testing

### Payment flow

```
stripe listen --forward-to localhost:4000/webhook
```

Enter 4242 4242 4242 4242 as the card number
Enter any future date for card expiry
Enter any 3-digit number for CVV
Enter any billing postal code (90210)

