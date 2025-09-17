import { Badge } from '@/components/ui/badge'

interface RunStateBadgeProps {
  state: string
}

export function RunStateBadge({ state }: RunStateBadgeProps) {
  const variant = state === 'succeeded' ? 'success' : state === 'failed' ? 'error' : state === 'running' ? 'warning' : 'default'
  return <Badge variant={variant as any}>{state}</Badge>
}