import { useEffect, useMemo, useState } from 'react'

function formatPercent(value) {
  if (value === null || value === undefined || value === '') return '-'
  return `${Number(value).toLocaleString('id-ID')}%`
}

function formatMoney(value) {
  const number = Number(value || 0)
  return `Rp${number.toLocaleString('id-ID')}`
}

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

function getPartnerName(partnerMap, partnerId) {
  if (!partnerId) return '-'
  return partnerMap?.[partnerId]?.display_name || partnerId
}

export default function AdminPsSettings({ session }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState(null)
  const [data, setData] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const token = session?.access_token

  useEffect(() => {
    async function loadSettings() {
      if (!token) return

      setLoading(true)
      setError('')

      try {
        const res = await fetch('/api/admin-ps-settings', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        const result = await res.json()

        if (!res.ok || !result.ok) {
          throw new Error(result.error || 'Gagal mengambil data PS settings')
        }

        setSummary(result.summary || null)
        setData(result.data || null)
      } catch (err) {
        setError(err.message || 'Gagal mengambil data PS settings')
      } finally {
        setLoading(false)
      }
    }

    loadSettings()
  }, [token, refreshKey])

  const tierMap = useMemo(() => {
    const map = {}

    for (const tier of data?.tiers || []) {
      map[tier.id] = tier
    }

    return map
  }, [data])

  const activeSplit = data?.master_splits?.[0] || null
  const activeRule = data?.distribution_rules?.[0] || null
  const partnerMap = data?.partner_map || {}

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
      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
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
    section: {
      padding: 18,
      borderRadius: 18,
      background: 'rgba(15, 23, 42, 0.92)',
      border: '1px solid rgba(148, 163, 184, 0.18)',
      color: '#e5e7eb',
    },
    sectionTitle: {
      margin: '0 0 6px',
      fontSize: 18,
      fontWeight: 900,
    },
    sectionSub: {
      margin: '0 0 14px',
      color: '#94a3b8',
      fontSize: 13,
      lineHeight: 1.5,
    },
    tableWrap: {
      overflowX: 'auto',
      borderRadius: 14,
      border: '1px solid rgba(148, 163, 184, 0.16)',
    },
    table: {
      width: '100%',
      borderCollapse: 'collapse',
      minWidth: 780,
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
      background: 'rgba(20, 184, 166, 0.14)',
      color: '#5eead4',
      fontWeight: 800,
      fontSize: 12,
    },
    warningBox: {
      padding: 14,
      borderRadius: 14,
      background: 'rgba(251, 191, 36, 0.10)',
      border: '1px solid rgba(251, 191, 36, 0.22)',
      color: '#fde68a',
      lineHeight: 1.5,
      fontSize: 13,
    },
    error: {
      padding: 14,
      borderRadius: 14,
      background: 'rgba(239, 68, 68, 0.12)',
      border: '1px solid rgba(239, 68, 68, 0.28)',
      color: '#fecaca',
    },
    empty: {
      padding: 16,
      color: '#94a3b8',
      textAlign: 'center',
    },
  }

  return (
    <div style={styles.wrap}>
      <section style={styles.header}>
        <div>
          <h2 style={styles.title}>PS Settings</h2>
          <p style={styles.subtitle}>
            Pengaturan Profit Share v2: tier PS client, split TS/Master Pool,
            bobot distribusi upline, setting client, dan FX snapshot.
          </p>
        </div>

        <button
          type="button"
          style={styles.button}
          onClick={() => setRefreshKey((prev) => prev + 1)}
          disabled={loading}
        >
          {loading ? 'Loading...' : 'Refresh Setting'}
        </button>
      </section>

      {error && <div style={styles.error}>{error}</div>}

      {summary && (
        <section style={styles.grid}>
          <div style={styles.card}>
            <div style={styles.label}>PS Tier</div>
            <div style={styles.value}>{summary.tiers || 0}</div>
          </div>

          <div style={styles.card}>
            <div style={styles.label}>Master Split</div>
            <div style={styles.value}>{summary.master_splits || 0}</div>
          </div>

          <div style={styles.card}>
            <div style={styles.label}>Distribution Level</div>
            <div style={styles.value}>{summary.distribution_items || 0}</div>
          </div>

          <div style={styles.card}>
            <div style={styles.label}>Client Setting</div>
            <div style={styles.value}>{summary.client_settings || 0}</div>
          </div>
        </section>
      )}

      <section style={styles.warningBox}>
        Saat ini tampilan masih mode baca dulu. Perubahan PS nanti jangan langsung
        update tabel utama, tapi harus lewat <strong>Setting Change Request</strong>,
        approval, effective date, dan broker time window supaya invoice lama tidak
        berubah.
      </section>

      <section style={styles.section}>
        <h3 style={styles.sectionTitle}>PS Tier Client</h3>
        <p style={styles.sectionSub}>
          Tier ini menentukan berapa persen profit client yang menjadi PS fee.
        </p>

        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Kode</th>
                <th style={styles.th}>Nama</th>
                <th style={styles.th}>Rate</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Deskripsi</th>
              </tr>
            </thead>

            <tbody>
              {(data?.tiers || []).map((tier) => (
                <tr key={tier.id}>
                  <td style={styles.td}>
                    <span style={styles.badge}>{tier.tier_code}</span>
                  </td>
                  <td style={styles.td}>{tier.tier_name}</td>
                  <td style={styles.td}>{formatPercent(tier.ps_fee_rate)}</td>
                  <td style={styles.td}>{tier.is_active ? 'Aktif' : 'Nonaktif'}</td>
                  <td style={styles.td}>{tier.description || '-'}</td>
                </tr>
              ))}

              {!loading && (data?.tiers || []).length === 0 && (
                <tr>
                  <td style={styles.empty} colSpan={5}>
                    Belum ada PS tier.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section style={styles.section}>
        <h3 style={styles.sectionTitle}>TS Share / Master Pool</h3>
        <p style={styles.sectionSub}>
          PS fee client dibagi menjadi bagian TS dan Master Pool. Client net tidak
          boleh berkurang di luar PS fee.
        </p>

        <div style={styles.grid}>
          <div style={styles.card}>
            <div style={styles.label}>TS Share</div>
            <div style={styles.value}>{formatPercent(activeSplit?.ts_share_rate)}</div>
          </div>

          <div style={styles.card}>
            <div style={styles.label}>Master Pool</div>
            <div style={styles.value}>{formatPercent(activeSplit?.master_pool_rate)}</div>
          </div>

          <div style={styles.card}>
            <div style={styles.label}>Effective From</div>
            <div style={{ color: '#f8fafc', fontWeight: 800 }}>
              {formatDate(activeSplit?.effective_from)}
            </div>
          </div>
        </div>
      </section>

      <section style={styles.section}>
        <h3 style={styles.sectionTitle}>Distribution Weight</h3>
        <p style={styles.sectionSub}>
          Bobot ini membagi Master Pool ke upline. Angka 4 / 2.5 / 1.5 / 1 / 0.5
          adalah bobot pool, bukan potongan tambahan dari profit client.
        </p>

        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Level Upline</th>
                <th style={styles.th}>Weight</th>
                <th style={styles.th}>Fixed Amount</th>
                <th style={styles.th}>Note</th>
              </tr>
            </thead>

            <tbody>
              {(data?.distribution_items || []).map((item) => (
                <tr key={item.id}>
                  <td style={styles.td}>Level {item.upline_level}</td>
                  <td style={styles.td}>
                    <strong>{item.weight_value}</strong>
                  </td>
                  <td style={styles.td}>{formatMoney(item.fixed_amount_idr)}</td>
                  <td style={styles.td}>{item.note || '-'}</td>
                </tr>
              ))}

              {!loading && (data?.distribution_items || []).length === 0 && (
                <tr>
                  <td style={styles.empty} colSpan={4}>
                    Belum ada distribution item.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section style={styles.section}>
        <h3 style={styles.sectionTitle}>Distribution Rule</h3>
        <p style={styles.sectionSub}>
          Rule aktif yang dipakai untuk menghitung pembagian Master Pool.
        </p>

        <div style={styles.grid}>
          <div style={styles.card}>
            <div style={styles.label}>Rule Name</div>
            <div style={{ color: '#f8fafc', fontWeight: 900 }}>
              {activeRule?.rule_name || '-'}
            </div>
          </div>

          <div style={styles.card}>
            <div style={styles.label}>Rule Code</div>
            <div style={{ color: '#f8fafc', fontWeight: 900 }}>
              {activeRule?.rule_code || '-'}
            </div>
          </div>

          <div style={styles.card}>
            <div style={styles.label}>Status</div>
            <div style={{ color: '#f8fafc', fontWeight: 900 }}>
              {activeRule?.is_active ? 'Aktif' : 'Nonaktif'}
            </div>
          </div>
        </div>
      </section>

      <section style={styles.section}>
        <h3 style={styles.sectionTitle}>Client PS Setting</h3>
        <p style={styles.sectionSub}>
          Setting PS per client. Nanti bagian ini akan kita buat bisa request perubahan
          rate, FX mode, dan effective broker time.
        </p>

        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Client</th>
                <th style={styles.th}>Tier</th>
                <th style={styles.th}>Override Rate</th>
                <th style={styles.th}>FX Mode</th>
                <th style={styles.th}>Fixed FX</th>
                <th style={styles.th}>Effective From</th>
              </tr>
            </thead>

            <tbody>
              {(data?.client_settings || []).map((setting) => {
                const tier = tierMap[setting.ps_tier_id]

                return (
                  <tr key={setting.id}>
                    <td style={styles.td}>
                      {getPartnerName(partnerMap, setting.client_partner_id)}
                    </td>
                    <td style={styles.td}>
                      {tier ? `${tier.tier_code} — ${tier.tier_name}` : '-'}
                    </td>
                    <td style={styles.td}>
                      {setting.ps_fee_rate_override === null ||
                      setting.ps_fee_rate_override === undefined
                        ? '-'
                        : formatPercent(setting.ps_fee_rate_override)}
                    </td>
                    <td style={styles.td}>{setting.fx_mode || '-'}</td>
                    <td style={styles.td}>
                      {setting.fixed_fx_rate
                        ? Number(setting.fixed_fx_rate).toLocaleString('id-ID')
                        : '-'}
                    </td>
                    <td style={styles.td}>{formatDate(setting.effective_from)}</td>
                  </tr>
                )
              })}

              {!loading && (data?.client_settings || []).length === 0 && (
                <tr>
                  <td style={styles.empty} colSpan={6}>
                    Belum ada client PS setting.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section style={styles.section}>
        <h3 style={styles.sectionTitle}>FX Snapshot</h3>
        <p style={styles.sectionSub}>
          Snapshot rate USD/IDR untuk penguncian nilai invoice. Sekarang masih kosong,
          nanti terisi saat calculation/invoice PS berjalan.
        </p>

        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Source</th>
                <th style={styles.th}>Base</th>
                <th style={styles.th}>Quote</th>
                <th style={styles.th}>Rate</th>
                <th style={styles.th}>Source Date</th>
              </tr>
            </thead>

            <tbody>
              {(data?.fx_snapshots || []).map((fx) => (
                <tr key={fx.id}>
                  <td style={styles.td}>{fx.source || '-'}</td>
                  <td style={styles.td}>{fx.base_currency || '-'}</td>
                  <td style={styles.td}>{fx.quote_currency || '-'}</td>
                  <td style={styles.td}>
                    {Number(fx.rate || 0).toLocaleString('id-ID')}
                  </td>
                  <td style={styles.td}>{formatDate(fx.source_date)}</td>
                </tr>
              ))}

              {!loading && (data?.fx_snapshots || []).length === 0 && (
                <tr>
                  <td style={styles.empty} colSpan={5}>
                    Belum ada FX snapshot.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {loading && (
        <section style={styles.section}>
          <div style={styles.empty}>Mengambil PS settings...</div>
        </section>
      )}
    </div>
  )
}
