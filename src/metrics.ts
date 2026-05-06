type ResolverMap = Record<string, any>;

export function wrapGraphqlResolversWithMetrics<T extends ResolverMap>(resolverMap: T): T {
    return resolverMap;
}
