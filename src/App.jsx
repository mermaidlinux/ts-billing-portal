import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import AdminNetwork from './AdminNetwork.jsx'
import AdminActivityLogs from './AdminActivityLogs.jsx'
import AdminShell from './AdminShell.jsx'
import AdminPsSettings from './AdminPsSettings.jsx'
import AdminPsRequests from './AdminPsRequests.jsx'

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

const STORAGE_BUCKET = 'ts-billing-slips'
const MAX_FILE_SIZE = 10 * 1024 * 1024

const REJECT_OPTIONS = [
  {
    value: 'nominal_kurang',
    label: 'Nominal pembayaran kurang',
  },
  {
    value: 'nominal_tidak_sesuai',
    label: 'Nominal pembayaran tidak sesuai invoice',
  },
  {
    value: 'bukti_tidak_jelas',
    label: 'Bukti transfer kurang jelas',
  },
  {
    value: 'bukti_terpotong',
    label: 'Bukti transfer terpotong',
  },
  {
    value: 'rekening_tujuan_tidak_sesuai',
    label: 'Rekening tujuan tidak sesuai',
  },
  {
    value: 'transaksi_pending',
    label: 'Transaksi masih pending',
  },
  {
    value: 'tanggal_tidak_sesuai',
    label: 'Tanggal transaksi tidak sesuai',
  },
  {
    value: 'invoice_lain',
    label: 'Pembayaran untuk invoice lain',
  },
  {
    value: 'bukti_duplikat',
    label: 'Bukti yang sama sudah pernah digunakan',
  },
  {
    value: 'lainnya',
    label: 'Alasan lainnya',
  },
]

function formatRupiah(value) {
  const number = Number(value || 0)

  return `Rp${number.toLocaleString('id-ID')}`
}

