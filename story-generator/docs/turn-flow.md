# Story Generator - Turn Flow

This document describes the AI agent flow at each turn in the story generator.

## Overview

The story generator uses multiple AI agents coordinated through the Fireworks API:

1. **DM Agent** - The Dungeon Master that initializes the world and resolves actions
2. **Player Agents** - One per character, decides what each character does
3. **Verification Agent** - Updates character stats after each turn
4. **Image Generator** - Creates scene illustrations (Flux model)

## Initialization Flow

When a new story is started with a seed, the DM Agent initializes the world.

### 1. DM Init Call

**Role:** `dm-init`

**System Prompt:**
```
You are a Dungeon Master narrating an interactive story from a third-person
perspective. You observe and describe world events as an omniscient narrator.
```

**User Prompt (example):**
```
Parse the following story seed and create the initial world state. Extract
characters, setting, situation, and the overall story goal.

SEED:
Two survivors of a plane crash in the desert. Sarah is a doctor, Mike is an
engineer. They must find water and shelter.

Respond with a JSON object containing:
{
  "narrative": "Opening paragraph...",
  "sceneDescription": "Visual description for illustration...",
  "time": { "day": 1, "hour": 8, "minute": 0 },
  "environment": { ... },
  "storyGoal": "...",
  "characters": [ ... ],
  ...
}
```

**Response (example):**
```json
{
  "narrative": "The scorching sun beat down on the wreckage of Flight 247, its twisted metal frame half-buried in the golden sand dunes. Sarah wiped the sweat from her brow as she assessed the situation, her medical training kicking in automatically. Beside her, Mike surveyed the debris field, already calculating what might be salvageable.",
  "sceneDescription": "Two weary survivors stand beside smoking plane wreckage in a vast desert landscape, harsh midday sun casting sharp shadows on golden sand dunes",
  "time": { "day": 1, "hour": 14, "minute": 30 },
  "environment": {
    "type": "desert",
    "terrain": "sandy dunes with scattered rock formations",
    "lighting": "bright harsh sunlight",
    "weather": "clear",
    "temperature": "hot"
  },
  "storyGoal": "Survive the desert and find rescue",
  "narrativeArc": "Introduction - characters assess their dire situation",
  "majorEvents": ["Plane crashed in remote desert"],
  "tensions": ["No water supply", "Extreme heat", "Unknown location", "No communication"],
  "location": {
    "id": "crash_site",
    "name": "Plane Crash Site",
    "description": "The scattered wreckage of a small passenger plane lies across the dunes...",
    "exits": ["north", "east", "south", "west"],
    "items": ["twisted metal", "luggage", "first aid kit"],
    "npcs": []
  },
  "characters": [
    {
      "id": "char_sarah",
      "name": "Sarah",
      "appearance": {
        "gender": "female",
        "age": "mid-30s",
        "height": "average",
        "build": "athletic",
        "hairColor": "dark brown",
        "hairLength": "medium",
        "eyeColor": "brown",
        "skinTone": "olive"
      },
      "clothing": "torn business casual - white blouse, gray slacks, sensible flats",
      "personality": "Calm under pressure, analytical, compassionate",
      "goals": "Keep everyone alive, find water and medical supplies",
      "inventory": ["pen", "small notebook"],
      "status": "minor cuts and bruises",
      "stats": {
        "health": 85,
        "stamina": 70,
        "hunger": 20,
        "thirst": 35,
        "strength": 45,
        "dexterity": 55,
        "encumbrance": 5,
        "sanity": 90,
        "anger": 10,
        "fear": 25
      }
    },
    {
      "id": "char_mike",
      "name": "Mike",
      ...
    }
  ],
  "worldSummary": "Two survivors of a plane crash must find water and shelter in an unforgiving desert."
}
```

---

## Turn Flow

Each turn follows this sequence:

