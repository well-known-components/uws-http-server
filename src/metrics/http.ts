import { IMetricsComponent } from '@well-known-components/interfaces'

export const httpLabels = ['method', 'handler', 'code'] as const

const metrics = {
  http_request_duration_seconds: {
    type: IMetricsComponent.HistogramType,
    help: 'Request duration in seconds.',
    labelNames: httpLabels
  },
  http_requests_total: {
    type: IMetricsComponent.CounterType,
    help: 'Total number of HTTP requests',
    labelNames: httpLabels
  },
  http_request_size_bytes: {
    type: IMetricsComponent.HistogramType,
    help: 'Duration of HTTP requests size in bytes',
    labelNames: httpLabels
  }
}

export type HttpMetrics = keyof typeof metrics

/**
 * @public
 */
export function getDefaultHttpMetrics(): IMetricsComponent.MetricsRecordDefinition<HttpMetrics> {
  return metrics
}
