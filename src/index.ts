import {
  IBaseComponent,
  IConfigComponent,
  ILoggerComponent,
  IMetricsComponent
} from '@well-known-components/interfaces'
import * as uws from 'uWebSockets.js'
import { Registry } from 'prom-client'
import { HttpMetrics } from './metrics/http'

export type IUWsComponent = IBaseComponent & {
  start(): Promise<void>
  app: uws.TemplatedApp
}

type Components = {
  config: IConfigComponent
  logs: ILoggerComponent
  metrics: IMetricsComponent<HttpMetrics>
}

export async function createUWsComponent(
  components: Pick<Components, 'config' | 'logs'>,
  options?: uws.AppOptions
): Promise<IUWsComponent> {
  const { config, logs } = components
  const [port, host] = await Promise.all([
    config.requireNumber('HTTP_SERVER_PORT'),
    await config.requireString('HTTP_SERVER_HOST')
  ])

  const logger = logs.getLogger('http-server')

  const app = uws.App(options || {})

  let listen: Promise<uws.us_listen_socket> | undefined
  async function start() {
    if (listen) {
      logger.error('start() called more than once')
      await listen
      return
    }
    listen = new Promise<uws.us_listen_socket>((resolve, reject) => {
      try {
        app.listen(host, port, (token) => {
          logger.log(`Listening ${host}:${port}`)
          resolve(token)
        })
      } catch (err: any) {
        reject(err)
      }
    })
    await listen
  }

  async function stop() {
    if (listen) {
      logger.info(`Closing server`)
      const token = await listen
      uws.us_listen_socket_close(token)
      logger.info(`Server closed`)
    }
  }

  return {
    app,
    start,
    stop
  }
}

export const CONFIG_PREFIX = 'WKC_METRICS' as const

export function _configKey(key: Uppercase<string>): string {
  return `${CONFIG_PREFIX}_${key.toUpperCase().replace(/^(_*)/, '')}`
}

export async function createMetricsHandler(components: Pick<Components, 'config' | 'metrics'>) {
  const { metrics, config } = components

  const metricsPath = (await config.getString(_configKey('PUBLIC_PATH'))) || '/metrics'
  const bearerToken = await config.getString(_configKey('BEARER_TOKEN'))
  const rotateMetrics = (await config.getString(_configKey('RESET_AT_NIGHT'))) === 'true'

  function calculateNextReset() {
    return new Date(new Date(new Date().toDateString()).getTime() + 86400000).getTime()
  }

  let nextReset: number = calculateNextReset()

  return {
    path: metricsPath,
    handler: async (res: uws.HttpResponse, req: uws.HttpRequest) => {
      const registry = (metrics as any as { registry: Registry }).registry
      const body = await registry.metrics()

      if (bearerToken) {
        const header = req.getHeader('authorization')
        if (!header) {
          res.writeStatus('401 Forbidden')
          res.end()
          return
        }
        const [_, value] = header.split(' ')
        if (value !== bearerToken) {
          res.writeStatus('401 Forbidden')
          res.end()
          return
        }
      }

      // heavy-metric servers that run for long hours tend to generate precision problems
      // and memory degradation for histograms if not cleared enough. this method
      // resets the metrics once per day at 00.00UTC
      if (rotateMetrics && Date.now() > nextReset) {
        nextReset = calculateNextReset()
        metrics.resetAll()
      }

      res.writeStatus('200 OK')
      res.writeHeader('content-type', registry.contentType)
      res.end(body)
    }
  }
}

export * from './metrics'