```
┌─────────────────────────────────────────────────────────────┐
│                     Human clicks "Next Turn"                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  1. PLAYER AGENTS (parallel)                                │
│     - Each character decides their action                    │
│     - Runs simultaneously for all characters                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  2. DM AGENT - RESOLUTION                                   │
│     - Receives all character actions                         │
│     - Resolves what happens based on stats                   │
│     - Generates narrative and world changes                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  3. VERIFICATION AGENT                                       │
│     - Updates character stats based on narrative             │
│     - Tracks hunger, thirst, stamina, mental state           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  4. IMAGE GENERATOR                                          │
│     - Creates illustration from scene description            │
│     - Uses Flux model via Fireworks API                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  5. SAVE & UPDATE UI                                         │
│     - Save turn snapshot for rollback                        │
│     - Update story display                                   │
└─────────────────────────────────────────────────────────────┘
```

---

### Step 1: Player Agent Calls (Parallel)

Each player character has their own agent that decides their action. All player agents are called **simultaneously** using `Promise.all()`.

**Role:** `player-{character-name}` (e.g., `player-sarah`, `player-mike`)

**System Prompt:**
```
You are playing a character in an interactive story. Stay in character and
make decisions that fit your personality and goals.
```

**User Prompt (example for Sarah):**
```
You are Sarah.

CURRENT TIME: Day 1, 14:30

YOUR CHARACTER:
- Appearance: female, mid-30s, olive skin, average, athletic, medium dark brown hair, brown eyes
- Clothing: torn business casual - white blouse, gray slacks, sensible flats
- Personality: Calm under pressure, analytical, compassionate
- Goals: Keep everyone alive, find water and medical supplies
- Inventory: pen, small notebook
- Status: minor cuts and bruises
- Stats: Health: 85%, Stamina: 70%, Hunger: 20%, Thirst: 35%, Strength: 45%,
         Dexterity: 55%, Encumbrance: 5%, Sanity: 90%, Anger: 10%, Fear: 25%

Consider your physical and mental condition when deciding actions...

CURRENT SITUATION:
Location: Plane Crash Site
The scattered wreckage of a small passenger plane lies across the dunes...

Available exits: north, east, south, west
Items here: twisted metal, luggage, first aid kit
Others present: Mike

RECENT EVENTS:
- The plane crashed in the desert
- Sarah and Mike are the only survivors

WORLD SUMMARY: Two survivors of a plane crash must find water and shelter...

What do you do? Choose ONE action that fits your character.

Respond with JSON:
{
  "thinking": "Brief internal thought about the situation",
  "action": "The specific action you take",
  "dialogue": "What you say, if anything"
}
```

**Response (example):**
```json
{
  "thinking": "We need to assess injuries first, then find water before the heat gets worse.",
  "action": "Sarah moves to the wreckage and searches for the first aid kit she spotted, carefully navigating around the sharp metal debris.",
  "dialogue": "Mike, are you hurt? Let me check you over while I grab that first aid kit."
}
```

---

### Step 2: DM Resolution Call

After all player agents have decided their actions, the DM agent resolves what happens.

**Role:** `dm-resolve`

**User Prompt (example):**
```
Resolve the following character actions and describe what happens.

CURRENT TIME: Day 1, 14:30
ENVIRONMENT: desert, sandy dunes, bright harsh sunlight, clear, hot

STORY GOAL: Survive the desert and find rescue
NARRATIVE ARC: Introduction - characters assess their dire situation
MAJOR EVENTS SO FAR: Plane crashed in remote desert
CURRENT TENSIONS: No water supply; Extreme heat; Unknown location

CURRENT LOCATION: Plane Crash Site
The scattered wreckage of a small passenger plane lies across the dunes...
Items: twisted metal, luggage, first aid kit
Exits: north, east, south, west

CHARACTERS:
- Sarah (char_sarah): female, mid-30s, olive skin, athletic, wearing torn business casual,
  minor cuts and bruises, inventory: [pen, small notebook]
  Stats: HP:85% STM:70% HNG:20% THR:35% STR:45% DEX:55% ENC:5% SAN:90% ANG:10% FER:25%
- Mike (char_mike): male, late-30s, tan skin, muscular, wearing khaki cargo pants and
  a torn polo shirt, healthy, inventory: [pocket knife, wallet]
  Stats: HP:90% STM:75% HNG:15% THR:30% STR:65% DEX:50% ENC:10% SAN:85% ANG:15% FER:20%

CHARACTER ACTIONS THIS TURN:
Sarah: Sarah moves to the wreckage and searches for the first aid kit. Says: "Mike, are you hurt?"
Mike: Mike examines the plane's fuselage, looking for intact storage compartments. Says: "I'm fine, just a few scratches."

Resolve these actions realistically. Consider:
- What succeeds, fails, or has unexpected outcomes based on CHARACTER STATS
- High strength = better physical tasks, high dexterity = better fine motor/agility tasks
- Low sanity (<50%) = character may hallucinate or make irrational decisions
- High anger (>50%) = character may act aggressively
- High fear (>70%) = character may freeze or flee
...

Respond with JSON:
{
  "narrative": "Paragraph describing what happens (3-5 sentences)",
  "sceneDescription": "Visual description for illustration",
  "time": { "day": 1, "hour": 14, "minute": 45 },
  "arcUpdates": { ... },
  "worldChanges": { ... },
  "worldSummary": "Updated summary"
}
```

