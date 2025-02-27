import { Hono } from 'hono';
import puppeteer from "@cloudflare/puppeteer";
import { serveStatic } from '@hono/node-server/serve-static';
import { EmailMessage } from "cloudflare:email";
import { createMimeMessage } from "mimetext";

interface Env {
    MYBROWSER: any;
    BUCKET: any;
    BROWSERDO: any;
    AI: any;
    SEB: any;
}

const KEEP_BROWSER_ALIVE_IN_SECONDS = 60;

export class BrowserDo {
    private browser: any;
    private keptAliveInSeconds: number;
    private storage: any;

    constructor(private env: Env, state: any) {
        this.keptAliveInSeconds = 0;
        this.storage = state?.storage;
        this.env = env;
    }

    async fetch(request: Request) {
        if (!this.browser || !this.browser.isConnected()) {
            try {
                // Initialize the browser using the BROWSER binding
                this.browser = await puppeteer.launch(this.env.MYBROWSER);
            } catch (e: any) {
                return new Response(JSON.stringify({ error: e.message }), { status: 500 });
            }
        }
        return new Response(JSON.stringify({ status: 'ok' }));
    }

    async initBrowser() {
        if (!this.browser || !this.browser.isConnected()) {
            console.log(`Browser Manager: Starting new instance`);
            try {
                // Initialize the browser using the BROWSER binding
                this.browser = await puppeteer.launch(this.env.MYBROWSER);
            } catch (e) {
                console.log(`Browser Manager: Could not start browser instance. Error: ${e}`);
                throw e;
            }
        }
        return this.browser;
    }

    async alarm() {
        this.keptAliveInSeconds += 10;

        // Extend browser DO life
        if (this.keptAliveInSeconds < KEEP_BROWSER_ALIVE_IN_SECONDS) {
            console.log(
                `Browser DO: has been kept alive for ${this.keptAliveInSeconds} seconds. Extending lifespan.`,
            );
            await this.storage.setAlarm(Date.now() + 10 * 1000);
        } else {
            console.log(
                `Browser DO: exceeded life of ${KEEP_BROWSER_ALIVE_IN_SECONDS}s.`,
            );
            if (this.browser) {
                console.log(`Closing browser.`);
                await this.browser.close();
            }
        }
    }

    async cleanup() {
        if (this.browser) {
            console.log('Closing browser.');
            await this.browser.close();
        }
    }
}

const app = new Hono<{ Bindings: Env }>();

// Serve the / HTML form
app.get('/', serveStatic({ root: './assets' }));

