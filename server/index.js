// server/index.js
// Simple Express server that manages redial "jobs" and uses Twilio to place calls.

const express = require('express');
const bodyParser = require('body-parser');
const twilio = require('twilio');
const { v4: uuidv4 } = require('uuid');

require('dotenv').config();

const PORT = process.env.PORT || 3000;
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER; // e.g. +1XXX
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`; // public URL for Twilio callbacks

if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
  console.error('Missing Twilio configuration. Please set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER in .env');
  process.exit(1);
}

const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
const app = express();
app.use(bodyParser.json());

// In-memory jobs map. For production consider persistent storage (Redis/DB).
const jobs = new Map();

function makeCall(job) {
  if (!job.running) return;
  job.attempts += 1;
  console.log(`Job ${job.id}: placing attempt #${job.attempts} to ${job.target}`);

  const twimlUrl = `${BASE_URL}/twiml?jobId=${job.id}`;
  const statusCallback = `${BASE_URL}/twilio-callback?jobId=${job.id}`;

  client.calls.create({
    to: job.target,
    from: TWILIO_PHONE_NUMBER,
    url: twimlUrl,
    statusCallback: statusCallback,
    statusCallbackEvent: ['completed', 'busy', 'failed', 'no-answer'],
    statusCallbackMethod: 'POST'
  }).then(call => {
    job.lastCallSid = call.sid;
    job.lastStatus = 'initiated';
    console.log(`Job ${job.id}: call initiated Sid=${call.sid}`);
  }).catch(err => {
    console.error('Twilio call create error', err);
    job.lastStatus = 'error';
    // schedule retry if allowed
    scheduleNextIfNeeded(job);
  });
}

function scheduleNextIfNeeded(job) {
  if (!job.running) return;
  const retries = job.retries; // 0 = infinite
  if (retries !== 0 && job.attempts >= retries) {
    job.running = false;
    job.status = 'finished';
    console.log(`Job ${job.id}: reached max attempts (${job.attempts}). Stopping.`);
    return;
  }

  console.log(`Job ${job.id}: scheduling next attempt in ${job.interval}s`);
  job.status = 'waiting';
  job.timer = setTimeout(() => {
    makeCall(job);
  }, job.interval * 1000);
}

// Create a new job
app.post('/start', (req, res) => {
  const { target, retries = 3, interval = 10 } = req.body;
  if (!target) return res.status(400).json({ error: 'target is required (E.164 format)' });
  const jobId = uuidv4();
  const job = {
    id: jobId,
    target,
    retries: Number(retries),
    interval: Number(interval),
    attempts: 0,
    running: true,
    status: 'started',
    lastCallSid: null,
    lastStatus: null,
    timer: null,
  };
  jobs.set(jobId, job);
  // start immediately
  makeCall(job);
  res.json({ jobId, message: 'job started' });
});

// Stop a job
app.post('/stop', (req, res) => {
  const { jobId } = req.body;
  const job = jobs.get(jobId);
  if (!job) return res.status(404).json({ error: 'job not found' });
  job.running = false;
  job.status = 'stopped';
  if (job.timer) {
    clearTimeout(job.timer);
    job.timer = null;
  }
  res.json({ jobId, message: 'stopped' });
});

// Status
app.get('/status/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'job not found' });
  res.json({
    id: job.id,
    target: job.target,
    attempts: job.attempts,
    running: job.running,
    status: job.status,
    lastCallSid: job.lastCallSid,
    lastStatus: job.lastStatus
  });
});

// TwiML endpoint — Twilio will request this when the call is answered.
// You can customize behavior here. Current implementation plays a short message.
app.post('/twiml', (req, res) => {
  const jobId = req.query.jobId;
  res.set('Content-Type', 'text/xml');
  // Simple TwiML: say a short message then hang up. You can replace with <Dial> to bridge.
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Say voice="alice">Bu bir otomatik aramadır. Arama testi için yapıldı.</Say>\n  <Pause length="1"/>\n</Response>`;
  res.send(twiml);
});

// Twilio status callback
app.post('/twilio-callback', (req, res) => {
  const jobId = req.query.jobId;
  const job = jobs.get(jobId);
  const callStatus = req.body.CallStatus || req.body.call_status || req.query.CallStatus;
  const callSid = req.body.CallSid || req.body.call_sid;
  console.log(`Twilio callback for job=${jobId} CallSid=${callSid} status=${callStatus}`);

  if (!job) {
    console.warn('Callback for unknown job', jobId);
    return res.sendStatus(200);
  }

  job.lastCallSid = callSid;
  job.lastStatus = callStatus;

  // When Twilio reports terminal statuses, decide whether to retry.
  const terminalStatuses = ['completed', 'busy', 'failed', 'no-answer', 'canceled'];
  if (terminalStatuses.includes(callStatus)) {
    // If call was answered (completed) and you want to stop on answer, you could stop here.
    // We treat 'completed' as a terminal that also may not require retry.

    // For this implementation, if completed (someone answered), we stop the job.
    if (callStatus === 'completed') {
      job.running = false;
      job.status = 'completed';
      console.log(`Job ${job.id}: call completed. Stopping.`);
      return res.sendStatus(200);
    }

    // For busy/no-answer/failed -> attempt next if allowed
    scheduleNextIfNeeded(job);
  }

  res.sendStatus(200);
});

// List jobs (for debug)
app.get('/jobs', (req, res) => {
  const list = Array.from(jobs.values()).map(j => ({ id: j.id, target: j.target, attempts: j.attempts, running: j.running, status: j.status }));
  res.json(list);
});

app.listen(PORT, () => {
  console.log(`Auto-redial server listening on ${PORT}`);
  console.log(`Make sure BASE_URL (${BASE_URL}) is reachable by Twilio (use ngrok or deploy).`);
});
