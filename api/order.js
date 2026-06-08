const { Resend } = require('resend');

const resend      = new Resend(process.env.RESEND_API_KEY);
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const FROM_EMAIL  = process.env.FROM_EMAIL;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  const { orderRef, customer, products, total, notes, submittedAt } = req.body;

  if (!customer?.email || !products?.length) {
    return res.status(400).json({ error: 'Invalid order data' });
  }

  if (!ADMIN_EMAIL || !FROM_EMAIL || !process.env.RESEND_API_KEY) {
    return res.status(500).json({ error: 'Server misconfiguration' });
  }

  const productRows = products.map(p =>
    `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${p.name}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${p.qty}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">$${(p.price * p.qty).toFixed(2)}</td>
    </tr>`
  ).join('');

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to:   ADMIN_EMAIL,
      subject: `🛒 New order ${orderRef} — $${total} from ${customer.firstName} ${customer.lastName}`,
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1a1a18">
          <h2 style="font-size:20px;margin-bottom:4px">New order received</h2>
          <p style="color:#888;font-size:13px;margin-top:0">Ref: <strong>${orderRef}</strong> &nbsp;·&nbsp; ${new Date(submittedAt).toLocaleString()}</p>
          <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px">
            <thead><tr style="background:#f5f5f2">
              <th style="padding:8px 12px;text-align:left;font-weight:500">Product</th>
              <th style="padding:8px 12px;text-align:center;font-weight:500">Qty</th>
              <th style="padding:8px 12px;text-align:right;font-weight:500">Subtotal</th>
            </tr></thead>
            <tbody>${productRows}</tbody>
            <tfoot><tr>
              <td colspan="2" style="padding:10px 12px;font-weight:600">Total</td>
              <td style="padding:10px 12px;text-align:right;font-weight:600;font-size:16px">$${total}</td>
            </tr></tfoot>
          </table>
          <table style="width:100%;font-size:14px;border-collapse:collapse">
            <tr><td style="padding:4px 0;color:#888;width:120px">Name</td><td>${customer.firstName} ${customer.lastName}</td></tr>
            <tr><td style="padding:4px 0;color:#888">Email</td><td>${customer.email}</td></tr>
            ${customer.phone ? `<tr><td style="padding:4px 0;color:#888">Phone</td><td>${customer.phone}</td></tr>` : ''}
            ${notes ? `<tr><td style="padding:4px 0;color:#888">Notes</td><td>${notes}</td></tr>` : ''}
          </table>
        </div>`
    });

    await resend.emails.send({
      from: FROM_EMAIL,
      to:   customer.email,
      subject: `Order confirmed — ${orderRef}`,
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1a1a18">
          <h2 style="font-size:20px;margin-bottom:4px">Thanks for your order, ${customer.firstName}!</h2>
          <p style="color:#888;font-size:13px">We've received your order and will be in touch soon.</p>
          <div style="background:#f5f5f2;border-radius:8px;padding:12px 16px;margin:20px 0;font-size:13px;color:#555">
            Order reference: <strong style="color:#1a1a18;font-family:monospace">${orderRef}</strong>
          </div>
          <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px">
            <thead><tr style="background:#f5f5f2">
              <th style="padding:8px 12px;text-align:left;font-weight:500">Product</th>
              <th style="padding:8px 12px;text-align:center;font-weight:500">Qty</th>
              <th style="padding:8px 12px;text-align:right;font-weight:500">Subtotal</th>
            </tr></thead>
            <tbody>${productRows}</tbody>
            <tfoot><tr>
              <td colspan="2" style="padding:10px 12px;font-weight:600">Total</td>
              <td style="padding:10px 12px;text-align:right;font-weight:600;font-size:16px">$${total}</td>
            </tr></tfoot>
          </table>
          ${notes ? `<p style="font-size:13px;color:#888">Your notes: <em>${notes}</em></p>` : ''}
          <p style="font-size:13px;color:#aaa;margin-top:32px">Questions? Contact us at ${ADMIN_EMAIL}</p>
        </div>`
    });

    return res.status(200).json({ success: true, orderRef });

  } catch (err) {
    console.error('Email send error:', err);
    return res.status(500).json({ error: 'Failed to send emails' });
  }
}
