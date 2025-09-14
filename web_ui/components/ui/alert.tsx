import { cn } from '@/lib/utils'

export function Alert({ variant = 'default', className, ...props }: React.HTMLAttributes<HTMLDivElement> & { variant?: 'default' | 'destructive' }) {
  const styles = variant === 'destructive'
    ? 'border-destructive/50 text-destructive dark:border-destructive'
    : 'border-border'
  return <div role="alert" className={cn('rounded-md border p-3 text-sm', styles, className)} {...props} />
}

