# 📜 SPECS.md : Interactive Webtoon Generator

## 1. Overview & Product Vision

Mobile-first web application for reading interactive Webtoons. The user reads a story in the form of a vertically scrolling comic strip. At certain narrative nodes, the story pauses to offer a direction choice combined with a natural language input field. The continuation of the story (dialogues + visuals) is generated on-the-fly asynchronously without ever blocking the reading experience.

---

## 2. Architecture & Tech Stack

* **Frontend:** Next.js (App Router, TypeScript), Tailwind CSS, Framer Motion (bubble animations & fade-in).

* **Backend API:** Next.js Server Actions / Route Handlers (or FastAPI).
* **AI & Orchestration (OpenAI SDK):**
  * **OpenAI Decisions API / GPT-6 Luna:** Instant evaluation (< 200ms) of the narrative direction based on the user's choice + text.
  * **GPT-4o (Structured Outputs):** Generation of the continuation script (strict JSON: dialogue bubbles, onomatopoeia, image descriptions).

* **DALL-E 3:** Generation of panel visuals (executed in parallel in the background).

* **Dev Assistant:** Codex Max (generation of UI components and event pipelines).

---

## 3. Ultra-Strict Latency & Pipeline Constraints (SLA)

* **0.0s – 0.3s:** Choice validation by the **Decisions API** (`choice`).
* **0.3s – 2.0s:** Text script generation by **GPT-4o (Structured Outputs)**.
* **< 3.0s (FIRST VISUAL FEEDBACK REQUIRED):** The UI unlocks scrolling, inserts the new panel cards with text/dialogues in *typing* mode and an image container in *sketch / animated wireframe* style.

* **3.0s – 12.0s:** DALL-E 3 images are received asynchronously and replace the sketch with a *fade-in* effect.
* **Max Cap:** **30s** for 100% of the sequence to be fully loaded in HD.

---

## 4. Data Schemas (JSON Contracts)

### A. Panel Format (`ComicPanel`)

```typescript
interface SpeechBubble {
  id: string;
  character: string;
  text: string;
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
  style?: 'normal' | 'whisper' | 'shout';
}

interface ComicPanel {
  panel_id: string;
  sequence_index: number;
  layout_aspect: 'square' | 'vertical' | 'banner';
  onomatopoeia?: {
    text: string; // e.g., "BOOM!", "SWOOSH!"
    position: { x: number; y: number }; // Percentage 0-100
  };
  dialogues: SpeechBubble[];
  image_prompt: string; // Description sent to DALL-E 3
  image_url?: string;   // Filled in asynchronously
  status: 'pending_script' | 'rendering_text' | 'loading_image' | 'complete';
}
```

### B. Script Response Format (`GPT-4o Structured Output`)

```json
{
  "story_node_id": "node_step_2",
  "panels": [
    {
      "panel_id": "panel_1",
      "sequence_index": 1,
      "layout_aspect": "vertical",
      "onomatopoeia": { "text": "CRASH!", "position": { "x": 50, "y": 20 } },
      "dialogues": [
        {
          "id": "d1",
          "character": "Kael",
          "text": "What are you doing here?!",
          "position": "top-left",
          "style": "shout"
        }
      ],
      "image_prompt": "Cyberpunk detective Kael wearing a yellow coat looking shocked in a dark neon alleyway, webtoon digital art style, line art."
    }
  ]
}
```

---

## 5. Navigation Flow / User Journey

1. **Home / Library (`/`):**
   * Grid of base story covers (e.g., *Apocalypse Hackathon*, *Cyberpunk Romance*).

2. **Reading Pre-made Beginning (`/story/[id]`):**
   * Instant vertical scroll over the first 3 pre-recorded panels.

3. **Decision Point (`Branching Component`):**
   * Locks scrolling.
   * Offers 3 options (e.g., `[Attack, Flee, Negotiate]`) + a free text field: *"Add a detail (e.g., 'a cat appears')"*.

4. **Generation & Streaming (< 3s -> 12s):**
   * Validation button that triggers the asynchronous pipeline.
   * Immediate scroll unlock upon receiving the next panel's text.

5. **End & Share:**
   * After 2 or 3 iterations, the story ends with a "Share Your Webtoon" card generating a unique personalized link.

---

## 6. Execution Guide for Codex Max (Dev Roadmap)

### Step 1: UI Shell & Webtoon Layout (Saturday Morning)

* [ ] Create the `<WebtoonReader/>` component (scroll snap, clean vertical layout).
* [ ] Create the `<ComicPanel/>` component handling the overlay of text bubbles and onomatopoeia on top of an image.
* [ ] Add an animated placeholder (sketch/skeleton) during image loading.

### Step 2: AI Engine & Orchestration (Saturday Afternoon)

* [ ] Create the OpenAI client for the **Decisions API** to route the scene type.
* [ ] Create the Server Action with **Structured Outputs** (`type: "json_schema"`) to generate the `ComicPanel[]` structure.
* [ ] Implement the asynchronous parallel call to **DALL-E 3**.

### Step 3: Polishing & UX Optimization (Sunday)

* [ ] Prepare 2 pre-made "Base" stories (already saved as JSON/local assets).
* [ ] Add Framer Motion animations (bubble pop-in, image fade-in).
* [ ] Test end-to-end latency and validate compliance with the 5s / 30s budget.