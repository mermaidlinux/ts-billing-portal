import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
)

const billingBaseUrl =
  process.env.BILLING_BASE_URL ||
  'https://ts-billing-portal.vercel.app'

const fonnteToken = process.env.FONNTE_TOKEN
const googleSheetBackupUrl = process.env.GOOGLE_SHEET_BACKUP_URL
const googleSheetBackupSecret = process.env.GOOGLE_SHEET_BACKUP_SECRET

function getAllowedAdminEmails() {
  return String(process.env.BILLING_ADMIN_EMAIL || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
}

async function verifyAdmin(req) {
  const authorization = String(req.headers.authorization || '')

  if (!authorization.startsWith('Bearer ')) {
    throw new Error('UNAUTHORIZED')
  }

  const accessToken = authorization.slice(7).trim()

  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(accessToken)

  if (error || !user?.email) {
    throw new Error('UNAUTHORIZED')
  }

  const allowedEmails = getAllowedAdminEmails()

  if (!allowedEmails.includes(user.email.toLowerCase())) {
    throw new Error('FORBIDDEN')
  }

  return user
}

function parseBody(req) {
  if (!req.body) return {}

  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body)
    } catch {
      return {}
    }
  }

  return req.body
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

function formatMoney(value) {
  const number = Number(value || 0)
  return `Rp${number.toLocaleString('id-ID')}`
}

function formatDate(value) {
  if (!value) return '-'

  try {
    const date = new Date(value)

    if (Number.isNaN(date.getTime())) return String(value)

    return date.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return String(value)
  }
}

function buildInvoiceMessage({ invoice, client, invoiceLink }) {
  const clientName = client?.client_name || 'Bapak/Ibu'

  return [
    `Halo ${clientName},`,
    ``,
    `Berikut kami kirimkan invoice tagihan TernakSukses:`,
    ``,
    `Invoice: ${invoice.invoice_no}`,
    `Periode: ${formatDate(invoice.period_start)} s/d ${formatDate(invoice.period_end)}`,
    `Total: ${formatMoney(invoice.total_amount)}`,
    `Jatuh tempo: ${formatDate(invoice.due_date)}`,
    ``,
    `Link pembayaran:`,
    invoiceLink,
    ``,
    `Silakan upload bukti transfer melalui link tersebut setelah pembayaran.`,
    ``,
    `Terima kasih.`,
  ].join('\n')
}

async function postGoogleSheetBackup({ table, action, payload }) {
  if (!googleSheetBackupUrl || !googleSheetBackupSecret) {
    throw new Error(
      'GOOGLE_SHEET_BACKUP_URL / GOOGLE_SHEET_BACKUP_SECRET belum diset di Vercel.'
    )
  }

  const response = await fetch(googleSheetBackupUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      secret: googleSheetBackupSecret,
      table,
      action,
      payload,
    }),
  })

  const rawText = await response.text()

  let body = null

  try {
    body = JSON.parse(rawText)
  } catch {
    body = {
      ok: false,
      error: `Google Apps Script returned non-JSON response: ${rawText.slice(0, 500)}`,
    }
  }

  if (!response.ok || body?.ok !== true) {
    throw new Error(
      body?.error ||
        body?.message ||
        `Google Sheet backup gagal HTTP ${response.status}`
    )
  }

  return body
}

async function getBackupRowsForBilling() {
  const backupRows = []
  const counts = {}

  async function addTableRows({ supabaseTable, sheetTable, action }) {
    const { data, error } = await supabaseAdmin
      .from(supabaseTable)
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error

    const rows = data || []
    counts[sheetTable] = rows.length

    for (const row of rows) {
      backupRows.push({
        table: sheetTable,
        action,
        payload: row,
      })
    }
  }

  await addTableRows({
    supabaseTable: 'ts_clients',
    sheetTable: 'clients',
    action: 'backup_client',
  })

  await addTableRows({
    supabaseTable: 'ts_client_services',
    sheetTable: 'services',
    action: 'backup_service',
  })

  await addTableRows({
    supabaseTable: 'ts_billing_invoices',
    sheetTable: 'invoices',
    action: 'backup_invoice',
  })

  await addTableRows({
    supabaseTable: 'ts_billing_invoice_items',
    sheetTable: 'invoice_items',
    action: 'backup_invoice_item',
  })

  await addTableRows({
    supabaseTable: 'ts_payment_confirmations',
    sheetTable: 'payments',
    action: 'backup_payment',
  })

  backupRows.push({
    table: 'logs',
    action: 'backup_billing_data_done',
    payload: {
      source: 'api/admin-payments',
      counts,
      total_rows: backupRows.length,
      backed_up_at: new Date().toISOString(),
    },
  })

  return {
    rows: backupRows,
    counts,
  }
}

