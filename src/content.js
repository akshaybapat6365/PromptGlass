// AI Prompt Helper - Advanced Content Script

let customTemplates = [];
let lastFocusedInput = null; // Track the last focused input element

// Helper to check if extension context is still valid
function isExtensionValid() {
  try {
    return chrome.runtime && !!chrome.runtime.id;
  } catch (e) {
    return false;
  }
}

// Safely call chrome APIs
function safeStorageGet(keys, callback) {
  if (!isExtensionValid()) return;
  try {
    chrome.storage.sync.get(keys, callback);
  } catch (e) {
    console.warn('PromptGlass: Extension context invalidated');
  }
}

function safeStorageSet(data, callback) {
  if (!isExtensionValid()) return;
  try {
    chrome.storage.sync.set(data, callback);
  } catch (e) {
    console.warn('PromptGlass: Extension context invalidated');
  }
}

// Load templates on start
safeStorageGet({ templates: [] }, (data) => {
  if (data) customTemplates = data.templates;
});

// Listen for storage changes
try {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (!isExtensionValid()) return; // Guard inside callback
    if (area === 'sync' && changes.templates) {
      customTemplates = changes.templates.newValue;
    }
  });
} catch (e) {
  // Ignore - extension context invalid
}

// Track focus on inputs across the page
document.addEventListener('focusin', (e) => {
  const el = e.target;
  // Only track textareas and contenteditable elements
  if (el.tagName === 'TEXTAREA' || el.getAttribute('contenteditable') === 'true') {
    // Don't track our own custom input
    if (el.id !== 'aph-custom-input') {
      lastFocusedInput = {
        element: el,
        type: el.tagName === 'TEXTAREA' ? 'textarea' : 'contenteditable'
      };
    }
  }
}, true);

function createToolbar() {
  if (document.getElementById('ai-prompt-helper-container')) return;

  const container = document.createElement('div');
  container.id = 'ai-prompt-helper-container';
  container.innerHTML = `
    <div class="aph-handle">⋮⋮</div>
    
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
    manage.addEventListener('click', () => {
      if (isExtensionValid()) {
        try { chrome.runtime.sendMessage({ openOptions: true }); } catch (e) { }
      }
    });
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
      safeStorageGet({ templates: [] }, (data) => {
        if (!data) return;
        const newTmpl = {
          id: Date.now().toString(),
          label: cleanText.substring(0, 10) + '...', // Auto-label
          text: cleanText
        };
        const updated = data.templates;
        updated.push(newTmpl);
        safeStorageSet({ templates: updated }, () => {
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
  // Helper to check if element is truly usable
  function isUsable(el) {
    if (!el || !document.body.contains(el)) return false;
    // Check if element is visible (not in a closed dialog)
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  // 1. First priority: Use our tracked last focused input (if still valid)
  if (lastFocusedInput && lastFocusedInput.element && isUsable(lastFocusedInput.element)) {
    return lastFocusedInput;
  } else {
    // Clear stale reference
    lastFocusedInput = null;
  }

  // 2. Second priority: Check if any relevant input is currently focused
  const activeElement = document.activeElement;
  if (activeElement && isUsable(activeElement)) {
    if (activeElement.tagName === 'TEXTAREA' && activeElement.id !== 'aph-custom-input') {
      return { element: activeElement, type: 'textarea' };
    }
    if (activeElement.getAttribute('contenteditable') === 'true') {
      return { element: activeElement, type: 'contenteditable' };
    }
  }

  // 3. Third priority: Look for edit dialogs (visible ones)
  const editTextarea = document.querySelector('[role="dialog"] textarea, .edit-message textarea');
  if (editTextarea && isUsable(editTextarea)) {
    return { element: editTextarea, type: 'textarea' };
  }

  // 4. Fallback: Main chat input
  const mainTextarea = document.querySelector('textarea#prompt-textarea') ||
    document.querySelector('textarea[data-id="root"]');
  if (mainTextarea && isUsable(mainTextarea)) {
    return { element: mainTextarea, type: 'textarea' };
  }

  // Try any visible textarea
  const anyTextarea = document.querySelector('textarea:not(#aph-custom-input)');
  if (anyTextarea && isUsable(anyTextarea)) {
    return { element: anyTextarea, type: 'textarea' };
  }

  const contentEditable = document.querySelector('div[contenteditable="true"][role="textbox"]') ||
    document.querySelector('div[contenteditable="true"]');
  if (contentEditable && isUsable(contentEditable)) {
    return { element: contentEditable, type: 'contenteditable' };
  }

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
  let isDragging = false;
  let startX, startY, startLeft, startTop;

  // Make draggable from handle
  element.addEventListener('mousedown', (e) => {
    // Use closest() to handle clicks on child elements
    const clickedHandle = e.target.closest('.aph-handle');
    const clickedContainer = e.target === element;

    // Only initiate drag from handle or container background
    if (!clickedHandle && !clickedContainer) return;

    isDragging = true;
    e.preventDefault();
    e.stopPropagation();

    // Get strictly current visual position
    startX = e.clientX;
    startY = e.clientY;

    const rect = element.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;

    // Convert CSS positioning to explicit top/left to allow movement
    element.style.left = startLeft + 'px';
    element.style.top = startTop + 'px';
    // Unset the conflicting anchors
    element.style.bottom = 'auto';
    element.style.right = 'auto';
    element.style.margin = '0';

    document.addEventListener('mousemove', elementDrag);
    document.addEventListener('mouseup', closeDragElement);
  });

  function elementDrag(e) {
    if (!isDragging) return;
    e.preventDefault();

    // Calculate delta
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    // Apply new position
    element.style.top = (startTop + dy) + "px";
    element.style.left = (startLeft + dx) + "px";
  }

  function closeDragElement() {
    isDragging = false;
    document.removeEventListener('mousemove', elementDrag);
    document.removeEventListener('mouseup', closeDragElement);
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

  safeStorageGet({ history: [] }, (data) => {
    if (!data) return;
    const history = data.history;
    history.push({
      timestamp: Date.now(),
      text: text,
      platform: window.location.hostname
    });
    // Limit history to 50 items for Cloud Sync quotas (max 100KB total)
    if (history.length > 50) history.shift();

    safeStorageSet({ history }, () => {
      console.log("PromptGlass: Saved to Cloud History");
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
