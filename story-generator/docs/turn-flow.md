# Story Generator - Turn Flow

This document describes the AI agent flow at each turn in the story generator.

## Overview

The story generator uses multiple AI agents coordinated through the Fireworks API:

1. **DM Agent** - The Dungeon Master that initializes the world and resolves actions
2. **Player Agents** - One per character, decides what each character does
3. **Image Generator** - Creates scene illustrations (Z-Image-Turbo model via local GPU)
4. **Novel Writer** - Generates prose chapters at day boundaries (optional)

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              STORY GENERATOR                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                   │
│  │  DM Agent    │    │ Player Agent │    │ Player Agent │  ... (up to 7)    │
│  │  (dm model)  │    │ (char model) │    │ (char model) │                   │
│  └──────────────┘    └──────────────┘    └──────────────┘                   │
│         │                   │                   │                            │
│         └───────────────────┼───────────────────┘                            │
│                             │                                                │
│                    ┌────────▼────────┐                                       │
│                    │   World State   │                                       │
│                    │   (in memory)   │                                       │
│                    └────────┬────────┘                                       │
│                             │                                                │
│    ┌────────────────────────┼────────────────────────────┐                   │
│    │                        │                            │                   │
│    ▼                        ▼                            ▼                   │
│  ┌──────────┐    ┌──────────────────┐    ┌──────────────────┐               │
│  │state.json│    │ narrative.json   │    │    map.json      │               │
│  │worldState│    │ history, scenes  │    │ features, paths  │               │
│  └──────────┘    └──────────────────┘    └──────────────────┘               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Initialization Flow

When a new story is started with a seed:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           User provides story seed                           │
│            "Two survivors of a plane crash in the desert..."                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              DM INIT CALL                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ • Parse seed and create initial world state                          │    │
│  │ • Generate 5-8 map features (water sources, shelters, landmarks)     │    │
│  │ • Create characters with stats, inventory, positions, attitudes      │    │
│  │ • Set up victory conditions and story goal                           │    │
│  │ • Write opening narrative                                            │    │
│  │ • Determine starting time and environment                            │    │
│  │ • Select author style (if not specified)                             │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           WORLD STATE INITIALIZED                            │
│  • Characters array populated                                                │
│  • Map features placed (most undiscovered)                                   │
│  • Starting location established                                             │
│  • Character paths initialized at (0, 0)                                     │
│  • Auto-discover any visible features from starting positions                │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         GENERATE OPENING IMAGE                               │
│  • Build prompt from sceneFocus + sceneVisuals + environment                 │
│  • Run draw.py with Z-Image-Turbo model                                      │
│  • Save to stories/{id}/images/turn-000.jpg                                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SAVE INITIAL STATE                              │
│  • state.json - world state snapshot                                         │
│  • narrative.json - story content and history                                │
│  • map.json - features and character paths                                   │
│  • history/turn-000.json - turn 0 snapshot for rollback                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Turn Flow - Main Loop

