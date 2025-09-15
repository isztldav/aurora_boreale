import { getApiBase } from './api'

type MessageHandler = (msg: any) => void

function toWsUrl(httpBase: string) {
  try {
    const u = new URL(httpBase)
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:'
    return u.toString()
  } catch {
    // Fallback
    return httpBase.replace(/^http/, 'ws')
  }
}

export function makeRunsWS(onMessage: MessageHandler) {
  const base = getApiBase().replace(/\/$/, '')
  const wsBase = toWsUrl(base)
  const url = `${wsBase}/ws?topic=runs`
  let socket: WebSocket | null = null

  return {
    connect() {
      if (socket) return
      socket = new WebSocket(url)
      socket.onmessage = (e) => {
        try {
          const payload = JSON.parse(e.data)
          onMessage(payload)
        } catch {
          // ignore
        }
      }
      socket.onclose = () => {
        socket = null
      }
    },
    disconnect() {
      try {
        socket?.close()
      } finally {
        socket = null
      }
    },
  }
}

