import { useEffect, useMemo, useState } from 'react'
import AdjustableTable from './AdjustableTable.jsx'

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

function shortText(value, max = 160) {
  if (!value) return '-'

  const text = String(value)

  if (text.length <= max) return text

  return text.slice(0, max) + '...'
}

function StatusBadge({ status }) {
  const value = status || '-'

  const style = {
    display: 'inline-flex',
    padding: '4px 8px',
    borderRadius: 999,
    fontWeight: 800,
    fontSize: 12,
    background: 'rgba(251, 191, 36, 0.12)',
    color: '#fbbf24',
    whiteSpace: 'nowrap',
  }

  if (value === 'approved' || value === 'active') {
    style.background = 'rgba(34, 197, 94, 0.12)'
    style.color = '#86efac'
  }

  if (value === 'rejected' || value === 'cancelled') {
    style.background = 'rgba(239, 68, 68, 0.12)'
    style.color = '#fca5a5'
  }

  if (value === 'scheduled') {
    style.background = 'rgba(14, 165, 233, 0.14)'
    style.color = '#7dd3fc'
  }

  return <span style={style}>{value}</span>
}

export default function AdminPsRequests({ session }) {
  const [requests, setRequests] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('ALL')
  const [limit, setLimit] = useState(100)
  const [search, setSearch] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  const [actionLoadingId, setActionLoadingId] = useState('')
  const [actionMessage, setActionMessage] = useState(null)

  const token = session?.access_token

  useEffect(() => {
    async function loadRequests() {
      if (!token) return

      setLoading(true)
      setError('')

      try {
        const params = new URLSearchParams()
        params.set('limit', String(limit))

        if (status !== 'ALL') {
          params.set('status', status)
        }

        if (search.trim()) {
          params.set('search', search.trim())
        }

        const res = await fetch(`/api/admin-ps-requests?${params.toString()}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        const result = await res.json()

        if (!res.ok || !result.ok) {
          throw new Error(result.error || 'Gagal mengambil PS requests')
        }

        setRequests(result.requests || [])
        setSummary(result.summary || null)
      } catch (err) {
        setError(err.message || 'Gagal mengambil PS requests')
      } finally {
        setLoading(false)
      }
    }

    loadRequests()
  }, [token, status, limit, search, refreshKey])

  const statusOptions = useMemo(() => {
    const base = ['ALL']
    const fromSummary = summary?.by_status
      ? Object.keys(summary.by_status)
      : []

    return [...new Set([...base, ...fromSummary])]
  }, [summary])

  async function reviewRequest(row, action) {
    if (!token) {
      setActionMessage({
        type: 'error',
        text: 'Session admin tidak ditemukan. Login ulang dulu.',
      })
      return
    }

    let note = ''

    if (action === 'approve') {
      const confirmed = window.confirm(
        `Approve PS Request ${row.request_code} untuk ${row.target_display_name}?\n\nApprove tidak langsung mengubah setting aktif. Setting baru tetap menunggu effective broker time.`
      )

      if (!confirmed) return

      note =
        window.prompt(
          'Catatan approve opsional:',
          'Approved by Admin TS.'
        ) || ''
    }

    if (action === 'reject') {
      const reason = window.prompt(
        `Alasan reject PS Request ${row.request_code}:`,
        ''
      )

      if (!reason || !reason.trim()) {
        setActionMessage({
          type: 'error',
          text: 'Alasan reject wajib diisi.',
        })
        return
      }

      note = reason.trim()
    }

    setActionLoadingId(row.id)
    setActionMessage(null)

    try {
      const res = await fetch('/api/admin-review-ps-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          requestId: row.id,
          action,
          note,
          rejectionReason: action === 'reject' ? note : '',
        }),
      })

      const result = await res.json()

      if (!res.ok || !result.ok) {
        throw new Error(result.error || 'Gagal memproses PS request')
      }

      setActionMessage({
        type: 'success',
        text: result.message || 'PS Request berhasil diproses.',
      })

      setRefreshKey((prev) => prev + 1)
    } catch (err) {
      setActionMessage({
        type: 'error',
        text: err.message || 'Gagal memproses PS request.',
      })
    } finally {
      setActionLoadingId('')
    }
  }

  const columns = [
    {
      key: 'request_code',
      label: 'Request Code',
      width: 230,
      render: (row) => row.request_code || '-',
    },
    {
      key: 'target_display_name',
      label: 'Client',
      width: 180,
      render: (row) => row.target_display_name || '-',
    },
    {
      key: 'approval_status',
      label: 'Status',
      width: 130,
      render: (row) => <StatusBadge status={row.approval_status} />,
    },
    {
      key: 'created_at',
      label: 'Created',
      width: 180,
      render: (row) => formatDate(row.created_at),
    },
    {
      key: 'effective_from',
      label: 'Effective GMT+7',
      width: 180,
      render: (row) => formatDate(row.effective_from),
    },
    {
      key: 'old_value_summary',
      label: 'Old',
      width: 340,
      render: (row) => (
        <span style={{ color: '#fca5a5' }}>
          {shortText(row.old_value_summary, 260)}
        </span>
      ),
    },
    {
      key: 'new_value_summary',
      label: 'New',
      width: 360,
      render: (row) => (
        <span style={{ color: '#86efac' }}>
          {shortText(row.new_value_summary, 280)}
        </span>
      ),
    },
    {
      key: 'broker_summary',
      label: 'Broker Window',
      width: 420,
      render: (row) => shortText(row.broker_summary, 350),
    },
    {
      key: 'boundary_summary',
      label: 'Ticket Boundary',
      width: 520,
      render: (row) => shortText(row.boundary_summary, 420),
    },
    {
      key: 'note',
      label: 'Note',
      width: 300,
      render: (row) => row.note || '-',
    },
    {
      key: 'actions',
      label: 'Action',
      width: 230,
      render: (row) => {
        const lockedStatuses = [
          'approved',
          'rejected',
          'active',
          'cancelled',
          'superseded',
        ]

        const isLocked = lockedStatuses.includes(row.approval_status)
        const isLoading = actionLoadingId === row.id

        if (isLocked) {
          return <StatusBadge status={row.approval_status} />
        }

        return (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => reviewRequest(row, 'approve')}
              disabled={isLoading}
              style={{
                border: '1px solid rgba(34, 197, 94, 0.35)',
                background: 'rgba(34, 197, 94, 0.12)',
                color: '#86efac',
                padding: '8px 10px',
                borderRadius: 10,
                cursor: isLoading ? 'not-allowed' : 'pointer',
                fontWeight: 800,
              }}
            >
              {isLoading ? '...' : 'Approve'}
            </button>

            <button
              type="button"
              onClick={() => reviewRequest(row, 'reject')}
              disabled={isLoading}
              style={{
                border: '1px solid rgba(239, 68, 68, 0.35)',
                background: 'rgba(239, 68, 68, 0.12)',
                color: '#fca5a5',
                padding: '8px 10px',
                borderRadius: 10,
                cursor: isLoading ? 'not-allowed' : 'pointer',
                fontWeight: 800,
              }}
            >
              {isLoading ? '...' : 'Reject'}
            </button>
          </div>
        )
      },
    },
  ]

  const styles = {
    wrap: {
      display: 'grid',
      gap: 18,
    },
    header: {
      padding: 20,
      borderRadius: 18,
      background: 'rgba(15, 23, 42, 0.92)',
      border: '1px solid rgba(148, 163, 184, 0.18)',
      color: '#e5e7eb',
      display: 'flex',
      justifyContent: 'space-between',
      gap: 16,
      alignItems: 'flex-start',
      flexWrap: 'wrap',
    },
    title: {
      margin: 0,
      fontSize: 24,
      fontWeight: 900,
      letterSpacing: '-0.03em',
    },
    subtitle: {
      margin: '6px 0 0',
      color: '#94a3b8',
      lineHeight: 1.5,
      fontSize: 14,
      maxWidth: 760,
    },
    button: {
      border: '1px solid rgba(251, 191, 36, 0.45)',
      background: 'rgba(251, 191, 36, 0.12)',
      color: '#fbbf24',
      padding: '10px 14px',
      borderRadius: 12,
      cursor: 'pointer',
      fontWeight: 800,
    },
    grid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
      gap: 12,
    },
    card: {
      padding: 16,
      borderRadius: 16,
      background: 'rgba(15, 23, 42, 0.92)',
      border: '1px solid rgba(148, 163, 184, 0.18)',
      color: '#e5e7eb',
    },
    label: {
      color: '#94a3b8',
      fontSize: 12,
      marginBottom: 8,
    },
    value: {
      color: '#f8fafc',
      fontSize: 24,
      fontWeight: 900,
    },
    filters: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
      gap: 12,
      padding: 18,
      borderRadius: 18,
      background: 'rgba(15, 23, 42, 0.92)',
      border: '1px solid rgba(148, 163, 184, 0.18)',
    },
    inputLabel: {
      display: 'block',
      color: '#cbd5e1',
      fontSize: 13,
      fontWeight: 800,
    },
    inputSub: {
      display: 'block',
      marginTop: 4,
      marginBottom: 7,
      color: '#94a3b8',
      fontSize: 12,
      fontWeight: 500,
    },
    input: {
      width: '100%',
      boxSizing: 'border-box',
      padding: '11px 12px',
      borderRadius: 12,
      border: '1px solid rgba(148, 163, 184, 0.22)',
      background: 'rgba(2, 6, 23, 0.55)',
      color: '#e5e7eb',
      outline: 'none',
    },
    error: {
      padding: 14,
      borderRadius: 14,
      background: 'rgba(239, 68, 68, 0.12)',
      border: '1px solid rgba(239, 68, 68, 0.28)',
      color: '#fecaca',
    },
    success: {
      padding: 14,
      borderRadius: 14,
      background: 'rgba(34, 197, 94, 0.12)',
      border: '1px solid rgba(34, 197, 94, 0.28)',
      color: '#bbf7d0',
    },
  }

  return (
    <div style={styles.wrap}>
      <section style={styles.header}>
        <div>
          <h2 style={styles.title}>PS Requests</h2>

          <p style={styles.subtitle}>
            Daftar request perubahan PS client, termasuk broker time window dan
            ticket boundary log. Approve/Reject saat ini hanya untuk Admin TS.
          </p>
        </div>

        <button
          type="button"
          style={styles.button}
          onClick={() => setRefreshKey((prev) => prev + 1)}
          disabled={loading}
        >
          {loading ? 'Loading...' : 'Refresh Requests'}
        </button>
      </section>

      {summary && (
        <section style={styles.grid}>
          <div style={styles.card}>
            <div style={styles.label}>Total Request</div>
            <div style={styles.value}>{summary.total || 0}</div>
          </div>

          <div style={styles.card}>
            <div style={styles.label}>Scheduled</div>
            <div style={styles.value}>{summary.by_status?.scheduled || 0}</div>
          </div>

          <div style={styles.card}>
            <div style={styles.label}>Approved</div>
            <div style={styles.value}>{summary.by_status?.approved || 0}</div>
          </div>

          <div style={styles.card}>
            <div style={styles.label}>Rejected</div>
            <div style={styles.value}>{summary.by_status?.rejected || 0}</div>
          </div>
        </section>
      )}

      <section style={styles.filters}>
        <label style={styles.inputLabel}>
          Search
          <span style={styles.inputSub}>
            Cari request code, client, old/new, note.
          </span>

          <input
            style={styles.input}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cari PS request..."
          />
        </label>

        <label style={styles.inputLabel}>
          Status
          <span style={styles.inputSub}>Filter approval status.</span>

          <select
            style={styles.input}
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            {statusOptions.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <label style={styles.inputLabel}>
          Limit
          <span style={styles.inputSub}>Jumlah data yang ditampilkan.</span>

          <select
            style={styles.input}
            value={limit}
            onChange={(event) => setLimit(Number(event.target.value))}
          >
            <option value={20}>20 request</option>
            <option value={50}>50 request</option>
            <option value={100}>100 request</option>
            <option value={300}>300 request</option>
          </select>
        </label>
      </section>

      {error && <div style={styles.error}>{error}</div>}

      {actionMessage && (
        <div
          style={
            actionMessage.type === 'success'
              ? styles.success
              : styles.error
          }
        >
          {actionMessage.text}
        </div>
      )}

      <AdjustableTable
        title="PS Request List"
        subtitle="Drag kolom untuk membaca request panjang seperti broker window dan ticket boundary."
        storageKey="ts_ps_requests_table"
        columns={columns}
        rows={requests}
        loading={loading}
        emptyText="Belum ada PS request."
      />
    </div>
  )
}