Each turn follows a two-phase concurrent system for realistic character communication:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Human clicks "Next Turn"                             │
│                    (optional: provides DM instructions)                      │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  0. COLLECT PREVIOUS TURN INFO                                               │
│     For each character, gather:                                              │
│     • Actions and dialogue from nearby characters last turn                  │
│     • lastActionResult - what happened from THEIR action                     │
│     • Only from characters within 20m communication range                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│   ══════════════════ PHASE 1: THINK AND TALK ══════════════════             │
│                                                                              │
│   All player agents run IN PARALLEL (Promise.all)                            │
│                                                                              │
│   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│   │   Sarah Agent   │  │   Mike Agent    │  │   NPC Agent     │             │
│   │                 │  │                 │  │                 │             │
│   │ INPUT:          │  │ INPUT:          │  │ INPUT:          │             │
│   │ • Character     │  │ • Character     │  │ • Character     │             │
│   │ • World state   │  │ • World state   │  │ • World state   │             │
│   │ • Recent events │  │ • Recent events │  │ • Recent events │             │
│   │ • Last action   │  │ • Last action   │  │ • Last action   │             │
│   │   result        │  │   result        │  │   result        │             │
│   │ • What nearby   │  │ • What nearby   │  │ • What nearby   │             │
│   │   chars did     │  │   chars did     │  │   chars did     │             │
│   │                 │  │                 │  │                 │             │
│   │ OUTPUT:         │  │ OUTPUT:         │  │ OUTPUT:         │             │
│   │ • thinking      │  │ • thinking      │  │ • thinking      │             │
│   │ • intendedAction│  │ • intendedAction│  │ • intendedAction│             │
│   │ • speech        │  │ • speech        │  │ • speech        │             │
│   └────────┬────────┘  └────────┬────────┘  └────────┬────────┘             │
│            │                    │                    │                       │
│            └────────────────────┼────────────────────┘                       │
│                                 │                                            │
│                                 ▼                                            │
│                    ┌────────────────────────┐                                │
│                    │   COLLECT ALL SPEECH   │                                │
│                    │   Build speech map by  │                                │
│                    │   character ID         │                                │
│                    └────────────────────────┘                                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  1.5 DISTRIBUTE SPEECH                                                       │
│      For each character, filter speech to only nearby characters (≤20m)      │
│                                                                              │
│      Sarah at (0, 5)  ─────  Mike at (3, 2)  ───✕───  NPC at (100, 50)       │
│         │                       │                         │                  │
│         └──── can hear ────────►│                         │                  │
│         │◄──── can hear ────────┘                         │                  │
│         │                                                 │                  │
│         └──────────── too far to hear ───────────────────►│                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│   ════════════════════ PHASE 2: ACTION ════════════════════                 │
│                                                                              │
│   All player agents run IN PARALLEL (Promise.all)                            │
│                                                                              │
│   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│   │   Sarah Agent   │  │   Mike Agent    │  │   NPC Agent     │             │
│   │                 │  │                 │  │                 │             │
│   │ INPUT:          │  │ INPUT:          │  │ INPUT:          │             │
│   │ • All Phase 1   │  │ • All Phase 1   │  │ • All Phase 1   │             │
│   │   context       │  │   context       │  │   context       │             │
│   │ • HEARD: Mike   │  │ • HEARD: Sarah  │  │ • HEARD: none   │             │
│   │   says "..."    │  │   says "..."    │  │   (too far)     │             │
│   │                 │  │                 │  │                 │             │
│   │ OUTPUT:         │  │ OUTPUT:         │  │ OUTPUT:         │             │
│   │ • thinking      │  │ • thinking      │  │ • thinking      │             │
│   │ • action        │  │ • action        │  │ • action        │             │
│   │ • dialogue      │  │ • dialogue      │  │ • dialogue      │             │
│   └────────┬────────┘  └────────┬────────┘  └────────┬────────┘             │
│            │                    │                    │                       │
│            └────────────────────┼────────────────────┘                       │
│                                 │                                            │
│                                 ▼                                            │
│                    ┌────────────────────────┐                                │
│                    │  COLLECT ALL ACTIONS   │                                │
│                    │  Record dialogue for   │                                │
│                    │  next turn's context   │                                │
│                    └────────────────────────┘                                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│   ════════════════════ DM RESOLUTION ════════════════════                   │
│                                                                              │
│   Single call to DM agent with ALL character actions                         │
│                                                                              │
│   INPUT:                                                                     │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │ • Current world state (characters, location, environment)           │   │
│   │ • All character actions and dialogue from Phase 2                   │   │
│   │ • All character speech from Phase 1 (for narrative inclusion)       │   │
│   │ • DM instructions (if provided by user)                             │   │
│   │ • Character positions and paths for distance calculations           │   │
│   │ • Map features with distances to each character                     │   │
│   │ • Victory conditions to check                                       │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   DM DETERMINES:                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │ • What succeeds, fails, or has unexpected outcomes                  │   │
│   │ • Movement results (new positions via direction+distance)           │   │
│   │ • Activity levels for each character (rest/light/moderate/etc)      │   │
│   │ • Events that affect stats (drinking, eating, injuries, etc)        │   │
│   │ • lastActionResult for EACH character (explicit feedback)           │   │
│   │ • Inventory changes (items picked up, used, lost)                   │   │
│   │ • Clothing and status changes                                       │   │
│   │ • Map feature discoveries                                           │   │
│   │ • New characters to introduce (up to 7 total)                       │   │
│   │ • Turn duration in minutes                                          │   │
│   │ • Story arc updates (tensions, major events)                        │   │
│   │ • Whether story ends (victory/defeat/other)                         │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   OUTPUT:                                                                    │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │ {                                                                   │   │
│   │   "narrative": "What happens this turn...",                         │   │
│   │   "sceneFocus": "characters|landscape|object|phenomenon",           │   │
│   │   "sceneVisuals": { "characterAction": "...", ... },                │   │
│   │   "durationMinutes": 30,                                            │   │
│   │   "arcUpdates": { "narrativeArc": "...", "tensions": [...] },       │   │
│   │   "worldChanges": {                                                 │   │
│   │     "characterUpdates": [{                                          │   │
│   │       "id": "sarah",                                                │   │
│   │       "lastActionResult": "Found the water bottle intact...",       │   │
│   │       "activityLevel": "moderate",                                  │   │
│   │       "hydrationEvent": "drinking",                                 │   │
│   │       "movement": { "targetLocation": "Rocky Oasis" },              │   │
│   │       "inventoryAdd": ["water bottle"],                             │   │
│   │       ...                                                           │   │
│   │     }],                                                             │   │
│   │     "discoveredMapFeatures": ["feat_1"],                            │   │
│   │     ...                                                             │   │
│   │   },                                                                │   │
│   │   "worldSummary": "Updated situation..."                            │   │
│   │ }                                                                   │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│   ════════════════ APPLY WORLD CHANGES (DETERMINISTIC) ════════════════     │
│                                                                              │
│   The system (not LLM) calculates stats based on DM's activity categories:   │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                    HYBRID STAT CALCULATION                          │   │
│   │                                                                     │   │
│   │   DM provides:              System calculates:                      │   │
│   │   ─────────────             ──────────────────                      │   │
│   │   activityLevel: "strenuous" ──► stamina -= 12/hour                 │   │
│   │                               ──► thirst += 7.5/hour (×1.5 mult)    │   │
│   │                               ──► hunger += 5/hour                  │   │
│   │                                                                     │   │
│   │   hydrationEvent: "drinking" ──► thirst -= 30                       │   │
│   │   nutritionEvent: "eating"   ──► hunger -= 40                       │   │
│   │   healthEvent: "injured"     ──► health -= 5-30 (by severity)       │   │
│   │   mentalEvent: "terrified"   ──► sanity -=8, fear +=25              │   │
│   │                                                                     │   │
│   │   All stats clamped to 0-100 range                                  │   │
│   │   All changes logged to deterministic.log                           │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                    MOVEMENT CALCULATION                             │   │
│   │                                                                     │   │
│   │   Option 1: targetLocation                                          │   │
│   │   movement: { "targetLocation": "Rocky Oasis" }                     │   │
│   │   ──► System finds feature position                                 │   │
│   │   ──► Calculates direction and distance to target                   │   │
│   │   ──► Moves up to 1200m toward target (one turn of walking)         │   │
│   │   ──► Snaps to target if within range                               │   │
│   │                                                                     │   │
│   │   Option 2: direction + distance                                    │   │
│   │   movement: { "direction": "northeast", "distance": 500 }           │   │
│   │   ──► System converts direction to heading (NE = 45°)               │   │
│   │   ──► Calculates dx, dy from polar coordinates                      │   │
│   │   ──► Updates character position                                    │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                    OTHER DETERMINISTIC UPDATES                      │   │
│   │                                                                     │   │
│   │   • Inventory validation (items must exist in world)                │   │
│   │   • Encumbrance calculation from inventory                          │   │
│   │   • Time advancement (current time + duration, never backwards)     │   │
│   │   • Map feature auto-discovery (within sight distance)              │   │
│   │   • lastActionResult stored on each character                       │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         VERIFICATION AGENT CALL                              │
│                                                                              │
│   Reviews narrative and updates attitudes/stats the DM might have missed:    │
│   • Clothing changes (torn, removed, changed)                                │
│   • Attitude changes between characters                                      │
│   • Additional stat adjustments based on narrative events                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           POST-PROCESSING                                    │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │ INTIMACY EFFECTS                                                    │   │
│   │ If narrative contains intimacy keywords + characters are close:     │   │
│   │ ──► Reduce mutual attraction by 1/3                                 │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │ STAT-BASED STATUS EFFECTS                                           │   │
│   │ Auto-update status based on extreme stat values:                    │   │
│   │ • stamina ≤ 0 ──► "collapsed from exhaustion"                       │   │
│   │ • thirst ≥ 95 ──► "collapsing from dehydration"                     │   │
│   │ • sanity ≤ 20 ──► "having a mental breakdown"                       │   │
│   │ • fear ≥ 90 ──► "paralyzed with terror"                             │   │
│   │ • etc.                                                              │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │ DEATH PROCESSING                                                    │   │
│   │ For characters with health ≤ 0:                                     │   │
│   │ ──► Convert to "dead body of {name}" object                         │   │
│   │ ──► Transfer inventory to body (can be looted)                      │   │
│   │ ──► Remove player agent                                             │   │
│   │ ──► Record death as major event                                     │   │
│   │                                                                     │   │
│   │ If ALL characters dead:                                             │   │
│   │ ──► Trigger story ending (defeat)                                   │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │ STORY ENDING CHECK                                                  │   │
│   │ If DM set storyEnding or all characters dead:                       │   │
│   │ ──► Mark story as complete                                          │   │
│   │ ──► Store ending type and summary                                   │   │
│   │ ──► Generate final novel chapter                                    │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           IMAGE GENERATION                                   │
│                                                                              │
│   Build prompt based on sceneFocus:                                          │
│   • "characters" ──► Full character descriptions + action + environment      │
│   • "landscape" ──► Environment only (no characters)                         │
│   • "object" ──► Object description + discovered objects + environment       │
│   • "phenomenon" ──► Weather/event description + narrative context           │
│                                                                              │
│   ──► Run draw.py with Z-Image-Turbo model                                   │
│   ──► Save to stories/{id}/images/turn-{N}.jpg                               │
│   ──► Retry up to 3 times on failure                                         │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           NOVEL GENERATION (conditional)                     │
│                                                                              │
│   Triggered when:                                                            │
│   • Day changes (new day starts) ──► Generate chapter for completed day      │
│   • 40 turns pass without day change ──► Generate mid-day chapter            │
│   • Story ends ──► Generate final chapter                                    │
│                                                                              │
│   Uses narrator model to transform game events into prose                    │
│   Written in configured author's style (e.g., "Stephen King")                │
│   Saved to stories/{id}/novel.md                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SAVE & RESPOND                                  │
│                                                                              │
│   Save:                                                                      │
│   • state.json - current world state                                         │
│   • narrative.json - story content, history, scene descriptions              │
│   • map.json - features, character paths, distances                          │
│   • history/turn-{N}.json - snapshot for rollback                            │
│   • story.md - human-readable markdown with images                           │
│                                                                              │
│   Return to client:                                                          │
│   • Turn number and narrative                                                │
│   • Think/talk results (thinking, intended action, speech, observed)         │
│   • Action results (thinking, action, dialogue, heard speech)                │
│   • Updated world state                                                      │
│   • Character paths for map display                                          │
│   • Turn stats (distances, duration)                                         │
│   • Story completion info (if ended)                                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Concurrent Actions - Detailed View

