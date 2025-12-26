// PromptGlass - Token Counter & Stats Module

// Stats tracking
let stats = {
    inputTokens: 0,
    outputTokens: 0,
    totalCost: 0,
    responseTime: 0,
    promptCount: 0,
    currentModel: 'unknown',
    // Service quality monitoring
    accountType: 'unknown',    // free, plus, team, pro
    verifiedModel: 'unknown',  // actual model responding
    rateLimitRemaining: null,  // requests remaining
    rateLimitReset: null,      // reset timestamp
    powDifficulty: null,       // proof of work difficulty (higher = degraded)
    serviceStatus: 'unknown'   // good, degraded, error
};

// Model pricing (per 1M tokens)
const MODEL_PRICING = {
    'gpt-4o': { input: 2.50, output: 10.00 },
    'gpt-4o-mini': { input: 0.15, output: 0.60 },
    'gpt-4-turbo': { input: 10.00, output: 30.00 },
    'gpt-4': { input: 30.00, output: 60.00 },
    'gpt-3.5-turbo': { input: 0.50, output: 1.50 },
    'o1': { input: 15.00, output: 60.00 },
    'o1-mini': { input: 3.00, output: 12.00 },
    'default': { input: 2.50, output: 10.00 } // Fallback to gpt-4o pricing
};

// Simple token estimation (approx 4 chars per token for English)
// More accurate would be tiktoken, but this is a reasonable estimate
function estimateTokens(text) {
    if (!text) return 0;
    // GPT tokenizer approximation: ~4 chars per token for English
    // Adjust for whitespace and punctuation
    return Math.ceil(text.length / 4);
}

// Detect model from request payload
function detectModel(payload) {
    try {
        if (payload.model) return payload.model;
        // ChatGPT web uses different field names
        if (payload.action === 'next') {
            // Default ChatGPT web model
            return 'gpt-4o';
        }
    } catch (e) { }
    return 'default';
}

// Calculate cost
function calculateCost(inputTokens, outputTokens, model) {
    const pricing = MODEL_PRICING[model] || MODEL_PRICING['default'];
    const inputCost = (inputTokens / 1000000) * pricing.input;
    const outputCost = (outputTokens / 1000000) * pricing.output;
    return inputCost + outputCost;
}

// Intercept fetch to capture requests/responses
function setupFetchInterceptor() {
    const originalFetch = window.fetch;

    window.fetch = async function (...args) {
        const [url, options] = args;
        const urlStr = typeof url === 'string' ? url : url.toString();

        // Intercept session/models for account info
        if (urlStr.includes('backend-api/models') || urlStr.includes('backend-api/me')) {
            const response = await originalFetch.apply(this, args);
            try {
                const cloned = response.clone();
                const data = await cloned.json();
                // Detect account type from models response
                if (data.categories) {
                    // Has gpt-4 access = Plus or higher
                    const hasGpt4 = data.categories.some(c =>
                        c.default_model && c.default_model.includes('gpt-4')
                    );
                    stats.accountType = hasGpt4 ? 'plus' : 'free';
                }
                // From /me endpoint
                if (data.picture || data.email) {
                    if (data.organizations?.some(o => o.is_team)) {
                        stats.accountType = 'team';
                    }
                }
            } catch (e) { }
            return response;
        }

        // Only intercept ChatGPT/Gemini API calls for main tracking
        const isRelevant = urlStr.includes('backend-api/conversation') ||
            urlStr.includes('generativelanguage.googleapis.com');

        if (!isRelevant) {
            return originalFetch.apply(this, args);
        }

        const startTime = Date.now();

        // Parse request body for input tokens
        try {
            if (options && options.body) {
                const payload = JSON.parse(options.body);

                // Extract prompt text
                let promptText = '';
                if (payload.messages) {
                    promptText = payload.messages.map(m => m.content?.parts?.[0] || m.content || '').join(' ');
                } else if (payload.prompt) {
                    promptText = payload.prompt;
                }

                const inputTokens = estimateTokens(promptText);
                stats.inputTokens += inputTokens;
                stats.currentModel = detectModel(payload);
                stats.promptCount++;

                console.log(`PromptGlass: Input ~${inputTokens} tokens`);
            }
        } catch (e) {
            // Ignore parsing errors
        }

        // Execute original fetch
        const response = await originalFetch.apply(this, args);

        // Clone response to read body
        const clonedResponse = response.clone();

        // Track response time
        stats.responseTime = Date.now() - startTime;

        // Parse response headers for rate limits
        try {
            const rateLimit = response.headers.get('x-ratelimit-remaining');
            const rateLimitReset = response.headers.get('x-ratelimit-reset');
            if (rateLimit) stats.rateLimitRemaining = parseInt(rateLimit);
            if (rateLimitReset) stats.rateLimitReset = parseInt(rateLimitReset);
        } catch (e) { }

        // Try to count output tokens and extract model info
        try {
            const text = await clonedResponse.text();
            const outputTokens = estimateTokens(text);
            stats.outputTokens += outputTokens;

            // Try to extract verified model from response
            try {
                const lines = text.split('\n');
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = JSON.parse(line.slice(6));
                        // ChatGPT returns model in response
                        if (data.model) {
                            stats.verifiedModel = data.model;
                        }
                        // Check for PoW difficulty (sentinel/turnstile)
                        if (data.arkose_token || data.turnstile_token) {
                            stats.powDifficulty = 'detected';
                        }
                    }
                }
            } catch (e) { }

            // Calculate total cost
            stats.totalCost = calculateCost(stats.inputTokens, stats.outputTokens, stats.currentModel);

            // Determine service status
            if (stats.responseTime > 10000) {
                stats.serviceStatus = 'slow';
            } else if (response.status >= 500) {
                stats.serviceStatus = 'error';
            } else if (stats.rateLimitRemaining !== null && stats.rateLimitRemaining < 5) {
                stats.serviceStatus = 'limited';
            } else {
                stats.serviceStatus = 'good';
            }

            console.log(`PromptGlass: Output ~${outputTokens} tokens, Model: ${stats.verifiedModel}, Status: ${stats.serviceStatus}`);

            // Update UI
            updateStatsDisplay();
        } catch (e) {
            // Streaming response - harder to count
        }

        return response;
    };

    console.log('PromptGlass: Fetch interceptor active');
}

