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

function getAllowedAdminEmails() {
  return String(process.env.BILLING_ADMIN_EMAIL || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
}

async function verifyAdmin(req) {
  const authorization = String(
    req.headers.authorization || ''
  )

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

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      ok: false,
      error: 'Only GET requests are allowed.',
    })
  }

  try {
    await verifyAdmin(req)

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
  } catch (error) {
    console.error(
      'ADMIN_PAYMENTS_ERROR:',
      error
    )

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
        'Gagal memuat daftar pembayaran.',
    })
  }
}
