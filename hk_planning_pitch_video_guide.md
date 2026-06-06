# Hong Kong Planning Intelligence Pitch Video Guide

## Purpose

Create a **two-minute hackathon pitch video** for a web-based planning intelligence platform designed for Hong Kong city planners.

The video should combine:

- Real openly licensed Hong Kong footage for credibility
- Real prototype screen recordings for evidence
- AI-generated motion only for transitions, unfinished features, or abstract visual support
- Clear wording that frames the system as **decision support**, not an autonomous city-planning authority

---

## Core Video Strategy

Use the following structure:

> Real Hong Kong footage for credibility + real prototype screen recordings for proof + AI-generated motion for transitions and incomplete features.

For a city-planning hackathon, the product demo should dominate. AI-generated footage should support the story, not replace the interface.

Use the term **openly licensed footage** rather than **open-source footage** when discussing video material. For video, the relevant categories are usually:

- Creative Commons
- Public domain
- Free stock licenses
- Government open data/media terms, where applicable

---

# 1. Final Video Architecture

## Target Runtime

Maximum length: **120 seconds**

| Time | Section | Main Asset Type | Can Build Now? |
|---:|---|---|---|
| 0:00-0:08 | Opening Hong Kong complexity | Real Hong Kong footage | Yes |
| 0:08-0:20 | Planning problem | Real footage + motion text | Yes |
| 0:20-0:38 | District map overview | Prototype screen recording | Yes |
| 0:38-0:55 | Click district + statistics | Prototype screen recording | Yes |
| 0:55-1:10 | District drill-down | Prototype or mock UI | Yes |
| 1:10-1:28 | LLM planning objective | Mock or prototype UI | Yes |
| 1:28-1:45 | Scenario reallocation output | Mocked future-state UI | Yes |
| 1:45-1:56 | Phased action roadmap | Mocked output UI | Yes |
| 1:56-2:00 | Closing | Logo, URL, team | Yes |

## Main Implementation Target

The most important immediate goal is the **complete narrative flow**, not the real algorithm.

For the video, you can show a polished scenario-output state if you avoid implying that a validated planning model has produced binding decisions.

---

# 2. Final Voiceover Script

Approximate length: **245 words**

```text
Hong Kong's future development requires balancing housing, industry, transport, land use, infrastructure, and environmental constraints across one of the world's densest urban environments.

The problem is not that planners lack data. The problem is turning district-level statistics, spatial evidence, and long-term policy goals into clear development scenarios.

Our prototype is a planning intelligence platform for Hong Kong. It begins with an interactive map of the city's districts. Each district contains a structured profile with key planning indicators, including population, land use, transport access, development pressure, and infrastructure context.

A planner can click into a district to inspect its geographical breakdown in more detail. This makes it easier to understand where capacity exists, where constraints are concentrated, and where trade-offs are likely to appear.

The planner can then define a future objective in natural language. For example: prioritize industrial development in Sai Kung by 2040, while minimizing residential displacement and preserving key green areas.

The system translates that objective into planning parameters: target district, time horizon, development priority, constraints, and evaluation criteria.

It then generates a candidate reallocation pathway for planner review. The output highlights potential redevelopment zones, estimated relocation pressure, suggested future land uses, and policy trade-offs requiring further assessment.

Finally, the platform presents a phased roadmap from today to the selected future state.

This is not an automatic city-planning decision-maker. It is a decision-support platform for faster scenario exploration, clearer evidence, and more transparent long-term planning.

From district insight to future-state simulation, our prototype helps Hong Kong planners turn complex data into actionable development pathways.
```

---

# 3. What to Implement Now

You do **not** need the full backend to create a convincing video. You need recordable states.

| Screen | Implementation Level Needed | Video Role |
|---|---|---|
| Hong Kong district map | Real interactive prototype if possible | Shows product exists |
| District hover/click | Real or scripted interaction | Shows usability |
| District statistics panel | Static data acceptable | Shows data integration |
| District drill-down | Static sub-map acceptable | Shows geographic granularity |
| LLM objective input | Static or mocked interaction acceptable | Shows AI workflow |
| Parsed planning parameters | Static or mocked output acceptable | Shows explainability |
| Candidate reallocation map | Mocked scenario acceptable | Shows end-state value |
| Phased roadmap | Static output acceptable | Shows actionable result |

## Minimum Viable District Data Cards

Show **5-6 metrics**, not 15.

Recommended metrics:

1. Population
2. Median household income or age
3. Land-use mix
4. Transport accessibility
5. Development capacity or constraint score
6. Environmental or infrastructure constraint

For real district data, use Hong Kong government open datasets where possible. Useful sources include:

- DATA.GOV.HK
- Hong Kong Common Spatial Data Infrastructure, or CSDI
- 2021 Population Census district-profile datasets

---

