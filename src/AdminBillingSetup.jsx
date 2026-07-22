import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import AdjustableTable from './AdjustableTable.jsx'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseAnonKey)

function formatMoney(value) {
  const number = Number(value || 0)
  return `Rp${number.toLocaleString('id-ID')}`
}

function formatDate(value) {
  if (!value) return '-'

  try {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value

    return date.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return value
  }
}

function emptyToNull(value) {
  if (value === null || value === undefined || value === '') return null
  return value
}

const blankClientForm = {
  id: '',
  client_name: '',
  whatsapp: '',
  email: '',
  status: 'active',
  notes: '',
}

const blankServiceForm = {
  id: '',
  client_id: '',
  service_type: 'VPS',
  service_name: '',
  service_title: '',
  service_target: '',
  service_detail: '',
  account_number: '',
  account_label: '',
  billing_cycle: 'monthly',
  billing_mode: 'FIXED',
  price: '',
  ps_percent: '',
  start_date: '',
  end_date: '',
  due_day: 1,
  grace_days: 10,
  is_active: true,
  notes: '',
}

function getDefaultBillingMonth() {
  const date = new Date()
  date.setMonth(date.getMonth() + 1)

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')

  return `${year}-${month}`
}

function monthToPeriodStart(value) {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return null
  return `${value}-01`
}

function getBillingMonthOptions() {
  const options = []
  const now = new Date()

  for (let offset = -2; offset <= 6; offset += 1) {
    const date = new Date(now.getFullYear(), now.getMonth() + offset, 1)
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

    const label = date.toLocaleDateString('id-ID', {
      month: 'long',
      year: 'numeric',
    })

    options.push({
      value,
      label,
    })
  }

  return options
}