**Response (example):**
```json
{
  "narrative": "Sarah carefully picked her way through the twisted metal, her medical instincts guiding her movements. She located the first aid kit wedged beneath a collapsed overhead bin, its white case scratched but intact. Meanwhile, Mike's engineering eye spotted a partially intact storage compartment near the tail section. Prying it open with his pocket knife, he discovered two bottles of water and a bag of peanuts - a small but crucial find. The afternoon sun continued its relentless assault, and both survivors could feel their energy draining with each passing minute.",
  "sceneDescription": "A woman in torn business clothes retrieves a first aid kit from plane wreckage while a man in khakis pries open a storage compartment, harsh desert sun beating down",
  "time": {
    "day": 1,
    "hour": 14,
    "minute": 50
  },
  "arcUpdates": {
    "narrativeArc": "Rising action - survivors gather resources",
    "newMajorEvents": ["Found first aid kit", "Discovered water bottles"],
    "tensions": ["Limited water supply", "Extreme heat", "Unknown location", "Need shelter before nightfall"]
  },
  "worldChanges": {
    "locationUpdates": {
      "items": ["twisted metal", "luggage"],
      "description": null
    },
    "characterUpdates": [
      {
        "id": "char_sarah",
        "inventoryAdd": ["first aid kit"],
        "inventoryRemove": [],
        "statusChange": null,
        "clothingChange": null
      },
      {
        "id": "char_mike",
        "inventoryAdd": ["water bottle", "water bottle", "bag of peanuts"],
        "inventoryRemove": [],
        "statusChange": null,
        "clothingChange": null
      }
    ]
  },
  "worldSummary": "Sarah and Mike have salvaged a first aid kit and precious water from the wreckage. They must now find shelter before the desert night."
}
```

---

### Step 3: Verification Agent Call

After the DM resolves actions, a verification agent updates character stats based on the narrative and elapsed time.

**Role:** `verify-state`

**User Prompt (example):**
```
Based on this narrative and elapsed time, update character states and stats.

NARRATIVE:
Sarah carefully picked her way through the twisted metal... The afternoon sun
continued its relentless assault, and both survivors could feel their energy
draining with each passing minute.

ELAPSED TIME: 20 minutes

CURRENT CHARACTER STATES:
- Sarah (id: char_sarah): clothing="torn business casual", status="minor cuts and bruises",
  inventory=[pen, small notebook, first aid kit]
  Stats: health=85%, stamina=70%, hunger=20%, thirst=35%, strength=45%, dexterity=55%,
         encumbrance=5%, sanity=90%, anger=10%, fear=25%
- Mike (id: char_mike): clothing="khaki cargo pants and torn polo shirt", status="healthy",
  inventory=[pocket knife, wallet, water bottle, water bottle, bag of peanuts]
  Stats: health=90%, stamina=75%, hunger=15%, thirst=30%, strength=65%, dexterity=50%,
         encumbrance=10%, sanity=85%, anger=15%, fear=20%

Update clothing, status, inventory, AND STATS for each character based on what happened.

STAT GUIDELINES (all values 0-100):
- health: Decrease for injuries, increase slowly with rest/medical care
- stamina: Decrease with physical exertion, recover with rest
- hunger: Increase ~2-5% per hour of activity, decrease when eating
- thirst: Increase ~3-8% per hour (faster in heat), decrease when drinking
- encumbrance: Based on inventory weight
- sanity: Decrease from trauma, horror, isolation; recover with safety
- anger: Increase from frustration, conflict; decrease with time
- fear: Increase from danger, threats; decrease with safety

Respond with JSON only:
{
  "characterUpdates": [
    {
      "id": "character_id",
      "clothingChange": "...",
      "statusChange": "...",
      "inventoryAdd": [],
      "inventoryRemove": [],
      "statsChange": {
        "health": 85,
        "stamina": 65,
        "hunger": 22,
        "thirst": 40,
        ...
      }
    }
  ]
}
```