# 4. Visual Storyboard

## Shot 1: Opening Hong Kong Context

**Time:** 0:00-0:08  
**Visual:** Real Hong Kong skyline, aerial density, harbour, dense high-rises, or district map footage.  
**Asset source:** Pexels, Pixabay, Wikimedia Commons, or YouTube Creative Commons.

### On-Screen Text

```text
Hong Kong development decisions are spatial, dense, and long-term.
```

### Narration

```text
Hong Kong's future development requires balancing housing, industry, transport, land use, infrastructure, and environmental constraints across one of the world's densest urban environments.
```

### Editing Notes

- Keep the tone civic and analytical.
- Avoid dramatic trailer-style music.
- Do not make this look like a tourism video.

---

## Shot 2: Problem - Disconnected Evidence Layers

**Time:** 0:08-0:20  
**Visual:** Quick montage of city footage, map overlay, fake/report cards, and planning data layers.

### Suggested Visual Elements

- Hong Kong footage
- Map grid overlay
- Floating cards labeled:
  - Population
  - Land use
  - Transport
  - Infrastructure
  - Environmental constraints
  - Development pressure
- Split-screen showing spreadsheet/map/report fragments

### On-Screen Text

```text
From fragmented evidence to scenario clarity
```

### Narration

```text
The problem is not that planners lack data. The problem is turning district-level statistics, spatial evidence, and long-term policy goals into clear development scenarios.
```

### Implementation

This can be built entirely in DaVinci Resolve using:

- Real Hong Kong footage
- Text overlays
- Simple animated cards
- Subtle map/grid overlay

---

## Shot 3: Product Intro - District Map

**Time:** 0:20-0:38  
**Visual:** OBS screen recording of the prototype.

### Actions

1. Load the app.
2. Show full Hong Kong district map.
3. Hover district boundaries.
4. Show district names.

### On-Screen Text

```text
Interactive district intelligence map
```

### Narration

```text
Our prototype is a planning intelligence platform for Hong Kong. It begins with an interactive map of the city's districts.
```

### Implementation

This should be real product footage if possible.

---

## Shot 4: District Statistics

**Time:** 0:38-0:55  
**Visual:** Click Sai Kung. Side panel opens.

### Example Stats Card

```text
Sai Kung District

Population: 489k
Land-use pressure: Medium
Transport access: Moderate
Industrial suitability: Candidate zones only
Green-area sensitivity: High
Planning horizon: 2040
```

Use **illustrative prototype values** if necessary.

### Narration

```text
Each district contains a structured profile with key planning indicators, including population, land use, transport access, development pressure, and infrastructure context.
```

---

## Shot 5: Geographic Drill-Down

**Time:** 0:55-1:10  
**Visual:** Zoom into Sai Kung. Show sub-zones, overlays, or colored blocks.

### Suggested Labels

- Existing residential clusters
- Green/open-space sensitivity
- Transport access corridors
- Candidate industrial-compatible zones
- Constraint areas

### Narration

```text
A planner can click into a district to inspect its geographical breakdown in more detail. This makes it easier to understand where capacity exists, where constraints are concentrated, and where trade-offs are likely to appear.
```

### Implementation

Can be a static map state if the interactive version is not ready.

---

## Shot 6: LLM Planning Objective

**Time:** 1:10-1:28  
**Visual:** Natural-language input box.

### Input Text

```text
Prioritize industrial development in Sai Kung by 2040 while minimizing residential displacement and preserving key green areas.
```

### Parsed Parameters

```text
Target district: Sai Kung
Planning horizon: 2040
Development priority: Industrial capacity
Constraint 1: Minimize displacement
Constraint 2: Preserve green areas
Evaluation: Access, land suitability, relocation pressure
```

### Narration

```text
The planner can then define a future objective in natural language. The system translates that objective into planning parameters: target district, time horizon, development priority, constraints, and evaluation criteria.
```

### Implementation

This can be mocked as a polished UI flow. It does not require the real optimization engine.

---

## Shot 7: Scenario Reallocation Pathway

**Time:** 1:28-1:45  
**Visual:** Before/after map.

### Safe Labels

```text
Candidate redevelopment zone
High relocation pressure
Infrastructure upgrade required
Environmental review required
Industrial transition area
```

### Narration

```text
It then generates a candidate reallocation pathway for planner review. The output highlights potential redevelopment zones, estimated relocation pressure, suggested future land uses, and policy trade-offs requiring further assessment.
```

### Guidance

Avoid showing exact demolition decisions unless you can defend them. Use zones, categories, and review flags instead.

---

## Shot 8: Phased Roadmap

**Time:** 1:45-1:56  
**Visual:** Timeline.

### Roadmap Text

```text
2026-2028: Validate constraints and land-use compatibility
2028-2032: Identify relocation capacity and infrastructure needs
2032-2036: Phase redevelopment of candidate zones
2036-2040: Review outcomes and adjust district plan
```

