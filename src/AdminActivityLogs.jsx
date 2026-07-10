import { useEffect, useMemo, useRef, useState } from 'react'

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
  if (String(value).length <= max) return value
  return String(value).slice(0, max) + '...'
}

function formatBrokerInfo(log) {
  const brokerServer = log.broker_server || ''
  const brokerTime = log.broker_time || ''
  const brokerLabel = log.broker_time_label || ''
  const brokerName = log.broker_name || ''

  if (!brokerServer && !brokerTime && !brokerName) {
    return '-'
  }

  const lines = []

  if (brokerName) {
    lines.push(brokerName)
  }

  if (brokerServer) {
    lines.push(brokerServer)
  }

  if (brokerTime) {
    lines.push(`${formatDate(brokerTime)} ${brokerLabel || ''}`.trim())
  }

  return lines.join(' | ')
}

const DEFAULT_COLUMN_WIDTHS = {
  time: 130,
  type: 170,
  severity: 90,
  action: 230,
  target: 150,
  actor: 150,
  broker: 230,
  old: 230,
  new: 280,
  message: 260,
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function loadSavedColumnWidths() {
  try {
    const saved = localStorage.getItem('ts_activity_table_widths')
    if (!saved) return DEFAULT_COLUMN_WIDTHS

    return {
      ...DEFAULT_COLUMN_WIDTHS,
      ...JSON.parse(saved),
    }
  } catch {
    return DEFAULT_COLUMN_WIDTHS
  }
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

  const [columnWidths, setColumnWidths] = useState(loadSavedColumnWidths)
  const [tableFontSize, setTableFontSize] = useState(() => {
    const saved = Number(localStorage.getItem('ts_activity_table_font_size') || 13)
    return Number.isFinite(saved) ? clamp(saved, 11, 17) : 13
  })

  const resizingRef = useRef(null)

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

  const totalTableWidth = useMemo(() => {
    return Object.values(columnWidths).reduce((sum, width) => sum + Number(width || 0), 0)
  }, [columnWidths])

  useEffect(() => {
    localStorage.setItem('ts_activity_table_widths', JSON.stringify(columnWidths))
  }, [columnWidths])

  useEffect(() => {
    localStorage.setItem('ts_activity_table_font_size', String(tableFontSize))
  }, [tableFontSize])

  useEffect(() => {
    function handleMouseMove(event) {
      if (!resizingRef.current) return

      const { key, startX, startWidth } = resizingRef.current
      const diff = event.clientX - startX
      const nextWidth = clamp(startWidth + diff, 70, 620)

      setColumnWidths((current) => ({
        ...current,
        [key]: nextWidth,
      }))
    }

    function handleMouseUp() {
      resizingRef.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

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

  function startResize(key, event) {
    event.preventDefault()
    event.stopPropagation()

    resizingRef.current = {
      key,
      startX: event.clientX,
      startWidth: columnWidths[key],
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  function resetTableView() {
    setColumnWidths(DEFAULT_COLUMN_WIDTHS)
    setTableFontSize(13)
  }

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
    buttonRow: {
      display: 'flex',
      gap: 8,
      flexWrap: 'wrap',
      justifyContent: 'flex-end',
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
    smallButton: {
      border: '1px solid rgba(148, 163, 184, 0.22)',
      background: 'rgba(15, 23, 42, 0.85)',
      color: '#cbd5e1',
      padding: '10px 12px',
      borderRadius: 12,
      cursor: 'pointer',
      fontWeight: 800,
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
      maxWidth: '100%',
    },
    table: {
      width: totalTableWidth,
      minWidth: totalTableWidth,
      tableLayout: 'fixed',
      borderCollapse: 'collapse',
      fontSize: tableFontSize,
    },
    th: {
      position: 'relative',
      textAlign: 'left',
      padding: '12px 12px',
      paddingRight: 18,
      background: 'rgba(2, 6, 23, 0.72)',
      color: '#cbd5e1',
      borderBottom: '1px solid rgba(148, 163, 184, 0.16)',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    },
    resizeHandle: {
      position: 'absolute',
      top: 0,
      right: 0,
      width: 8,
      height: '100%',
      cursor: 'col-resize',
      userSelect: 'none',
      touchAction: 'none',
      borderRight: '1px solid rgba(251, 191, 36, 0.18)',
    },
    td: {
      padding: '12px 12px',
      borderBottom: '1px solid rgba(148, 163, 184, 0.10)',
      color: '#e5e7eb',
      verticalAlign: 'top',
      whiteSpace: 'normal',
      wordBreak: 'break-word',
      overflowWrap: 'anywhere',
      lineHeight: 1.45,
    },
    badge: {
      display: 'inline-flex',
      padding: '4px 8px',
      borderRadius: 999,
      background: 'rgba(14, 165, 233, 0.14)',
      color: '#7dd3fc',
      fontWeight: 700,
      fontSize: Math.max(tableFontSize - 1, 10),
      whiteSpace: 'nowrap',
    },
    severity: {
      display: 'inline-flex',
      padding: '4px 8px',
      borderRadius: 999,
      background: 'rgba(251, 191, 36, 0.12)',
      color: '#fbbf24',
      fontWeight: 700,
      fontSize: Math.max(tableFontSize - 1, 10),
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
    oldText: {
      color: '#fca5a5',
    },
    newText: {
      color: '#86efac',
    },
    hint: {
      marginTop: 10,
      color: '#94a3b8',
      fontSize: 12,
      lineHeight: 1.5,
    },
  }

  function renderTh(key, label) {
    return (
      <th
        style={{
          ...styles.th,
          width: columnWidths[key],
          minWidth: columnWidths[key],
          maxWidth: columnWidths[key],
        }}
      >
        {label}

        <span
          style={styles.resizeHandle}
          onMouseDown={(event) => startResize(key, event)}
          title="Drag untuk ubah lebar kolom"
        />
      </th>
    )
  }

  return (
    <section style={styles.wrap}>
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>Activity Timeline</h2>
          <p style={styles.subtitle}>
            Log perubahan sistem: partner, permission, PS setting, broker time,
            invoice, payment, dan audit penting.
          </p>
        </div>

        <div style={styles.buttonRow}>
          <button
            type="button"
            style={styles.smallButton}
            onClick={() => setTableFontSize((prev) => clamp(prev - 1, 11, 17))}
          >
            A-
          </button>

          <button
            type="button"
            style={styles.smallButton}
            onClick={() => setTableFontSize((prev) => clamp(prev + 1, 11, 17))}
          >
            A+
          </button>

          <button
            type="button"
            style={styles.smallButton}
            onClick={resetTableView}
          >
            Reset Table
          </button>

          <button
            type="button"
            style={styles.button}
            onClick={() => setRefreshKey((prev) => prev + 1)}
            disabled={loading}
          >
            {loading ? 'Loading...' : 'Refresh Logs'}
          </button>
        </div>
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
              {renderTh('time', 'Waktu GMT+7')}
              {renderTh('type', 'Type')}
              {renderTh('severity', 'Severity')}
              {renderTh('action', 'Action')}
              {renderTh('target', 'Target')}
              {renderTh('actor', 'Actor')}
              {renderTh('broker', 'Broker')}
              {renderTh('old', 'Old')}
              {renderTh('new', 'New')}
              {renderTh('message', 'Pesan')}
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
                  {shortText(formatBrokerInfo(log), 180)}
                </td>

                <td style={styles.td}>
                  <span style={styles.oldText}>
                    {shortText(log.old_value_summary, 160)}
                  </span>
                </td>

                <td style={styles.td}>
                  <span style={styles.newText}>
                    {shortText(log.new_value_summary, 180)}
                  </span>
                </td>

                <td style={styles.td}>{shortText(log.message, 160)}</td>
              </tr>
            ))}

            {!loading && logs.length === 0 && (
              <tr>
                <td style={styles.empty} colSpan={10}>
                  Belum ada activity log.
                </td>
              </tr>
            )}

            {loading && (
              <tr>
                <td style={styles.empty} colSpan={10}>
                  Mengambil activity logs...
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={styles.hint}>
        Tips: arahkan mouse ke garis kanan header kolom, lalu drag untuk ubah lebar.
        Tombol A-/A+ untuk kecil-besarkan font tabel.
      </div>
    </section>
  )
}