// DEBUG: Log all ChatGPT API responses to console
function setupDebugInterceptor() {
    const originalFetch = window.fetch;

    window.fetch = async function (...args) {
        const [url, options] = args;
        const urlStr = typeof url === 'string' ? url : url.toString();

        // Log ALL backend-api calls
        if (urlStr.includes('backend-api') || urlStr.includes('chatgpt.com/api')) {
            console.log('🔍 PromptGlass intercepted:', urlStr);

            const response = await originalFetch.apply(this, args);

            // Log headers
            console.log('📋 Response headers:');
            response.headers.forEach((value, key) => {
                console.log(`  ${key}: ${value}`);
            });

            // Try to log body (for non-streaming)
            try {
                const cloned = response.clone();
                const text = await cloned.text();
                if (text.length < 5000) {
                    console.log('📦 Response body:', text.substring(0, 1000));
                } else {
                    console.log('📦 Response body (truncated):', text.substring(0, 500) + '...');
                }
            } catch (e) {
                console.log('⚠️ Could not read response body');
            }

            return response;
        }

        return originalFetch.apply(this, args);
    };

    console.log('🔍 PromptGlass DEBUG mode active - check console for API responses');
}

// Update the stats display in UI
function updateStatsDisplay() {
    const statsEl = document.getElementById('aph-stats');
    if (statsEl) {
        // Status indicator colors
        const statusColors = {
            'good': '#30d158',
            'slow': '#ff9f0a',
            'limited': '#ff453a',
            'error': '#ff453a',
            'unknown': '#8e8e93'
        };
        const statusColor = statusColors[stats.serviceStatus] || statusColors.unknown;

        // Model display (truncate long names)
        const modelDisplay = stats.verifiedModel !== 'unknown'
            ? stats.verifiedModel.replace('gpt-', '').substring(0, 6)
            : '?';

        // Rate limit warning
        const rateLimitWarning = stats.rateLimitRemaining !== null && stats.rateLimitRemaining < 10
            ? `⚠️${stats.rateLimitRemaining}`
            : '';

        statsEl.innerHTML = `
          <span class="aph-status-dot" style="background:${statusColor}" title="Service: ${stats.serviceStatus}"></span>
          <span title="Model: ${stats.verifiedModel}">${modelDisplay}</span>
          <span title="Input tokens">↑${formatNumber(stats.inputTokens)}</span>
          <span title="Output tokens">↓${formatNumber(stats.outputTokens)}</span>
          <span title="Estimated cost">$${stats.totalCost.toFixed(4)}</span>
          ${rateLimitWarning ? `<span class="aph-rate-warn" title="Rate limit remaining">${rateLimitWarning}</span>` : ''}
        `;
    }
}

// Format large numbers
function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

// Collapsible code blocks
function setupCollapsibleCodeBlocks() {
    // Find all code blocks
    const codeBlocks = document.querySelectorAll('pre:not(.aph-processed)');

    codeBlocks.forEach(pre => {
        pre.classList.add('aph-processed');

        // Create collapse button
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'aph-code-toggle';
        toggleBtn.textContent = '▼';
        toggleBtn.title = 'Collapse code';

        // Insert before pre
        pre.style.position = 'relative';
        pre.insertBefore(toggleBtn, pre.firstChild);

        // Toggle functionality
        let collapsed = false;
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            collapsed = !collapsed;

            if (collapsed) {
                pre.style.maxHeight = '40px';
                pre.style.overflow = 'hidden';
                toggleBtn.textContent = '▶';
                toggleBtn.title = 'Expand code';
            } else {
                pre.style.maxHeight = 'none';
                pre.style.overflow = 'visible';
                toggleBtn.textContent = '▼';
                toggleBtn.title = 'Collapse code';
            }
        });
    });
}

// Initialize stats module
function initStatsModule() {
    setupFetchInterceptor();

    // Run collapsible code setup periodically (for dynamically loaded content)
    setInterval(setupCollapsibleCodeBlocks, 2000);
}

// Export for use in main content script
window.PromptGlassStats = {
    init: initStatsModule,
    debug: setupDebugInterceptor,  // Call this to see what ChatGPT returns
    getStats: () => stats,
    updateDisplay: updateStatsDisplay
};

// Auto-run debug mode for now to see what's happening
setupDebugInterceptor();
