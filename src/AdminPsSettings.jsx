import { useEffect, useMemo, useState } from 'react'
import AdjustableTable from './AdjustableTable.jsx'

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

function pad(number) {
  return String(number).padStart(2, '0')
}

function toDateTimeLocalValue(date) {
  return (
    date.getFullYear() +
    '-' +
    pad(date.getMonth() + 1) +
    '-' +
    pad(date.getDate()) +
    'T' +
    pad(date.getHours()) +
    ':' +
    pad(date.getMinutes())
  )
}

function getNextMondayLocalValue(hour) {
  const date = new Date()
  const day = date.getDay()
  const diff = day === 0 ? 1 : 8 - day

  date.setDate(date.getDate() + diff)
  date.setHours(hour, 0, 0, 0)

  return toDateTimeLocalValue(date)
}

function withSeconds(value) {
  if (!value) return ''
  if (value.length === 16) return `${value}:00`
  return value
}

function emptyToNull(value) {
  if (value === null || value === undefined || value === '') return null
  return value
}

function InfoTip({ text }) {
  const [open, setOpen] = useState(false)

  const wrapStyle = {
    position: 'relative',
    display: 'inline-flex',
    marginLeft: 6,
    verticalAlign: 'middle',
  }

  const iconStyle = {
    width: 17,
    height: 17,
    borderRadius: 999,
    border: '1px solid rgba(251, 191, 36, 0.55)',
    background: 'rgba(251, 191, 36, 0.14)',
    color: '#fbbf24',
    fontSize: 11,
    fontWeight: 900,
    alignItems: 'center',
    justifyContent: 'center',
    display: 'inline-flex',
    cursor: 'help',
  }

  const boxStyle = {
    position: 'absolute',
    left: 24,
    top: -8,
    zIndex: 999,
    width: 320,
    padding: 12,
    borderRadius: 12,
    background: 'rgba(2, 6, 23, 0.98)',
    border: '1px solid rgba(251, 191, 36, 0.35)',
    color: '#fde68a',
    fontSize: 12,
    lineHeight: 1.55,
    boxShadow: '0 18px 40px rgba(0,0,0,0.45)',
    whiteSpace: 'pre-line',
  }

  return (
    <span
      style={wrapStyle}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <span style={iconStyle} tabIndex={0}>
        !
      </span>

      {open && (
        <span style={boxStyle}>
          {text}
        </span>
      )}
    </span>
  )
}

