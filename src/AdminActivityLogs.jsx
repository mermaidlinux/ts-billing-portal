import { useEffect, useMemo, useState } from 'react'

function formatDate(value) {
  if (!value) return '-'

  try {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value

    return date.toLocaleString('id-ID', {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  } catch {
    return value
  }
}

function shortText(value, max = 80) {
  if (!value) return '-'
  if (value.length <= max) return value
  return value.slice(0, max) + '...'
}

export default function AdminActivityLogs({ session }) {
  const [logs, setLogs] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [limit, setLimit] = useState(50)
  const [activityType, setActivityType] = useState('ALL')
  const [severity, setSeverity] = useState('ALL')
  const [search, setSearch] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  const token = session?.access_token

  const activityTypes = useMemo(() => {
    const base = ['ALL']
    const fromSummary = summary?.by_type ? Object.keys(summary.by_type) : []
    return [...new Set([...base, ...fromSummary])]
  }, [summary])

  const severities = useMemo(() => {
    const base = ['ALL']
    const fromSummary = summary?.by_severity ? Object.keys(summary.by_severity) : []
    return [...new Set([...base, ...fromSummary])]
  }, [summary])

  useEffect(() => {
    async function loadLogs() {
      if (!token) return

      setLoading(true)
      setError('')

      try {
        const params = new URLSearchParams()
        params.set('limit', String(limit))

        if (activityType !== 'ALL') {
          params.set('activity_type', activityType)
        }

        if (severity !== 'ALL') {
          params.set('severity', severity)
        }

        if (search.trim()) {
          params.set('search', search.trim())
        }

        const res = await fetch(`/api/admin-activity-logs?${params.toString()}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        const data = await res.json()

        if (!res.ok || !data.ok) {
          throw new Error(data.error || 'Gagal mengambil activity logs')
        }

        setLogs(data.logs || [])
        setSummary(data.summary || null)
      } catch (err) {
        setError(err.message || 'Gagal mengambil activity logs')
      } finally {
        setLoading(false)
      }
    }

    loadLogs()
  }, [token, limit, activityType, severity, search, refreshKey])

  const styles = {
    wrap: {
      marginTop: 24,
      padding: 20,
      borderRadius: 18,
      background: 'rgba(15, 23, 42, 0.92)',
      border: '1px solid rgba(148, 163, 184, 0.18)',
      color: '#e5e7eb',
      boxShadow: '0 18px 50px rgba(0, 0, 0, 0.22)',
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      gap: 16,
      alignItems: 'flex-start',
      marginBottom: 16,
      flexWrap: 'wrap',
    },
    title: {
      margin: 0,
      fontSize: 22,
      fontWeight: 800,
      letterSpacing: '-0.02em',
    },
    subtitle: {
      margin: '6px 0 0',
      color: '#94a3b8',
      fontSize: 14,
      lineHeight: 1.5,
    },
    button: {
      border: '1px solid rgba(251, 191, 36, 0.45)',
      background: 'rgba(251, 191, 36, 0.12)',
      color: '#fbbf24',
      padding: '10px 14px',
      borderRadius: 12,
      cursor: 'pointer',
      fontWeight: 700,
    },
    summaryGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
      gap: 12,
      marginBottom: 16,
    },
    card: {
      padding: 14,
      borderRadius: 14,
      background: 'rgba(30, 41, 59, 0.82)',
      border: '1px solid rgba(148, 163, 184, 0.14)',
    },
    cardLabel: {
      color: '#94a3b8',
      fontSize: 12,
      marginBottom: 6,
    },
    cardValue: {
      fontSize: 22,
      fontWeight: 800,
      color: '#f8fafc',
    },
    filters: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
      gap: 12,
      marginBottom: 16,
    },
    input: {
      width: '100%',
      boxSizing: 'border-box',
      padding: '10px 12px',
      borderRadius: 12,
      border: '1px solid rgba(148, 163, 184, 0.22)',
      background: 'rgba(2, 6, 23, 0.55)',
      color: '#e5e7eb',
      outline: 'none',
    },
    label: {
      display: 'block',
      fontSize: 12,
      color: '#94a3b8',
      marginBottom: 6,
    },
    tableWrap: {
      overflowX: 'auto',
      borderRadius: 14,
      border: '1px solid rgba(148, 163, 184, 0.16)',
    },
    table: {
      width: '100%',
      borderCollapse: 'collapse',
      minWidth: 1000,
      fontSize: 13,
    },
    th: {
      textAlign: 'left',
      padding: '12px 12px',
      background: 'rgba(2, 6, 23, 0.72)',
      color: '#cbd5e1',
      borderBottom: '1px solid rgba(148, 163, 184, 0.16)',
      whiteSpace: 'nowrap',
    },
    td: {
      padding: '12px 12px',
      borderBottom: '1px solid rgba(148, 163, 184, 0.10)',
      color: '#e5e7eb',
      verticalAlign: 'top',
    },
    badge: {
      display: 'inline-flex',
      padding: '4px 8px',
      borderRadius: 999,
      background: 'rgba(14, 165, 233, 0.14)',
      color: '#7dd3fc',
      fontWeight: 700,
      fontSize: 12,
      whiteSpace: 'nowrap',
    },
    severity: {
      display: 'inline-flex',
      padding: '4px 8px',
      borderRadius: 999,
      background: 'rgba(251, 191, 36, 0.12)',
      color: '#fbbf24',
      fontWeight: 700,
      fontSize: 12,
      whiteSpace: 'nowrap',
    },
    error: {
      padding: 12,
      borderRadius: 12,
      background: 'rgba(239, 68, 68, 0.12)',
      border: '1px solid rgba(239, 68, 68, 0.28)',
      color: '#fecaca',
      marginBottom: 16,
    },
    empty: {
      padding: 18,
      color: '#94a3b8',
      textAlign: 'center',
    },
    changeBox: {
      display: 'grid',
      gap: 4,
      color: '#cbd5e1',
      lineHeight: 1.4,
    },
    oldText: {
      color: '#fca5a5',
    },
    newText: {
      color: '#86efac',
    },
  }

  return (
    <section style={styles.wrap}>
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>Activity Timeline</h2>
          <p style={styles.subtitle}>
            Log perubahan sistem: partner, permission, PS setting, broker time, invoice, payment, dan audit penting.
          </p>
        </div>

        <button
          type="button"
          style={styles.button}
          onClick={() => setRefreshKey((prev) => prev + 1)}
          disabled={loading}
        >
          {loading ? 'Loading...' : 'Refresh Logs'}
        </button>
      </div>

      {summary && (
        <div style={styles.summaryGrid}>
          <div style={styles.card}>
            <div style={styles.cardLabel}>Total Log</div>
            <div style={styles.cardValue}>{summary.total || 0}</div>
          </div>

          <div style={styles.card}>
            <div style={styles.cardLabel}>Partner</div>
            <div style={styles.cardValue}>{summary.by_type?.PARTNER || 0}</div>
          </div>

          <div style={styles.card}>
            <div style={styles.cardLabel}>Setting Change</div>
            <div style={styles.cardValue}>{summary.by_type?.SETTING_CHANGE || 0}</div>
          </div>

          <div style={styles.card}>
            <div style={styles.cardLabel}>Warning/Critical</div>
            <div style={styles.cardValue}>
              {(summary.by_severity?.warning || 0) + (summary.by_severity?.critical || 0)}
            </div>
          </div>
        </div>
      )}

      <div style={styles.filters}>
        <div>
          <label style={styles.label}>Cari</label>
          <input
            style={styles.input}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari target, actor, action..."
          />
        </div>

        <div>
          <label style={styles.label}>Activity Type</label>
          <select
            style={styles.input}
            value={activityType}
            onChange={(e) => setActivityType(e.target.value)}
          >
            {activityTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={styles.label}>Severity</label>
          <select
            style={styles.input}
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
          >
            {severities.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={styles.label}>Limit</label>
          <select
            style={styles.input}
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
          >
            <option value={20}>20 log</option>
            <option value={50}>50 log</option>
            <option value={100}>100 log</option>
            <option value={200}>200 log</option>
          </select>
        </div>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Waktu GMT+7</th>
              <th style={styles.th}>Type</th>
              <th style={styles.th}>Severity</th>
              <th style={styles.th}>Action</th>
              <th style={styles.th}>Target</th>
              <th style={styles.th}>Actor</th>
              <th style={styles.th}>Old</th>
              <th style={styles.th}>New</th>
              <th style={styles.th}>Pesan</th>
            </tr>
          </thead>

          <tbody>
            {logs.map((log) => (
              <tr key={log.activity_id}>
                <td style={styles.td}>{formatDate(log.created_at_gmt7 || log.gmt7_time)}</td>
                <td style={styles.td}>
                  <span style={styles.badge}>{log.activity_type}</span>
                </td>
                <td style={styles.td}>
                  <span style={styles.severity}>{log.severity}</span>
                </td>
                <td style={styles.td}>{log.action}</td>
                <td style={styles.td}>{log.target_display_name || '-'}</td>
                <td style={styles.td}>{log.actor_display_name || 'System'}</td>
                <td style={styles.td}>
                  <span style={styles.oldText}>
                    {shortText(log.old_value_summary, 90)}
                  </span>
                </td>
                
                <td style={styles.td}>
                  <span style={styles.newText}>
                    {shortText(log.new_value_summary, 90)}
                  </span>
                </td>
                
                <td style={styles.td}>{shortText(log.message, 120)}</td>
              </tr>
            ))}

            {!loading && logs.length === 0 && (
              <tr>
                <td style={styles.empty} colSpan={9}>
                  Belum ada activity log.
                </td>
              </tr>
            )}

            {loading && (
              <tr>
                <td style={styles.empty} colSpan={9}>
                  Mengambil activity logs...
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
