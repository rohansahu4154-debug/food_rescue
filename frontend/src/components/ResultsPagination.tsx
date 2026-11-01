import type { PageResult } from '../types'

export function ResultsPagination<T>({
  data,
  onOffsetChange,
  label = 'Results pages',
}: {
  data: PageResult<T> | null
  onOffsetChange: (offset: number) => void
  label?: string
}) {
  if (!data || data.total <= data.limit) return null

  return (
    <nav className="history-pagination" aria-label={label}>
      <button
        type="button"
        className="button button-secondary"
        disabled={data.offset === 0}
        onClick={() => onOffsetChange(Math.max(0, data.offset - data.limit))}
      >
        Previous
      </button>
      <span>{data.offset + 1}–{Math.min(data.offset + data.limit, data.total)} of {data.total}</span>
      <button
        type="button"
        className="button button-secondary"
        disabled={data.offset + data.limit >= data.total}
        onClick={() => onOffsetChange(data.offset + data.limit)}
      >
        Next
      </button>
    </nav>
  )
}
