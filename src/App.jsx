import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

const STORAGE_BUCKET = 'ts-billing-slips'
const MAX_FILE_SIZE = 10 * 1024 * 1024

function formatRupiah(value) {
  const num = Number(value || 0)
  return 'Rp' + num.toLocaleString('id-ID')
}

function getTokenFromPath() {
  const parts = window.location.pathname.split('/').filter(Boolean)

  if (parts[0] === 'pay' && parts[1]) {
    return parts[1]
  }

  return null
}

function getStatusLabel(status) {
  switch (String(status || '').toLowerCase()) {
    case 'paid':
      return '🟢 Sudah Dibayar'

    case 'submitted':
      return '🟡 Menunggu Verifikasi'

    case 'overdue':
      return '🔴 Jatuh Tempo'

    case 'suspended':
      return '🔴 Fasilitas Dihentikan'

    case 'cancelled':
      return '⚫ Dibatalkan'

    case 'draft':
    case 'sent':
    default:
      return '🟠 Menunggu Pembayaran'
  }
}

async function readJsonResponse(response) {
  const text = await response.text()

  try {
    return text ? JSON.parse(text) : {}
  } catch {
    return {
      ok: false,
      error: text || 'Respons server tidak valid.',
    }
  }
}

export default function App() {
  const token = useMemo(() => getTokenFromPath(), [])

  const [loading, setLoading] = useState(Boolean(token))
  const [error, setError] = useState('')
  const [invoice, setInvoice] = useState(null)
  const [items, setItems] = useState([])

  const [uploadFile, setUploadFile] = useState(null)
  const [paymentNote, setPaymentNote] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [uploadSuccess, setUploadSuccess] = useState('')
  const [copyNotice, setCopyNotice] = useState('')
  const [fileInputKey, setFileInputKey] = useState(0)

  useEffect(() => {
    async function loadInvoice() {
      if (!token) return

      setLoading(true)
      setError('')

      const { data: inv, error: invError } = await supabase
        .from('ts_billing_invoices')
        .select('*, ts_clients(client_name, whatsapp, email)')
        .eq('token', token)
        .maybeSingle()

      if (invError) {
        setError(invError.message)
        setLoading(false)
        return
      }

      if (!inv) {
        setError('Invoice tidak ditemukan atau link tidak valid.')
        setLoading(false)
        return
      }

      const { data: invoiceItems, error: itemError } = await supabase
        .from('ts_billing_invoice_items')
        .select('*')
        .eq('invoice_id', inv.id)
        .order('created_at', { ascending: true })

      if (itemError) {
        setError(itemError.message)
        setLoading(false)
        return
      }

      setInvoice(inv)
      setItems(invoiceItems || [])
      setLoading(false)
    }

    loadInvoice()
  }, [token])

  async function copyText(text, successMessage) {
    try {
      await navigator.clipboard.writeText(text)
      setCopyNotice(successMessage)

      window.setTimeout(() => {
        setCopyNotice('')
      }, 2500)
    } catch {
      setCopyNotice('Gagal menyalin. Silakan salin secara manual.')
    }
  }

  function handleFileChange(event) {
    const selectedFile = event.target.files?.[0] || null

    setUploadError('')
    setUploadSuccess('')

    if (!selectedFile) {
      setUploadFile(null)
      return
    }

    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'application/pdf',
    ]

    if (!allowedTypes.includes(selectedFile.type)) {
      setUploadFile(null)
      setUploadError('File harus berupa JPG, PNG, atau PDF.')
      setFileInputKey((current) => current + 1)
      return
    }

    if (selectedFile.size > MAX_FILE_SIZE) {
      setUploadFile(null)
      setUploadError('Ukuran file maksimal 10 MB.')
      setFileInputKey((current) => current + 1)
      return
    }

    setUploadFile(selectedFile)
  }

  async function handleSubmitPayment(event) {
    event.preventDefault()

    if (!invoice || !token) {
      setUploadError('Data invoice belum tersedia.')
      return
    }

    if (!uploadFile) {
      setUploadError('Silakan pilih bukti transfer terlebih dahulu.')
      return
    }

    setUploading(true)
    setUploadError('')
    setUploadSuccess('')

    try {
      const prepareResponse = await fetch('/api/create-upload-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          invoiceToken: token,
          fileName: uploadFile.name,
          contentType: uploadFile.type,
        }),
      })

      const prepareResult = await readJsonResponse(prepareResponse)

      if (!prepareResponse.ok || !prepareResult.ok) {
        throw new Error(
          prepareResult.error || 'Gagal menyiapkan upload bukti transfer.'
        )
      }

      const { error: storageError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .uploadToSignedUrl(
          prepareResult.storagePath,
          prepareResult.uploadToken,
          uploadFile,
          {
            contentType: uploadFile.type,
          }
        )

      if (storageError) {
        throw storageError
      }

      const submitResponse = await fetch('/api/submit-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          invoiceToken: token,
          storagePath: prepareResult.storagePath,
          amountClaimed: Number(invoice.total_amount || 0),
          paymentNote: paymentNote.trim(),
        }),
      })

      const submitResult = await readJsonResponse(submitResponse)

      if (!submitResponse.ok || !submitResult.ok) {
        throw new Error(
          submitResult.error || 'Gagal mencatat konfirmasi pembayaran.'
        )
      }

      setInvoice((currentInvoice) => ({
        ...currentInvoice,
        status: 'submitted',
        submitted_at: new Date().toISOString(),
      }))

      setUploadFile(null)
      setPaymentNote('')
      setFileInputKey((current) => current + 1)

      setUploadSuccess(
        'Bukti pembayaran berhasil dikirim dan sedang menunggu verifikasi admin.'
      )
    } catch (submitError) {
      setUploadError(
        submitError.message || 'Terjadi kesalahan saat mengirim pembayaran.'
      )
    } finally {
      setUploading(false)
    }
  }

  if (!token) {
    return (
      <main className="page">
        <section className="card center">
          <h1>TERNAKSUKSES Billing</h1>
          <p>Silakan buka link invoice yang dikirim oleh admin.</p>
        </section>
      </main>
    )
  }

  if (loading) {
    return (
      <main className="page">
        <section className="card center">
          <h1>TERNAKSUKSES Billing</h1>
          <p>Memuat invoice...</p>
        </section>
      </main>
    )
  }

  if (error) {
    return (
      <main className="page">
        <section className="card center">
          <h1>Invoice Error</h1>
          <p>{error}</p>
        </section>
      </main>
    )
  }

  const currentStatus = String(invoice.status || '').toLowerCase()

  const canUpload = ![
    'paid',
    'submitted',
    'cancelled',
    'suspended',
  ].includes(currentStatus)

  return (
    <main className="page">
      <section className="card">
        <div className="header">
          <div className="brandLeft">
            <img
              src="/logo-ternaksukses.png"
              className="brandLogo"
              alt="TERNAKSUKSES"
            />

            <div>
              <p className="eyebrow">TERNAKSUKSES</p>

              <h1 className="invoiceTitle">
                Invoice Pembayaran
              </h1>
            </div>
          </div>

          <span className={`badge ${currentStatus}`}>
            {getStatusLabel(currentStatus)}
          </span>
        </div>

        <div className="clientBox">
          <div className="helloText">
            Halo,
          </div>

          <div className="clientName">
            {invoice.ts_clients?.client_name || 'Client'} 👋
          </div>

          <p>Berikut detail tagihan Anda.</p>
        </div>

        <div className="metaGrid">
          <div>
            <span>Invoice</span>
            <strong>{invoice.invoice_no}</strong>
          </div>

          <div>
            <span>Periode</span>
            <strong>
              {invoice.period_start} s/d {invoice.period_end}
            </strong>
          </div>

          <div>
            <span>Due Date</span>
            <strong>{invoice.due_date}</strong>
          </div>

          <div>
            <span>Grace Until</span>
            <strong>{invoice.grace_until}</strong>
          </div>
        </div>

        <h2>Detail Tagihan</h2>

        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>Layanan</th>
                <th>Keterangan</th>
                <th className="right">Nominal</th>
              </tr>
            </thead>

            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.service_type}</td>
                  <td>{item.description}</td>
                  <td className="right">
                    {formatRupiah(item.amount)}
                  </td>
                </tr>
              ))}
            </tbody>

            <tfoot>
              <tr>
                <td colSpan="2">Total</td>
                <td className="right">
                  {formatRupiah(invoice.total_amount)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="paymentBox">
          <h2>Pembayaran</h2>

          <p>Silakan transfer ke:</p>

          <p>
            <strong>Bank BLU by BCA Digital</strong>
          </p>

          <div className="rekeningRow">
            <span>No. Rek:</span>

            <strong>001138111111</strong>

            <button
              type="button"
              className="copyButton"
              onClick={() =>
                copyText(
                  '001138111111',
                  'Nomor rekening berhasil disalin.'
                )
              }
              aria-label="Salin nomor rekening"
            >
              📋
            </button>
          </div>

          <p>
            a.n. <strong>Marlene</strong>
          </p>

          <button
            type="button"
            className="copyDetailButton"
            onClick={() =>
              copyText(
                `Bank BLU by BCA Digital
No. Rek: 001138111111
a.n. Marlene
Total: ${formatRupiah(invoice.total_amount)}
Invoice: ${invoice.invoice_no}`,
                'Detail pembayaran berhasil disalin.'
              )
            }
          >
            📋 Copy Semua Detail
          </button>

          {copyNotice && (
            <div className="copyNotice">
              {copyNotice}
            </div>
          )}
        </div>

        {currentStatus === 'paid' && (
          <div className="notice paymentDoneNotice">
            ✅ Pembayaran invoice ini sudah diterima dan diverifikasi.
          </div>
        )}

        {currentStatus === 'submitted' && (
          <div className="notice verificationNotice">
            🟡 Bukti pembayaran sudah dikirim dan sedang menunggu
            verifikasi admin.
          </div>
        )}

        {currentStatus === 'cancelled' && (
          <div className="notice cancelledNotice">
            Invoice ini sudah dibatalkan.
          </div>
        )}

        {currentStatus === 'suspended' && (
          <div className="notice cancelledNotice">
            Fasilitas dihentikan karena pembayaran melewati batas waktu.
            Silakan hubungi admin.
          </div>
        )}

        {canUpload && (
          <section className="uploadBox">
            <h2>Upload Bukti Transfer</h2>

            <p>
              Pilih bukti transfer dalam format JPG, PNG, atau PDF.
              Ukuran maksimal 10 MB.
            </p>

            <form
              className="uploadForm"
              onSubmit={handleSubmitPayment}
            >
              <label className="fileInputLabel">
                <span>
                  {uploadFile
                    ? 'Ganti Bukti Transfer'
                    : 'Pilih Bukti Transfer'}
                </span>

                <input
                  key={fileInputKey}
                  type="file"
                  className="fileInput"
                  accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
                  onChange={handleFileChange}
                  disabled={uploading}
                />
              </label>

              {uploadFile && (
                <div className="selectedFile">
                  📎 {uploadFile.name}
                  <span>
                    {(uploadFile.size / 1024 / 1024).toFixed(2)} MB
                  </span>
                </div>
              )}

              <label className="paymentNoteLabel">
                Catatan pembayaran
                <span> opsional</span>

                <textarea
                  className="paymentNoteInput"
                  value={paymentNote}
                  onChange={(event) =>
                    setPaymentNote(event.target.value)
                  }
                  placeholder="Contoh: Transfer dari rekening atas nama Franky."
                  rows="3"
                  maxLength="500"
                  disabled={uploading}
                />
              </label>

              {uploadError && (
                <div className="formError">
                  {uploadError}
                </div>
              )}

              {uploadSuccess && (
                <div className="formSuccess">
                  {uploadSuccess}
                </div>
              )}

              <button
                type="submit"
                className="submitPaymentButton"
                disabled={uploading || !uploadFile}
              >
                {uploading
                  ? 'Mengirim Bukti Pembayaran...'
                  : 'Kirim Bukti Pembayaran'}
              </button>
            </form>
          </section>
        )}

        <footer className="footer">
          <strong>TERNAKSUKSES</strong>

          <p>
            Terima kasih telah mempercayai sistem kami.
          </p>
        </footer>
      </section>
    </main>
  )
}
