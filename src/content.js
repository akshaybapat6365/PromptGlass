// AI Prompt Helper - Advanced Content Script

let customTemplates = [];

// Load templates on start
chrome.storage.sync.get({ templates: [] }, (data) => {
  customTemplates = data.templates;
});

// Listen for storage changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.templates) {
    customTemplates = changes.templates.newValue;
  }
});

function createToolbar() {
  if (document.getElementById('ai-prompt-helper-container')) return;

  const container = document.createElement('div');
  container.id = 'ai-prompt-helper-container';
  container.innerHTML = `
    <div class="aph-handle"></div>
    
    <!-- 1 Sentence -->
    <button class="aph-btn" title="1 Sentence">1</button>
    
    <!-- 2 Sentences -->
    <button class="aph-btn" title="2 Sentences">2</button>
    
    <!-- Custom Number -->
    <button class="aph-btn aph-btn-custom" id="aph-custom-btn" title="Custom Limit">#
      <input type="number" id="aph-custom-input" placeholder="#" min="1" max="99">
    </button>

    <!-- Templates Menu -->
    <button class="aph-btn aph-btn-star" id="aph-star-btn" title="Templates">★</button>

    <!-- Save Prompt -->
    <button class="aph-btn aph-btn-save" id="aph-save-btn" title="Save Current Prompt">+</button>

    <!-- Popup Menu -->
    <div id="aph-popup-menu"></div>
  `;

  document.body.appendChild(container);

  // Dragging logic
  makeDraggable(container);

  // Button Listeners for 1 & 2 (using data attributes for safety)
  container.querySelector('.aph-btn[title="1 Sentence"]').addEventListener('click', () => insertText(" (Output: 1 sentence max)"));
  container.querySelector('.aph-btn[title="2 Sentences"]').addEventListener('click', () => insertText(" (Output: 2 sentences max)"));

  // Custom Number Logic
  const customBtn = document.getElementById('aph-custom-btn');
  const customInput = document.getElementById('aph-custom-input');

  // Only toggle expansion when clicking the button itself, not the input
  customBtn.addEventListener('click', (e) => {
    // Ignore clicks on the input field
    if (e.target === customInput) {
      e.stopPropagation();
      return;
    }

    // Toggle expanded state
    const isExpanded = customBtn.classList.toggle('expanded');
    if (isExpanded) {
      customInput.style.display = 'block';
      customInput.focus();
    } else {
      customInput.style.display = 'none';
    }

    // Prevent this click from doing anything else
    e.stopPropagation();
  });

  customInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();  // Prevent the default form submission behavior
      e.stopPropagation(); // Stop 'Enter' from bubbling to the form
      e.stopImmediatePropagation(); // Stop any other listeners

      const val = customInput.value;
      if (val) {
        insertText(` (Output: Max ${val} sentences)`);
      }
      customInput.value = '';
      customBtn.classList.remove('expanded');
      customInput.style.display = 'none';

      // Return focus to main input so they can type immediately
      const inputObj = getActiveInput();
      if (inputObj) inputObj.element.focus();
    }
  });

  // Templates Logic
  const starBtn = document.getElementById('aph-star-btn');
  const menu = document.getElementById('aph-popup-menu');

  starBtn.addEventListener('click', () => {
    menu.innerHTML = ''; // Clear

    // Add User Templates
    if (customTemplates.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'aph-menu-item';
      empty.innerText = "No templates set in Options";
      menu.appendChild(empty);
    } else {
      customTemplates.forEach(tmpl => {
        const item = document.createElement('div');
        item.className = 'aph-menu-item';
        item.innerText = tmpl.label;
        item.addEventListener('click', () => {
          insertText(" " + tmpl.text); // Prepend space
          menu.classList.remove('visible');
        });
        menu.appendChild(item);
      });
    }

    // Add "Manage..." link
    const manage = document.createElement('div');
    manage.className = 'aph-menu-item';
    manage.style.borderTop = '1px solid rgba(255,255,255,0.1)';
    manage.style.marginTop = '4px';
    manage.innerText = "⚙️ Manage Templates";
    manage.addEventListener('click', () => chrome.runtime.sendMessage({ openOptions: true }));
    menu.appendChild(manage);

    menu.classList.toggle('visible');
  });

  // Save Prompt Logic (+)
  document.getElementById('aph-save-btn').addEventListener('click', () => {
    const inputObj = getActiveInput();
    if (!inputObj) return;
    const text = inputObj.element.value || inputObj.element.innerText;

    if (text && text.trim().length > 0) {
      const cleanText = text.trim();

      // 1. Prevent saving System/Generated outputs (Regex)
      // Matches "(Output: ...)" at start/end
      if (/^\(Output:.*?\)$/i.test(cleanText)) {
        showToast("Cannot save system command", true);
        return;
      }

      // 2. Prevent Duplicates (Exact Match)
      const isDuplicate = customTemplates.some(t => t.text.trim() === cleanText);
      if (isDuplicate) {
        showToast("Template already exists", true);
        return;
      }

      // Save to templates
      chrome.storage.sync.get({ templates: [] }, (data) => {
        const newTmpl = {
          id: Date.now().toString(),
          label: cleanText.substring(0, 10) + '...', // Auto-label
          text: cleanText
        };
        const updated = data.templates;
        updated.push(newTmpl);
        chrome.storage.sync.set({ templates: updated }, () => {
          showToast("Saved as Template!");
        });
      });
    } else {
      showToast("Input is empty", true);
    }
  });
}

