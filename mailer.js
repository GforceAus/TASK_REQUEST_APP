'use strict';

const { ConfidentialClientApplication } = require('@azure/msal-node');
const fs   = require('fs');
const path = require('path');

const FROM_MAILBOX = process.env.TARGET_EMAIL || 'support@gforceaus.com';
const ADMIN_CC      = 'j.singh@gforce.co.nz';
const GRAPH         = 'https://graph.microsoft.com/v1.0';

// ── Auth ─────────────────────────────────────────────────────────────────────

let msalClient;

function getMsalClient() {
  if (!msalClient) {
    msalClient = new ConfidentialClientApplication({
      auth: {
        clientId:     process.env.AZURE_CLIENT_ID,
        clientSecret: process.env.AZURE_CLIENT_SECRET,
        authority:    `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
      },
    });
  }
  return msalClient;
}

async function getAccessToken() {
  const result = await getMsalClient().acquireTokenByClientCredential({
    scopes: ['https://graph.microsoft.com/.default'],
  });
  if (!result?.accessToken) throw new Error('Failed to acquire Graph access token');
  return result.accessToken;
}

async function verifyCredentials() {
  await getAccessToken();
}

// ── Graph send ───────────────────────────────────────────────────────────────

function toRecipients(addresses) {
  return addresses.map(address => ({ emailAddress: { address } }));
}

function toAttachments(attachmentPaths) {
  return attachmentPaths.map(p => ({
    '@odata.type':  '#microsoft.graph.fileAttachment',
    name:           path.basename(p),
    contentBytes:   fs.readFileSync(p).toString('base64'),
  }));
}

async function sendMail({ to, cc = [], subject, body, attachmentPaths = [] }) {
  const token = await getAccessToken();
  const res = await fetch(`${GRAPH}/users/${encodeURIComponent(FROM_MAILBOX)}/sendMail`, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        subject,
        body:          { contentType: 'Text', content: body },
        toRecipients:  toRecipients(to),
        ccRecipients:  toRecipients(cc),
        attachments:   toAttachments(attachmentPaths),
      },
      saveToSentItems: true,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph sendMail -> ${res.status}: ${text}`);
  }
}

/**
 * Send the approved task email to support@gforceaus.com.
 * @param {object} opts
 * @param {string}   opts.subject          [GFORCE-TASK] ... subject line
 * @param {string}   opts.body             Plain-text body with JSON delimiters
 * @param {string[]} opts.attachmentPaths  Absolute server paths to attach
 */
async function sendTaskEmail({ subject, body, attachmentPaths = [] }) {
  await sendMail({
    to:   [FROM_MAILBOX],
    cc:   [ADMIN_CC],
    subject,
    body,
    attachmentPaths,
  });
}

/**
 * Send a rejection notification to the CRM user.
 * @param {object} opts
 * @param {string} opts.toEmail      User's email address
 * @param {string} opts.taskName     The task name they submitted
 * @param {string} opts.reason       Admin's rejection reason
 */
async function sendRejectionEmail({ toEmail, taskName, reason }) {
  await sendMail({
    to:      [toEmail],
    cc:      [ADMIN_CC],
    subject: `[GForce] Task Request Rejected — ${taskName}`,
    body:    `Your task request has been reviewed and was not approved.\n\nTask: ${taskName}\n\nReason:\n${reason}\n\nIf you have questions, please contact your admin.`,
  });
}

module.exports = { verifyCredentials, sendTaskEmail, sendRejectionEmail };