async function handleBackupBillingData(req, res, user) {
  const body = parseBody(req)
  const mode = body.mode || 'full'

  if (mode === 'test') {
    const result = await postGoogleSheetBackup({
      table: 'logs',
      action: 'test_backup_from_admin_portal',
      payload: {
        source: 'api/admin-payments',
        admin_email: user.email,
        tested_at: new Date().toISOString(),
      },
    })

    return res.status(200).json({
      ok: true,
      mode,
      message: 'Test backup berhasil dikirim ke Google Sheet.',
      result,
    })
  }

  if (mode === 'single') {
    const table = body.table || 'logs'
    const action = body.backup_action || body.backupAction || 'single_backup'
    const payload = body.payload || {}

    const result = await postGoogleSheetBackup({
      table,
      action,
      payload: {
        ...payload,
        backed_up_by: user.email,
        backed_up_at: new Date().toISOString(),
      },
    })

    return res.status(200).json({
      ok: true,
      mode,
      message: 'Single backup berhasil dikirim ke Google Sheet.',
      result,
    })
  }

  const backupData = await getBackupRowsForBilling()

  const result = await postGoogleSheetBackup({
    table: 'logs',
    action: 'backup_billing_data_batch',
    payload: {
      rows: backupData.rows,
    },
  })

  return res.status(200).json({
    ok: true,
    mode: 'full',
    message: 'Backup billing data berhasil dikirim ke Google Sheet.',
    counts: backupData.counts,
    total_rows: backupData.rows.length,
    result,
  })
}

async function sendFonnteMessage({ target, message }) {
  if (!fonnteToken) {
    throw new Error('FONNTE_TOKEN belum diset di Vercel Environment Variables.')
  }

  const form = new URLSearchParams()
  form.set('target', target)
  form.set('message', message)

  const response = await fetch('https://api.fonnte.com/send', {
    method: 'POST',
    headers: {
      Authorization: fonnteToken,
    },
    body: form,
  })

  const rawText = await response.text()

  let responseBody = null

  try {
    responseBody = JSON.parse(rawText)
  } catch {
    responseBody = {
      raw: rawText,
    }
  }

  if (!response.ok) {
    throw new Error(
      responseBody?.reason ||
        responseBody?.message ||
        `Fonnte error HTTP ${response.status}`
    )
  }

  if (
    responseBody &&
    (responseBody.status === false ||
      responseBody.status === 'false')
  ) {
    throw new Error(
      responseBody.reason ||
        responseBody.message ||
        'Fonnte menolak pengiriman pesan.'
    )
  }

  return {
    statusCode: response.status,
    body: responseBody,
  }
}

async function handleSendInvoiceWhatsApp(req, res, user) {
  const body = parseBody(req)
  const invoiceId = body.invoice_id || body.invoiceId

  if (!invoiceId) {
    return res.status(400).json({
      ok: false,
      error: 'invoice_id wajib dikirim.',
    })
  }

  const {
    data: invoice,
    error: invoiceError,
  } = await supabaseAdmin
    .from('ts_billing_invoices')
    .select(
      `
        id,
        invoice_no,
        token,
        client_id,
        total_amount,
        period_start,
        period_end,
        due_date,
        grace_until,
        status,
        sent_at,
        notes
      `
    )
    .eq('id', invoiceId)
    .maybeSingle()

  if (invoiceError) throw invoiceError

  if (!invoice) {
    return res.status(404).json({
      ok: false,
      error: 'Invoice tidak ditemukan.',
    })
  }

  if (invoice.status === 'paid') {
    return res.status(400).json({
      ok: false,
      error: 'Invoice sudah paid, tidak perlu dikirim ulang sebagai tagihan.',
    })
  }

  const {
    data: client,
    error: clientError,
  } = await supabaseAdmin
    .from('ts_clients')
    .select(
      `
        id,
        client_name,
        whatsapp,
        email
      `
    )
    .eq('id', invoice.client_id)
    .maybeSingle()

  if (clientError) throw clientError

  if (!client) {
    return res.status(404).json({
      ok: false,
      error: 'Client invoice tidak ditemukan.',
    })
  }

  const phone = normalizeWhatsApp(client.whatsapp)

  if (!phone) {
    return res.status(400).json({
      ok: false,
      error: 'Nomor WhatsApp client kosong / tidak valid.',
    })
  }

  const invoiceLink = `${billingBaseUrl}/pay/${invoice.token}`

  const message = buildInvoiceMessage({
    invoice,
    client,
    invoiceLink,
  })

  const fonnteResult = await sendFonnteMessage({
    target: phone,
    message,
  })

  const sentAt = new Date().toISOString()

  const updatedNotes = [
    invoice.notes || '',
    `Invoice sent via Fonnte by ${user.email} at ${sentAt}`,
  ]
    .filter(Boolean)
    .join('\n')

  const {
    data: updatedInvoice,
    error: updateError,
  } = await supabaseAdmin
    .from('ts_billing_invoices')
    .update({
      status: 'unpaid',
      sent_at: sentAt,
      updated_at: sentAt,
      notes: updatedNotes,
    })
    .eq('id', invoice.id)
    .select(
      `
        id,
        invoice_no,
        token,
        client_id,
        total_amount,
        period_start,
        period_end,
        due_date,
        grace_until,
        status,
        sent_at
      `
    )
    .maybeSingle()

  if (updateError) throw updateError

  return res.status(200).json({
    ok: true,
    message: `Invoice ${invoice.invoice_no} berhasil dikirim via Fonnte.`,
    invoice: {
      ...updatedInvoice,
      invoice_link: invoiceLink,
    },
    client: {
      id: client.id,
      client_name: client.client_name,
      whatsapp: client.whatsapp,
      normalized_whatsapp: phone,
    },
    fonnte: fonnteResult,
  })
}