export default function AdminBillingSetup({ session }) {
  const [clients, setClients] = useState([])
  const [services, setServices] = useState([])
  const [invoices, setInvoices] = useState([])

  const [clientForm, setClientForm] = useState(blankClientForm)
  const [serviceForm, setServiceForm] = useState(blankServiceForm)
  const [generateClientId, setGenerateClientId] = useState('')
  const [billingMonth, setBillingMonth] = useState(getDefaultBillingMonth)
  const billingMonthOptions = useMemo(() => getBillingMonthOptions(), [])

  const [backupUrl, setBackupUrl] = useState(() =>
    localStorage.getItem('ts_billing_backup_url') || ''
  )
  const [backupSecret, setBackupSecret] = useState(() =>
    localStorage.getItem('ts_billing_backup_secret') || ''
  )

  const [loading, setLoading] = useState(false)
  const [savingClient, setSavingClient] = useState(false)
  const [savingService, setSavingService] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [bulkGenerating, setBulkGenerating] = useState(false)
  const [sendingInvoiceId, setSendingInvoiceId] = useState('')
  const [message, setMessage] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const token = session?.access_token

  const activeClients = useMemo(() => {
    return clients.filter((client) => client.status === 'active')
  }, [clients])
  
  const filteredInvoices = useMemo(() => {
    const selectedMonth = String(billingMonth || '').slice(0, 7)
  
    if (!selectedMonth) return invoices
  
    return (invoices || []).filter((invoice) => {
      return String(invoice.period_start || '').slice(0, 7) === selectedMonth
    })
  }, [invoices, billingMonth])
  
  useEffect(() => {
    if (!serviceForm.client_id && activeClients[0]?.id) {
      setServiceForm((current) => ({
        ...current,
        client_id: activeClients[0].id,
      }))
    }

    if (!generateClientId && activeClients[0]?.id) {
      setGenerateClientId(activeClients[0].id)
    }
  }, [activeClients, serviceForm.client_id, generateClientId])

  useEffect(() => {
    loadData()
  }, [token, refreshKey])

  async function loadData() {
    if (!token) return

    setLoading(true)
    setMessage(null)

    try {
      const { data, error } = await supabase.rpc('ts_admin_billing_snapshot')

      if (error) throw error

      setClients(data?.clients || [])
      setServices(data?.services || [])
      setInvoices(data?.invoices || [])
    } catch (err) {
      setMessage({
        type: 'error',
        text: err.message || 'Gagal mengambil data billing.',
      })
    } finally {
      setLoading(false)
    }
  }

  function saveBackupConfig() {
    localStorage.setItem('ts_billing_backup_url', backupUrl.trim())
    localStorage.setItem('ts_billing_backup_secret', backupSecret.trim())

    setMessage({
      type: 'success',
      text: 'Setting backup Google Sheet disimpan di browser ini.',
    })
  }

  async function backupToSheet(table, action, payload) {
    console.log('Google Sheet backup skipped for now:', {
      table,
      action,
      payload,
    })

    return {
      ok: true,
      skipped: true,
      reason: 'Google Sheet browser backup disabled sementara.',
    }
  }

  async function testBackup() {
    setMessage({
      type: 'error',
      text: 'Backup Google Sheet sementara dinonaktifkan agar halaman Billing Setup stabil. Data utama tetap aman di Supabase.',
    })
  }

  async function backupAllCurrentData() {
    setMessage({
      type: 'error',
      text: 'Backup Google Sheet sementara dinonaktifkan. Kita lanjutkan setelah Billing Setup dan invoice stabil.',
    })
  }

  function handleClientChange(field, value) {
    setClientForm((current) => ({
      ...current,
      [field]: value,
    }))
  }

  function handleServiceChange(field, value) {
    setServiceForm((current) => ({
      ...current,
      [field]: value,
    }))
  }
  
  async function saveClient(event) {
    event.preventDefault()

    if (!clientForm.client_name.trim()) {
      setMessage({
        type: 'error',
        text: 'Nama client wajib diisi.',
      })
      return
    }

    setSavingClient(true)
    setMessage(null)

    try {
      const { data, error } = await supabase.rpc(
        'ts_admin_save_billing_client',
        {
          p_client_id: emptyToNull(clientForm.id),
          p_client_name: clientForm.client_name,
          p_whatsapp: emptyToNull(clientForm.whatsapp),
          p_email: emptyToNull(clientForm.email),
          p_status: clientForm.status || 'active',
          p_notes: emptyToNull(clientForm.notes),
        }
      )

      if (error) throw error

      await backupToSheet('clients', `client_${data.action}`, data.client)

      setMessage({
        type: 'success',
        text: `Client berhasil di-${data.action}. Data tersimpan ke Supabase. Backup Google Sheet sementara nonaktif.`,
      })

      setClientForm(blankClientForm)
      setRefreshKey((prev) => prev + 1)
    } catch (err) {
      setMessage({
        type: 'error',
        text: err.message || 'Gagal save client.',
      })
    } finally {
      setSavingClient(false)
    }
  }

  async function saveService(event) {
    event.preventDefault()

    if (!serviceForm.client_id) {
      setMessage({
        type: 'error',
        text: 'Pilih client dulu.',
      })
      return
    }

    if (!serviceForm.price || Number(serviceForm.price) < 0) {
      setMessage({
        type: 'error',
        text: 'Harga service tidak valid.',
      })
      return
    }

    setSavingService(true)
    setMessage(null)

    try {
      const { data, error } = await supabase.rpc(
        'ts_admin_save_client_service',
        {
          p_service_id: emptyToNull(serviceForm.id),
          p_client_id: serviceForm.client_id,
          p_service_type: serviceForm.service_type || 'VPS',
          p_service_name: emptyToNull(serviceForm.service_name),
          p_account_number: emptyToNull(serviceForm.account_number),
          p_account_label: emptyToNull(serviceForm.account_label),
          p_billing_cycle: serviceForm.billing_cycle || 'monthly',
          p_price: Number(serviceForm.price || 0),
          p_ps_percent: emptyToNull(serviceForm.ps_percent),
          p_start_date: emptyToNull(serviceForm.start_date),
          p_end_date: emptyToNull(serviceForm.end_date),
          p_due_day: Number(serviceForm.due_day || 1),
          p_grace_days: Number(serviceForm.grace_days || 10),
          p_is_active: serviceForm.is_active === true,
          p_notes: emptyToNull(serviceForm.notes),
          p_service_title: emptyToNull(serviceForm.service_title),
          p_service_target: emptyToNull(serviceForm.service_target),
          p_service_detail: emptyToNull(serviceForm.service_detail),
          p_billing_mode: serviceForm.billing_mode || 'FIXED',
        }
      )

      if (error) throw error

      await backupToSheet('services', `service_${data.action}`, data.service)

      setMessage({
        type: 'success',
        text: `Service berhasil di-${data.action}. Data tersimpan ke Supabase. Backup Google Sheet sementara nonaktif.`,
      })

      setServiceForm({
        ...blankServiceForm,
        client_id: serviceForm.client_id,
      })
      setRefreshKey((prev) => prev + 1)
    } catch (err) {
      setMessage({
        type: 'error',
        text: err.message || 'Gagal save service.',
      })
    } finally {
      setSavingService(false)
    }
  }

  async function generateNextInvoice() {
    if (!generateClientId) {
      setMessage({
        type: 'error',
        text: 'Pilih client untuk generate invoice.',
      })
      return
    }

    const periodStart = monthToPeriodStart(billingMonth)

    if (!periodStart) {
      setMessage({
        type: 'error',
        text: 'Pilih bulan invoice dulu.',
      })
      return
    }

    const confirmed = window.confirm(
      `Generate invoice bulan ${billingMonth} untuk client ini?\n\nSistem anti dobel. Kalau invoice bulan ini sudah ada, tidak akan dibuat ulang.`
    )

    if (!confirmed) return

    setGenerating(true)
    setMessage(null)

    try {
      const { data, error } = await supabase.rpc(
        'ts_admin_generate_billing_invoice_for_month',
        {
          p_client_id: generateClientId,
          p_period_start: periodStart,
        }
      )

      if (error) throw error

      if (data?.ok === false) {
        throw new Error(data.error || 'Generate invoice gagal.')
      }

      await backupToSheet('invoices', 'generate_invoice_selected_month', data)

      setMessage({
        type: 'success',
        text:
          data.message ||
          `Invoice ${data.invoice_no || ''} berhasil dibuat / ditemukan.`,
      })

      setRefreshKey((prev) => prev + 1)
    } catch (err) {
      setMessage({
        type: 'error',
        text: err.message || 'Gagal generate invoice.',
      })
    } finally {
      setGenerating(false)
    }
  }

  async function generateAllNextInvoices() {
    const periodStart = monthToPeriodStart(billingMonth)

    if (!periodStart) {
      setMessage({
        type: 'error',
        text: 'Pilih bulan invoice dulu.',
      })
      return
    }

    const activeServiceClientIds = [
      ...new Set(
        services
          .filter((service) => service.is_active === true)
          .map((service) => service.client_id)
          .filter(Boolean)
      ),
    ]

    const targetClients = clients.filter((client) => {
      return (
        client.status === 'active' &&
        activeServiceClientIds.includes(client.id)
      )
    })

    if (targetClients.length <= 0) {
      setMessage({
        type: 'error',
        text: 'Tidak ada client aktif yang punya service aktif.',
      })
      return
    }

    const confirmed = window.confirm(
      `Generate invoice bulan ${billingMonth} untuk semua client aktif?\n\nClient diproses: ${targetClients.length}\n\nSistem anti dobel. Jika invoice bulan ini sudah ada, tidak akan dibuat ulang.`
    )

    if (!confirmed) return

    setBulkGenerating(true)
    setMessage(null)

    let createdCount = 0
    let existingCount = 0
    let failedCount = 0
    const failedItems = []

    try {
      for (const client of targetClients) {
        try {
          const { data, error } = await supabase.rpc(
            'ts_admin_generate_billing_invoice_for_month',
            {
              p_client_id: client.id,
              p_period_start: periodStart,
            }
          )

          if (error) throw error

          if (data?.ok === false) {
            failedCount += 1
            failedItems.push(`${client.client_name}: ${data.error || 'Gagal'}`)
            continue
          }

          if (data?.already_exists) {
            existingCount += 1
          } else {
            createdCount += 1
          }

          await backupToSheet('invoices', 'generate_invoice_selected_month_bulk', {
            client_name: client.client_name,
            billing_month: billingMonth,
            result: data,
          })
        } catch (err) {
          failedCount += 1
          failedItems.push(
            `${client.client_name}: ${err.message || 'Gagal generate'}`
          )
        }
      }

      setMessage({
        type: failedCount > 0 ? 'error' : 'success',
        text:
          failedCount > 0
            ? `Generate bulan ${billingMonth} selesai dengan error. Baru dibuat: ${createdCount}, sudah ada: ${existingCount}, gagal: ${failedCount}. ${failedItems.join(' | ')}`
            : `Generate bulan ${billingMonth} selesai. Baru dibuat: ${createdCount}, sudah ada: ${existingCount}, gagal: ${failedCount}.`,
      })

      setRefreshKey((prev) => prev + 1)
    } finally {
      setBulkGenerating(false)
    }
  }
  
  async function rebuildInvoice(row) {
    if (!row?.id) {
      setMessage({
        type: 'error',
        text: 'Invoice ID tidak ditemukan.',
      })
      return
    }

    if (row.status === 'paid') {
      setMessage({
        type: 'error',
        text: 'Invoice sudah PAID, tidak boleh direbuild.',
      })
      return
    }

    const confirmed = window.confirm(
      `Rebuild invoice ${row.invoice_no} dari service ACTIVE sekarang?\n\nService OFF tidak akan masuk invoice.\nTotal invoice akan dihitung ulang.`
    )

    if (!confirmed) return

    setMessage(null)

    try {
      const { data, error } = await supabase.rpc(
        'ts_admin_rebuild_billing_invoice',
        {
          p_invoice_id: row.id,
        }
      )

      if (error) throw error

      if (data?.ok === false) {
        throw new Error(data.error || 'Rebuild invoice gagal.')
      }

      await backupToSheet('invoices', 'rebuild_invoice', data)

      setMessage({
        type: 'success',
        text:
          data?.message ||
          `Invoice ${row.invoice_no} berhasil direbuild dari service aktif.`,
      })

      setRefreshKey((prev) => prev + 1)
    } catch (err) {
      setMessage({
        type: 'error',
        text: err.message || 'Gagal rebuild invoice.',
      })
    }
  }
  
  function editClient(client) {
    setClientForm({
      id: client.id || '',
      client_name: client.client_name || '',
      whatsapp: client.whatsapp || '',
      email: client.email || '',
      status: client.status || 'active',
      notes: client.notes || '',
    })

    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function editService(service) {
    setServiceForm({
      id: service.id || '',
      client_id: service.client_id || '',
      service_type: service.service_type || 'VPS',
      service_name: service.service_name || '',
      service_title: service.service_title || '',
      service_target: service.service_target || '',
      service_detail: service.service_detail || '',
      account_number: service.account_number || '',
      account_label: service.account_label || '',
      billing_cycle: service.billing_cycle || 'monthly',
      billing_mode: service.billing_mode || 'FIXED',
      price: service.price ?? '',
      ps_percent: service.ps_percent ?? '',
      start_date: service.start_date || '',
      end_date: service.end_date || '',
      due_day: service.due_day || 1,
      grace_days: service.grace_days || 10,
      is_active: service.is_active !== false,
      notes: service.notes || '',
    })

    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function copyText(text) {
    navigator.clipboard.writeText(text || '')
    setMessage({
      type: 'success',
      text: 'Link berhasil dicopy.',
    })
  }

  function normalizeWhatsApp(value) {
    const digits = String(value || '').replace(/\D/g, '')

    if (!digits) return ''

    if (digits.startsWith('0')) {
      return `62${digits.slice(1)}`
    }

    if (digits.startsWith('62')) {
      return digits
    }

    return digits
  }

  function buildInvoiceMessage(row) {
    const link = row.invoice_link || ''
    const clientName = row.client_name || 'Bapak/Ibu'
    const invoiceNo = row.invoice_no || '-'
    const periodStart = formatDate(row.period_start)
    const periodEnd = formatDate(row.period_end)
    const dueDate = formatDate(row.due_date)
    const total = formatMoney(row.total_amount)

    return [
      `Halo ${clientName},`,
      ``,
      `Berikut kami kirimkan invoice tagihan TernakSukses:`,
      ``,
      `Invoice: ${invoiceNo}`,
      `Periode: ${periodStart} s/d ${periodEnd}`,
      `Total: ${total}`,
      `Jatuh tempo: ${dueDate}`,
      ``,
      `Link pembayaran:`,
      link,
      ``,
      `Silakan upload bukti transfer melalui link tersebut setelah pembayaran.`,
      ``,
      `Terima kasih.`,
    ].join('\n')
  }

  async function copyInvoiceMessage(row) {
    const text = buildInvoiceMessage(row)

    await navigator.clipboard.writeText(text)

    setMessage({
      type: 'success',
      text: `Pesan WhatsApp invoice ${row.invoice_no} berhasil dicopy.`,
    })
  }

  function openWhatsAppInvoice(row) {
    const phone = normalizeWhatsApp(row.whatsapp)
    const text = buildInvoiceMessage(row)

    if (!phone) {
      setMessage({
        type: 'error',
        text: 'Nomor WhatsApp client kosong / tidak valid.',
      })
      return
    }

    const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`

    window.open(url, '_blank')
  }

  async function markInvoiceSent(row) {
    if (!row?.id) {
      setMessage({
        type: 'error',
        text: 'Invoice ID tidak ditemukan.',
      })
      return
    }

    if (row.status === 'paid') {
      setMessage({
        type: 'error',
        text: 'Invoice sudah PAID, tidak perlu mark sent.',
      })
      return
    }

    const confirmed = window.confirm(
      `Tandai invoice ${row.invoice_no} sebagai sudah dikirim?\n\nStatus akan menjadi unpaid dan sent_at akan diisi.`
    )

    if (!confirmed) return

    setMessage(null)

    try {
      const { data, error } = await supabase.rpc(
        'ts_admin_mark_billing_invoice_sent',
        {
          p_invoice_id: row.id,
        }
      )

      if (error) throw error

      if (data?.ok === false) {
        throw new Error(data.error || 'Mark sent gagal.')
      }

      await backupToSheet('invoices', 'mark_invoice_sent', data)

      setMessage({
        type: 'success',
        text:
          data?.message ||
          `Invoice ${row.invoice_no} berhasil ditandai sebagai sent/unpaid.`,
      })

      setRefreshKey((prev) => prev + 1)
    } catch (err) {
      setMessage({
        type: 'error',
        text: err.message || 'Gagal mark invoice as sent.',
      })
    }
  }

  async function sendInvoiceWhatsApp(row) {
    if (!row?.id) {
      setMessage({
        type: 'error',
        text: 'Invoice ID tidak ditemukan.',
      })
      return
    }

    if (row.status === 'paid') {
      setMessage({
        type: 'error',
        text: 'Invoice sudah PAID, tidak perlu dikirim sebagai tagihan.',
      })
      return
    }

    if (!row.whatsapp) {
      setMessage({
        type: 'error',
        text: 'Nomor WhatsApp client kosong.',
      })
      return
    }

    const confirmed = window.confirm(
      `Kirim invoice ${row.invoice_no} ke WhatsApp client via Fonnte?\n\nClient: ${row.client_name}\nWhatsApp: ${row.whatsapp}\n\nInvoice akan otomatis ditandai sebagai unpaid/sent.`
    )

    if (!confirmed) return

    setSendingInvoiceId(row.id)
    setMessage(null)

    try {
      const response = await fetch('/api/admin-payments', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'send_invoice_whatsapp',
          invoice_id: row.id,
        }),
      })

      const result = await response.json()

      if (!response.ok || !result.ok) {
        throw new Error(result.error || 'Gagal kirim invoice via Fonnte.')
      }

      setMessage({
        type: 'success',
        text:
          result.message ||
          `Invoice ${row.invoice_no} berhasil dikirim via Fonnte.`,
      })

      setRefreshKey((prev) => prev + 1)
    } catch (err) {
      setMessage({
        type: 'error',
        text: err.message || 'Gagal kirim invoice via Fonnte.',
      })
    } finally {
      setSendingInvoiceId('')
    }
  }
  
  const clientColumns = [
    {
      key: 'client_name',
      label: 'Client',
      width: 220,
    },
    {
      key: 'whatsapp',
      label: 'WhatsApp',
      width: 160,
    },
    {
      key: 'email',
      label: 'Email',
      width: 220,
      render: (row) => row.email || '-',
    },
    {
      key: 'status',
      label: 'Status',
      width: 120,
      render: (row) => (
        <span style={row.status === 'active' ? styles.good : styles.bad}>
          {row.status}
        </span>
      ),
    },
    {
      key: 'notes',
      label: 'Notes',
      width: 260,
      render: (row) => row.notes || '-',
    },
    {
      key: 'action',
      label: 'Action',
      width: 120,
      render: (row) => (
        <button
          type="button"
          style={styles.smallButton}
          onClick={() => editClient(row)}
        >
          Edit
        </button>
      ),
    },
  ]

  const serviceColumns = [
    {
      key: 'client_name',
      label: 'Client',
      width: 190,
    },
    {
      key: 'service_type',
      label: 'Type',
      width: 120,
    },
    {
      key: 'service_title',
      label: 'Title',
      width: 220,
      render: (row) => row.service_title || row.service_name || '-',
    },
    {
      key: 'service_target',
      label: 'Target',
      width: 240,
      render: (row) => row.service_target || row.account_number || '-',
    },
    {
      key: 'price',
      label: 'Harga',
      width: 140,
      render: (row) => formatMoney(row.price),
    },
    {
      key: 'due_day',
      label: 'Due Day',
      width: 110,
    },
    {
      key: 'grace_days',
      label: 'Grace',
      width: 100,
    },
    {
      key: 'is_active',
      label: 'Status',
      width: 110,
      render: (row) =>
        row.is_active ? (
          <span style={styles.good}>ACTIVE</span>
        ) : (
          <span style={styles.bad}>OFF</span>
        ),
    },
    {
      key: 'action',
      label: 'Action',
      width: 120,
      render: (row) => (
        <button
          type="button"
          style={styles.smallButton}
          onClick={() => editService(row)}
        >
          Edit
        </button>
      ),
    },
  ]

  const invoiceColumns = [
    {
      key: 'invoice_no',
      label: 'Invoice',
      width: 170,
    },
    {
      key: 'client_name',
      label: 'Client',
      width: 180,
    },
    {
      key: 'period_start',
      label: 'Period',
      width: 210,
      render: (row) =>
        `${formatDate(row.period_start)} - ${formatDate(row.period_end)}`,
    },
    {
      key: 'due_date',
      label: 'Due',
      width: 130,
      render: (row) => formatDate(row.due_date),
    },
    {
      key: 'total_amount',
      label: 'Total',
      width: 140,
      render: (row) => formatMoney(row.total_amount),
    },
    {
      key: 'status',
      label: 'Status',
      width: 120,
      render: (row) => (
        <span style={row.status === 'paid' ? styles.good : styles.warn}>
          {row.status}
        </span>
      ),
    },
    {
      key: 'item_count',
      label: 'Items',
      width: 90,
    },
    {
      key: 'invoice_link',
      label: 'Link',
      width: 260,
      render: (row) => (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a
            href={row.invoice_link}
            target="_blank"
            rel="noreferrer"
            style={styles.link}
          >
            Buka
          </a>
          <button
            type="button"
            style={styles.smallButton}
            onClick={() => copyText(row.invoice_link)}
          >
            Copy
          </button>
        </div>
      ),
    },
    {
        key: 'actions',
        label: 'Action',
        width: 520,
        render: (row) => (
          <div
            style={{
              display: 'flex',
              gap: 6,
              flexWrap: 'nowrap',
              alignItems: 'center',
              whiteSpace: 'nowrap',
            }}
          >
          <button
            type="button"
            style={styles.smallButton}
            onClick={() => rebuildInvoice(row)}
            disabled={row.status === 'paid'}
            title={
              row.status === 'paid'
                ? 'Invoice paid tidak boleh direbuild'
                : 'Rebuild invoice dari service aktif'
            }
          >
            Rebuild
          </button>

          <button
            type="button"
            style={styles.smallButton}
            onClick={() => markInvoiceSent(row)}
            disabled={row.status === 'paid'}
            title={
              row.status === 'paid'
                ? 'Invoice paid tidak perlu mark sent'
                : 'Tandai invoice sebagai terkirim'
            }
          >
            Mark Sent
          </button>

          <button
            type="button"
            style={styles.smallButton}
            onClick={() => sendInvoiceWhatsApp(row)}
            disabled={row.status === 'paid' || sendingInvoiceId === row.id}
            title={
              row.status === 'paid'
                ? 'Invoice paid tidak perlu dikirim'
                : 'Kirim invoice via Fonnte'
            }
          >
            {sendingInvoiceId === row.id ? 'Sending...' : 'Send WA'}
          </button>

          <button
            type="button"
            style={styles.smallButton}
            onClick={() => copyInvoiceMessage(row)}
          >
            Copy WA
          </button>

          <button
            type="button"
            style={styles.smallButton}
            onClick={() => openWhatsAppInvoice(row)}
          >
            Open WA
          </button>
        </div>
      ),
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
    },
    subtitle: {
      margin: '6px 0 0',
      color: '#94a3b8',
      lineHeight: 1.5,
      fontSize: 14,
      maxWidth: 760,
    },
    buttonRow: {
      display: 'flex',
      gap: 10,
      flexWrap: 'wrap',
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
    primaryButton: {
      border: '1px solid rgba(34, 197, 94, 0.35)',
      background: 'rgba(34, 197, 94, 0.12)',
      color: '#86efac',
      padding: '10px 14px',
      borderRadius: 12,
      cursor: 'pointer',
      fontWeight: 900,
    },
    smallButton: {
      border: '1px solid rgba(148, 163, 184, 0.24)',
      background: 'rgba(15, 23, 42, 0.72)',
      color: '#e5e7eb',
      padding: '7px 10px',
      borderRadius: 10,
      cursor: 'pointer',
      fontWeight: 800,
      fontSize: 12,
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
    grid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
      gap: 12,
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
      minHeight: 80,
      resize: 'vertical',
    },
    success: {
      padding: 14,
      borderRadius: 14,
      background: 'rgba(34, 197, 94, 0.12)',
      border: '1px solid rgba(34, 197, 94, 0.28)',
      color: '#bbf7d0',
    },
    error: {
      padding: 14,
      borderRadius: 14,
      background: 'rgba(239, 68, 68, 0.12)',
      border: '1px solid rgba(239, 68, 68, 0.28)',
      color: '#fecaca',
    },
    info: {
      padding: 14,
      borderRadius: 14,
      background: 'rgba(14, 165, 233, 0.12)',
      border: '1px solid rgba(14, 165, 233, 0.28)',
      color: '#bae6fd',
      lineHeight: 1.5,
    },
    good: {
      color: '#86efac',
      fontWeight: 900,
    },
    bad: {
      color: '#fca5a5',
      fontWeight: 900,
    },
    warn: {
      color: '#fbbf24',
      fontWeight: 900,
    },
    link: {
      color: '#7dd3fc',
      fontWeight: 800,
      textDecoration: 'none',
    },
  }

  function messageStyle(currentMessage) {
    if (!currentMessage) return styles.info
    if (currentMessage.type === 'success') return styles.success
    if (currentMessage.type === 'error') return styles.error
    return styles.info
  }

  return (
    <div style={styles.wrap}>
      <section style={styles.header}>
        <div>
          <h2 style={styles.title}>Billing Setup</h2>
          <p style={styles.subtitle}>
            Input client, layanan/tagihan, generate invoice bulanan, dan backup
            data ke Google Sheet.
          </p>
        </div>

        <div style={styles.buttonRow}>
          <button
            type="button"
            style={styles.button}
            onClick={() => setRefreshKey((prev) => prev + 1)}
            disabled={loading}
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>

          <button
            type="button"
            style={styles.primaryButton}
            onClick={backupAllCurrentData}
          >
            Backup All Current Data
          </button>
        </div>
      </section>

      {message && (
        <div style={messageStyle(message)}>
          {message.text}
        </div>
      )}

      <section style={styles.section}>
        <h3 style={styles.sectionTitle}>Google Sheet Backup</h3>
        <p style={styles.sectionSub}>
          URL dan secret disimpan di browser admin ini, bukan di GitHub.
        </p>

        <div style={styles.grid}>
          <label style={styles.inputLabel}>
            Apps Script Web App URL
            <span style={styles.inputSub}>URL dari deploy Apps Script.</span>
            <input
              style={styles.input}
              value={backupUrl}
              onChange={(event) => setBackupUrl(event.target.value)}
              placeholder="https://script.google.com/macros/s/.../exec"
            />
          </label>

          <label style={styles.inputLabel}>
            Backup Secret
            <span style={styles.inputSub}>Secret yang sama dengan Code.gs.</span>
            <input
              style={styles.input}
              type="password"
              value={backupSecret}
              onChange={(event) => setBackupSecret(event.target.value)}
              placeholder="backup secret"
            />
          </label>
        </div>

        <div style={{ ...styles.buttonRow, marginTop: 14 }}>
          <button
            type="button"
            style={styles.button}
            onClick={saveBackupConfig}
          >
            Save Backup Setting
          </button>

          <button
            type="button"
            style={styles.primaryButton}
            onClick={testBackup}
          >
            Test Backup
          </button>
        </div>
      </section>

      <section style={styles.section}>
        <h3 style={styles.sectionTitle}>
          {clientForm.id ? 'Edit Client' : 'Tambah Client'}
        </h3>
        <p style={styles.sectionSub}>
          Data client untuk invoice VPS/robot/membership.
        </p>

        <form onSubmit={saveClient}>
          <div style={styles.grid}>
            <label style={styles.inputLabel}>
              Nama Client
              <span style={styles.inputSub}>Contoh: Franky Irawan.</span>
              <input
                style={styles.input}
                value={clientForm.client_name}
                onChange={(event) =>
                  handleClientChange('client_name', event.target.value)
                }
                disabled={savingClient}
              />
            </label>

            <label style={styles.inputLabel}>
              WhatsApp
              <span style={styles.inputSub}>Contoh: 62811xxxx.</span>
              <input
                style={styles.input}
                value={clientForm.whatsapp}
                onChange={(event) =>
                  handleClientChange('whatsapp', event.target.value)
                }
                disabled={savingClient}
              />
            </label>

            <label style={styles.inputLabel}>
              Email
              <span style={styles.inputSub}>Opsional.</span>
              <input
                style={styles.input}
                value={clientForm.email}
                onChange={(event) =>
                  handleClientChange('email', event.target.value)
                }
                disabled={savingClient}
              />
            </label>

            <label style={styles.inputLabel}>
              Status
              <span style={styles.inputSub}>Active berarti bisa ditagih.</span>
              <select
                style={styles.input}
                value={clientForm.status}
                onChange={(event) =>
                  handleClientChange('status', event.target.value)
                }
                disabled={savingClient}
              >
                <option value="active">active</option>
                <option value="inactive">inactive</option>
              </select>
            </label>
          </div>

          <div style={{ marginTop: 12 }}>
            <label style={styles.inputLabel}>
              Notes
              <span style={styles.inputSub}>Catatan internal.</span>
              <textarea
                style={styles.textarea}
                value={clientForm.notes}
                onChange={(event) =>
                  handleClientChange('notes', event.target.value)
                }
                disabled={savingClient}
              />
            </label>
          </div>

          <div style={{ ...styles.buttonRow, marginTop: 14 }}>
            <button
              type="submit"
              style={styles.primaryButton}
              disabled={savingClient}
            >
              {savingClient ? 'Saving...' : clientForm.id ? 'Update Client' : 'Save Client'}
            </button>

            {clientForm.id && (
              <button
                type="button"
                style={styles.button}
                onClick={() => setClientForm(blankClientForm)}
              >
                Cancel Edit
              </button>
            )}
          </div>
        </form>
      </section>

      <section style={styles.section}>
        <h3 style={styles.sectionTitle}>
          {serviceForm.id ? 'Edit Service / Tagihan' : 'Tambah Service / Tagihan'}
        </h3>
        <p style={styles.sectionSub}>
          Input biaya yang akan muncul sebagai item invoice.
        </p>

        <form onSubmit={saveService}>
          <div style={styles.grid}>
            <label style={styles.inputLabel}>
              Client
              <span style={styles.inputSub}>Pemilik layanan.</span>
              <select
                style={styles.input}
                value={serviceForm.client_id}
                onChange={(event) =>
                  handleServiceChange('client_id', event.target.value)
                }
                disabled={savingService}
              >
                <option value="">Pilih client</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.client_name}
                  </option>
                ))}
              </select>
            </label>

            <label style={styles.inputLabel}>
              Service Type
              <span style={styles.inputSub}>VPS / ROBOT / MEMBERSHIP.</span>
              <select
                style={styles.input}
                value={serviceForm.service_type}
                onChange={(event) =>
                  handleServiceChange('service_type', event.target.value)
                }
                disabled={savingService}
              >
                <option value="VPS">VPS</option>
                <option value="ROBOT">ROBOT</option>
                <option value="MEMBERSHIP">MEMBERSHIP</option>
                <option value="OTHER">OTHER</option>
              </select>
            </label>

            <label style={styles.inputLabel}>
              Service Title
              <span style={styles.inputSub}>Tampil di invoice.</span>
              <input
                style={styles.input}
                value={serviceForm.service_title}
                onChange={(event) =>
                  handleServiceChange('service_title', event.target.value)
                }
                placeholder="Contoh: Forex VPS"
                disabled={savingService}
              />
            </label>

            <label style={styles.inputLabel}>
              Service Name
              <span style={styles.inputSub}>Nama internal.</span>
              <input
                style={styles.input}
                value={serviceForm.service_name}
                onChange={(event) =>
                  handleServiceChange('service_name', event.target.value)
                }
                placeholder="Contoh: VPS"
                disabled={savingService}
              />
            </label>

            <label style={styles.inputLabel}>
              Target / Detail Akun
              <span style={styles.inputSub}>Contoh nomor akun atau nama EA.</span>
              <input
                style={styles.input}
                value={serviceForm.service_target}
                onChange={(event) =>
                  handleServiceChange('service_target', event.target.value)
                }
                placeholder="Contoh: 159937776, 159991586"
                disabled={savingService}
              />
            </label>

            <label style={styles.inputLabel}>
              Detail Tambahan
              <span style={styles.inputSub}>Opsional.</span>
              <input
                style={styles.input}
                value={serviceForm.service_detail}
                onChange={(event) =>
                  handleServiceChange('service_detail', event.target.value)
                }
                placeholder="Contoh: Forex VPS"
                disabled={savingService}
              />
            </label>

            <label style={styles.inputLabel}>
              Account Number
              <span style={styles.inputSub}>Opsional.</span>
              <input
                style={styles.input}
                value={serviceForm.account_number}
                onChange={(event) =>
                  handleServiceChange('account_number', event.target.value)
                }
                disabled={savingService}
              />
            </label>

            <label style={styles.inputLabel}>
              Harga
              <span style={styles.inputSub}>Nominal invoice.</span>
              <input
                style={styles.input}
                type="number"
                value={serviceForm.price}
                onChange={(event) =>
                  handleServiceChange('price', event.target.value)
                }
                placeholder="Contoh: 400000"
                disabled={savingService}
              />
            </label>

            <label style={styles.inputLabel}>
              Due Day
              <span style={styles.inputSub}>Tanggal jatuh tempo setiap bulan.</span>
              <input
                style={styles.input}
                type="number"
                min="1"
                max="31"
                value={serviceForm.due_day}
                onChange={(event) =>
                  handleServiceChange('due_day', event.target.value)
                }
                disabled={savingService}
              />
            </label>

            <label style={styles.inputLabel}>
              Grace Days
              <span style={styles.inputSub}>Tenggang hari setelah due.</span>
              <input
                style={styles.input}
                type="number"
                min="0"
                max="60"
                value={serviceForm.grace_days}
                onChange={(event) =>
                  handleServiceChange('grace_days', event.target.value)
                }
                disabled={savingService}
              />
            </label>

            <label style={styles.inputLabel}>
              Billing Cycle
              <span style={styles.inputSub}>Default monthly.</span>
              <select
                style={styles.input}
                value={serviceForm.billing_cycle}
                onChange={(event) =>
                  handleServiceChange('billing_cycle', event.target.value)
                }
                disabled={savingService}
              >
                <option value="monthly">monthly</option>
                <option value="weekly">weekly</option>
                <option value="one_time">one_time</option>
              </select>
            </label>

            <label style={styles.inputLabel}>
              Status Service
              <span style={styles.inputSub}>Aktif akan ikut invoice.</span>
              <select
                style={styles.input}
                value={serviceForm.is_active ? 'true' : 'false'}
                onChange={(event) =>
                  handleServiceChange('is_active', event.target.value === 'true')
                }
                disabled={savingService}
              >
                <option value="true">ACTIVE</option>
                <option value="false">INACTIVE</option>
              </select>
            </label>
          </div>

          <div style={{ marginTop: 12 }}>
            <label style={styles.inputLabel}>
              Notes
              <span style={styles.inputSub}>Catatan internal.</span>
              <textarea
                style={styles.textarea}
                value={serviceForm.notes}
                onChange={(event) =>
                  handleServiceChange('notes', event.target.value)
                }
                disabled={savingService}
              />
            </label>
          </div>

          <div style={{ ...styles.buttonRow, marginTop: 14 }}>
            <button
              type="submit"
              style={styles.primaryButton}
              disabled={savingService}
            >
              {savingService ? 'Saving...' : serviceForm.id ? 'Update Service' : 'Save Service'}
            </button>

            {serviceForm.id && (
              <button
                type="button"
                style={styles.button}
                onClick={() =>
                  setServiceForm({
                    ...blankServiceForm,
                    client_id: serviceForm.client_id,
                  })
                }
              >
                Cancel Edit
              </button>
            )}
          </div>
        </form>
      </section>

      <section style={styles.section}>
        <h3 style={styles.sectionTitle}>Generate Invoice Bulanan</h3>

        <p style={styles.sectionSub}>
          Pilih bulan invoice dulu supaya sistem tidak loncat ke bulan berikutnya.
        </p>

        <div style={styles.grid}>
          <label style={styles.inputLabel}>
            Billing Month
            <span style={styles.inputSub}>
              Pilih bulan invoice yang mau dibuat.
            </span>

            <select
              style={styles.input}
              value={billingMonth}
              onChange={(event) => setBillingMonth(event.target.value)}
              disabled={generating || bulkGenerating}
            >
              {billingMonthOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label style={styles.inputLabel}>
            Client
            <span style={styles.inputSub}>
              Pilih client yang mau dibuat invoice.
            </span>

            <select
              style={styles.input}
              value={generateClientId}
              onChange={(event) => setGenerateClientId(event.target.value)}
              disabled={generating || bulkGenerating}
            >
              <option value="">Pilih client</option>

              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.client_name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div style={{ ...styles.buttonRow, marginTop: 14 }}>
          <button
            type="button"
            style={styles.primaryButton}
            onClick={generateNextInvoice}
            disabled={generating || bulkGenerating}
          >
            {generating ? 'Generating...' : 'Generate Selected Client'}
          </button>

          <button
            type="button"
            style={styles.button}
            onClick={generateAllNextInvoices}
            disabled={generating || bulkGenerating}
          >
            {bulkGenerating ? 'Generating All...' : 'Generate All Active Clients'}
          </button>
        </div>
      </section>

      <AdjustableTable
        title="Client List"
        subtitle="Daftar client billing."
        storageKey="ts_billing_clients_table"
        columns={clientColumns}
        rows={clients}
        loading={loading}
        emptyText="Belum ada client."
      />

      <AdjustableTable
        title="Service / Tagihan List"
        subtitle="Service aktif akan ikut generate invoice."
        storageKey="ts_billing_services_table"
        columns={serviceColumns}
        rows={services}
        loading={loading}
        emptyText="Belum ada service."
      />

      <AdjustableTable
        title={`Invoice List — ${billingMonth}`}
        subtitle={`Menampilkan ${filteredInvoices.length} invoice untuk bulan ${billingMonth}. Total invoice tersimpan: ${invoices.length}.`}
        storageKey="ts_billing_invoices_table"
        columns={invoiceColumns}
        rows={filteredInvoices}
        loading={loading}
        emptyText="Belum ada invoice untuk bulan ini."
      />
    </div>
  )
}