### Narration

```text
Finally, the platform presents a phased roadmap from today to the selected future state.
```

---

## Shot 9: Responsible Positioning and Close

**Time:** 1:56-2:00  
**Visual:** Product logo, team name, prototype URL.

### On-Screen Text

```text
District insight -> Future-state simulation -> Planner-reviewed roadmap
```

### Narration

```text
From district insight to future-state simulation, our prototype helps Hong Kong planners turn complex data into actionable development pathways.
```

---

# 5. Using Real Openly Licensed Hong Kong Footage

## Recommended Sources

Use these in this order:

| Source | Best Use | Licensing Caution |
|---|---|---|
| Pexels | High-quality city b-roll, skyline, traffic, harbour | Check each asset page |
| Pixabay | Skyline, harbour, urban motion, night city | Check each asset page |
| Wikimedia Commons | Creative Commons or public-domain media with attribution | Must follow the specific license |
| YouTube Creative Commons | Longer Hong Kong city footage | Only use videos explicitly marked Creative Commons / CC BY |
| Hong Kong Tourism Board | Avoid unless permission fits use case | Terms may restrict non-tourism uses |

## Useful Search Terms

### Pexels

```text
Hong Kong skyline video
Hong Kong aerial video
Hong Kong city night video
Hong Kong traffic timelapse
Victoria Harbour video
Hong Kong high rise buildings video
Hong Kong street video
Hong Kong drone city
Hong Kong harbour night
```

### Pixabay

```text
Hong Kong city
Hong Kong skyline
Hong Kong night
Hong Kong harbour
Hong Kong aerial
Hong Kong traffic
Hong Kong skyscrapers
Hong Kong timelapse
```

### Wikimedia Commons

```text
site:commons.wikimedia.org Hong Kong skyline video
site:commons.wikimedia.org Hong Kong aerial video
site:commons.wikimedia.org Victoria Harbour video
site:commons.wikimedia.org Hong Kong timelapse video
site:commons.wikimedia.org Sai Kung video
site:commons.wikimedia.org Hong Kong transport video
```

### YouTube Creative Commons

```text
Hong Kong 4K Creative Commons
Hong Kong skyline Creative Commons
Hong Kong aerial Creative Commons
Victoria Harbour Creative Commons
Hong Kong timelapse Creative Commons
```

Then use:

```text
Search -> Filters -> Features -> Creative Commons
```

Do not use a YouTube video just because the title says **free** or **no copyright**. Confirm that the license field says **Creative Commons Attribution license**.

---

# 6. Footage Selection Rules

Download only **5-7 clips**.

## Required Footage Types

| Clip | Purpose | Length Used |
|---|---|---:|
| Hong Kong skyline / harbour | Opening context | 3-4 sec |
| Dense urban aerial / high-rises | Planning complexity | 3-4 sec |
| Street / traffic / transit | Infrastructure pressure | 2-3 sec |
| Night city / time-lapse | Future-facing transition | 2-3 sec |
| Map / aerial / satellite-like view | Planning intelligence bridge | 2-4 sec |

## Selection Criteria

Use footage that is:

- Horizontal, preferably 16:9
- At least 1080p
- Stable and not shaky
- Without prominent identifiable faces
- Without watermarks, logos, or brand signage if avoidable
- Without protest/police/political imagery unless directly relevant
- Compatible with a civic/government tone

## Folder Structure

```text
HK_Pitch_Video/
  01_footage_open_license/
  02_obs_recordings/
  03_ai_generated/
  04_voiceover/
  05_music_sfx/
  06_davinci_project/
  07_exports/
  licensing_log.csv
```

## File Naming Convention

```text
pexels_hk_skyline_creatorname_license_pageurl.mp4
pixabay_victoria_harbour_creatorname_license_pageurl.mp4
wikimedia_peak_tram_creatorname_ccby40_pageurl.webm
```

## Licensing Log Template

```csv
filename,source,creator,title,license,source_url,download_date,attribution_required,notes
pexels_hk_skyline.mp4,Pexels,Creator Name,Hong Kong Skyline,Pexels License,URL,2026-06-06,No,Opening shot
wikimedia_star_ferry.webm,Wikimedia Commons,Creator Name,Star Ferry,CC BY-SA 4.0,URL,2026-06-06,Yes,Include attribution in credits
```

---

# 7. Attribution Slide

Even if attribution is not always required, include a small source note at the end or in the video description.

## End-Card Attribution Format

```text
Footage: Pexels, Pixabay, Wikimedia Commons contributors
Map/data sources: DATA.GOV.HK, Hong Kong CSDI, 2021 Population Census
Prototype: [Team/Product Name]
```

## Wikimedia / Creative Commons Attribution Format

