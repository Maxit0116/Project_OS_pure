import type { AdminUserRow } from '@/lib/admin-analytics'

interface AdminTableProps {
  data: readonly AdminUserRow[]
  columns: ReadonlyArray<Exclude<keyof AdminUserRow, 'id'>>
}

export function AdminTable({ data, columns }: AdminTableProps) {
  return (
    <table className="admin-table">
      <thead>
        <tr>
          {columns.map((col) => (
            <th key={col}>{col}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((row) => (
          <tr key={row.id}>
            {columns.map((col) => (
              <td key={col}>
                {col === 'joined' ? (
                  <time dateTime={row[col]}>
                    {new Date(row[col]).toLocaleDateString('en-US', {
                      timeZone: 'UTC',
                    })}
                  </time>
                ) : row[col]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
