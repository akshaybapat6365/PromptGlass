# PromptGlass (formerly AI Prompt Helper)

**Minimalist. Transparent. Efficient.**
PromptGlass adds a refined "Liquid Glass" toolbar to ChatGPT and Gemini, allowing you to control output length and style with zero friction.

## Installation
1.  Open Chrome and navigate to `chrome://extensions`.
2.  Enable **Developer mode** (toggle in the top right corner).
3.  Click the **Load unpacked** button (top left).
4.  Select the following folder:
    `/Users/akshaybapat/.gemini/antigravity/scratch/ai-prompt-helper`
5.  The extension "AI Prompt Helper" should now appear in your list.

## Usage
1.  Go to **ChatGPT** (`chatgpt.com`) or **Gemini** (`gemini.google.com`).
2.  You will see a floating toolbar in the bottom-right corner.
3.  **Click and Drag** the header "AI HELPER" to move it if it's in the way.
4.  Type your query, then click a button:
    -   **1 Sentence**: Appends `(Output: 1 sentence max)`
    -   **2 Sentences**: Appends `(Output: 2 sentences max)`
    -   **Strict Style**: Appends your custom style guidelines.
5.  Send your message!

## Customization
To change the text or add buttons, edit `src/content.js` in the folder mentioned above.
