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

const REJECT_REASONS = {
  nominal_kurang:
    'Nominal pembayaran yang diterima masih kurang dari total tagihan.',

  nominal_tidak_sesuai:
    'Nominal pembayaran belum sesuai dengan total invoice.',

  bukti_tidak_jelas:
    'Bukti transfer kurang jelas sehingga detail transaksi belum dapat dibaca.',

  bukti_terpotong:
    'Bukti transfer terpotong sehingga informasi transaksi belum lengkap.',

  rekening_tujuan_tidak_sesuai:
    'Pembayaran tercatat ke rekening tujuan yang tidak sesuai.',

  transaksi_pending:
    'Status transaksi pada bukti pembayaran masih pending atau belum berhasil.',

  tanggal_tidak_sesuai:
    'Tanggal transaksi pada bukti pembayaran belum sesuai dengan periode invoice.',

  invoice_lain:
    'Bukti pembayaran yang dikirim terhubung dengan invoice lain.',

  bukti_duplikat:
    'Bukti pembayaran yang sama sudah pernah digunakan sebelumnya.',

  lainnya:
    'Pembayaran belum dapat diverifikasi berdasarkan hasil pemeriksaan admin.',
}

function cleanWaNumber(value) {
  return String(value || '')
    .replace(/\+/g, '')
    .replace(/\s/g, '')
    .replace(/-/g, '')
    .trim()
}

function formatRupiah(value) {
  const amount = Number(value || 0)

  return `Rp${amount.toLocaleString('id-ID')}`
}

function formatPeriod(startDate, endDate) {
  if (!startDate && !endDate) return '-'
  if (!endDate) return startDate

  return `${startDate} s/d ${endDate}`
}

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