```text
"[Title]" by [Creator], licensed under CC BY 4.0, via Wikimedia Commons.
```

## YouTube Creative Commons Attribution Format

```text
"[Video Title]" by [Channel Name], licensed under Creative Commons Attribution, via YouTube.
```

---

# 8. OBS Recording Guide

Use OBS for all prototype capture.

## OBS Settings

Open:

```text
Settings -> Video
```

Use:

```text
Base Canvas Resolution: 1920x1080
Output Scaled Resolution: 1920x1080
Common FPS Values: 30
```

Open:

```text
Settings -> Output -> Recording
```

Use:

```text
Recording Format: MKV
Encoder: Hardware encoder if available
Rate Control: CQP or high-quality preset
```

After recording:

```text
File -> Remux Recordings
```

Convert `.mkv` to `.mp4`.

## Browser Setup Before Recording

```text
Browser zoom: 125% or 150%
Resolution: 1920x1080
Notifications: off
Bookmarks bar: hidden
Tabs: only one visible tab
Cursor: visible
Dark mode: only if your UI is designed for it
```

## OBS Clips to Record

```text
OBS_01_home_map_overview.mp4
OBS_02_click_sai_kung_stats.mp4
OBS_03_district_drilldown.mp4
OBS_04_llm_prompt_typing.mp4
OBS_05_parsed_parameters.mp4
OBS_06_future_state_map.mp4
OBS_07_roadmap_output.mp4
```

Each clip should be **8-15 seconds**. Trim them later.

---

# 9. DaVinci Resolve Project Setup

Use DaVinci Resolve as the final editor.

## Project Settings

```text
Project name: HK_Planning_Pitch_2min
Timeline resolution: 1920x1080 HD
Timeline frame rate: 30 fps
Playback frame rate: 30 fps
```

## Media Bins

```text
00_Timeline
01_Real_HK_Footage
02_OBS_Prototype
03_AI_Generated
04_Voiceover
05_Music_SFX
06_Graphics
07_Exports
```

## Timeline Layout

```text
V1: Main footage / prototype
V2: Zoomed duplicate clips / overlays
V3: Text callouts
V4: Lower thirds / logos

A1: Final voiceover
A2: Music bed
A3: UI clicks / subtle sound effects
```

## Editing Rules

Use:

- Simple cuts
- Occasional 110-125% zoom on UI details
- Minimal transitions
- Clean captions
- Subtle music

Avoid:

- Spinning effects
- Generic startup hype motion
- Excessive text labels
- Overly dramatic transitions

---

# 10. ElevenLabs Voiceover Guide

Use ElevenLabs for a clean temporary or final narration.

## Voice Direction

The voice should sound:

- Calm
- Neutral
- Professional
- Civic
- Low-hype
- Clear

Avoid:

- Influencer tone
- Dramatic trailer voice
- Fast startup-ad voice

## ElevenLabs Prompt / Direction

```text
Read in a calm, professional, civic-technology presentation style.
The audience is Hong Kong city representatives reviewing a hackathon prototype.
Keep the pacing measured and clear. Avoid sales hype.
Emphasize "decision-support platform", "district-level data", "future-state simulation", and "planner review".
Pronounce "Sai Kung" clearly.
```

## Generate Three Versions

```text
VO_v1_calm_civic.mp3
VO_v2_slightly_more_energetic.mp3
VO_v3_slower_government_presentation.mp3
```

## Hybrid Option

Record a real human intro/outro and use ElevenLabs for the middle.

Human:

```text
Opening 10 seconds
Closing 8 seconds
```

ElevenLabs:

```text
Technical demo narration
```

This gives credibility without requiring a perfect full recording.

---

# 11. HeyGen Guide

Use HeyGen only if you want a brief presenter segment.

## Best Use

Use HeyGen for a **5-7 second intro** or **5-7 second closing**, not the full video.

## HeyGen Prompt

```text
Create a short professional presenter segment for a civic technology hackathon pitch.

Audience: Hong Kong city representatives and hackathon judges.
Tone: calm, credible, concise, not salesy.
Setting: neutral modern presentation background.
Message:
"Hong Kong planners need faster ways to explore district-level trade-offs. Our prototype turns spatial data and planning objectives into transparent future-state scenarios."
Use natural delivery, moderate pace, and minimal gestures.
```

## Recommendation

Prefer a real team-member recording over an AI avatar if possible. For government-facing presentations, a real person usually feels more accountable.

Use HeyGen only if:

- Camera/audio quality is poor
- You need a quick placeholder
- Watermarking is acceptable in the hackathon context

---

# 12. Luma Labs Guide

Use Luma for **short abstract b-roll**, not product screens.

## Use Luma For

1. Abstract data-over-city transition
2. Future-state city planning visualization
3. Map-layer animation
4. Scenario simulation transition

