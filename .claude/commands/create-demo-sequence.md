# Create Demo Sequence

Takes a folder of sequentially-named screenshots and produces an annotated GIF + MP4 demo with contextual captions describing user actions.

## Invocation

```
/create-demo-sequence
```

## Required Inputs (collect from user)

1. **Folder path** — directory containing sequentially-named screenshots (e.g., `01_login.png`, `02_dashboard.png`)
2. **Demo goal prompt** — brief description of what the demo shows (e.g., "User onboarding flow for new signups")
3. **Context file path** (optional) — path to a PRD, README, or flow document that describes the use case

## Execution Steps

### Step 1: Validate Input

- Scan the folder for image files (PNG, JPG, JPEG)
- Sort by filename prefix (numeric/alphabetical)
- **Quality gate**: Check dimensions of all screenshots
  - If aspect ratios differ significantly (>10% variance), STOP and report to user with suggestions
  - Minor size differences: resize all to the most common dimension using high-quality downscaling
  - Log any concerns before proceeding

### Step 2: Analyze Context & Generate Annotations

- Read the user's demo goal prompt
- Read the context file (if provided)
- Analyze each screenshot visually to understand what screen/state it represents
- Generate annotations that describe **what the user is doing** at each step (action-oriented)
  - Example: "Click the Login button", "Fill in email address", "Select the Pro plan"
- Keep annotations concise: max 8-10 words per frame

### Step 3: Position Annotations

- For each frame, determine annotation placement:
  - Find areas with whitespace/empty space relative to the action target area
  - Never obscure primary content or the UI element being described
  - Prefer bottom-third or top-third positioning based on content density
  - Maintain consistent positioning across frames where possible (avoid jumping around)

### Step 4: Style Annotations

- Analyze the dominant color palette of the screenshot set
- Apply ONE consistent style across all frames:
  - Background: semi-transparent pill/rounded rect behind text
  - Contrast: ensure WCAG AA readability against the image
  - Font: clean sans-serif (Arial/Helvetica), bold weight
  - Size: proportional to image dimensions (~3-4% of image height)
  - If screenshots are predominantly dark → light text on dark pill
  - If screenshots are predominantly light → dark text on light pill
- Add a subtle step indicator (e.g., "1/10") in a fixed corner position

### Step 5: Generate Annotated Screenshots

- Apply annotations to each frame using ImageMagick
- Save annotated frames to `<input_folder>/annotated/` subfolder
- Maintain original filenames with `_annotated` suffix

### Step 6: Assemble GIF

- **Frame rate**: 2 seconds per frame (default)
  - Frames with longer annotation text (>6 words): +0.5s display time
- **Transitions**: crossfade dissolve between frames (200ms)
- **Loop**: infinite
- **Resize**: all frames normalized to consistent dimensions before assembly
- **Optimization**: reduce GIF file size with color palette optimization (256 colors)
- Output: `<input_folder>/<derived-name>-demo.gif`

### Step 7: Assemble MP4

- Same frame timing and transitions as GIF
- **Loop**: play once
- **End**: 1.5s hold on final frame then fade to black (0.5s)
- **Codec**: H.264 for universal compatibility
- **Quality**: high (CRF 18-20)
- Output: `<input_folder>/<derived-name>-demo.mp4`

### Step 8: Summary

- Report output file paths and sizes
- Show the annotation list (frame → caption mapping)
- Note any decisions made (resizing, timing adjustments)

## Output Naming

- Derive name from the demo goal prompt (kebab-case, e.g., "onboarding-flow")
- Annotated frames: `<folder>/annotated/<original_name>_annotated.png`
- GIF: `<folder>/<derived-name>-demo.gif`
- MP4: `<folder>/<derived-name>-demo.mp4`

## Dependencies

On first run, check for and install if missing:
- **ImageMagick** — annotation rendering and image manipulation
- **ffmpeg** — GIF/MP4 assembly, transitions, encoding

Use `magick` (ImageMagick v7) or fall back to `convert` (v6). Check with `magick --version` or `convert --version`.

## Duration Estimate

| Frames | Duration (@ 2s/frame + transitions) |
|--------|--------------------------------------|
| 10     | ~22 seconds                          |
| 12     | ~26 seconds                          |
| 15     | ~33 seconds                          |

## Defaults (Happy Path)

| Setting | Default |
|---------|---------|
| Frame rate | 2 sec/frame |
| Adaptive timing | +0.5s for text-heavy frames |
| GIF loop | Infinite |
| MP4 loop | Play once, fade-out |
| Transitions | Crossfade 200ms |
| Annotation style | Auto-contrast pill, sans-serif bold |
| Positioning | Whitespace-aware, relative to action area |
| Max frames | 10-15 (warn if more) |
| Quality gate | Stop if aspect ratios differ >10% |

---

## Backlog (Pending Refinements)

> Show these when user asks for pending clarifications.

### Open Questions — Parked for Review

1. **Frame rate configurability** — Should the skill offer "use default or custom?" at invocation, or always use 2s?
2. **Adaptive timing logic** — Should frames with more annotation text automatically get +0.5s, or should all frames be uniform?
3. **Loop behavior per-run** — Should GIF/MP4 loop settings be asked each time or always use defaults?
4. **Transition style choice** — Hard cut vs crossfade vs dissolve — should this be configurable per invocation?
5. **Output naming override** — Should user be able to specify a custom output filename?
6. **Batch processing** — Support multiple demo folders in one invocation?
7. **Annotation review step** — Should the skill pause to show proposed annotations before rendering, or go fully automated?
8. **Arrow/pointer overlays** — Add visual indicators (arrows, circles) pointing to the target UI element?
9. **Thumbnail strip** — Generate a horizontal filmstrip preview image alongside the GIF/MP4?
10. **Frame count limits** — Hard cap at 15, or warn-and-continue for larger sequences?
11. **Audio narration** — Future: generate TTS narration for MP4 based on annotations?
12. **Watermark/branding** — Option to add logo or watermark to output?
