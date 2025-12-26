// Options Logic

const defaultTemplates = [
    { id: 'strict', label: 'Strict Style', text: "Do not use contractions. Do not use en or em dashes. Do not use bullet points. Write in natural conversational tone. Do not use filler words." }
];

document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('add-btn').addEventListener('click', addTemplate);
document.getElementById('clear-history').addEventListener('click', clearHistory);

function restoreOptions() {
    chrome.storage.sync.get({ templates: defaultTemplates, history: [] }, (data) => {
        renderTemplates(data.templates);
        renderHistory(data.history);
        updateSyncStatus();
    });
}

function updateSyncStatus() {
    const h3 = document.querySelector('h3:nth-of-type(2)');
    if (h3) {
        // Clear previous status if any to avoid duplication
        const cleanTitle = h3.innerHTML.split('<span')[0];
        h3.innerHTML = cleanTitle + ' <span style="font-size:10px; color:#2ed573; border:1px solid #2ed573; padding:2px 4px; border-radius:4px; margin-left:8px;">☁️ Cloud Synced</span>';
    }
}

function renderTemplates(templates) {
    const container = document.getElementById('templates-list');
    container.innerHTML = '';

    templates.forEach((tmpl, index) => {
        const div = document.createElement('div');
        div.className = 'item';
        div.innerHTML = `
      <div style="flex: 1">
        <div style="font-weight: 500">${tmpl.label}</div>
        <div style="font-size: 11px; color: #8e8e93; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 250px;">${tmpl.text}</div>
      </div>
      <button class="delete" data-index="${index}">Delete</button>
    `;
        container.appendChild(div);
    });

    document.querySelectorAll('.delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            deleteTemplate(parseInt(e.target.dataset.index));
        });
    });
}

function renderHistory(history) {
    const container = document.getElementById('history-list');
    container.innerHTML = '';
    if (Object.keys(history).length === 0) {
        container.innerHTML = '<div class="history-item">No history yet...</div>';
        return;
    }

    // Show last 20 items inverted
    const slice = history.slice(-20).reverse();

    slice.forEach(item => {
        const div = document.createElement('div');
        div.className = 'history-item';
        div.innerText = item.text.substring(0, 60) + (item.text.length > 60 ? '...' : '');
        div.title = item.text; // Tooltip
        div.addEventListener('click', () => {
            navigator.clipboard.writeText(item.text);
            div.innerText = "Copied!";
            setTimeout(() => div.innerText = item.text.substring(0, 60) + "...", 1000);
        });
        container.appendChild(div);
    });
}

function addTemplate() {
    const label = document.getElementById('new-label').value;
    const text = document.getElementById('new-text').value;

    if (!label || !text) return;

    chrome.storage.sync.get({ templates: defaultTemplates }, (data) => {
        const templates = data.templates;
        templates.push({ id: Date.now().toString(), label, text });
        chrome.storage.sync.set({ templates }, () => {
            document.getElementById('new-label').value = '';
            document.getElementById('new-text').value = '';
            renderTemplates(templates);
        });
    });
}

function deleteTemplate(index) {
    chrome.storage.sync.get({ templates: defaultTemplates }, (data) => {
        const templates = data.templates;
        templates.splice(index, 1);
        chrome.storage.sync.set({ templates }, () => {
            renderTemplates(templates);
        });
    });
}

function clearHistory() {
    chrome.storage.sync.set({ history: [] }, () => {
        renderHistory([]);
    });
}