## Do Not Use Luma For

- Fake government dashboards
- Fake Hong Kong official maps
- Shots implying real planning approval
- People, unless necessary

## Luma Prompt 1: Civic Data Overlay

```text
A realistic wide aerial view of a dense coastal Asian city inspired by Hong Kong, with subtle transparent urban planning data overlays, district boundaries, transit lines, and land-use grids. Professional civic technology style, realistic lighting, clean composition, no text, no logos, no people close-up, no futuristic cyberpunk elements. Camera slowly pushes forward. 16:9.
```

## Luma Prompt 2: Planning Scenario Transition

```text
A clean urban planning visualization: a realistic city map viewed from above, with semi-transparent colored zones gradually appearing to represent housing, industry, transport corridors, and green areas. Minimal, analytical, government presentation style. No readable text, no brand logos, no dramatic sci-fi look. Smooth slow camera movement. 16:9.
```

## Luma Prompt 3: Future-State Simulation

```text
A sober future-city planning visualization showing a dense harbour city from above, with subtle overlay lines indicating phased redevelopment and infrastructure upgrades. Realistic, restrained, policy briefing style. No flying cars, no fantasy architecture, no text, no people, no logos. 16:9, slow stable motion.
```

## Luma Prompt 4: District Map Abstraction

```text
A top-down abstract map of a coastal city with islands, harbour, roads, green hills, and dense urban districts. Transparent district boundaries animate gently into view. Clean data visualization aesthetic, neutral colors, no labels, no text, no logos. Suitable for a city planning software pitch. 16:9.
```

## Usage Rule

Generate at most **4 clips**. Use only the best **2-3 seconds** from each.

---

# 13. ngram Guide

Use ngram as a drafting assistant, not the final editor.

## ngram Prompt: Full Rough Cut

```text
Create a 2-minute product pitch video storyboard for a civic technology hackathon.

Product:
A web-based planning intelligence platform for Hong Kong city planners. The platform shows an interactive map of Hong Kong's districts. Clicking a district reveals key statistics and a more detailed geographical breakdown. A planner can enter a natural-language future objective, such as "prioritize industrial development in Sai Kung by 2040 while minimizing residential displacement and preserving key green areas." The system parses the objective into planning parameters and generates a candidate reallocation pathway, future-state map, and phased roadmap for planner review.

Audience:
Hong Kong city representatives and hackathon judges.

Tone:
Calm, credible, policy-oriented, practical. Avoid hype. Avoid saying the AI makes final planning decisions.

Required message:
This is a decision-support platform, not an automatic city-planning decision-maker.

Visual style:
Real Hong Kong footage, prototype screen recordings, clean map overlays, restrained motion graphics.

Structure:
0:00-0:08 Hong Kong planning complexity
0:08-0:20 Problem: fragmented evidence and scenario complexity
0:20-0:55 Product demo: district map and district statistics
0:55-1:10 District drill-down
1:10-1:28 Natural-language planning objective
1:28-1:45 Candidate reallocation pathway
1:45-1:56 Phased roadmap
1:56-2:00 Closing

Deliver:
A scene-by-scene storyboard with voiceover, on-screen text, and suggested visuals.
```

## ngram Prompt: Improve Script

```text
Rewrite this 2-minute voiceover to sound like a credible civic technology demo for city representatives. Make it concise, specific, and non-hype. Keep the message that the product supports planner review and does not automate final planning decisions.

[Paste script]
```

## ngram Prompt: Generate Captions

```text
Create concise on-screen captions for this 2-minute pitch video.
Rules:
- Maximum 6 words per caption.
- Captions should label concepts, not repeat the voiceover.
- Tone: civic, analytical, professional.
- Avoid startup cliches.

[Paste script]
```

---

# 14. Motionfly Guide

Use Motionfly for short motion sequences only.

## Best Uses

- Opening title animation
- Product concept explainer
- Feature cards
- Closing impact cards

## Motionfly Prompt: Product Explainer Sequence

```text
Create a short 20-second civic SaaS explainer sequence for a hackathon pitch.

Product:
A planning intelligence platform for Hong Kong city planners.

Core workflow:
1. Interactive Hong Kong district map
2. District statistics and geographic drill-down
3. Natural-language planning objective
4. Candidate reallocation pathway
5. Future-state roadmap for planner review

Tone:
Professional, government-facing, analytical, calm. No hype.

Visual style:
Clean UI mockups, map overlays, district boundaries, data cards, subtle motion graphics. Avoid cartoon style. Avoid neon cyberpunk. Avoid exaggerated AI imagery.

On-screen text:
- District intelligence
- Natural-language planning objective
- Scenario pathway
- Planner-reviewed roadmap

Important:
Do not say the AI makes final planning decisions. It supports scenario exploration and planner review.
```

## Motionfly Prompt: Impact Cards

