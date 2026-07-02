import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, useParams } from "react-router-dom";
import { supabase } from "./supabaseClient";
import "./style.css";

const rupiah = (value) => "Rp" + Number(value || 0).toLocaleString("id-ID");

function PayPage() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [invoice, setInvoice] = useState(null);
  const [items, setItems] = useState([]);
  const [client, setClient] = useState(null);
  const [file, setFile] = useState(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    async function loadInvoice() {
      setLoading(true);
      setError("");

      const { data: inv, error: invError } = await supabase
        .from("ts_billing_invoices")
        .select("*")
        .eq("token", token)
        .maybeSingle();

      if (invError) {
        setError(invError.message);
        setLoading(false);
        return;
      }

      if (!inv) {
        setError("Invoice tidak ditemukan.");
        setLoading(false);
        return;
      }

      const [{ data: clientData }, { data: itemData }] = await Promise.all([
        supabase.from("ts_clients").select("*").eq("id", inv.client_id).maybeSingle(),
        supabase
          .from("ts_billing_invoice_items")
          .select("*")
          .eq("invoice_id", inv.id)
          .order("created_at", { ascending: true }),
      ]);

      setInvoice(inv);
      setClient(clientData);
      setItems(itemData || []);
      setLoading(false);
    }

    loadInvoice();
  }, [token]);

  const statusLabel = useMemo(() => {
    const map = {
      draft: "Menunggu Pembayaran",
      sent: "Menunggu Pembayaran",
      submitted: "Menunggu Verifikasi",
      paid: "Lunas",
      overdue: "Terlambat",
      suspended: "Ditangguhkan",
      cancelled: "Dibatalkan",
    };
    return map[invoice?.status] || invoice?.status || "-";
  }, [invoice]);

  async function handleSubmit(e) {
    e.preventDefault();

    if (!invoice || !client) return;
    if (!file) {
      setError("Mohon upload bukti transfer terlebih dahulu.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const ext = file.name.split(".").pop() || "jpg";
      const safeToken = token.replace(/[^a-zA-Z0-9]/g, "");
      const path = `${safeToken}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("ts-billing-slips")
        .upload(path, file, { cacheControl: "3600", upsert: false });

      if (uploadError) throw uploadError;

      const { data: signed } = await supabase.storage
        .from("ts-billing-slips")
        .createSignedUrl(path, 60 * 60 * 24 * 365);

      const { error: paymentError } = await supabase
        .from("ts_payment_confirmations")
        .insert({
          invoice_id: invoice.id,
          client_id: client.id,
          slip_url: signed?.signedUrl || path,
          amount_claimed: invoice.total_amount,
          payment_note: note || null,
          status: "waiting_verification",
        });

      if (paymentError) throw paymentError;

      const { error: invUpdateError } = await supabase
        .from("ts_billing_invoices")
        .update({ status: "submitted", submitted_at: new Date().toISOString() })
        .eq("id", invoice.id);

      if (invUpdateError) throw invUpdateError;

      setDone(true);
    } catch (err) {
      setError(err.message || "Gagal mengirim bukti pembayaran.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <main className="page"><section className="card"><p>Memuat invoice...</p></section></main>;

  if (error && !invoice) {
    return <main className="page"><section className="card"><h1>TernakSukses Billing</h1><p className="error">{error}</p></section></main>;
  }

  if (done) {
    return (
      <main className="page">
        <section className="card success">
          <h1>✅ Bukti Pembayaran Terkirim</h1>
          <p>Terima kasih, {client?.client_name || "Kak"}.</p>
          <p>Bukti transfer kamu sudah masuk dan akan diverifikasi oleh admin TernakSukses.</p>
          <p className="muted">Status invoice: Menunggu Verifikasi</p>
        </section>
      </main>
    );
  }

  return (
    <main className="page">
      <section className="card">
        <div className="brand">TERNAKSUKSES BILLING</div>
        <h1>Halo, {client?.client_name || "Kak"} 👋</h1>
        <p className="muted">Invoice: {invoice.invoice_no}</p>

        <div className="infoGrid">
          <div><span>Periode</span><b>{invoice.period_start} s/d {invoice.period_end}</b></div>
          <div><span>Due Date</span><b>{invoice.due_date}</b></div>
          <div><span>Status</span><b>{statusLabel}</b></div>
        </div>

        <h2>Detail Tagihan</h2>
        <div className="tableWrap">
          <table>
            <thead><tr><th>Layanan</th><th>Detail</th><th className="right">Nominal</th></tr></thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.service_type}</td>
                  <td>{item.description}</td>
                  <td className="right">{rupiah(item.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td colSpan="2">Total</td><td className="right">{rupiah(invoice.total_amount)}</td></tr></tfoot>
          </table>
        </div>

        <div className="bankBox">
          <b>Pembayaran melalui transfer ke:</b>
          <p>Bank BLU by BCA Digital</p>
          <p>No. Rek: <b>001138111111</b></p>
          <p>a.n. <b>Marlene</b></p>
        </div>

        {invoice.status === "paid" ? (
          <div className="paidBox">Invoice ini sudah lunas.</div>
        ) : (
          <form onSubmit={handleSubmit} className="form">
            <h2>Upload Bukti Transfer</h2>
            <input type="file" accept="image/*,.pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            <textarea placeholder="Catatan opsional" value={note} onChange={(e) => setNote(e.target.value)} />
            {error && <p className="error">{error}</p>}
            <button type="submit" disabled={submitting}>{submitting ? "Mengirim..." : "Kirim Bukti Pembayaran"}</button>
          </form>
        )}

        <p className="footer">TernakSukses Billing</p>
      </section>
    </main>
  );
}

function Home() {
  return <main className="page"><section className="card"><h1>TernakSukses Billing</h1><p>Silakan buka link invoice yang dikirim oleh admin.</p></section></main>;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/pay/:token" element={<PayPage />} />
      </Routes>
    </BrowserRouter>
  );
}

createRoot(document.getElementById("root")).render(<App />);