async function handleGetPayments(req, res) {
  const {
    data: confirmations,
    error: confirmationError,
  } = await supabaseAdmin
    .from('ts_payment_confirmations')
    .select(
      `
        id,
        invoice_id,
        client_id,
        slip_url,
        amount_claimed,
        payment_note,
        status,
        uploaded_at,
        created_at
      `
    )
    .eq('status', 'waiting_verification')
    .order('uploaded_at', {
      ascending: false,
    })

  if (confirmationError) {
    throw confirmationError
  }

  if (!confirmations?.length) {
    return res.status(200).json({
      ok: true,
      payments: [],
    })
  }

  const invoiceIds = [
    ...new Set(
      confirmations
        .map((item) => item.invoice_id)
        .filter(Boolean)
    ),
  ]

  const clientIds = [
    ...new Set(
      confirmations
        .map((item) => item.client_id)
        .filter(Boolean)
    ),
  ]

  const {
    data: invoices,
    error: invoiceError,
  } = await supabaseAdmin
    .from('ts_billing_invoices')
    .select(
      `
        id,
        invoice_no,
        token,
        client_id,
        total_amount,
        period_start,
        period_end,
        due_date,
        grace_until,
        status
      `
    )
    .in('id', invoiceIds)

  if (invoiceError) {
    throw invoiceError
  }

  const {
    data: clients,
    error: clientError,
  } = await supabaseAdmin
    .from('ts_clients')
    .select(
      `
        id,
        client_name,
        whatsapp,
        email
      `
    )
    .in('id', clientIds)

  if (clientError) {
    throw clientError
  }

  const invoiceMap = new Map(
    (invoices || []).map((invoice) => [
      invoice.id,
      invoice,
    ])
  )

  const clientMap = new Map(
    (clients || []).map((client) => [
      client.id,
      client,
    ])
  )

  const payments = await Promise.all(
    confirmations.map(async (confirmation) => {
      const invoice =
        invoiceMap.get(confirmation.invoice_id) || null

      const client =
        clientMap.get(confirmation.client_id) || null

      let signedSlipUrl = null
      let slipError = null

      if (confirmation.slip_url) {
        const {
          data: signedData,
          error: signedError,
        } = await supabaseAdmin.storage
          .from('ts-billing-slips')
          .createSignedUrl(
            confirmation.slip_url,
            15 * 60
          )

        if (signedError) {
          slipError = signedError.message
        } else {
          signedSlipUrl = signedData.signedUrl
        }
      }

      return {
        confirmationId: confirmation.id,
        amountClaimed: confirmation.amount_claimed,
        paymentNote: confirmation.payment_note,
        uploadedAt: confirmation.uploaded_at,
        slipPath: confirmation.slip_url,
        slipUrl: signedSlipUrl,
        slipError,

        invoice: invoice
          ? {
              id: invoice.id,
              invoiceNo: invoice.invoice_no,
              token: invoice.token,
              totalAmount: invoice.total_amount,
              periodStart: invoice.period_start,
              periodEnd: invoice.period_end,
              dueDate: invoice.due_date,
              graceUntil: invoice.grace_until,
              status: invoice.status,
            }
          : null,

        client: client
          ? {
              id: client.id,
              name: client.client_name,
              whatsapp: client.whatsapp,
              email: client.email,
            }
          : null,
      }
    })
  )

  return res.status(200).json({
    ok: true,
    payments,
  })
}

export default async function handler(req, res) {
  try {
    const user = await verifyAdmin(req)

    if (req.method === 'GET') {
      return handleGetPayments(req, res)
    }

    if (req.method === 'POST') {
      const body = parseBody(req)

      if (body.action === 'send_invoice_whatsapp') {
        return handleSendInvoiceWhatsApp(req, res, user)
      }

      if (body.action === 'backup_billing_data') {
        return handleBackupBillingData(req, res, user)
      }
      
      return res.status(400).json({
        ok: false,
        error: 'Action POST tidak dikenal.',
      })
    }

    return res.status(405).json({
      ok: false,
      error: 'Only GET and POST requests are allowed.',
    })
  } catch (error) {
    console.error('ADMIN_PAYMENTS_ERROR:', error)

    if (error.message === 'UNAUTHORIZED') {
      return res.status(401).json({
        ok: false,
        error: 'Silakan login sebagai admin.',
      })
    }

    if (error.message === 'FORBIDDEN') {
      return res.status(403).json({
        ok: false,
        error:
          'Akun ini tidak memiliki akses admin.',
      })
    }

    return res.status(500).json({
      ok: false,
      error:
        error.message ||
        'Gagal memproses admin payments.',
    })
  }
}