The two-phase system enables realistic communication where characters can coordinate before acting:

```
                    Time ──────────────────────────────────────────►
                         │
   PHASE 1: THINK & TALK │        PHASE 2: ACTION
   (all parallel)        │        (all parallel)
                         │
   ┌─────────────────────┼─────────────────────────┐
   │                     │                         │
   │  Sarah ─────────────┼─► "Let's check north"   │
   │    │                │         │               │
   │    │ thinking...    │         │ hears Mike    │
   │    │ planning...    │         │               │
   │    ▼                │         ▼               │
   │  SPEAK              │      DECIDE ACTION      │──► "Head north"
   │                     │         │               │
   ├─────────────────────┼─────────┼───────────────┤
   │                     │         │               │
   │  Mike ──────────────┼─► "I'll search wreck"  │
   │    │                │         │               │
   │    │ thinking...    │         │ hears Sarah   │
   │    │ planning...    │         │               │
   │    ▼                │         ▼               │
   │  SPEAK              │      DECIDE ACTION      │──► "Stay and search"
   │                     │         │               │
   ├─────────────────────┼─────────┼───────────────┤
   │                     │         │               │
   │  NPC (far away) ────┼─► [silent]             │
   │    │                │         │               │
   │    │ thinking...    │         │ hears nothing │
   │    │ (alone)        │         │               │
   │    ▼                │         ▼               │
   │  [no speech]        │      DECIDE ACTION      │──► "Hunt for prey"
   │                     │                         │
   └─────────────────────┼─────────────────────────┘
                         │
                   COLLECT ──► TO DM RESOLUTION
```

