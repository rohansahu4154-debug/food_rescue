import { AlertCircle, RefreshCw } from 'lucide-react'
import type { ReactNode } from 'react'

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="page-title-row">
      <div>
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {action}
    </div>
  )
}

export function LoadingState({ label = 'Loading...' }: { label?: string }) {
  return <p className="route-loading" role="status"><RefreshCw aria-hidden="true" size={16} />{label}</p>
}

export function ErrorState({ message }: { message: string }) {
  return <p className="route-error" role="alert"><AlertCircle aria-hidden="true" size={17} />{message}</p>
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="route-empty">{children}</div>
}