async function sendFonnteMessage(target, message) {
  const token = process.env.FONNTE_TOKEN
  const cleanTarget = cleanWaNumber(target)

  if (!token) {
    throw new Error('FONNTE_TOKEN belum tersedia di Vercel.')
  }

  if (!cleanTarget) {
    throw new Error('Nomor WhatsApp client kosong.')
  }

  const payload = new URLSearchParams()

  payload.set('target', cleanTarget)
  payload.set('message', message)
  payload.set('countryCode', '0')

  const response = await fetch('https://api.fonnte.com/send', {
    method: 'POST',
    headers: {
      Authorization: token,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: payload,
  })

  const responseText = await response.text()

  if (!response.ok) {
    throw new Error(
      `Fonnte HTTP ${response.status}: ${responseText}`
    )
  }

  return responseText
}

function buildApprovedMessage(invoice, clientName) {
  return `Halo Kak ${clientName} 👋

Pembayaran untuk invoice ${invoice.invoice_no} sebesar ${formatRupiah(
    invoice.total_amount
  )} telah kami terima dan berhasil diverifikasi.

✅ Status pembayaran: LUNAS
📅 Periode layanan: ${formatPeriod(
    invoice.period_start,
    invoice.period_end
  )}
📌 Layanan Anda tetap aktif.

Terima kasih atas pembayaran dan kepercayaannya kepada TERNAKSUKSES.

—
TERNAKSUKSES Billing`
}

function buildRejectedMessage({
  invoice,
  clientName,
  rejectionMessage,
}) {
  const baseUrl =
    process.env.BILLING_BASE_URL ||
    'https://ts-billing-portal.vercel.app'

  const invoiceLink = `${baseUrl}/pay/${invoice.token}`

  return `Halo Kak ${clientName} 👋

Terima kasih, bukti pembayaran untuk invoice ${invoice.invoice_no} sudah kami periksa.

Saat ini pembayaran belum dapat kami verifikasi karena:

${rejectionMessage}

Silakan periksa kembali pembayaran Anda, lalu unggah ulang bukti transfer melalui link berikut:

${invoiceLink}

Jika membutuhkan bantuan, silakan hubungi Admin. Kami siap membantu.

—
TERNAKSUKSES Billing`
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      ok: false,
      error: 'Only POST requests are allowed.',
    })
  }

  try {
    const adminUser = await verifyAdmin(req)

    const {
      confirmationId,
      action,
      rejectReason,
      rejectNote,
    } = req.body || {}

    if (!confirmationId) {
      return res.status(400).json({
        ok: false,
        error: 'Confirmation ID belum tersedia.',
      })
    }

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({
        ok: false,
        error: 'Action harus approve atau reject.',
      })
    }

    const {
      data: confirmation,
      error: confirmationError,
    } = await supabaseAdmin
      .from('ts_payment_confirmations')
      .select(
        'id, invoice_id, client_id, status, payment_note'
      )
      .eq('id', confirmationId)
      .maybeSingle()

    if (confirmationError) {
      throw confirmationError
    }

    if (!confirmation) {
      return res.status(404).json({
        ok: false,
        error: 'Konfirmasi pembayaran tidak ditemukan.',
      })
    }

    if (confirmation.status !== 'waiting_verification') {
      return res.status(400).json({
        ok: false,
        error:
          'Konfirmasi pembayaran ini sudah pernah diproses.',
      })
    }

    const { data: invoice, error: invoiceError } =
      await supabaseAdmin
        .from('ts_billing_invoices')
        .select(
          `
            id,
            invoice_no,
            token,
            total_amount,
            period_start,
            period_end,
            status,
            client_id,
            ts_clients (
              client_name,
              whatsapp
            )
          `
        )
        .eq('id', confirmation.invoice_id)
        .maybeSingle()

    if (invoiceError) {
      throw invoiceError
    }

    if (!invoice) {
      return res.status(404).json({
        ok: false,
        error: 'Invoice tidak ditemukan.',
      })
    }

    const clientName =
      invoice.ts_clients?.client_name || 'Client'

    const whatsapp =
      invoice.ts_clients?.whatsapp || ''

    const now = new Date().toISOString()

    let whatsappMessage = ''
    let resultStatus = ''

    if (action === 'approve') {
      const { error: approveError } = await supabaseAdmin
        .from('ts_payment_confirmations')
        .update({
          status: 'approved',
          approved_at: now,
          approved_by: adminUser.email,
        })
        .eq('id', confirmation.id)

      if (approveError) {
        throw approveError
      }

      const { error: invoiceUpdateError } =
        await supabaseAdmin
          .from('ts_billing_invoices')
          .update({
            status: 'paid',
            paid_at: now,
            updated_at: now,
          })
          .eq('id', invoice.id)

      if (invoiceUpdateError) {
        throw invoiceUpdateError
      }

      whatsappMessage = buildApprovedMessage(
        invoice,
        clientName
      )

      resultStatus = 'paid'
    }

    if (action === 'reject') {
      const standardReason =
        REJECT_REASONS[rejectReason] ||
        REJECT_REASONS.lainnya

      const customNote = String(rejectNote || '').trim()

      const rejectionMessage = customNote
        ? `${standardReason}

Catatan admin:
${customNote}`
        : standardReason

      const existingNote = String(
        confirmation.payment_note || ''
      ).trim()

      const updatedPaymentNote = [
        existingNote,
        `Ditolak admin: ${rejectionMessage}`,
      ]
        .filter(Boolean)
        .join('\n\n')

      const { error: rejectError } = await supabaseAdmin
        .from('ts_payment_confirmations')
        .update({
          status: 'rejected',
          payment_note: updatedPaymentNote,
          approved_at: null,
          approved_by: adminUser.email,
        })
        .eq('id', confirmation.id)

      if (rejectError) {
        throw rejectError
      }

      const { error: invoiceUpdateError } =
        await supabaseAdmin
          .from('ts_billing_invoices')
          .update({
            status: 'draft',
            submitted_at: null,
            updated_at: now,
          })
          .eq('id', invoice.id)

      if (invoiceUpdateError) {
        throw invoiceUpdateError
      }

      whatsappMessage = buildRejectedMessage({
        invoice,
        clientName,
        rejectionMessage,
      })

      resultStatus = 'draft'
    }

    let notificationSent = false
    let notificationError = null

    try {
      await sendFonnteMessage(
        whatsapp,
        whatsappMessage
      )

      notificationSent = true
    } catch (sendError) {
      console.error(
        'FONNTE_NOTIFICATION_ERROR:',
        sendError
      )

      notificationError = sendError.message
    }

    return res.status(200).json({
      ok: true,
      action,
      invoiceStatus: resultStatus,
      notificationSent,
      notificationError,
      message:
        action === 'approve'
          ? 'Pembayaran disetujui.'
          : 'Pembayaran ditolak dan client dapat upload ulang.',
    })
  } catch (error) {
    console.error('REVIEW_PAYMENT_ERROR:', error)

    if (error.message === 'UNAUTHORIZED') {
      return res.status(401).json({
        ok: false,
        error: 'Silakan login sebagai admin.',
      })
    }

    if (error.message === 'FORBIDDEN') {
      return res.status(403).json({
        ok: false,
        error: 'Akun ini tidak memiliki akses admin.',
      })
    }

    return res.status(500).json({
      ok: false,
      error:
        error.message ||
        'Gagal memproses konfirmasi pembayaran.',
    })
  }
}