```text
Generate a 10-second closing card animation for a civic planning platform.

Style:
Minimal, clean, government briefing style.

Cards:
1. Faster district assessment
2. Clearer evidence trails
3. Transparent scenario comparison
4. Planner-reviewed future roadmap

No voiceover needed. No music needed. 16:9.
```

---

# 15. Prompt Pack for Prototype Mock Screens

## UI Screen 1: District Overview

```text
Design a realistic web app screen for a Hong Kong city planning intelligence platform.

Screen:
Interactive map of Hong Kong divided into 18 districts.
Right side panel with selected district statistics.
Professional civic technology UI, suitable for city representatives.
Dense but readable, not futuristic.

Selected district:
Sai Kung

Metrics:
Population
Land-use mix
Transport accessibility
Development pressure
Green-area sensitivity
Infrastructure readiness

Style:
Clean dashboard, neutral colors, clear typography, map-first layout.
Avoid exaggerated startup design. Avoid fake government logos.
```

## UI Screen 2: District Drill-Down

```text
Design a detailed district drill-down screen for Sai Kung in a city planning platform.

Show:
- District map split into sub-zones
- Existing residential clusters
- Transport corridors
- Green/open-space sensitivity
- Candidate redevelopment zones
- Constraint warnings

Include a side panel titled "Geographical Breakdown".

Tone:
Analytical, planner-facing, credible, restrained.

Important:
Use labels like "candidate zone", "requires review", "estimated pressure".
Do not use labels like "demolish this area" or "remove population".
```

## UI Screen 3: LLM Objective

```text
Design a natural-language planning objective panel for a city planning platform.

Input text:
"Prioritize industrial development in Sai Kung by 2040 while minimizing residential displacement and preserving key green areas."

Below it, show parsed parameters:
Target district: Sai Kung
Planning horizon: 2040
Development priority: Industrial capacity
Constraint: Minimize residential displacement
Constraint: Preserve key green areas
Evaluation: Transport access, land suitability, relocation pressure, environmental sensitivity

Style:
Professional web app, clean cards, clear hierarchy.
```

## UI Screen 4: Candidate Scenario Output

```text
Design a scenario output screen for a city planning decision-support platform.

Scenario:
Prioritize industrial development in Sai Kung by 2040 while minimizing displacement and preserving green areas.

Show:
- Future-state map
- Candidate redevelopment zones
- Estimated relocation pressure
- Suggested industrial transition areas
- Environmental review flags
- Infrastructure upgrade requirements

Important wording:
Use "candidate", "estimated", "requires review", "scenario pathway".
Do not imply automatic final decisions.

Style:
Government-facing, sober, map-based, data-rich but readable.
```

## UI Screen 5: Phased Roadmap

```text
Design a phased roadmap output screen for a Hong Kong district planning platform.

Timeline:
2026-2028: Validate constraints and land-use compatibility
2028-2032: Identify relocation capacity and infrastructure needs
2032-2036: Phase redevelopment of candidate zones
2036-2040: Review outcomes and adjust district plan

Add:
- Key risks
- Required reviews
- Evidence links
- Planner approval checkpoints

Style:
Decision-support dashboard, not marketing page.
```

---

# 16. Safer Wording for Politically Sensitive Features

Use this wording everywhere.

| Avoid | Use Instead |
|---|---|
| AI decides what to demolish | Identifies candidate redevelopment zones |
| Reallocate people | Estimates relocation pressure |
| Tear down buildings | Flags redevelopment candidates |
| Optimal city plan | Candidate scenario pathway |
| Final decision | Planner-reviewed recommendation |
| Automated city planning | Decision-support workflow |
| Replace neighborhoods | Explore land-use transition options |
| Force relocation | Model displacement risk |
| The system chooses | The platform suggests for review |

This is important because city planning involves legal, social, environmental, and political constraints. The video should make clear that the product supports human planners rather than replacing public planning processes.

---

# 17. DaVinci Resolve Edit Plan

## Timeline

### 0:00-0:08

Video:

```text
Real Hong Kong skyline footage
```

Overlay:

```text
Hong Kong planning is dense, spatial, and long-term
```

Audio:

```text
Voiceover starts immediately
Subtle music bed begins at -24 dB
```

### 0:08-0:20

Video:

```text
Dense city / traffic footage
Motion text cards: Housing, Industry, Transport, Land Use, Environment
```

Overlay:

```text
From fragmented evidence to scenario clarity
```

### 0:20-0:38

Video:

```text
OBS_01_home_map_overview.mp4
```

Effects:

```text
Slow zoom to district map
Cursor highlight if needed
```

Overlay:

```text
Interactive district intelligence
```

### 0:38-0:55

Video:

```text
OBS_02_click_sai_kung_stats.mp4
```

Effects:

```text
Zoom into side panel
Add callout arrow to statistics
```

