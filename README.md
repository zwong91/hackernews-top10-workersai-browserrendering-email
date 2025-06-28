## Hacker News Top 10 Stories with AI Analysis w/ Hourly Email Summaries

This is a Cloudflare Worker that scrapes the top 10 stories from Hacker News using [Browser Rendering](https://developers.cloudflare.com/browser-rendering/workers-binding-api/screenshots/), analyzes/summarizes them using [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/models/), displays that according to tone  users select via button click, and sends the results via [Cloudflare Email Routing](https://developers.cloudflare.com/email-routing/email-workers/send-email-workers/) every hour (using [Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)).

### Features

Scrapes Top 10 Hacker News Stories: Uses Cloudflare's Browser Rendering API to fetch the latest top stories from Hacker News.

AI-Powered Analysis: Generates summaries of the stories using Cloudflare Workers AI with customizable tones (e.g., Ted Lasso or Stephen A. Smith).

Email Delivery: Sends the top stories and AI-generated summaries via Cloudflare Email.

Interactive Web Interface: Provides a web interface to view the top stories and generate AI summaries in different tones.

### Setup

#### Prerequisites

- Cloudflare Account: Create one today for free: <https://dash.cloudflare.com/sign-up>

- Wrangler CLI: Install and authenticate:

```bash
npm install -g wrangler
wrangler login
```

- Cloudflare Email Setup: [Configure your domain for Cloudflare Email and set up the necessary bindings](https://developers.cloudflare.com/email-routing/setup/email-routing-addresses/).

- Add the following bindings to your wrangler.jsonc file to interact with your Worker:

```toml
[triggers]
crons = ["0 * * * *"] # 每小时运行

[[send_email]]
name = "SEB"

[ai]
binding = "AI"

[browser]
binding = "MYBROWSER"

[durable_objects]
bindings = [
  { name = "BROWSERDO", class_name = "BrowserDo" }
]

[[migrations]]
tag = "v1"
new_classes = ["BrowserDo"]

[observability]
enabled = true
```

- Deploy the Worker:

```bash
npx wrangler deploy
```

or run locally with `npm run dev --remote`
