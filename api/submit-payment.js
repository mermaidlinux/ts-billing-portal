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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      ok: false,
      error: 'Only POST requests are allowed.',
    })
  }

  try {
    const {
      invoiceToken,
      storagePath,
      amountClaimed,
      paymentNote,
    } = req.body || {}

    if (!invoiceToken || !storagePath) {
      return res.status(400).json({
        ok: false,
        error: 'Token invoice atau bukti pembayaran belum lengkap.',
      })
    }

    const { data: invoice, error: invoiceError } =
      await supabaseAdmin
        .from('ts_billing_invoices')
        .select('id, client_id, total_amount, status')
        .eq('token', invoiceToken)
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

    if (invoice.status === 'paid') {
      return res.status(400).json({
        ok: false,
        error: 'Invoice ini sudah dibayar.',
      })
    }

    if (invoice.status === 'cancelled') {
      return res.status(400).json({
        ok: false,
        error: 'Invoice ini sudah dibatalkan.',
      })
    }

    if (invoice.status === 'submitted') {
      return res.status(400).json({
        ok: false,
        error: 'Bukti pembayaran sudah pernah dikirim dan sedang diverifikasi.',
      })
    }

    const claimedAmount =
      Number(amountClaimed || invoice.total_amount || 0)

    const { data: confirmation, error: confirmationError } =
      await supabaseAdmin
        .from('ts_payment_confirmations')
        .insert({
          invoice_id: invoice.id,
          client_id: invoice.client_id,
          slip_url: storagePath,
          amount_claimed: claimedAmount,
          payment_note: String(paymentNote || '').trim() || null,
          status: 'waiting_verification',
          uploaded_at: new Date().toISOString(),
        })
        .select('id')
        .single()

    if (confirmationError) {
      throw confirmationError
    }

    const { error: updateError } =
      await supabaseAdmin
        .from('ts_billing_invoices')
        .update({
          status: 'submitted',
          submitted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', invoice.id)

    if (updateError) {
      throw updateError
    }

    return res.status(200).json({
      ok: true,
      confirmationId: confirmation.id,
      status: 'submitted',
      message: 'Bukti pembayaran berhasil dikirim dan menunggu verifikasi.',
    })
  } catch (error) {
    console.error('SUBMIT_PAYMENT_ERROR:', error)

    return res.status(500).json({
      ok: false,
      error: error.message || 'Gagal mencatat pembayaran.',
    })
  }
}
