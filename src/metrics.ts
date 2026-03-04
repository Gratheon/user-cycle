import client from "prom-client";

const register = new client.Registry();

register.setDefaultLabels({
    service: "user-cycle",
});

client.collectDefaultMetrics({ register });

export const httpRequestDurationSeconds = new client.Histogram({
    name: "user_cycle_http_request_duration_seconds",
    help: "HTTP request duration in seconds",
    labelNames: ["method", "route", "status_code"] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
    registers: [register],
});

export const httpRequestsTotal = new client.Counter({
    name: "user_cycle_http_requests_total",
    help: "Total number of HTTP requests",
    labelNames: ["method", "route", "status_code"] as const,
    registers: [register],
});

export function recordHttpRequest(input: {
    method: string;
    route: string;
    statusCode: number;
    durationSeconds: number;
}) {
    const labels = {
        method: input.method,
        route: input.route,
        status_code: String(input.statusCode),
    };

    httpRequestsTotal.inc(labels);
    httpRequestDurationSeconds.observe(labels, input.durationSeconds);
}

export async function renderMetrics(): Promise<string> {
    return register.metrics();
}

export const metricsContentType = register.contentType;