export default function AdminPsSettings({ session }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState(null)
  const [data, setData] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const [selectedClientSettingId, setSelectedClientSettingId] = useState('')
  const [newPsTierId, setNewPsTierId] = useState('')
  const [psFeeRateOverride, setPsFeeRateOverride] = useState('')
  const [fxMode, setFxMode] = useState('MANUAL')
  const [fixedFxRate, setFixedFxRate] = useState('')
  const [effectiveFromGmt7, setEffectiveFromGmt7] = useState('')
  const [effectiveFromBroker, setEffectiveFromBroker] = useState('')
  const [ticketApplyRule, setTicketApplyRule] = useState(
    'CLOSE_TIME_BROKER_GTE_EFFECTIVE_FROM'
  )
  const [note, setNote] = useState('')
  const [requestLoading, setRequestLoading] = useState(false)
  const [requestError, setRequestError] = useState('')
  const [requestSuccess, setRequestSuccess] = useState('')

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

  useEffect(() => {
    if (!data) return

    const firstClientSetting = data.client_settings?.[0]
    const firstTier = data.tiers?.[0]

    if (!selectedClientSettingId && firstClientSetting?.id) {
      setSelectedClientSettingId(firstClientSetting.id)
    }

    if (!newPsTierId) {
      setNewPsTierId(firstClientSetting?.ps_tier_id || firstTier?.id || '')
    }

    if (!effectiveFromGmt7) {
      setEffectiveFromGmt7(getNextMondayLocalValue(6))
    }

    if (!effectiveFromBroker) {
      setEffectiveFromBroker(getNextMondayLocalValue(0))
    }
  }, [
    data,
    selectedClientSettingId,
    newPsTierId,
    effectiveFromGmt7,
    effectiveFromBroker,
  ])

  const tierMap = useMemo(() => {
    const map = {}

    for (const tier of data?.tiers || []) {
      map[tier.id] = tier
    }

    return map
  }, [data])

  const selectedClientSetting = useMemo(() => {
    return (data?.client_settings || []).find(
      (setting) => setting.id === selectedClientSettingId
    )
  }, [data, selectedClientSettingId])

  const selectedCurrentTier =
    tierMap[selectedClientSetting?.ps_tier_id]

  const selectedNewTier =
    tierMap[newPsTierId]

  const activeSplit = data?.master_splits?.[0] || null
  const activeRule = data?.distribution_rules?.[0] || null
  const partnerMap = data?.partner_map || {}

  async function handleSubmitChangeRequest(event) {
    event.preventDefault()

    if (!token) {
      setRequestError('Session admin tidak ditemukan. Login ulang dulu.')
      return
    }

    if (!selectedClientSettingId) {
      setRequestError('Pilih client setting terlebih dahulu.')
      return
    }

    if (!newPsTierId) {
      setRequestError('Pilih PS tier baru terlebih dahulu.')
      return
    }

    if (!effectiveFromGmt7 || !effectiveFromBroker) {
      setRequestError('Effective GMT+7 dan Broker Time wajib diisi.')
      return
    }

    setRequestLoading(true)
    setRequestError('')
    setRequestSuccess('')

    try {
      const res = await fetch('/api/admin-request-ps-change', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          clientSettingId: selectedClientSettingId,
          newPsTierId,
          psFeeRateOverride: emptyToNull(psFeeRateOverride),
          fxMode,
          fixedFxRate: emptyToNull(fixedFxRate),
          effectiveFromGmt7: withSeconds(effectiveFromGmt7),
          effectiveFromBroker: withSeconds(effectiveFromBroker),
          ticketApplyRule,
          note: note.trim(),
        }),
      })

      const result = await res.json()

      if (!res.ok || !result.ok) {
        throw new Error(result.error || 'Gagal membuat request perubahan PS')
      }

      setRequestSuccess(
        result.message ||
          'Request perubahan PS berhasil dibuat. Cek menu Timeline.'
      )

      setNote('')
      setRefreshKey((prev) => prev + 1)
    } catch (err) {
      setRequestError(err.message || 'Gagal membuat request perubahan PS')
    } finally {
      setRequestLoading(false)
    }
  }

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
    formGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
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
    textarea: {
      width: '100%',
      boxSizing: 'border-box',
      padding: '11px 12px',
      borderRadius: 12,
      border: '1px solid rgba(148, 163, 184, 0.22)',
      background: 'rgba(2, 6, 23, 0.55)',
      color: '#e5e7eb',
      outline: 'none',
      minHeight: 90,
      resize: 'vertical',
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
    success: {
      padding: 14,
      borderRadius: 14,
      background: 'rgba(34, 197, 94, 0.12)',
      border: '1px solid rgba(34, 197, 94, 0.28)',
      color: '#bbf7d0',
    },
    empty: {
      padding: 16,
      color: '#94a3b8',
      textAlign: 'center',
    },
    previewGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
      gap: 12,
      marginBottom: 14,
    },
    oldBox: {
      padding: 14,
      borderRadius: 14,
      background: 'rgba(239, 68, 68, 0.08)',
      border: '1px solid rgba(239, 68, 68, 0.18)',
      color: '#fecaca',
      lineHeight: 1.5,
    },
    newBox: {
      padding: 14,
      borderRadius: 14,
      background: 'rgba(34, 197, 94, 0.08)',
      border: '1px solid rgba(34, 197, 94, 0.18)',
      color: '#bbf7d0',
      lineHeight: 1.5,
    },
  }

  const psTierColumns = [
    {
      key: 'tier_code',
      label: 'Kode',
      width: 120,
      render: (tier) => (
        <span style={styles.badge}>{tier.tier_code}</span>
      ),
    },
    {
      key: 'tier_name',
      label: 'Nama',
      width: 180,
    },
    {
      key: 'ps_fee_rate',
      label: 'Rate',
      width: 120,
      render: (tier) => formatPercent(tier.ps_fee_rate),
    },
    {
      key: 'is_active',
      label: 'Status',
      width: 120,
      render: (tier) =>
        tier.is_active ? 'Aktif' : 'Nonaktif',
    },
    {
      key: 'description',
      label: 'Deskripsi',
      width: 420,
      render: (tier) => tier.description || '-',
    },
  ]

  const distributionColumns = [
    {
      key: 'upline_level',
      label: 'Level Upline',
      width: 150,
      render: (item) => `Level ${item.upline_level}`,
    },
    {
      key: 'weight_value',
      label: 'Weight',
      width: 120,
      render: (item) => <strong>{item.weight_value}</strong>,
    },
    {
      key: 'fixed_amount_idr',
      label: 'Fixed Amount',
      width: 160,
      render: (item) => formatMoney(item.fixed_amount_idr),
    },
    {
      key: 'note',
      label: 'Note',
      width: 520,
      render: (item) => item.note || '-',
    },
  ]

  const clientSettingColumns = [
    {
      key: 'client_partner_id',
      label: 'Client',
      width: 240,
      render: (setting) =>
        getPartnerName(partnerMap, setting.client_partner_id),
    },
    {
      key: 'ps_tier_id',
      label: 'Tier',
      width: 220,
      render: (setting) => {
        const tier = tierMap[setting.ps_tier_id]

        return tier
          ? `${tier.tier_code} — ${tier.tier_name}`
          : '-'
      },
    },
    {
      key: 'ps_fee_rate_override',
      label: 'Override Rate',
      width: 170,
      render: (setting) =>
        setting.ps_fee_rate_override === null ||
        setting.ps_fee_rate_override === undefined
          ? '-'
          : formatPercent(setting.ps_fee_rate_override),
    },
    {
      key: 'fx_mode',
      label: 'FX Mode',
      width: 140,
      render: (setting) => setting.fx_mode || '-',
    },
    {
      key: 'fixed_fx_rate',
      label: 'Fixed FX',
      width: 160,
      render: (setting) =>
        setting.fixed_fx_rate
          ? Number(setting.fixed_fx_rate).toLocaleString('id-ID')
          : '-',
    },
    {
      key: 'effective_from',
      label: 'Effective From',
      width: 200,
      render: (setting) => formatDate(setting.effective_from),
    },
  ]

  const fxColumns = [
    {
      key: 'source',
      label: 'Source',
      width: 180,
      render: (fx) => fx.source || '-',
    },
    {
      key: 'base_currency',
      label: 'Base',
      width: 120,
      render: (fx) => fx.base_currency || '-',
    },
    {
      key: 'quote_currency',
      label: 'Quote',
      width: 120,
      render: (fx) => fx.quote_currency || '-',
    },
    {
      key: 'rate',
      label: 'Rate',
      width: 180,
      render: (fx) =>
        Number(fx.rate || 0).toLocaleString('id-ID'),
    },
    {
      key: 'source_date',
      label: 'Source Date',
      width: 220,
      render: (fx) => formatDate(fx.source_date),
    },
  ]
  
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
        Saat ini perubahan PS tidak langsung mengubah setting aktif. Semua perubahan
        masuk ke <strong>Setting Change Request</strong>, dicatat di Timeline, dan
        memakai effective date + broker time window.
      </section>

      <section style={styles.section}>
        <h3 style={styles.sectionTitle}>Request Change PS Client</h3>
        <p style={styles.sectionSub}>
          Buat request perubahan PS. Ini hanya membuat jadwal perubahan, belum
          langsung mengubah setting aktif client.
        </p>

        <div style={styles.previewGrid}>
          <div style={styles.oldBox}>
            <strong>Old</strong>
            <div>
              Client:{' '}
              {getPartnerName(
                partnerMap,
                selectedClientSetting?.client_partner_id
              )}
            </div>
            <div>
              Tier:{' '}
              {selectedCurrentTier
                ? `${selectedCurrentTier.tier_code} — ${selectedCurrentTier.tier_name}`
                : '-'}
            </div>
            <div>
              Rate:{' '}
              {selectedCurrentTier
                ? formatPercent(selectedCurrentTier.ps_fee_rate)
                : '-'}
            </div>
            <div>FX: {selectedClientSetting?.fx_mode || '-'}</div>
          </div>

          <div style={styles.newBox}>
            <strong>New</strong>
            <div>
              Tier:{' '}
              {selectedNewTier
                ? `${selectedNewTier.tier_code} — ${selectedNewTier.tier_name}`
                : '-'}
            </div>
            <div>
              Rate:{' '}
              {psFeeRateOverride
                ? formatPercent(psFeeRateOverride)
                : selectedNewTier
                  ? formatPercent(selectedNewTier.ps_fee_rate)
                  : '-'}
            </div>
            <div>FX: {fxMode}</div>
            <div>Broker mulai: {effectiveFromBroker || '-'}</div>
          </div>
        </div>

        {requestError && <div style={styles.error}>{requestError}</div>}
        {requestSuccess && <div style={styles.success}>{requestSuccess}</div>}

        <form onSubmit={handleSubmitChangeRequest}>
          <div style={styles.formGrid}>
            <label style={styles.inputLabel}>
              Client Setting
              <span style={styles.inputSub}>Pilih client yang akan diubah PS-nya.</span>
              <select
                style={styles.input}
                value={selectedClientSettingId}
                onChange={(event) => {
                  const nextId = event.target.value
                  const nextSetting = (data?.client_settings || []).find(
                    (setting) => setting.id === nextId
                  )

                  setSelectedClientSettingId(nextId)
                  setNewPsTierId(nextSetting?.ps_tier_id || '')
                }}
                disabled={requestLoading}
              >
                {(data?.client_settings || []).map((setting) => {
                  const tier = tierMap[setting.ps_tier_id]

                  return (
                    <option key={setting.id} value={setting.id}>
                      {getPartnerName(partnerMap, setting.client_partner_id)} —{' '}
                      {tier?.tier_code || 'No Tier'}
                    </option>
                  )
                })}
              </select>
            </label>

            <label style={styles.inputLabel}>
              New PS Tier
              <span style={styles.inputSub}>Tier baru yang akan berlaku.</span>
              <select
                style={styles.input}
                value={newPsTierId}
                onChange={(event) => setNewPsTierId(event.target.value)}
                disabled={requestLoading}
              >
                {(data?.tiers || []).map((tier) => (
                  <option key={tier.id} value={tier.id}>
                    {tier.tier_code} — {tier.tier_name} — {tier.ps_fee_rate}%
                  </option>
                ))}
              </select>
            </label>

            <label style={styles.inputLabel}>
              Override Rate
              <span style={styles.inputSub}>Kosongkan jika ikut rate tier.</span>
              <input
                style={styles.input}
                type="number"
                step="0.01"
                value={psFeeRateOverride}
                onChange={(event) => setPsFeeRateOverride(event.target.value)}
                placeholder="Contoh: 35"
                disabled={requestLoading}
              />
            </label>

            <label style={styles.inputLabel}>
              FX Mode
              <span style={styles.inputSub}>Cara rate USD/IDR dikunci.</span>
              <select
                style={styles.input}
                value={fxMode}
                onChange={(event) => setFxMode(event.target.value)}
                disabled={requestLoading}
              >
                <option value="MANUAL">MANUAL</option>
                <option value="FIXED">FIXED</option>
                <option value="FLOATING">FLOATING</option>
              </select>
            </label>

            <label style={styles.inputLabel}>
              Fixed FX Rate
              <span style={styles.inputSub}>Isi kalau pakai fixed/manual rate tertentu.</span>
              <input
                style={styles.input}
                type="number"
                step="0.01"
                value={fixedFxRate}
                onChange={(event) => setFixedFxRate(event.target.value)}
                placeholder="Contoh: 16250"
                disabled={requestLoading}
              />
            </label>

            <label style={styles.inputLabel}>
              Effective GMT+7
              <span style={styles.inputSub}>Jam sistem/admin. Default Senin 06:00.</span>
              <input
                style={styles.input}
                type="datetime-local"
                value={effectiveFromGmt7}
                onChange={(event) => setEffectiveFromGmt7(event.target.value)}
                disabled={requestLoading}
              />
            </label>

            <label style={styles.inputLabel}>
              Effective Broker Time
              <span style={styles.inputSub}>Jam broker server. Default Senin 00:00.</span>
              <input
                style={styles.input}
                type="datetime-local"
                value={effectiveFromBroker}
                onChange={(event) => setEffectiveFromBroker(event.target.value)}
                disabled={requestLoading}
              />
            </label>

            <label style={styles.inputLabel}>
              Ticket Apply Rule
              <InfoTip
                text={`Rule ini menentukan ticket mana yang memakai PS baru.
            
            NEXT PERIOD / SELECTED DATE:
            Paling aman pakai close time broker.
            Ticket yang close setelah waktu berlaku akan pakai setting baru.
            
            IMMEDIATE / berlaku segera:
            Lebih fair pakai open time broker.
            Order yang sudah berjalan sebelum perubahan tetap pakai setting lama.
            
            Pending order:
            Kalau pending dibuat sebelum perubahan tapi baru trigger setelah effective time, biasanya dianggap order baru dan bisa masuk setting baru.`}
              />
              <span style={styles.inputSub}>
                Ticket mana yang pakai setting baru.
              </span>
              <select
                style={styles.input}
                value={ticketApplyRule}
                onChange={(event) => setTicketApplyRule(event.target.value)}
                disabled={requestLoading}
              >
                <option value="CLOSE_TIME_BROKER_GTE_EFFECTIVE_FROM">
                  Close time broker &gt;= effective broker time
                </option>
                <option value="OPEN_TIME_BROKER_GTE_EFFECTIVE_FROM">
                  Open time broker &gt;= effective broker time
                </option>
                <option value="MANUAL_REVIEW_REQUIRED">
                  Manual review required
                </option>
              </select>
            </label>
          </div>

          <div
            style={{
              marginTop: 8,
              padding: 10,
              borderRadius: 10,
              background: 'rgba(15, 23, 42, 0.72)',
              border: '1px solid rgba(148, 163, 184, 0.14)',
              color: '#94a3b8',
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            {ticketApplyRule === 'CLOSE_TIME_BROKER_GTE_EFFECTIVE_FROM' && (
              <span>
                Setting baru berlaku untuk ticket yang <strong>close</strong> setelah effective broker time. Ini cocok untuk perubahan minggu depan/periode baru.
              </span>
            )}
          
            {ticketApplyRule === 'OPEN_TIME_BROKER_GTE_EFFECTIVE_FROM' && (
              <span>
                Setting baru berlaku untuk order yang <strong>open</strong> setelah effective broker time. Ini cocok untuk perubahan segera agar posisi yang sudah running tetap pakai setting lama.
              </span>
            )}
          
            {ticketApplyRule === 'MANUAL_REVIEW_REQUIRED' && (
              <span>
                Ticket tidak otomatis diputuskan oleh sistem. Admin harus review manual jika ada kondisi abu-abu.
              </span>
            )}
          </div>
          
          <div style={{ marginTop: 12 }}>
            <label style={styles.inputLabel}>
              Note
              <span style={styles.inputSub}>Alasan perubahan untuk audit log.</span>
              <textarea
                style={styles.textarea}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Contoh: Naik ke PS40 mulai minggu depan berdasarkan kesepakatan baru."
                disabled={requestLoading}
              />
            </label>
          </div>

          <div style={{ marginTop: 14 }}>
            <button
              type="submit"
              style={styles.button}
              disabled={requestLoading}
            >
              {requestLoading ? 'Membuat Request...' : 'Create Request Change'}
            </button>
          </div>
        </form>
      </section>

      <AdjustableTable
        title="PS Tier Client"
        subtitle="Tier ini menentukan berapa persen profit client yang menjadi PS fee."
        storageKey="ts_ps_tier_table"
        columns={psTierColumns}
        rows={data?.tiers || []}
        loading={loading}
        emptyText="Belum ada PS tier."
      />

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

      <AdjustableTable
        title="Distribution Weight"
        subtitle="Bobot ini membagi Master Pool ke upline. Angka 4 / 2.5 / 1.5 / 1 / 0.5 adalah bobot pool, bukan potongan tambahan dari profit client."
        storageKey="ts_distribution_weight_table"
        columns={distributionColumns}
        rows={data?.distribution_items || []}
        loading={loading}
        emptyText="Belum ada distribution item."
      />

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

      <AdjustableTable
        title="Client PS Setting"
        subtitle="Setting PS per client. Perubahan jangan langsung edit data aktif, gunakan form Request Change di atas."
        storageKey="ts_client_ps_setting_table"
        columns={clientSettingColumns}
        rows={data?.client_settings || []}
        loading={loading}
        emptyText="Belum ada client PS setting."
      />

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

      <AdjustableTable
        title="FX Snapshot"
        subtitle="Snapshot rate USD/IDR untuk penguncian nilai invoice. Sekarang masih kosong, nanti terisi saat calculation/invoice PS berjalan."
        storageKey="ts_fx_snapshot_table"
        columns={fxColumns}
        rows={data?.fx_snapshots || []}
        loading={loading}
        emptyText="Belum ada FX snapshot."
      />

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
