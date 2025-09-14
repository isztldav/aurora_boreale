"use client"

import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { api, apiEx } from '@/lib/api'

export default function TensorboardPage() {
  const params = useParams<{ runId: string }>()
  const runId = params.runId
  const [url, setUrl] = useState<string>('')

  useEffect(() => {
    let alive = true
    api.runs.tensorboard(runId).then(({ url }) => { if (alive) setUrl(url) }).catch(() => {})
    return () => { alive = false }
  }, [runId])

  useEffect(() => {
    let timer: any
    let stopped = false
    const ping = async () => {
      if (document.visibilityState === 'visible') {
        try { await apiEx.tensorboard.heartbeat(runId) } catch {}
      }
    }
    const start = () => {
      if (stopped) return
      ping()
      timer = setInterval(ping, 10000)
    }
    const onVis = () => {
      if (document.visibilityState === 'visible') start()
      else if (timer) clearInterval(timer)
    }
    start()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      stopped = true
      if (timer) clearInterval(timer)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [runId])

  return (
    <div className="fixed inset-0 bg-background">
      {url ? (
        <iframe src={url} className="w-full h-full bg-white" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          Loading TensorBoard…
        </div>
      )}
    </div>
  )
}