Overlay:

```text
District profile: Sai Kung
```

### 0:55-1:10

Video:

```text
OBS_03_district_drilldown.mp4
```

Effects:

```text
Callouts on sub-zones
```

Overlay:

```text
Geographical breakdown
```

### 1:10-1:28

Video:

```text
OBS_04_llm_prompt_typing.mp4
OBS_05_parsed_parameters.mp4
```

Effects:

```text
Cut from input prompt to parsed parameters
```

Overlay:

```text
Natural-language planning objective
```

### 1:28-1:45

Video:

```text
OBS_06_future_state_map.mp4
```

Effects:

```text
Before/after split or wipe
Callout labels
```

Overlay:

```text
Candidate scenario pathway
```

### 1:45-1:56

Video:

```text
OBS_07_roadmap_output.mp4
```

Overlay:

```text
Planner-reviewed roadmap
```

### 1:56-2:00

Video:

```text
Logo + URL + team
```

Overlay:

```text
District insight -> Future-state simulation
```

---

# 18. Music and Sound

Use no-cost music only if licensing is clear.

## Search Terms

```text
free corporate background music Creative Commons
free ambient technology music CC BY
Pixabay music ambient technology
```

## Audio Levels

```text
Music level: -28 dB to -22 dB under voice
Voiceover level: around -6 dB peak
```

Avoid:

- Epic trailer music
- Dramatic cinematic hits
- Fast corporate pop
- Distracting sound effects

---

# 19. Captions

Use captions only if they are clean and readable.

## Caption Style

```text
Font: clean sans-serif
Position: lower third
Max line length: 42 characters
Max lines: 2
Background: semi-transparent dark box if needed
```

## Caption Correction Checklist

Manually check:

```text
Sai Kung
Hong Kong
district-level
land use
reallocation
planner-reviewed
future-state
```

Auto-caption tools often fail on proper nouns and planning terminology.

---

# 20. Final Export Settings

In DaVinci Resolve:

```text
Format: MP4
Codec: H.264
Resolution: 1920x1080
Frame rate: 30 fps
Quality: Restrict to 12000-16000 Kb/s
Audio: AAC
Filename: HK_Planning_Intelligence_Pitch_v1.mp4
```

Also export a smaller backup:

```text
Filename: HK_Planning_Intelligence_Pitch_v1_compressed.mp4
Bitrate: 6000-8000 Kb/s
```

Bring both files to the hackathon.

---

# 21. One-Day Production Schedule

## Hour 1: Lock Script and Assets

- Finalize script.
- Choose 5-7 real Hong Kong clips.
- Fill licensing log.
- Decide whether to use human or ElevenLabs voice.

## Hour 2: Build Missing Prototype States

Build:

- District map
- Sai Kung stats
- Drill-down screen
- LLM prompt screen
- Parsed parameters
- Future-state scenario
- Roadmap

## Hour 3: Record Prototype

Use OBS to record all 7 clips separately.

## Hour 4: Generate AI Support Assets

Use:

- Luma for 2-4 abstract transition clips
- Motionfly for closing cards
- ngram for script/storyboard refinement only

## Hour 5: Voiceover

Generate ElevenLabs versions or record human voice.

## Hours 6-7: Edit in DaVinci

Assemble:

1. Voiceover
2. Prototype clips
3. Real Hong Kong footage
4. AI transition clips
5. Text overlays
6. Captions

## Hour 8: Export and Review

Review:

- Is the real prototype visible before 0:25?
- Is the LLM feature understandable without explanation?
- Does the video avoid claiming autonomous planning authority?
- Is the final benefit clear?
- Are all footage licenses logged?

---

# 22. Final Checklist

## Must Have

- Real Hong Kong footage
- Real prototype screen recording
- District click interaction
- LLM objective input
- Future-state scenario output
- Planner-reviewed roadmap
- Clear decision-support framing

## Should Have

- Small attribution slide or source note
- Subtle captions
- Cursor highlights
- One real team voice segment

## Avoid

- Fully AI-generated pitch
- Fake government logos
- Unlicensed YouTube footage
- Tourism-board assets without permission
- Overclaiming algorithmic validity
- "AI demolishes buildings" language
- Too many datasets shown at once

---

# 23. Recommended Tool Usage

| Tool | Use | Importance |
|---|---|---:|
| OBS | Record prototype | Critical |
| DaVinci Resolve | Final edit | Critical |
| ElevenLabs | Voiceover draft/final | High |
| Pexels / Pixabay / Wikimedia | Real Hong Kong footage | High |
| ngram | Storyboard and script refinement | Medium |
| Motionfly | Short cards and transitions | Medium |
| Luma Labs | Abstract planning b-roll | Low-medium |
| HeyGen | Optional intro/outro only | Low |

## Recommended Final Composition

