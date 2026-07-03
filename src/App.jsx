import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

function formatRupiah(value) {
  const num = Number(value || 0)
  return 'Rp' + num.toLocaleString('id-ID')
}

function getTokenFromPath() {
  const parts = window.location.pathname.split('/').filter(Boolean)
  if (parts[0] === 'pay' && parts[1]) return parts[1]
  return null
}

export default function App() {
  const token = useMemo(() => getTokenFromPath(), [])
  const [loading, setLoading] = useState(Boolean(token))
  const [error, setError] = useState('')
  const [invoice, setInvoice] = useState(null)
  const [items, setItems] = useState([])

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

  if (!token) {
    return (
      <main className="page">
        <section className="card center">
          <h1>TernakSukses Billing</h1>
          <p>Silakan buka link invoice yang dikirim oleh admin.</p>
        </section>
      </main>
    )
  }

  if (loading) {
    return (
      <main className="page">
        <section className="card center">
          <h1>TernakSukses Billing</h1>
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
        
          <span className={`badge ${invoice.status}`}>
          
            {invoice.status === "paid" && "🟢 Sudah Dibayar"}
          
            {invoice.status === "draft" && "🟠 Menunggu Pembayaran"}
          
            {invoice.status === "submitted" && "🟡 Menunggu Verifikasi"}
          
            {invoice.status === "overdue" && "🔴 Jatuh Tempo"}
          
          </span>
        
        </div>

        <div className="clientBox">
        
          <div className="helloText">
            Halo,
          </div>
        
          <div className="clientName">
            {invoice.ts_clients?.client_name || 'Client'} 👋
          </div>
        
          <p>
            Berikut detail tagihan Anda.
          </p>
        
        </div>

        <div className="metaGrid">
          <div><span>Invoice</span><strong>{invoice.invoice_no}</strong></div>
          <div><span>Periode</span><strong>{invoice.period_start} s/d {invoice.period_end}</strong></div>
          <div><span>Due Date</span><strong>{invoice.due_date}</strong></div>
          <div><span>Grace Until</span><strong>{invoice.grace_until}</strong></div>
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
                  <td className="right">{formatRupiah(item.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan="2">Total</td>
                <td className="right">{formatRupiah(invoice.total_amount)}</td>
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
        
            <span>No. Rek :</span>
        
            <strong>001138111111</strong>
        
            <button
              className="copyButton"
              onClick={() => {
        
                navigator.clipboard.writeText("001138111111")
        
                alert("Nomor rekening berhasil disalin.")
        
              }}
            >
              📋
            </button>
        
          </div>
        
          <p>
            a.n. <strong>Marlene</strong>
          </p>
        
          <button
            className="copyDetailButton"
            onClick={() => {
        
              navigator.clipboard.writeText(
        
        `Bank BLU by BCA Digital
        No. Rek : 001138111111
        a.n. Marlene`
        
              )
        
              alert("Detail pembayaran berhasil disalin.")
        
            }}
          >
        
            📋 Copy Semua Detail
        
          </button>
        
        </div>

        <div className="notice">
        
          Upload bukti transfer akan kita aktifkan pada step berikutnya.
        
        </div>
        
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
