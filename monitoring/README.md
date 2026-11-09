# Togglely Monitoring Stack

Prometheus + Grafana monitoring for the Togglely backend.

## Quick Start

```bash
cd monitoring
docker compose -f docker-compose.monitoring.yml up -d
```

This starts:

- **Prometheus** on [http://localhost:9090](http://localhost:9090)
- **Grafana** on [http://localhost:3001](http://localhost:3001) (login: `admin` / `admin`)

Make sure the Togglely backend is running on port 4000 and exposes a `/metrics` endpoint.

**Security:** `/metrics` is protected by the backend env var `METRICS_TOKEN`. In production the endpoint is disabled (404) when no token is set. Configure the same token under `authorization` in `prometheus.yml`.

## Available Dashboards

Both dashboards are provisioned automatically under the **Togglely** folder in Grafana.

### API Performance (`togglely-api-performance`)

- **HTTP Request Rate** -- requests per second by method, route, and status code
- **Request Latency (p50/p95/p99)** -- response time percentiles
- **Error Rate (%)** -- percentage of 5xx responses with color thresholds
- **Active Connections** -- current open HTTP connections
- **Top Slowest Endpoints** -- table sorted by p99 latency

### System Metrics (`togglely-system-metrics`)

- **Process CPU Usage** -- CPU time consumed by the Node.js process
- **Memory Usage (RSS/Heap)** -- resident set size and V8 heap usage
- **Event Loop Lag** -- delay in the Node.js event loop
- **GC Duration** -- time spent in garbage collection
- **Active Handles / Requests** -- open libuv handles and pending requests

## Alert Rules

Two alert rules are provisioned automatically:

| Alert | Condition | Severity | For |
|---|---|---|---|
| **High Error Rate** | 5xx error rate > 5% | critical | 5 min |
| **High Latency** | p95 latency > 2 seconds | warning | 5 min |

Alerts fire after the condition holds for the specified duration. Configure notification channels (email, Slack, etc.) in Grafana under **Alerting > Contact points**.

## Adding Custom Metrics

The backend uses the `/metrics` endpoint (typically via `prom-client` in NestJS). To add new metrics:

1. Import and create a metric in your service:
   ```typescript
   import { Counter, Histogram } from 'prom-client';

   const myCounter = new Counter({
     name: 'my_custom_total',
     help: 'Description of the counter',
     labelNames: ['label1'],
   });
   ```

2. Increment or observe in your code:
   ```typescript
   myCounter.inc({ label1: 'value' });
   ```

3. The metric is automatically available at `/metrics` and scraped by Prometheus.

4. Add a new panel in Grafana using the metric name in a PromQL query.

## Prometheus Configuration

The scrape configuration is in `prometheus.yml`:

- **Scrape interval:** 15 seconds
- **Target:** `host.docker.internal:4000/metrics` (the Togglely backend)
- **Retention:** 30 days

To add more scrape targets, edit `prometheus.yml` and restart Prometheus:

```bash
docker compose -f docker-compose.monitoring.yml restart prometheus
```

## Stopping the Stack

```bash
docker compose -f docker-compose.monitoring.yml down
```

To also remove stored data:

```bash
docker compose -f docker-compose.monitoring.yml down -v
```
