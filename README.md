# user-cycle
User registration, billing, deletion, management

## Stripe
- https://stripe.com/docs/billing/subscriptions/build-subscriptions
- https://dashboard.stripe.com/test/webhooks/create?endpoint_location=local

## Architecture

```mermaid
flowchart LR
    web-app("<a href='https://github.com/Gratheon/web-app'>web-app</a>") --> graphql-router
    
    graphql-router --> user-cycle("<a href='https://github.com/Gratheon/user-cycle'>user-cycle</a>") --> mysql
    user-cycle --> stripe
    user-cycle --"register schema"--> graphql-schema-registry
    graphql-router --> graphql-schema-registry
```


## Development
```
npm run dev
```

## Deployment
```
make
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
