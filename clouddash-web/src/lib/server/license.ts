import { dynamodb, ses } from 'aws-utils';
import crypto from 'crypto';

const LICENSES_TABLE = 'clouddash-licenses';
const FROM_EMAIL = process.env.GMAIL_APP_USER || 'support@clouddash.dev';

export async function lookupLicensesByEmail(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const licenses: any[] = [];
  for await (const item of dynamodb.queryAll({
    tableName: LICENSES_TABLE,
    indexName: 'email-index',
    pk: normalizedEmail,
    pkFieldName: 'email'
  })) {
    licenses.push(item);
  }
  return licenses;
}

export async function getLicenseByKey(key: string) {
  const normalizedKey = key.trim().toUpperCase();
  return dynamodb.querySingle({
    tableName: LICENSES_TABLE,
    pk: normalizedKey
  });
}

function generateLicenseKey(): string {
  const segments = [];
  for (let i = 0; i < 4; i++) {
    segments.push(crypto.randomBytes(2).toString('hex').toUpperCase());
  }
  return `CD-${segments.join('-')}`;
}

export async function sendLicenseEmail(licenseKey: string, email: string, isRecovery: boolean = false) {
  // Use QuickChart API for QR code since Gmail blocks Data URL (base64) images in emails
  const qrUrl = `https://quickchart.io/qr?text=${encodeURIComponent(licenseKey)}&size=250`;

  const subject = isRecovery ? 'Your CloudDash Pro License Key (Recovery)' : 'Your CloudDash Pro License Key';
  const introBlock = isRecovery 
    ? `<h1 style="color:#ffffff;font-size:28px;margin:0 0 8px;">🔑 Your CloudDash Pro License</h1>
       <p style="color:#94a3b8;font-size:15px;margin:0;">Here's your license key as requested.</p>`
    : `<h1 style="color:#ffffff;font-size:28px;margin:0 0 8px;">🎉 Welcome to CloudDash Pro!</h1>
       <p style="color:#94a3b8;font-size:15px;margin:0;">Thank you for your purchase. Your license key is ready.</p>`;
  const outroBlock = isRecovery
    ? `<p style="color:#64748b;font-size:12px;margin:0;">If you didn't request this, you can safely ignore this email.</p>`
    : `<p style="color:#64748b;font-size:12px;margin:0;">Questions? Contact us at <a href="mailto:support@clouddash.dev" style="color:#60a5fa;text-decoration:none;">support@clouddash.dev</a></p>`;

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px;">
    <div style="text-align:center;margin-bottom:32px;">
      ${introBlock}
    </div>

    <div style="background:#1e293b;border:1px solid #334155;border-radius:16px;padding:32px;text-align:center;margin-bottom:24px;">
      <p style="color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:2px;margin:0 0 12px;">Your License Key</p>
      <div style="background:#0f172a;border:1px solid #475569;border-radius:8px;padding:16px;margin-bottom:24px;">
        <code style="color:#60a5fa;font-size:20px;font-weight:bold;letter-spacing:2px;word-break:break-all;">${licenseKey}</code>
      </div>
      <p style="color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:2px;margin:0 0 16px;">Or Scan This QR Code</p>
      <img src="${qrUrl}" alt="License QR Code" width="200" height="200" style="border-radius:12px;border:2px solid #334155;background:#ffffff;" />
    </div>

    <div style="background:#1e293b;border:1px solid #334155;border-radius:12px;padding:24px;margin-bottom:24px;">
      <h3 style="color:#ffffff;font-size:15px;margin:0 0 12px;">How to Activate</h3>
      <ol style="color:#94a3b8;font-size:13px;line-height:1.8;margin:0;padding-left:20px;">
        <li>Open CloudDash on your desktop or mobile device</li>
        <li>Go to <strong style="color:#e2e8f0;">Settings → Pro License</strong></li>
        <li>Paste your license key or tap <strong style="color:#e2e8f0;">Scan QR Code</strong></li>
        <li>Click <strong style="color:#e2e8f0;">Activate</strong> — you're all set!</li>
      </ol>
    </div>

    <div style="text-align:center;padding-top:16px;border-top:1px solid #1e293b;">
      ${outroBlock}
    </div>
  </div>
</body>
</html>`;

  await ses.sendEmail({
    subject,
    htmlBody,
    body: `Your CloudDash Pro license key is: ${licenseKey}\n\nTo activate, open CloudDash → Settings → Pro License and paste this key.`,
    toEmail: email,
    fromEmail: FROM_EMAIL
  });
}

export async function processWebhookLicenseCreation(email: string, customerId: string, subscriptionId: string, planId: string) {
  // Look up the email first before adding. 
  // If the email already exists with an active license, do not generate a new key unless the subscription id is different.
  const existingLicenses = await lookupLicensesByEmail(email);
  const activeMatchingLicense = existingLicenses.find(l => l.status === 'active' && l.chargebeeSubscriptionId === subscriptionId);

  if (activeMatchingLicense) {
    const licenseKey = activeMatchingLicense.pk;
    return licenseKey;
  }

  const licenseKey = generateLicenseKey();
  
  await dynamodb.addItem({
    tableName: LICENSES_TABLE,
    item: {
      pk: licenseKey,
      email,
      chargebeeSubscriptionId: subscriptionId,
      chargebeeCustomerId: customerId,
      plan: planId,
      status: 'active',
      createdAt: new Date().toISOString()
    }
  });

  await sendLicenseEmail(licenseKey, email, false);
  return licenseKey;
}
