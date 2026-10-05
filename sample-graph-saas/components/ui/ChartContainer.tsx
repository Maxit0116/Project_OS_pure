export function ChartContainer({ data, title }: { data: any; title: string }) {
  return (
    <div className="chart-container">
      <h3>{title}</h3>
      <div className="chart-placeholder">
        <p>{Array.isArray(data) ? `${data.length} data points` : 'No data'}</p>
      </div>
    </div>
  )
}