function insertText(textToInsert) {
  const inputObj = getActiveInput();
  if (!inputObj) {
    showToast("No input found", true);
    return;
  }

  const { element, type } = inputObj;
  element.focus();

  if (type === 'textarea') {
    const start = element.selectionStart;
    const end = element.selectionEnd;
    const value = element.value;
    const newValue = value.substring(0, start) + textToInsert + value.substring(end);

    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(element, newValue);
    } else {
      element.value = newValue;
    }

    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));

  } else if (type === 'contenteditable') {
    document.execCommand('insertText', false, textToInsert);
  }
}

function getActiveInput() {
  const textarea = document.querySelector('textarea#prompt-textarea') || document.querySelector('textarea[data-id="root"]');
  if (textarea) return { element: textarea, type: 'textarea' };

  const contentEditable = document.querySelector('div[contenteditable="true"][role="textbox"]') ||
    document.querySelector('div[contenteditable="true"]');
  if (contentEditable) return { element: contentEditable, type: 'contenteditable' };

  return null;
}

function showToast(msg, error = false) {
  const toast = document.createElement('div');
  Object.assign(toast.style, {
    position: 'fixed', bottom: '130px', right: '20px', padding: '8px 16px',
    background: error ? '#ff4757' : '#2ed573', color: '#fff', borderRadius: '8px',
    zIndex: '10001', fontSize: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
  });
  toast.innerText = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2000);
}

function makeDraggable(element) {
  const handle = element.querySelector('.aph-handle');
  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

  handle.onmousedown = dragMouseDown;

  function dragMouseDown(e) {
    e = e || window.event;
    e.preventDefault();
    pos3 = e.clientX;
    pos4 = e.clientY;
    document.onmouseup = closeDragElement;
    document.onmousemove = elementDrag;
  }

  function elementDrag(e) {
    e = e || window.event;
    e.preventDefault();
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;
    element.style.top = (element.offsetTop - pos2) + "px";
    element.style.left = (element.offsetLeft - pos1) + "px";
    element.style.bottom = 'auto'; element.style.right = 'auto';
  }

  function closeDragElement() {
    document.onmouseup = null; document.onmousemove = null;
  }
}

// History Saver Interceptor
// We listen for 'Enter' key on inputs or clicks on the send button
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    // Potential submit
    setTimeout(saveToHistory, 100);
  }
}, true); // Capture phase

// Also listen for button clicks (generic approach)
document.addEventListener('click', (e) => {
  // Basic heuristic for send buttons: often have svg or 'send' in aria-label
  // This is hard to perfect without specific selectors, but we can try generic
  if (e.target.closest('button[data-testid="send-button"]') || // ChatGPT
    e.target.closest('.send-button') ||
    e.target.closest('button[aria-label*="Send"]')) {
    saveToHistory();
  }
}, true);

let lastSavedText = "";

function saveToHistory() {
  const inputObj = getActiveInput();
  if (!inputObj) return; // Can't read input

  const text = inputObj.element.value || inputObj.element.innerText;
  if (!text || text.trim() === "" || text === lastSavedText) return;

  lastSavedText = text; // Debounce duplicate saves

  chrome.storage.sync.get({ history: [] }, (data) => {
    const history = data.history;
    history.push({
      timestamp: Date.now(),
      text: text,
      platform: window.location.hostname
    });
    // Limit history to 50 items for Cloud Sync quotas (max 100KB total)
    if (history.length > 50) history.shift();

    chrome.storage.sync.set({ history }, () => {
      if (chrome.runtime.lastError) {
        console.warn("Cloud Sync Error:", chrome.runtime.lastError);
        showToast("Sync Error: History full?", true);
      } else {
        console.log("AI Prompt Helper: Saved to Cloud History");
      }
    });
  });
}


const observer = new MutationObserver((mutations) => {
  if (!document.getElementById('ai-prompt-helper-container')) {
    createToolbar();
  }
});
observer.observe(document.body, { childList: true, subtree: true });
setTimeout(createToolbar, 1000);