### Communication Range

Characters can only hear others within 20 meters:

```
        (0,0)                                    (100,0)
          │                                         │
     ┌────┼────┐        20m range              ┌────┼────┐
     │  Sarah  │◄──────────────────────────────┤   NPC   │
     │ (2, 3)  │        [TOO FAR - 98m]        │(100,50) │
     └────┬────┘                               └─────────┘
          │
          │ 8m (can communicate)
          │
     ┌────▼────┐
     │  Mike   │
     │ (5, 10) │
     └─────────┘
```

---

## Information Flow - What Characters Know

Each turn, characters receive specific information:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CHARACTER CONTEXT (per character)                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  YOUR CHARACTER                                                              │
│  ├── Appearance, clothing, personality, goals                                │
│  ├── Inventory: [items you carry]                                            │
│  ├── Status: "healthy" / "injured" / etc.                                    │
│  ├── Stats: health, stamina, hunger, thirst, strength, dex, int, etc.        │
│  ├── Position: (x, y) meters from center                                     │
│  └── Attitudes toward others: love, anger, attraction, trust, fear           │
│                                                                              │
│  PERSONALITY EFFECTS (from personalityTypes)                                 │
│  └── Behavioral guidance: "As a stoic, you rarely show emotion..."           │
│                                                                              │
│  STAT EFFECTS (if thresholds crossed)                                        │
│  └── "WARNING: Stamina at 25% - you're exhausted, must rest soon"            │
│                                                                              │
│  ATTITUDE EFFECTS (if thresholds crossed)                                    │
│  └── "Your attraction to Mike (75%) makes you seek his company..."           │
│                                                                              │
│  CURRENT SITUATION                                                           │
│  ├── Location name and description                                           │
│  ├── Items here, dead bodies, discovered objects (within visual range)       │
│  ├── Others present (with distance: "right next to you" / "nearby" / etc.)   │
│  └── Available exits                                                         │
│                                                                              │
│  KNOWN LOCATIONS (discovered map features)                                   │
│  └── "Rocky Oasis (water_source): 2500m northeast (~31 min walk)"            │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ RESULT OF YOUR LAST ACTION (NEW!)                                     │  │
│  │ "You successfully found the water bottle. It's half full."            │  │
│  │                                                                       │  │
│  │ This explicit feedback tells you what happened when you tried         │  │
│  │ your action last turn - success, failure, or partial outcome.         │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  LAST TURN, YOU OBSERVED NEARBY                                              │
│  └── "Mike: searched the wreckage. Said: 'Found some supplies!'"             │
│                                                                              │
│  RECENT EVENTS (last 7 DM narratives)                                        │
│  └── "Sarah and Mike continued through the desert as the sun rose..."        │
│                                                                              │
│  STORY CONTEXT                                                               │
│  ├── Goal: "Survive and find rescue"                                         │
│  ├── Major events: "Plane crashed", "Found water source"                     │
│  └── Current tensions: "Low water supply", "Storm approaching"               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## DM Resolution Context

