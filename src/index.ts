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
app.get('/', async (c) => {
    const tone = c.req.query('tone');
    const url = "https://news.ycombinator.com";

    try {
        // Initialize browser and get stories
        const browserManager = new BrowserDo(c.env, { storage: null });
        const browser = await browserManager.initBrowser();
        const page = await browser.newPage();
        await page.goto(url);

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

            return stories.slice(0, 10);
        });

        await page.close();

        // Only generate AI analysis if a tone is selected
        let aiContent = '';
        if (tone) {
            try {
                const storiesForAnalysis = topStories
                    .map((story: { title: string }, index: number) => `${index + 1}. ${story.title}`)
                    .join('\n');

                let systemPrompt;
                if (tone === 'tedlasso') {
                    systemPrompt = "You are Ted Lasso, the optimistic football coach. With your characteristic warmth, folksy wisdom, and endless optimism, analyze these Hacker News stories. Use Ted Lasso-style metaphors, reference biscuits, football (soccer), and keep it believe-ingly positive!";
                } else if (tone === 'stephena') {
                    systemPrompt = "You are Stephen A. Smith, the passionate sports commentator. With your signature dramatic flair and strong opinions, analyze these Hacker News stories. Use your catchphrases, dramatic pauses (marked with ...), and bold declarations. Stay BLASPHEMOUS!";
                }

                const analysisMessages = [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: "Analyze these top Hacker News stories and provide a brief, engaging summary:\n\n" + storiesForAnalysis }
                ];

                const analysisResponse = await c.env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", 
                    {
                        messages: analysisMessages,
                        max_tokens: 2048,
                        temperature: 0.7,
                    },
                    {
                        gateway: {
                            id: "hn-browser-email",
                            skipCache: false,
                            cacheTtl: 3360,
                        },
                    }
                );

                aiContent = (analysisResponse?.text || 
                           analysisResponse?.response || 
                           analysisResponse?.content || 
                           'Analysis failed to generate.')
                           .toString()
                           .replace(/&/g, '&amp;')
                           .replace(/</g, '&lt;')
                           .replace(/>/g, '&gt;')
                           .replace(/"/g, '&quot;')
                           .replace(/'/g, '&#039;');

            } catch (aiError) {
                console.error('AI Analysis Error:', aiError);
                aiContent = 'Failed to generate AI analysis.';
            }
        }

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
                        
                        .container {
                            max-width: 800px;
                            margin: 0 auto;
                            padding: 20px;
                        }
                        
                        .button-container {
                            display: flex;
                            gap: 20px;
                            justify-content: center;
                            margin: 30px 0;
                        }
                        
                        .analysis-button {
                            padding: 15px 30px;
                            border: none;
                            border-radius: 10px;
                            font-size: 1.2em;
                            cursor: pointer;
                            transition: transform 0.3s, box-shadow 0.3s;
                        }
                        
                        .ted-button {
                            background: #AFC01C;
                            color: white;
                        }
                        
                        .stephen-button {
                            background: #FF4D4D;
                            color: white;
                        }
                        
                        .analysis-button:hover {
                            transform: translateY(-3px);
                            box-shadow: 0 5px 15px rgba(0,255,149,0.3);
                        }
                        
                        .stories-list {
                            list-style: none;
                            margin: 20px 0;
                        }
                        
                        .stories-list li {
                            background: rgba(255,255,255,0.1);
                            margin: 10px 0;
                            padding: 15px;
                            border-radius: 8px;
                        }
                        
                        .stories-list a {
                            color: #00ff95;
                            text-decoration: none;
                        }
                        
                        .stories-list a:hover {
                            text-decoration: underline;
                        }
                        
                        .ai-analysis {
                            background: rgba(255,255,255,0.1);
                            padding: 20px;
                            border-radius: 10px;
                            margin-top: 30px;
                            white-space: pre-wrap;
                            display: ${aiContent ? 'block' : 'none'};
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>🤖 Top 10 Hacker News Stories</h1>
                        <p>This is a Cloudflare Worker that emails me the top 10 Hacker News stories and an analysis/summary of them using Cloudflare Email, Workers AI, AI Gateway, and Browser Rendering. On this page, you can select a tone to analyze the stories:</p>

                        <ul class="stories-list">
                            ${topStories.map((story: any) => `
                                <li>
                                    <a href="${story.link}" target="_blank">${story.title}</a>
                                </li>
                            `).join('')}
                        </ul>
                        <div class="button-container">
                            <button onclick="window.location.href='?tone=tedlasso'" class="analysis-button ted-button">
                                ⚽ Ted Lasso Analysis
                            </button>
                            <button onclick="window.location.href='?tone=stephena'" class="analysis-button stephen-button">
                                🎤 Stephen A. Smith Analysis
                            </button>
                        </div>

                        ${aiContent ? `
                            <div class="ai-analysis">
                                <h2>🎭 ${tone === 'tedlasso' ? 'Ted Lasso' : 'Stephen A. Smith'} Analysis</h2>
                                <div>${aiContent.split('\n').map(line => `<p>${line}</p>`).join('')}</div>
                            </div>
                        ` : ''}
                    </div>
                </body>
            </html>
        `;

        return c.html(resultHtml);
    } catch (error) {
        console.error('Scraping Error:', error);
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
        msg.setSender({ name: "HN Digest", addr: "me@lizziesiegle.xyz" });
        msg.setRecipient("lizzie@cloudflare.com");
        msg.setSubject("Top 10 Hacker News Stories");
        
        const emailContent = stories
            .map((story: { title: string; link: string }, index: number) => `${index + 1}. ${story.title}\n   ${story.link}`)
            .join('\n\n');
		const messages = [
			{ role: "system", content: "You are a friendly assistant" },
			{
				role: "user",
				content: "Compose an email body explaining and analyzing the top 10 Hacker News stories. Do not have a preamble or closing. Here are the stories: " + emailContent,
			},
		];
		const emailResponse = await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", 
            {
                messages,
                max_tokens: 2048,
                temperature: 0.5,
            },
            {
                gateway: {
                    id: "hn-browser-email",
                    skipCache: false,
                    cacheTtl: 3360,
                },
            }
        );
		  
        msg.addMessage({
            contentType: 'text/plain',
            data: emailResponse.response || emailResponse.text || emailResponse.content || emailContent
        });

        const message = new EmailMessage(
            "me@lizziesiegle.xyz",
            "lizzie@cloudflare.com",
            msg.asRaw()
        );

        try {
            await env.SEB.send(message);
            console.log("Email sent successfully");
        } catch (e: any) {
            console.error("Failed to send email:", e.message);
        }
    }
};