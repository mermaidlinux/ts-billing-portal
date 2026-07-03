import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

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
      fileName,
      contentType,
    } = req.body || {}

    if (!invoiceToken || !fileName || !contentType) {
      return res.status(400).json({
        ok: false,
        error: 'Data upload belum lengkap.',
      })
    }

    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'application/pdf',
    ]

    if (!allowedTypes.includes(contentType)) {
      return res.status(400).json({
        ok: false,
        error: 'File harus JPG, PNG, atau PDF.',
      })
    }

    const { data: invoice, error: invoiceError } =
      await supabaseAdmin
        .from('ts_billing_invoices')
        .select('id, status')
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

    if (
      invoice.status === 'paid' ||
      invoice.status === 'cancelled'
    ) {
      return res.status(400).json({
        ok: false,
        error: 'Invoice ini tidak menerima upload pembayaran.',
      })
    }

    const extensionByType = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'application/pdf': 'pdf',
    }

    const extension = extensionByType[contentType]

    const storagePath =
      `${invoice.id}/${Date.now()}-${randomUUID()}.${extension}`

    const { data: uploadData, error: uploadError } =
      await supabaseAdmin.storage
        .from('ts-billing-slips')
        .createSignedUploadUrl(storagePath)

    if (uploadError) {
      throw uploadError
    }

    return res.status(200).json({
      ok: true,
      storagePath,
      uploadToken: uploadData.token,
    })
  } catch (error) {
    console.error('CREATE_UPLOAD_URL_ERROR:', error)

    return res.status(500).json({
      ok: false,
      error: error.message || 'Gagal menyiapkan upload.',
    })
  }
}