The DM receives comprehensive information to make decisions:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DM RESOLUTION CONTEXT                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  STORY STATE                                                                 │
│  ├── Current time: Day 1, 14:30                                              │
│  ├── Story goal and victory conditions                                       │
│  ├── Narrative arc: "Rising action"                                          │
│  ├── Major events so far                                                     │
│  └── Current tensions                                                        │
│                                                                              │
│  ENVIRONMENT                                                                 │
│  └── Type, terrain, lighting, weather, temperature                           │
│                                                                              │
│  ALL CHARACTERS (with full details)                                          │
│  ├── Positions, stats, inventory, status, clothing                           │
│  ├── Attitudes toward each other                                             │
│  └── Sight distances                                                         │
│                                                                              │
│  TRAVEL SUMMARY                                                              │
│  └── "Sarah: traveled 2500m total, currently 1800m from starting point"      │
│                                                                              │
│  KNOWN LOCATIONS (discovered features)                                       │
│  └── With distances from each character and navigation instructions          │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ ALL MAP FEATURES WITH DISTANCES                                       │  │
│  │                                                                       │  │
│  │ ⚠️ CRITICAL: Characters can only ARRIVE at locations within ~1200m   │  │
│  │                                                                       │  │
│  │ Sarah at (0, 2000):                                                   │  │
│  │   - Rocky Oasis: 3500m northeast → ✗ 3 turns away - DO NOT arrive    │  │
│  │   - Wind-Cut Caves: 800m west → ✓ CAN ARRIVE THIS TURN               │  │
│  │                                                                       │  │
│  │ This prevents the DM from writing that characters "arrived" at       │  │
│  │ locations that are actually days of travel away.                     │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  CHARACTER DIALOGUE THIS TURN (from Phase 1)                                 │
│  └── All speech to include in narrative                                      │
│                                                                              │
│  CHARACTER ACTIONS THIS TURN (from Phase 2)                                  │
│  └── What each character is attempting to do                                 │
│                                                                              │
│  DM INSTRUCTIONS (if provided)                                               │
│  └── "A sandstorm approaches from the west"                                  │
│                                                                              │
│  STAT THRESHOLDS (enforcement rules)                                         │
│  └── "At stamina ≤10%: character can only rest or do light activities"       │
│                                                                              │
│  HYBRID STAT SYSTEM INSTRUCTIONS                                             │
│  └── Activity levels and event categories to use instead of raw numbers      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Hybrid Stat System