**Response (example):**
```json
{
  "characterUpdates": [
    {
      "id": "char_sarah",
      "clothingChange": null,
      "statusChange": null,
      "inventoryAdd": [],
      "inventoryRemove": [],
      "statsChange": {
        "health": 85,
        "stamina": 62,
        "hunger": 23,
        "thirst": 42,
        "strength": 45,
        "dexterity": 55,
        "encumbrance": 15,
        "sanity": 88,
        "anger": 8,
        "fear": 22
      }
    },
    {
      "id": "char_mike",
      "clothingChange": null,
      "statusChange": null,
      "inventoryAdd": [],
      "inventoryRemove": [],
      "statsChange": {
        "health": 90,
        "stamina": 68,
        "hunger": 18,
        "thirst": 38,
        "strength": 65,
        "dexterity": 50,
        "encumbrance": 25,
        "sanity": 84,
        "anger": 12,
        "fear": 18
      }
    }
  ]
}
```

---

### Step 4: Image Generation

The scene description from the DM response is sent to the Flux image model.

**Model:** `flux` (via Fireworks API)

**Prompt (example):**
```
A woman in torn business clothes retrieves a first aid kit from plane wreckage
while a man in khakis pries open a storage compartment, harsh desert sun beating down
```

**Output:** A generated image saved to `stories/{storyId}/images/turn_{N}.png`

---

## Optional: DM Instructions

The user can provide optional DM instructions that get incorporated into the turn. These appear before the DM resolution call.

**Example DM Instruction:** "A sandstorm approaches from the west"

This gets added to the DM Resolution prompt:
```
DM INSTRUCTIONS (incorporate these into the narrative):
A sandstorm approaches from the west
```

The DM will then work this event into the narrative naturally.

---

## Character Stats Reference

| Stat | Range | Default | Description |
|------|-------|---------|-------------|
| health | 0-100% | 100 | Physical wellbeing, injuries decrease it |
| stamina | 0-100% | 100 | Energy for physical activity |
| hunger | 0-100% | 0 | 0=full, 100=starving |
| thirst | 0-100% | 0 | 0=hydrated, 100=severely dehydrated |
| strength | 0-100% | 50 | Physical power for tasks |
| dexterity | 0-100% | 50 | Agility and fine motor skills |
| encumbrance | 0-100% | 0 | Inventory weight burden |
| sanity | 0-100% | 100 | Mental stability |
| anger | 0-100% | 0 | Frustration/aggression level |
| fear | 0-100% | 0 | Current fear level |

---

## File Storage

Each story is saved in `stories/{storyId}/`:

```
stories/
└── {storyId}/
    ├── state.json          # Current world state
    ├── story.md            # Full narrative markdown
    ├── history/            # Turn snapshots for rollback
    │   ├── turn_0.json
    │   ├── turn_1.json
    │   └── ...
    ├── images/             # Generated illustrations
    │   ├── turn_0.png
    │   ├── turn_1.png
    │   └── ...
    └── logs/               # LLM request/response logs
        ├── 20260119_143052_dm-init_llama-v3p1-8b.json
        ├── 20260119_143055_player-sarah_llama-v3p1-8b.json
        ├── 20260119_143055_player-mike_llama-v3p1-8b.json
        ├── 20260119_143058_dm-resolve_llama-v3p1-8b.json
        ├── 20260119_143101_verify-state_llama-v3p1-8b.json
        ├── 20260119_143105_image_flux.json
        └── ...
```
