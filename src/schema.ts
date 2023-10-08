import { gql } from "apollo-server-core";

export const schema = gql`
    scalar JSON
    scalar DateTime
    scalar URL
    
    type Query {
        user: User
        invoices: [Invoice]
        api_tokens: [APIToken]
        translate(en: String, key: String, tc: String): Locale
    }

    type APIToken {
        id: ID!
        token: String!
    }

    type Invoice {
        id: ID!
        total: Float
        currency: String
        date: DateTime
        url: URL
    }

    type Locale {
        id: ID!
        en: String
        ru: String
        et: String
        tr: String
        pl: String
        key: String
    }
    
    type Mutation {
        register(email:String, password: String): LoginResult
        login(email:String, password: String): LoginResult
        generateApiToken: APIToken
        validateApiToken(token: String): ValidateTokenResult
        updateUser(user: UserUpdateInput!): UpdateUserResult
        createCheckoutSession: URL
        cancelSubscription: CancelSubscriptionResult
    }
    
    type TokenUser {
        id: ID!
    }
    
    type UserSession {
        key: String
    }

    type Error{
        code: String
    }
    
    union ValidateTokenResult = TokenUser | Error
    union LoginResult = UserSession | Error
    union UpdateUserResult = User | Error
    union CancelSubscriptionResult = User | Error
    
    type User {
        id: ID!
        email: String
        first_name: String
        last_name: String

        """
        Language code: en, ru, tr, et, pl
        """
        lang: String
        date_added: DateTime
        date_expiration: DateTime
        hasSubscription: Boolean
        isSubscriptionExpired: Boolean
    }
    
    input UserUpdateInput{
        first_name: String
        last_name: String
        lang: String
    }
`;