Stats are calculated deterministically by the system based on activity categories from the DM:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          ACTIVITY LEVELS                                     │
├──────────────┬────────────┬─────────────┬─────────────┬─────────────────────┤
│ Level        │ Stamina/hr │ Thirst Mult │ Hunger/hr   │ Examples            │
├──────────────┼────────────┼─────────────┼─────────────┼─────────────────────┤
│ rest         │ +20        │ ×0.5        │ 1           │ Sleeping, resting   │
│ light        │ +5         │ ×0.8        │ 2           │ Sitting, vehicle    │
│ moderate     │ -3         │ ×1.0        │ 3           │ Walking, searching  │
│ strenuous    │ -12        │ ×1.5        │ 5           │ Running, climbing   │
│ extreme      │ -25        │ ×2.0        │ 8           │ Sprinting, combat   │
└──────────────┴────────────┴─────────────┴─────────────┴─────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                          EVENT CATEGORIES                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  HYDRATION EVENTS                                                            │
│  ├── drinking: thirst -= 30                                                  │
│  └── dehydrating: thirst += 15 (on top of base rate)                         │
│                                                                              │
│  NUTRITION EVENTS                                                            │
│  ├── eating: hunger -= 40                                                    │
│  └── vomiting: hunger += 20, health -= 5                                     │
│                                                                              │
│  HEALTH EVENTS                                                               │
│  ├── injured (minor): health -= 5                                            │
│  ├── injured (moderate): health -= 15                                        │
│  ├── injured (severe): health -= 30                                          │
│  ├── healing: health += 5                                                    │
│  └── resting: health += 2 (if injured)                                       │
│                                                                              │
│  MENTAL EVENTS                                                               │
│  ├── stressed: sanity -= 3, fear += 5                                        │
│  ├── relieved: sanity += 5, fear -= 10                                       │
│  ├── terrified: sanity -= 8, fear += 25                                      │
│  ├── enraged: anger += 30, sanity -= 5                                       │
│  └── calm: anger -= 20, fear -= 15, sanity += 3                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## LLM Calls Per Turn

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          LLM CALLS SUMMARY                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   For a story with N living characters:                                      │
│                                                                              │
│   Phase 1: Think/Talk (parallel) ────────────────────────── N calls         │
│   Phase 2: Action (parallel) ────────────────────────────── N calls         │
│   DM Resolution ─────────────────────────────────────────── 1 call          │
│   Verification ──────────────────────────────────────────── 1 call          │
│   Image Generation ──────────────────────────────────────── 1 call (GPU)    │
│                                                                              │
│   ───────────────────────────────────────────────────────────────────────   │
│   TOTAL: 2N + 3 LLM calls per turn                                          │
│                                                                              │
│   Example (2 characters): 2(2) + 3 = 7 calls                                 │
│   Example (5 characters): 2(5) + 3 = 13 calls                                │
│                                                                              │
│   + Novel writer call (conditional, at day boundaries)                       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## File Storage Structure