// Handle the analysis with GET
app.get('/analyze', async (c) => {
    const url = "https://news.ycombinator.com"; // Hacker News URL

    try {
        // Get or create a Durable Object instance
        const id = c.env.BROWSERDO.idFromName("browser");
        const browserObj = c.env.BROWSERDO.get(id);

        // Initialize the browser
        const browserManager = new BrowserDo(c.env, { storage: null });
        const browser = await browserManager.initBrowser();
        const page = await browser.newPage();
        await page.goto(url);

        // Scrape the top stories
        const topStories = await page.evaluate(() => {
            const stories: { title: string; link: string }[] = [];
            const storyElements = document.querySelectorAll('.athing');

            storyElements.forEach((story) => {
                const titleElement = story.querySelector('.titleline a') as HTMLAnchorElement | null;
                const title = titleElement?.innerText.trim();
                const link = titleElement?.href;

                if (title && link) {
                    stories.push({ title, link });
                }
            });

            return stories.slice(0, 10); // Get the top 10 stories
        });

        await page.close();

        // Format the results into HTML
        const resultHtml = `
            <!DOCTYPE html>
            <html>
                <head>
                    <title>HN AI Analysis</title>
                    <style>
                        @import url('https://fonts.googleapis.com/css2?family=Comic+Neue&display=swap');
                        
                        * {
                            margin: 0;
                            padding: 0;
                            box-sizing: border-box;
                            font-family: 'Comic Neue', cursive;
                        }
                        
                        body {
                            min-height: 100vh;
                            display: flex;
                            flex-direction: column;
                            background: linear-gradient(135deg, #1a1a2e, #16213e);
                            color: #fff;
                            padding: 20px;
                        }
                        
                        h1 {
                            text-align: center;
                            color: #00ff95;
                            font-size: 2.5em;
                            margin: 20px 0;
                            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
                        }
                        
                        .container {
                            flex: 1;
                            max-width: 800px;
                            margin: 0 auto;
                        }
                        
                        ul {
                            list-style-type: none;
                            padding: 0;
                        }
                        
                        li {
                            background: rgba(255, 255, 255, 0.1);
                            margin: 15px 0;
                            padding: 20px;
                            border-radius: 10px;
                            backdrop-filter: blur(10px);
                            border: 1px solid rgba(255, 255, 255, 0.1);
                            transition: transform 0.3s ease, box-shadow 0.3s ease;
                        }
                        
                        li:hover {
                            transform: translateY(-5px);
                            box-shadow: 0 5px 15px rgba(0, 255, 149, 0.2);
                        }
                        
                        a {
                            color: #00ff95;
                            text-decoration: none;
                            font-size: 1.1em;
                        }
                        
                        a:hover {
                            text-decoration: underline;
                            color: #00ffaa;
                        }
                        
                        footer {
                            background: rgba(0, 0, 0, 0.5);
                            color: #fff;
                            text-align: center;
                            padding: 15px;
                            position: fixed;
                            bottom: 0;
                            left: 0;
                            width: 100%;
                            backdrop-filter: blur(5px);
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>🤖 Top 10 Hacker News Posts AI Analysis</h1>
                        <ul>
                            ${topStories.map((story: any) => `
                                <li>
                                    <a href="${story.link}" target="_blank">${story.title}</a>
                                </li>
                            `).join('')}
                        </ul>
                    </div>
                    <footer>
                        Powered by <a href="https://developers.cloudflare.com/workers-ai/models/">Cloudflare Workers AI</a>, <a href="https://developers.cloudflare.com/browser-rendering/">Browser Rendering</a>, <a href="https://developers.cloudflare.com/email-routing/email-workers/send-email-workers/">Emails</a> | GitHub -> <a href="https://github.com/elizabethsiegle/hackernews-top10-workersai-browserrendering-email">code👩🏻‍💻here</a>
                    </footer>
                </body>
            </html>
        `;

        return c.html(resultHtml);
    } catch (error) {
        return c.text(`Error scraping Hacker News: ${error}`, 500);
    }
});

async function getTopStories(env: Env) {
    const browserManager = new BrowserDo(env, { storage: null });
    const browser = await browserManager.initBrowser();
    const page = await browser.newPage();
    await page.goto("https://news.ycombinator.com");

    const topStories = await page.evaluate((): { title: string; link: string }[] => {
        const stories: { title: string; link: string }[] = [];
        const storyElements = document.querySelectorAll('.athing');

        storyElements.forEach((story) => {
            const titleElement = story.querySelector('.titleline a') as HTMLAnchorElement | null;
            const title = titleElement?.innerText.trim();
            const link = titleElement?.href;

            if (title && link) {
                stories.push({ title, link });
            }
        });

        return stories.slice(0, 10);
    });

    await page.close();
    await browserManager.cleanup();
    return topStories;
}

// Add new scheduled handler
export default {
    ...app,
    async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
        const stories = await getTopStories(env);
        
        const msg = createMimeMessage();
        msg.setSender({ name: "HN Digest", addr: "sender@example.com" });
        msg.setRecipient("lizzie@cloudflare.com");
        msg.setSubject("Top 10 Hacker News Stories");
        
        const emailContent = stories
            .map((story: { title: string; link: string }, index: number) => `${index + 1}. ${story.title}\n   ${story.link}`)
            .join('\n\n');
		const messages = [
			{ role: "system", content: "You are a friendly assistant" },
			{
				role: "user",
				content: "Compose an email including the top 10 Hacker News stories. Here are the stories: " + emailContent,
			},
		];
		const emailResponse = await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", { messages });
		  
        msg.addMessage({
            contentType: 'text/plain',
            data: `${emailResponse.content}`
        });

        const message = new EmailMessage(
            "sender@example.com",
            "recipient@example.com",
            msg.asRaw()
        );

        try {
            await env.SEB.send(message);
        } catch (e: any) {
            console.error("Failed to send email:", e.message);
        }
    }
};