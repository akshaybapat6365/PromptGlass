document.getElementById('options').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
});

document.getElementById('help').addEventListener('click', () => {
    alert('PromptGlass adds a floating toolbar to ChatGPT/Gemini.\n\n• Click 1/2 to limit sentences\n• Click # for custom limit\n• Click ★ for saved templates\n• Click + to save current prompt');
});
