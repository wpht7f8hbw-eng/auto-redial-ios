# Auto Redial (iOS client + Twilio-based server)

This repository contains a robust, server-driven redial system. The server uses Twilio to place outbound calls and performs redial logic reliably on the server side. A minimal iOS SwiftUI client demonstrates how to start/stop redial jobs from your iPhone. This design avoids iOS background limitations: all redial scheduling and retries happen on the server.

Important: Twilio is a paid service. You need a Twilio account, a verified phone number (or purchased Twilio number), and API credentials. See the Server README below for setup.

WARNING: Use this software only for lawful, non-harassing purposes. Continuous automated calling may violate local laws and Twilio terms.
