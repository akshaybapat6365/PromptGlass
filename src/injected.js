// PromptGlass - Service Monitor (Injected Script)
// This gets injected into the page context to intercept fetch

(function () {
    'use strict';

    // Stats storage (accessible via window)
    window.__promptGlassStats = {
        powDifficulty: 'N/A',
        persona: 'N/A',
        status: 'unknown'
    };

    // Intercept fetch
    const originalFetch = window.fetch;
    window.fetch = async function (resource, options) {
        const response = await originalFetch(resource, options);

        const url = typeof resource === 'string' ? resource : resource.url || '';

        if ((url.includes('/backend-api/sentinel/chat-requirements') ||
            url.includes('backend-anon/sentinel/chat-requirements')) &&
            options && options.method === 'POST') {

            try {
                const clonedResponse = response.clone();
                const data = await clonedResponse.json();

                const difficulty = data.proofofwork ? data.proofofwork.difficulty : 'N/A';
                const persona = data.persona || 'N/A';

                window.__promptGlassStats.powDifficulty = difficulty;
                window.__promptGlassStats.persona = persona;

                // Determine status from difficulty
                if (difficulty !== 'N/A') {
                    const cleanDiff = difficulty.replace('0x', '').replace(/^0+/, '');
                    const hexLen = cleanDiff.length;
                    if (hexLen <= 2) {
                        window.__promptGlassStats.status = 'degraded';
                    } else if (hexLen === 3) {
                        window.__promptGlassStats.status = 'warning';
                    } else {
                        window.__promptGlassStats.status = 'good';
                    }
                }

                console.log('%c🔍 PromptGlass: PoW=' + difficulty + ', Persona=' + persona,
                    'background: #00d4ff; color: black; padding: 2px 6px; border-radius: 3px;');

                // Dispatch event for content script to pick up
                window.dispatchEvent(new CustomEvent('promptglass-stats-update', {
                    detail: window.__promptGlassStats
                }));

            } catch (e) {
                console.error('PromptGlass: Error parsing response', e);
            }
        }

        return response;
    };

    console.log('%c✅ PromptGlass: Fetch interceptor injected',
        'background: #30d158; color: black; padding: 2px 6px; border-radius: 3px;');
})();