> Real Hong Kong footage + real product screen recording + human or clean AI voiceover + restrained text overlays + careful decision-support framing.

---

# 24. Shot 2 AI Prompt

Use this in Motionfly or ngram.

```text
Create a 12-second video segment for Shot 2 of a civic technology pitch video.

Context:
Shot 1 is real openly licensed footage of Hong Kong, showing the city context. Shot 2 should continue from that visual tone and introduce the planning problem before we cut into the actual product demo.

Goal of Shot 2:
Show that Hong Kong planners are not missing data -- the issue is that evidence is spread across many disconnected sources, making long-term district planning difficult.

Audience:
Hong Kong city representatives and hackathon judges.

Tone:
Professional, civic, analytical, calm, credible. Avoid startup hype, cyberpunk visuals, dramatic music, or exaggerated AI imagery.

Duration:
12 seconds.

Aspect ratio:
16:9 horizontal.

Visual style:
Use real-city-inspired Hong Kong visuals, map overlays, planning documents, data cards, district boundaries, and clean dashboard-style motion graphics. The visuals should feel like a government planning briefing, not a commercial ad.

Scene structure:
0:00-0:03
Continue from Hong Kong city footage. Add subtle transparent map grid and district-boundary style overlays over the city.

0:03-0:07
Show fragmented evidence sources appearing separately on screen:
- Population
- Land use
- Transport
- Infrastructure
- Environmental constraints
- Development pressure

These should appear as clean floating data cards, reports, map layers, or dashboard fragments. They should feel disconnected and slightly spread out, not chaotic.

0:07-0:10
Animate the separate data cards moving toward a central map interface, suggesting that the product will consolidate them into one planning view.

0:10-0:12
End on a clean transition frame with this on-screen text:
"From fragmented evidence to scenario clarity"

Leave the right side or center of the frame visually clean enough to transition into a real prototype screen recording in the next shot.

Important wording:
Do not imply the AI makes final city planning decisions.
Do not show fake government logos.
Do not show specific demolition decisions.
Do not use fictional official-looking stamps or approvals.
Do not use unreadable walls of text.
Do not make the visuals look like a futuristic sci-fi city.

On-screen text:
Use only these short labels:
"Population"
"Land use"
"Transport"
"Infrastructure"
"Environmental constraints"
"Development pressure"
Final text:
"From fragmented evidence to scenario clarity"

Music:
Subtle, minimal, low-intensity civic technology background. No dramatic trailer music.

Output:
A polished 12-second visual segment that can be placed between Hong Kong b-roll and a screen recording of a planning intelligence platform.
```

## Luma Alternative for Shot 2

```text
A realistic Hong Kong-inspired dense urban city view transitions into a clean civic planning visualization. Subtle transparent map grids, district boundaries, transport lines, land-use layers, and planning data cards appear over the city. The data cards are initially separated, representing population, land use, transport, infrastructure, environmental constraints, and development pressure. They gradually move toward one central map interface, suggesting fragmented evidence becoming integrated planning intelligence. Professional government briefing style, realistic, restrained, analytical, no cyberpunk, no sci-fi, no fake government logos, no people close-ups, no readable fake documents. 16:9, smooth slow motion, 12 seconds.
```

## Manual Text Overlay for Shot 2 in DaVinci

```text
0:02  Population
0:03  Land use
0:04  Transport
0:05  Infrastructure
0:06  Environmental constraints
0:07  Development pressure
0:10  From fragmented evidence to scenario clarity
```

## Optional Voiceover for Shot 2

```text
The problem is not that planners lack data. The problem is turning district-level statistics, spatial evidence, and long-term policy goals into clear development scenarios.
```

---

# 25. Reference Links to Check

Use these as starting points and verify the current license/terms for each asset before using it.

- DATA.GOV.HK: https://data.gov.hk/en/
- Hong Kong CSDI: https://portal.csdi.gov.hk/
- Pexels Hong Kong videos: https://www.pexels.com/search/videos/hong%20kong/
- Pixabay Hong Kong videos: https://pixabay.com/videos/search/hong%20kong/
- Wikimedia Commons Hong Kong videos: https://commons.wikimedia.org/wiki/Category:Videos_from_Hong_Kong
- YouTube Creative Commons help: https://support.google.com/youtube/answer/2797468
- Creative Commons licenses: https://creativecommons.org/cc-licenses/
- OBS Studio: https://obsproject.com/
- DaVinci Resolve: https://www.blackmagicdesign.com/products/davinciresolve
- ElevenLabs pricing: https://elevenlabs.io/pricing
- HeyGen pricing: https://www.heygen.com/pricing
- Luma Labs support/pricing: https://lumalabs.ai/learning-hub/dream-machine-support-pricing-information
- ngram: https://www.ngram.com/
- Motionfly: https://motionfly.co/

