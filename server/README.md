# Server README

This server uses Twilio to perform reliable redial attempts. The server manages jobs in-memory (for production you should use a persistent store like Redis or a database).

Setup

1. Create a Twilio account and purchase a phone number (or use a verified number for trial).
2. Install Node.js (14+).
3. Copy server/.env.example to server/.env and set your TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER, and BASE_URL (public URL reachable by Twilio).

Local testing with ngrok

- Run `npm install` in the server folder.
- Start server: `npm start`
- Expose to internet with ngrok: `ngrok http 3000`
- Set BASE_URL to the https ngrok URL (e.g. https://abcd1234.ngrok.io) in your .env and restart server.
- In Twilio, you do not need to configure a webhook: our code includes statusCallback URL dynamically when creating calls.

API

- POST /start
  - body: { target: "+90XXXXXXXXX", retries: 5, interval: 30 }
  - returns: { jobId }

- POST /stop
  - body: { jobId }

- GET /status/:jobId
  - returns job info

Behavior

- retries = 0 -> infinite attempts
- interval = seconds between attempts
- When a call statusCallback reports 'completed', job stops (someone answered). For busy/no-answer/failed, the server schedules the next attempt until retries exhausted.

Notes

- This server places calls FROM your Twilio phone number TO the target.
- If you need calls bridged to your personal phone, the TwiML served at /twiml can be adjusted to <Dial> another number (but bridging requires a staged flow to connect two parties reliably).
- Costs: Each outbound call will be billed by Twilio. Trial accounts may require verification of target numbers.

Security

- Protect your API endpoints (no authentication in this sample). For production add API keys or authentication so others cannot start calls from your account.