```
stories/
└── {storyId}/
    ├── state.json              # Current world state (characters, location, etc.)
    ├── narrative.json          # Story content, history, scene descriptions
    ├── map.json                # Map features, character paths, distances
    ├── story.md                # Human-readable story with embedded images
    ├── novel.md                # Generated prose novel (if author style set)
    ├── deterministic.log       # Log of all stat calculations for debugging
    ├── history/                # Turn snapshots for rollback
    │   ├── turn-000.json
    │   ├── turn-001.json
    │   └── ...
    ├── images/                 # Generated illustrations
    │   ├── turn-000.jpg
    │   ├── turn-001.jpg
    │   └── ...
    └── logs/                   # LLM request/response logs
        ├── 20260121_143052_dm-init_model.json
        ├── 20260121_143055_player-sarah-think_model.json
        ├── 20260121_143056_player-sarah-action_model.json
        ├── 20260121_143058_dm-resolve_model.json
        └── ...
```

---

## Position and Movement

Characters and objects have positions tracked in meters (x, y) relative to scene center.

### Coordinate System

```
                    North (+y)
                        │
                        │
                        │
    West (-x) ──────────┼────────── East (+x)
                        │
                        │
                        │
                    South (-y)
```

### Movement Speeds

| Activity | Speed | Per 15-min turn |
|----------|-------|-----------------|
| Walking | ~80 m/min (5 km/h) | ~1,200 m |
| Running | ~150 m/min (9 km/h) | ~2,250 m |
| Sprinting | ~200 m/min (12 km/h) | ~3,000 m |

### Navigation Example

```
Character wants to reach "Rocky Oasis" at (5500, 3000)
Current position: (0, 2000)

Distance: sqrt((5500-0)² + (3000-2000)²) = 5590m
Direction: atan2(1000, 5500) = 10.3° (roughly east-northeast)

Turn 1: Move 1200m toward target → (1183, 2214)
Turn 2: Move 1200m toward target → (2365, 2429)
Turn 3: Move 1200m toward target → (3548, 2643)
Turn 4: Move 1200m toward target → (4731, 2857)
Turn 5: Move 859m (remaining) → (5500, 3000) ARRIVED!
```

---

## Character Stats Reference

| Stat | Range | Default | Description |
|------|-------|---------|-------------|
| health | 0-100% | 100 | Physical wellbeing (0 = death) |
| stamina | 0-100% | 100 | Energy for physical activity |
| hunger | 0-100% | 0 | 0=full, 100=starving |
| thirst | 0-100% | 0 | 0=hydrated, 100=severely dehydrated |
| strength | 0-100% | 50 | Physical power (ability stat) |
| dexterity | 0-100% | 50 | Agility/fine motor (ability stat) |
| intelligence | 0-100% | 50 | Mental acuity (ability stat) |
| encumbrance | 0-100% | 0 | Inventory weight burden |
| sanity | 0-100% | 100 | Mental stability |
| anger | 0-100% | 0 | Frustration/aggression level |
| fear | 0-100% | 0 | Current fear level |

---

## Attitude System

Characters track feelings toward each other:

| Attitude | Range | Description |
|----------|-------|-------------|
| love | 0-100% | Emotional connection, care |
| anger | 0-100% | Resentment, hostility |
| attraction | 0-100% | Physical/romantic interest |
| trust | 0-100% | Reliability, faith |
| fear | 0-100% | Intimidation, threat |

Attitudes affect behavior when thresholds are crossed (e.g., attraction > 70% influences romantic behavior).

---

## Story Ending Conditions

The DM checks for endings each turn:

| Type | Condition | Example |
|------|-----------|---------|
| **victory** | Victory conditions met | Reached radio tower and called rescue |
| **defeat** | All characters dead | Last survivor succumbed to thirst |
| **other** | Story reaches natural end | Characters decided to stay in wilderness |

When a story ends:
1. `storyComplete` is set to `true`
2. `storyEnding` contains type and summary
3. Final novel chapter is generated
4. No more turns can be taken
