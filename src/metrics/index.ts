import { IBaseComponent, IConfigComponent, IMetricsComponent } from '@well-known-components/interfaces'

import { collectDefaultMetrics } from 'prom-client'
import { getDefaultHttpMetrics, HttpMetrics } from './http'
import { createTestMetricsComponent } from './base'

export { createTestMetricsComponent, getDefaultHttpMetrics }

/**
 * Metrics configuration prefix.
 * @public
 */
export const CONFIG_PREFIX = 'WKC_METRICS' as const

/**
 * @internal
 */
export function _configKey(key: Uppercase<string>): string {
  return `${CONFIG_PREFIX}_${key.toUpperCase().replace(/^(_*)/, '')}`
}

/**
 * @public
 */
export async function createMetricsComponent<K extends string, V extends object = {}>(
  metricsDefinition: IMetricsComponent.MetricsRecordDefinition<K>,
  components: { config: IConfigComponent }
): Promise<IMetricsComponent<K> & IBaseComponent> {
  const { config } = components

  const basePort = createTestMetricsComponent<K>(metricsDefinition)

  return {
    // IMetricsComponent<K>
    ...basePort,
    // IBaseComponent
    start: async () => {
      if ((await config.getString(_configKey('COLLECT_DEFAULT'))) != 'false') {
        collectDefaultMetrics({ register: basePort.registry })
      }
    }
  }
}

/**
 * This function only validates the types.
 * In the future it may perform real runtime assertions.
 *
 * @public
 */
export function validateMetricsDeclaration<T extends string>(
  metricsDefinition: IMetricsComponent.MetricsRecordDefinition<T>
): IMetricsComponent.MetricsRecordDefinition<T> {
  return metricsDefinition
}

const noopStartTimer = { end() {} }

export function onRequestStart(metrics: IMetricsComponent<HttpMetrics>, method: string, handler: string) {
  const labels = {
    method,
    handler
  }
  const startTimerResult = metrics.startTimer('http_request_duration_seconds', labels)
  const end = startTimerResult?.end || noopStartTimer.end
  return { end, labels }
}

export function onRequestEnd(
  metrics: IMetricsComponent<HttpMetrics>,
  startLabels: Record<string, any>,
  code: number,
  end: (labels: Record<string, any>) => void
) {
  const labels = {
    ...startLabels,
    code
  }

  metrics.increment('http_requests_total', labels)
  end(labels)
}
