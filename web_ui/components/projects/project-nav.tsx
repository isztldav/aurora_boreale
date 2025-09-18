import Link from 'next/link'
import { cn } from '@/lib/utils'

type Props = {
  projectId: string
  current: 'overview' | 'configs' | 'datasets' | 'models' | 'tags'
}

export function ProjectNav({ projectId, current }: Props) {
  const base = `/projects/${projectId}`
  const items = [
    { key: 'overview', href: `${base}`, label: 'Overview' },
    { key: 'configs', href: `${base}/configs`, label: 'Configs' },
    { key: 'datasets', href: `${base}/datasets`, label: 'Datasets' },
    { key: 'models', href: `${base}/models`, label: 'Models' },
    { key: 'tags', href: `${base}/tags`, label: 'Tags' },
  ] as const
  return (
    <div className="flex items-center gap-4 border-b mb-6">
      {items.map((it) => (
        <Link key={it.key} href={it.href} className={cn('py-2 text-sm', current === it.key ? 'text-foreground border-b-2 border-foreground' : 'text-muted-foreground hover:text-foreground')}>
          {it.label}
        </Link>
      ))}
    </div>
  )
}