function formatDateTime(value) {
  if (!value) return '-'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function getTokenFromPath() {
  const parts = window.location.pathname
    .split('/')
    .filter(Boolean)

  if (parts[0] === 'pay' && parts[1]) {
    return parts[1]
  }

  return null
}

function isAdminPath() {
  return (
    window.location.pathname === '/admin' ||
    window.location.pathname.startsWith('/admin/')
  )
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

function InvoicePage() {
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

      const {
        data: invoiceData,
        error: invoiceError,
      } = await supabase
        .from('ts_billing_invoices')
        .select(
          '*, ts_clients(client_name, whatsapp, email)'
        )
        .eq('token', token)
        .maybeSingle()

      if (invoiceError) {
        setError(invoiceError.message)
        setLoading(false)
        return
      }

      if (!invoiceData) {
        setError(
          'Invoice tidak ditemukan atau link tidak valid.'
        )
        setLoading(false)
        return
      }

      const {
        data: invoiceItems,
        error: itemError,
      } = await supabase
        .from('ts_billing_invoice_items')
        .select('*')
        .eq('invoice_id', invoiceData.id)
        .order('created_at', {
          ascending: true,
        })

      if (itemError) {
        setError(itemError.message)
        setLoading(false)
        return
      }

      setInvoice(invoiceData)
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
      setCopyNotice(
        'Gagal menyalin. Silakan salin secara manual.'
      )
    }
  }

  function handleFileChange(event) {
    const selectedFile =
      event.target.files?.[0] || null

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
      setUploadError(
        'File harus berupa JPG, PNG, atau PDF.'
      )
      setFileInputKey((current) => current + 1)
      return
    }

    if (selectedFile.size > MAX_FILE_SIZE) {
      setUploadFile(null)
      setUploadError(
        'Ukuran file maksimal 10 MB.'
      )
      setFileInputKey((current) => current + 1)
      return
    }

    setUploadFile(selectedFile)
  }

  async function handleSubmitPayment(event) {
    event.preventDefault()

    if (!invoice || !token) {
      setUploadError(
        'Data invoice belum tersedia.'
      )
      return
    }

    if (!uploadFile) {
      setUploadError(
        'Silakan pilih bukti transfer terlebih dahulu.'
      )
      return
    }

    setUploading(true)
    setUploadError('')
    setUploadSuccess('')

    try {
      const prepareResponse = await fetch(
        '/api/create-upload-url',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            invoiceToken: token,
            fileName: uploadFile.name,
            contentType: uploadFile.type,
          }),
        }
      )

      const prepareResult =
        await readJsonResponse(prepareResponse)

      if (
        !prepareResponse.ok ||
        !prepareResult.ok
      ) {
        throw new Error(
          prepareResult.error ||
            'Gagal menyiapkan upload bukti transfer.'
        )
      }

      const { error: storageError } =
        await supabase.storage
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

      const submitResponse = await fetch(
        '/api/submit-payment',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            invoiceToken: token,
            storagePath:
              prepareResult.storagePath,
            amountClaimed: Number(
              invoice.total_amount || 0
            ),
            paymentNote: paymentNote.trim(),
          }),
        }
      )

      const submitResult =
        await readJsonResponse(submitResponse)

      if (
        !submitResponse.ok ||
        !submitResult.ok
      ) {
        throw new Error(
          submitResult.error ||
            'Gagal mencatat konfirmasi pembayaran.'
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
        submitError.message ||
          'Terjadi kesalahan saat mengirim pembayaran.'
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

          <p>
            Silakan buka link invoice yang dikirim
            oleh admin.
          </p>
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

  const currentStatus = String(
    invoice.status || ''
  ).toLowerCase()

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
              <p className="eyebrow">
                TERNAKSUKSES
              </p>

              <h1 className="invoiceTitle">
                Invoice Pembayaran
              </h1>
            </div>
          </div>

          <span
            className={`badge ${currentStatus}`}
          >
            {getStatusLabel(currentStatus)}
          </span>
        </div>

        <div className="clientBox">
          <div className="helloText">
            Halo,
          </div>

          <div className="clientName">
            {invoice.ts_clients?.client_name ||
              'Client'}{' '}
            👋
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
              {invoice.period_start} s/d{' '}
              {invoice.period_end}
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

                <th className="right">
                  Nominal
                </th>
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
                  {formatRupiah(
                    invoice.total_amount
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="paymentBox">
          <h2>Pembayaran</h2>

          <p>Silakan transfer ke:</p>

          <p>
            <strong>
              Bank BLU by BCA Digital
            </strong>
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
Total: ${formatRupiah(
                  invoice.total_amount
                )}
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

        {uploadSuccess && (
          <div className="formSuccess">
            {uploadSuccess}
          </div>
        )}

        {currentStatus === 'paid' && (
          <div className="notice paymentDoneNotice">
            ✅ Pembayaran invoice ini sudah
            diterima dan diverifikasi.
          </div>
        )}

        {currentStatus === 'submitted' && (
          <div className="notice verificationNotice">
            🟡 Bukti pembayaran sudah dikirim
            dan sedang menunggu verifikasi admin.
          </div>
        )}

        {currentStatus === 'cancelled' && (
          <div className="notice cancelledNotice">
            Invoice ini sudah dibatalkan.
          </div>
        )}

        {currentStatus === 'suspended' && (
          <div className="notice cancelledNotice">
            Fasilitas dihentikan karena pembayaran
            melewati batas waktu. Silakan hubungi
            admin.
          </div>
        )}

        {canUpload && (
          <section className="uploadBox">
            <h2>Upload Bukti Transfer</h2>

            <p>
              Pilih bukti transfer dalam format
              JPG, PNG, atau PDF. Ukuran maksimal
              10 MB.
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
                  <span>
                    📎 {uploadFile.name}
                  </span>

                  <span>
                    {(
                      uploadFile.size /
                      1024 /
                      1024
                    ).toFixed(2)}{' '}
                    MB
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
                    setPaymentNote(
                      event.target.value
                    )
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

              <button
                type="submit"
                className="submitPaymentButton"
                disabled={
                  uploading || !uploadFile
                }
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
            Terima kasih telah mempercayai sistem
            kami.
          </p>
        </footer>
      </section>
    </main>
  )
}

function AdminPage() {
  const [authLoading, setAuthLoading] =
    useState(true)

  const [session, setSession] =
    useState(null)

  const [email, setEmail] =
    useState('')

  const [password, setPassword] =
    useState('')

  const [loginLoading, setLoginLoading] =
    useState(false)

  const [loginError, setLoginError] =
    useState('')

  const [activeAdminMenu, setActiveAdminMenu] =
    useState('home')

  const [payments, setPayments] =
    useState([])

  const [
    paymentsLoading,
    setPaymentsLoading,
  ] = useState(false)

  const [paymentsError, setPaymentsError] =
    useState('')

  const [actionId, setActionId] =
    useState('')

  const [actionMessage, setActionMessage] =
    useState(null)

  const [
    rejectReasons,
    setRejectReasons,
  ] = useState({})

  const [
    rejectNotes,
    setRejectNotes,
  ] = useState({})

  useEffect(() => {
    let mounted = true

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return

        setSession(data.session || null)
        setAuthLoading(false)
      })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession)
        setAuthLoading(false)
      }
    )

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (session?.access_token) {
      loadPayments(session)
    } else {
      setPayments([])
    }
  }, [session])

  async function loadPayments(
    activeSession = session
  ) {
    if (!activeSession?.access_token) {
      return
    }

    setPaymentsLoading(true)
    setPaymentsError('')

    try {
      const response = await fetch(
        '/api/admin-payments',
        {
          method: 'GET',
          headers: {
            Authorization:
              `Bearer ${activeSession.access_token}`,
          },
        }
      )

      const result =
        await readJsonResponse(response)

      if (!response.ok || !result.ok) {
        throw new Error(
          result.error ||
            'Gagal memuat daftar pembayaran.'
        )
      }

      setPayments(result.payments || [])
    } catch (loadError) {
      setPaymentsError(
        loadError.message ||
          'Gagal memuat daftar pembayaran.'
      )
    } finally {
      setPaymentsLoading(false)
    }
  }

  async function handleLogin(event) {
    event.preventDefault()

    setLoginLoading(true)
    setLoginError('')

    const {
      data,
      error,
    } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (error) {
      setLoginError(
        error.message ||
          'Email atau password salah.'
      )
      setLoginLoading(false)
      return
    }

    setSession(data.session)
    setPassword('')
    setLoginLoading(false)
  }

  async function handleLogout() {
    await supabase.auth.signOut()

    setSession(null)
    setPayments([])
    setActionMessage(null)
  }

  async function callReviewEndpoint(
    payment,
    payload
  ) {
    if (!session?.access_token) {
      throw new Error(
        'Sesi admin sudah berakhir. Silakan login kembali.'
      )
    }

    const response = await fetch(
      '/api/review-payment',
      {
        method: 'POST',
        headers: {
          'Content-Type':
            'application/json',

          Authorization:
            `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          confirmationId:
            payment.confirmationId,
          ...payload,
        }),
      }
    )

    const result =
      await readJsonResponse(response)

    if (!response.ok || !result.ok) {
      throw new Error(
        result.error ||
          'Gagal memproses pembayaran.'
      )
    }

    return result
  }

  async function handleApprove(payment) {
    const clientName =
      payment.client?.name || 'Client'

    const confirmed = window.confirm(
      `Setujui pembayaran ${
        payment.invoice?.invoiceNo || ''
      } milik ${clientName}?\n\nInvoice akan berubah menjadi LUNAS dan WhatsApp akan dikirim.`
    )

    if (!confirmed) return

    setActionId(payment.confirmationId)
    setActionMessage(null)

    try {
      const result =
        await callReviewEndpoint(payment, {
          action: 'approve',
        })

      if (result.notificationSent) {
        setActionMessage({
          type: 'success',
          text:
            'Pembayaran berhasil disetujui dan WhatsApp lunas telah dikirim.',
        })
      } else {
        setActionMessage({
          type: 'warning',
          text:
            `Pembayaran sudah menjadi LUNAS, tetapi WhatsApp gagal dikirim: ${
              result.notificationError ||
              'Kesalahan tidak diketahui.'
            }`,
        })
      }

      await loadPayments(session)
    } catch (approveError) {
      setActionMessage({
        type: 'error',
        text:
          approveError.message ||
          'Gagal menyetujui pembayaran.',
      })
    } finally {
      setActionId('')
    }
  }

  async function handleReject(payment) {
    const confirmationId =
      payment.confirmationId

    const rejectReason =
      rejectReasons[confirmationId] || ''

    const rejectNote =
      rejectNotes[confirmationId] || ''

    if (!rejectReason) {
      setActionMessage({
        type: 'error',
        text:
          'Pilih alasan penolakan terlebih dahulu.',
      })
      return
    }

    const clientName =
      payment.client?.name || 'Client'

    const confirmed = window.confirm(
      `Tolak pembayaran ${
        payment.invoice?.invoiceNo || ''
      } milik ${clientName}?\n\nClient akan menerima WhatsApp dan dapat upload ulang.`
    )

    if (!confirmed) return

    setActionId(confirmationId)
    setActionMessage(null)

    try {
      const result =
        await callReviewEndpoint(payment, {
          action: 'reject',
          rejectReason,
          rejectNote: rejectNote.trim(),
        })

      if (result.notificationSent) {
        setActionMessage({
          type: 'success',
          text:
            'Pembayaran ditolak dan WhatsApp alasan penolakan telah dikirim.',
        })
      } else {
        setActionMessage({
          type: 'warning',
          text:
            `Pembayaran sudah ditolak dan client dapat upload ulang, tetapi WhatsApp gagal dikirim: ${
              result.notificationError ||
              'Kesalahan tidak diketahui.'
            }`,
        })
      }

      setRejectReasons((current) => {
        const next = { ...current }
        delete next[confirmationId]
        return next
      })

      setRejectNotes((current) => {
        const next = { ...current }
        delete next[confirmationId]
        return next
      })

      await loadPayments(session)
    } catch (rejectError) {
      setActionMessage({
        type: 'error',
        text:
          rejectError.message ||
          'Gagal menolak pembayaran.',
      })
    } finally {
      setActionId('')
    }
  }

  if (authLoading) {
    return (
      <main className="adminPage">
        <section className="adminLoginCard">
          <p>Memeriksa sesi admin...</p>
        </section>
      </main>
    )
  }

  if (!session) {
    return (
      <main className="adminPage">
        <section className="adminLoginCard">
          <div className="adminLoginBrand">
            <img
              src="/logo-ternaksukses.png"
              alt="TERNAKSUKSES"
            />

            <div>
              <p>TERNAKSUKSES</p>
              <h1>Billing Admin</h1>
            </div>
          </div>

          <p className="adminLoginDescription">
            Login untuk memeriksa dan
            memverifikasi pembayaran client.
          </p>

          <form
            className="adminLoginForm"
            onSubmit={handleLogin}
          >
            <label>
              Email Admin

              <input
                type="email"
                value={email}
                onChange={(event) =>
                  setEmail(event.target.value)
                }
                placeholder="Email admin"
                autoComplete="email"
                required
                disabled={loginLoading}
              />
            </label>

            <label>
              Password

              <input
                type="password"
                value={password}
                onChange={(event) =>
                  setPassword(
                    event.target.value
                  )
                }
                placeholder="Password admin"
                autoComplete="current-password"
                required
                disabled={loginLoading}
              />
            </label>

            {loginError && (
              <div className="adminAlert error">
                {loginError}
              </div>
            )}

            <button
              type="submit"
              className="adminPrimaryButton"
              disabled={loginLoading}
            >
              {loginLoading
                ? 'Sedang Login...'
                : 'Login Admin'}
            </button>
          </form>
        </section>
      </main>
    )
  }

  return (
    <AdminShell
      activeMenu={activeAdminMenu}
      onMenuChange={setActiveAdminMenu}
      adminName={session.user.email || 'TERNAKSUKSES Admin'}
    >
      {activeAdminMenu === 'home' && (
        <section className="adminContainer">
          <header className="adminHeader">
            <div className="adminHeaderBrand">
              <img
                src="/logo-ternaksukses.png"
                alt="TERNAKSUKSES"
              />

              <div>
                <p>TERNAKSUKSES</p>
                <h1>Billing Admin</h1>
              </div>
            </div>

            <div className="adminHeaderActions">
              <span>{session.user.email}</span>

              <button
                type="button"
                className="adminSecondaryButton"
                onClick={() =>
                  loadPayments(session)
                }
                disabled={paymentsLoading}
              >
                ↻ Refresh
              </button>

              <button
                type="button"
                className="adminLogoutButton"
                onClick={handleLogout}
              >
                Keluar
              </button>
            </div>
          </header>

          <div className="adminSummary">
            <div>
              <span>
                Menunggu Verifikasi
              </span>

              <strong>{payments.length}</strong>
            </div>

            <p>
              Pilih menu di kiri untuk membuka Jaringan,
              Invoice, Timeline, dan Setting. Sidebar bisa
              kamu kecilkan atau lebarkan.
            </p>
          </div>

          {actionMessage && (
            <div
              className={`adminAlert ${actionMessage.type}`}
            >
              {actionMessage.text}
            </div>
          )}

          {paymentsError && (
            <div className="adminAlert error">
              {paymentsError}
            </div>
          )}

          <div className="adminEmptyState">
            ✅ Dashboard sudah dipisah per menu. Klik
            <strong> Invoice </strong>
            untuk review pembayaran, klik
            <strong> Jaringan </strong>
            untuk struktur partner, dan klik
            <strong> Timeline </strong>
            untuk activity log.
          </div>
        </section>
      )}

      {activeAdminMenu === 'network' && (
        <AdminNetwork session={session} />
      )}

      {activeAdminMenu === 'timeline' && (
        <AdminActivityLogs session={session} />
      )}

      {activeAdminMenu === 'settings' && (
        <AdminPsSettings session={session} />
      )}

      {activeAdminMenu === 'ps_requests' && (
        <AdminPsRequests session={session} />
      )}
      
      {activeAdminMenu === 'invoice' && (
        <section className="adminContainer">
          <header className="adminHeader">
            <div className="adminHeaderBrand">
              <img
                src="/logo-ternaksukses.png"
                alt="TERNAKSUKSES"
              />

              <div>
                <p>TERNAKSUKSES</p>
                <h1>Invoice Review</h1>
              </div>
            </div>

            <div className="adminHeaderActions">
              <span>{session.user.email}</span>

              <button
                type="button"
                className="adminSecondaryButton"
                onClick={() =>
                  loadPayments(session)
                }
                disabled={paymentsLoading}
              >
                ↻ Refresh
              </button>

              <button
                type="button"
                className="adminLogoutButton"
                onClick={handleLogout}
              >
                Keluar
              </button>
            </div>
          </header>

          <div className="adminSummary">
            <div>
              <span>
                Menunggu Verifikasi
              </span>

              <strong>{payments.length}</strong>
            </div>

            <p>
              Periksa nominal, rekening tujuan,
              tanggal transaksi, dan kejelasan
              bukti pembayaran.
            </p>
          </div>

          {actionMessage && (
            <div
              className={`adminAlert ${actionMessage.type}`}
            >
              {actionMessage.text}
            </div>
          )}

          {paymentsError && (
            <div className="adminAlert error">
              {paymentsError}
            </div>
          )}

          {paymentsLoading && (
            <div className="adminEmptyState">
              Memuat pembayaran...
            </div>
          )}

          {!paymentsLoading &&
            !paymentsError &&
            payments.length === 0 && (
              <div className="adminEmptyState">
                ✅ Tidak ada pembayaran yang
                menunggu verifikasi.
              </div>
            )}

          {!paymentsLoading &&
            payments.map((payment) => {
              const isPdf = String(
                payment.slipPath || ''
              )
                .toLowerCase()
                .endsWith('.pdf')

              const isProcessing =
                actionId ===
                payment.confirmationId

              return (
                <article
                  className="adminPaymentCard"
                  key={payment.confirmationId}
                >
                  <div className="adminPaymentTop">
                    <div>
                      <p className="adminSmallLabel">
                        Client
                      </p>

                      <h2>
                        {payment.client?.name ||
                          'Client tidak ditemukan'}
                      </h2>

                      <p>
                        WhatsApp:{' '}
                        {payment.client?.whatsapp ||
                          '-'}
                      </p>
                    </div>

                    <div className="adminInvoiceAmount">
                      <span>
                        Total Invoice
                      </span>

                      <strong>
                        {formatRupiah(
                          payment.invoice
                            ?.totalAmount
                        )}
                      </strong>
                    </div>
                  </div>

                  <div className="adminPaymentGrid">
                    <div>
                      <span>Invoice</span>

                      <strong>
                        {payment.invoice
                          ?.invoiceNo || '-'}
                      </strong>
                    </div>

                    <div>
                      <span>
                        Nominal Diklaim
                      </span>

                      <strong>
                        {formatRupiah(
                          payment.amountClaimed
                        )}
                      </strong>
                    </div>

                    <div>
                      <span>Periode</span>

                      <strong>
                        {payment.invoice
                          ?.periodStart || '-'}{' '}
                        s/d{' '}
                        {payment.invoice
                          ?.periodEnd || '-'}
                      </strong>
                    </div>

                    <div>
                      <span>Dikirim</span>

                      <strong>
                        {formatDateTime(
                          payment.uploadedAt
                        )}
                      </strong>
                    </div>
                  </div>

                  {payment.paymentNote && (
                    <div className="adminClientNote">
                      <span>
                        Catatan Client
                      </span>

                      <p>
                        {payment.paymentNote}
                      </p>
                    </div>
                  )}

                  <div className="adminSlipSection">
                    <div className="adminSlipHeader">
                      <h3>
                        Bukti Transfer
                      </h3>

                      {payment.slipUrl && (
                        <a
                          href={payment.slipUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Buka Ukuran Penuh ↗
                        </a>
                      )}
                    </div>

                    {!payment.slipUrl && (
                      <div className="adminAlert error">
                        Bukti transfer tidak dapat
                        dibuka.
                        {payment.slipError
                          ? ` ${payment.slipError}`
                          : ''}
                      </div>
                    )}

                    {payment.slipUrl &&
                      isPdf && (
                        <a
                          className="adminPdfButton"
                          href={payment.slipUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          📄 Buka Bukti Transfer PDF
                        </a>
                      )}

                    {payment.slipUrl &&
                      !isPdf && (
                        <a
                          href={payment.slipUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="adminSlipImageLink"
                        >
                          <img
                            className="adminSlipImage"
                            src={payment.slipUrl}
                            alt="Bukti transfer client"
                          />
                        </a>
                      )}
                  </div>

                  <div className="adminReviewSection">
                    <h3>
                      Keputusan Admin
                    </h3>

                    <div className="adminApproveArea">
                      <p>
                        Pastikan pembayaran sudah
                        masuk dan seluruh data
                        transaksi sesuai.
                      </p>

                      <button
                        type="button"
                        className="adminApproveButton"
                        onClick={() =>
                          handleApprove(payment)
                        }
                        disabled={isProcessing}
                      >
                        {isProcessing
                          ? 'Memproses...'
                          : '✓ Approve Pembayaran'}
                      </button>
                    </div>

                    <div className="adminRejectArea">
                      <label>
                        Alasan Penolakan

                        <select
                          value={
                            rejectReasons[
                              payment.confirmationId
                            ] || ''
                          }
                          onChange={(event) =>
                            setRejectReasons(
                              (current) => ({
                                ...current,
                                [payment.confirmationId]:
                                  event.target.value,
                              })
                            )
                          }
                          disabled={isProcessing}
                        >
                          <option value="">
                            Pilih alasan
                          </option>

                          {REJECT_OPTIONS.map(
                            (option) => (
                              <option
                                key={option.value}
                                value={option.value}
                              >
                                {option.label}
                              </option>
                            )
                          )}
                        </select>
                      </label>

                      <label>
                        Catatan Tambahan
                        <span> opsional</span>

                        <textarea
                          value={
                            rejectNotes[
                              payment.confirmationId
                            ] || ''
                          }
                          onChange={(event) =>
                            setRejectNotes(
                              (current) => ({
                                ...current,
                                [payment.confirmationId]:
                                  event.target.value,
                              })
                            )
                          }
                          placeholder="Contoh: Nominal yang diterima Rp350.000. Masih kurang Rp50.000."
                          rows="3"
                          maxLength="500"
                          disabled={isProcessing}
                        />
                      </label>

                      <button
                        type="button"
                        className="adminRejectButton"
                        onClick={() =>
                          handleReject(payment)
                        }
                        disabled={isProcessing}
                      >
                        {isProcessing
                          ? 'Memproses...'
                          : '✕ Reject Pembayaran'}
                      </button>
                    </div>
                  </div>

                  {payment.invoice?.token && (
                    <a
                      className="adminInvoiceLink"
                      href={`/pay/${payment.invoice.token}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Buka Halaman Invoice Client ↗
                    </a>
                  )}
                </article>
              )
            })}
        </section>
      )}
    </AdminShell>
  )
}

export default function App() {
  if (isAdminPath()) {
    return <AdminPage />
  }

  return <InvoicePage />
}
