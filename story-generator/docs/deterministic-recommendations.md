# Recommendations for Deterministic System Improvements

This document identifies responsibilities currently handled by the LLM that should be handled deterministically. LLMs excel at creative/judgment tasks but are unreliable for calculations and consistency enforcement.

## Current State Summary

### Already Deterministic (Good)
- Time advancement from duration
- Movement coordinate calculations
- Position-based visibility/discovery
- Communication range (20m)
- Death processing (health <= 0)
- Feature discovery by distance

### Currently LLM-Driven (Problem Areas)
- Stat changes (stamina, hunger, thirst, health)
- Attitude changes between characters
- Inventory validation
- Distance-based action validation
- Ability stat penalties

---

## Design Principle: Hybrid LLM + Deterministic

A fully deterministic system would fail on novel actions (flying, teleporting, magic, swimming underwater, etc.). The solution is a **hybrid approach**:

1. **LLM categorizes** the action into predefined intensity levels
2. **System calculates** the actual stat changes using fixed rates
3. **System validates** the results are within bounds

This gives us:
- Flexibility for any action type (LLM judges intensity)
- Consistency in calculations (system applies fixed rates)
- No impossible values (system enforces bounds)

---

## High Priority Recommendations

### 1. Hybrid Stat Changes (LLM Categorizes, System Calculates)

**Problem**: LLM estimates stat changes directly and is inconsistent.

**Current**: `verifyCharacterStates()` asks LLM to provide exact stat values.

**Recommendation**: LLM provides action intensity category, system calculates values.

#### DM Response Format (New)

```javascript
// Instead of asking LLM to calculate stats, ask for activity classification
"characterUpdates": [
  {
    "id": "sarah",
    "activityLevel": "strenuous",  // rest | light | moderate | strenuous | extreme
    "hydrationEvent": "drinking",   // null | "drinking" | "dehydrating" (vomiting, bleeding)
    "nutritionEvent": null,         // null | "eating" | "vomiting"
    "healthEvent": null,            // null | "injured" | "healing" | "resting"
    "mentalEvent": null,            // null | "stressed" | "relieved" | "terrified" | "enraged"
    // ... other fields unchanged
  }
]
```

#### System Calculation

```javascript
// Proposed: calculateStatChanges(character, update, durationMinutes, environment)

const hours = durationMinutes / 60;

// STAMINA - based on activity level (LLM categorizes, system calculates)
const STAMINA_RATES = {
  rest: +20,      // Sleeping/resting: +20% per hour
  light: +5,      // Sitting, light activity: +5% per hour
  moderate: -3,   // Walking, searching: -3% per hour
  strenuous: -12, // Running, fighting, climbing: -12% per hour
  extreme: -25    // Sprinting, intense combat, flying: -25% per hour
};
const staminaRate = STAMINA_RATES[update.activityLevel] || STAMINA_RATES.moderate;
character.stats.stamina += staminaRate * hours;

// THIRST - base rate + environment + activity modifier
const isHot = environment.temperature > 30;
const baseThirstRate = isHot ? 5 : 3;  // % per hour
const activityMultiplier = { rest: 0.5, light: 0.8, moderate: 1, strenuous: 1.5, extreme: 2 };
character.stats.thirst += baseThirstRate * (activityMultiplier[update.activityLevel] || 1) * hours;

// Hydration events (drinking/dehydrating)
if (update.hydrationEvent === 'drinking') {
  character.stats.thirst -= 35;
} else if (update.hydrationEvent === 'dehydrating') {
  character.stats.thirst += 20;
}

// HUNGER - slower, based on activity
const hungerRate = { rest: 1, light: 2, moderate: 3, strenuous: 5, extreme: 8 };
character.stats.hunger += (hungerRate[update.activityLevel] || 3) * hours;

if (update.nutritionEvent === 'eating') {
  character.stats.hunger -= 40;
} else if (update.nutritionEvent === 'vomiting') {
  character.stats.hunger += 15;
}

// HEALTH - injuries and healing
if (update.healthEvent === 'injured') {
  // LLM should also provide injury severity: minor/moderate/severe
  const damage = { minor: 5, moderate: 15, severe: 30 };
  character.stats.health -= damage[update.injurySeverity] || 10;
} else if (update.healthEvent === 'healing' || update.healthEvent === 'resting') {
  character.stats.health += 2 * hours;  // Slow recovery
}

// MENTAL STATS - based on events
const MENTAL_EFFECTS = {
  stressed:   { sanity: -3, fear: +5, anger: +3 },
  relieved:   { sanity: +5, fear: -10, anger: -5 },
  terrified:  { sanity: -8, fear: +25, anger: 0 },
  enraged:    { sanity: -5, fear: -5, anger: +30 },
  calm:       { sanity: +3, fear: -3, anger: -3 }
};
if (update.mentalEvent && MENTAL_EFFECTS[update.mentalEvent]) {
  const effects = MENTAL_EFFECTS[update.mentalEvent];
  character.stats.sanity += effects.sanity;
  character.stats.fear += effects.fear;
  character.stats.anger += effects.anger;
}

// ALWAYS clamp to valid range
for (const stat of Object.keys(character.stats)) {
  character.stats[stat] = Math.max(0, Math.min(100, character.stats[stat]));
}
```

#### Why This Works for Novel Actions

| Action | LLM Categorizes As | System Applies |
|--------|-------------------|----------------|
| Walking | moderate | -3% stamina/hr, +3% thirst/hr |
| Flying (magic) | extreme | -25% stamina/hr, +6% thirst/hr |
| Teleporting | light | +5% stamina/hr (not tiring) |
| Swimming | strenuous | -12% stamina/hr, +5% thirst/hr |
| Meditating | rest | +20% stamina/hr |
| Vehicle travel | light | +5% stamina/hr |

The LLM uses judgment to categorize any action into a known intensity level. The system applies consistent, tested rates for that level.

**Benefits**:
- Handles any action type (LLM judges intensity)
- Consistent calculations (same intensity = same rates)
- No impossible values (system clamps results)
- Testable (can unit test the calculation logic)
- Reduced prompt complexity (LLM picks from 5 categories, not infinite values)

---

### 2. Inventory Validation

**Problem**: LLM sometimes creates items from nothing or duplicates items.

**Current**: LLM provides `inventoryAdd`/`inventoryRemove` with no validation.

**Recommendation**: Validate all inventory changes against world state.

```javascript
// Proposed: validateInventoryChanges(changes, worldState, character)

for (const item of changes.inventoryAdd) {
  // Item must come from: discoveredObjects, location items, or another character
  const validSources = [
    ...worldState.discoveredObjects.map(o => o.name.toLowerCase()),
    ...(worldState.currentLocation?.items || []).map(i => i.toLowerCase()),
    ...worldState.characters.flatMap(c => c.inventory.map(i => i.toLowerCase()))
  ];

  if (!validSources.includes(item.toLowerCase())) {
    console.warn(`[Inventory] Rejected invalid item add: "${item}" - not found in world`);
    // Remove from inventoryAdd
  }
}

// Also: ensure removed items are actually in character's inventory
for (const item of changes.inventoryRemove) {
  if (!character.inventory.map(i => i.toLowerCase()).includes(item.toLowerCase())) {
    console.warn(`[Inventory] Rejected invalid item remove: "${item}" - not in inventory`);
  }
}
```

**Benefits**:
- No items appearing from nowhere
- No duplicate items in world
- Maintains inventory integrity

---

### 3. Stat Clamping

**Problem**: LLM occasionally produces stats outside 0-100 range.

**Current**: Stats are accepted as-is from LLM.

**Recommendation**: Clamp all stats after any update.

```javascript
// Proposed: clampStats(character)
const STAT_RANGE = { min: 0, max: 100 };

for (const stat of ['health', 'stamina', 'hunger', 'thirst', 'sanity', 'anger', 'fear']) {
  if (character.stats[stat] !== undefined) {
    character.stats[stat] = Math.max(STAT_RANGE.min, Math.min(STAT_RANGE.max, character.stats[stat]));
  }
}
```

**Benefits**:
- Guaranteed valid stat ranges
- No 150% health or negative stamina

---

### 4. Distance-Based Action Validation

**Problem**: LLM writes "arrived at location" when characters are 9km away.

**Current**: Prompt tells LLM not to do this, but LLM ignores.

**Recommendation**: Pre-validate actions before DM writes narrative.

```javascript
// Proposed: validateCharacterActions(actions, worldState)

for (const action of actions) {
  // Check if action mentions arriving/reaching a known location
  const arrivalMatch = action.action.match(/(?:go to|reach|arrive|head to|travel to) (?:the )?(.+)/i);
  if (arrivalMatch) {
    const locationName = arrivalMatch[1];
    const feature = worldState.findFeatureByIdOrName(locationName);

    if (feature) {
      const character = worldState.characters.find(c => c.id === action.characterId);
      const distance = worldState.getDistance(character.position, feature.position);

      if (distance > 1200) {
        // Modify action to be "travel toward" not "arrive at"
        action.action = action.action.replace(/(?:go to|reach|arrive at)/i, 'travel toward');
        action.canArrive = false;
        action.turnsToArrive = Math.ceil(distance / 1200);
      } else {
        action.canArrive = true;
      }
    }
  }
}
```

**Alternative**: Provide `canArrive` flag to DM for each mentioned location.

**Benefits**:
- Narrative matches actual distances
- No teleportation inconsistencies
- Map remains accurate to story

---

## Medium Priority Recommendations

### 5. Automatic Ability Stat Penalties

**Problem**: LLM forgets to apply penalties from injury/exhaustion.

**Current**: `behavior-config.js` defines thresholds but relies on LLM to apply them.

**Recommendation**: Auto-calculate effective ability stats.

```javascript
// Proposed: getEffectiveAbilityStats(character)

const { health, stamina, hunger, thirst } = character.stats;
let { strength, dexterity, intelligence } = character.stats;

// Health penalties
if (health < 30) {
  strength *= 0.5;
  dexterity *= 0.5;
} else if (health < 50) {
  strength *= 0.75;
  dexterity *= 0.75;
}

// Stamina penalties
if (stamina < 20) {
  strength *= 0.5;
  dexterity *= 0.6;
} else if (stamina < 40) {
  strength *= 0.8;
  dexterity *= 0.8;
}

// Hunger/Thirst penalties
if (hunger > 80 || thirst > 80) {
  intelligence *= 0.7;
  strength *= 0.8;
}

return { strength: Math.round(strength), dexterity: Math.round(dexterity), intelligence: Math.round(intelligence) };
```

**Benefits**:
- Consistent penalties
- Injury/exhaustion matters mechanically
- No LLM forgetting to apply rules

---

### 6. Attitude Change Triggers

**Problem**: LLM decides attitude changes inconsistently.

**Current**: LLM updates attitudes based on narrative interpretation.

**Recommendation**: Parse narrative for specific triggers, apply fixed deltas.

```javascript
// Proposed: calculateAttitudeChanges(character, otherCharacter, narrative)

const changes = { love: 0, anger: 0, attraction: 0, trust: 0, fear: 0 };

// Positive triggers
if (narrative.match(new RegExp(`${otherCharacter.name}.*(helped|saved|protected|shared).*${character.name}`, 'i'))) {
  changes.trust += 10;
  changes.love += 5;
}

// Negative triggers
if (narrative.match(new RegExp(`${otherCharacter.name}.*(hit|attacked|betrayed|stole|lied).*${character.name}`, 'i'))) {
  changes.trust -= 15;
  changes.anger += 20;
}

// Intimate triggers
if (narrative.match(new RegExp(`${character.name}.*${otherCharacter.name}.*(kissed|embraced|intimate)`, 'i'))) {
  changes.attraction += 15;
  changes.love += 10;
}

// Combat together (bonding)
if (narrative.match(/fought.*together|defended.*together|back to back/i)) {
  changes.trust += 8;
}

return changes;
```

**Benefits**:
- Consistent relationship progression
- Predictable social dynamics
- No random attitude swings

---

### 7. Encumbrance from Inventory

**Problem**: LLM guesses encumbrance value.

**Current**: Encumbrance is a stat the LLM manages.

**Recommendation**: Calculate from inventory count/weight.

```javascript
// Proposed: calculateEncumbrance(inventory)

const ITEM_WEIGHTS = {
  default: 5,
  light: ['knife', 'lighter', 'matches', 'compass', 'map', 'bandage'],  // 2 each
  medium: ['canteen', 'rope', 'flashlight', 'food', 'clothes'],  // 5 each
  heavy: ['tent', 'axe', 'rifle', 'pack', 'toolbox'],  // 15 each
};

let encumbrance = 0;
for (const item of inventory) {
  const itemLower = item.toLowerCase();
  if (ITEM_WEIGHTS.light.some(w => itemLower.includes(w))) {
    encumbrance += 2;
  } else if (ITEM_WEIGHTS.heavy.some(w => itemLower.includes(w))) {
    encumbrance += 15;
  } else {
    encumbrance += 5;  // default medium
  }
}

return Math.min(100, encumbrance);  // Cap at 100
```

**Benefits**:
- Carrying capacity matters
- No arbitrary encumbrance values
- Inventory decisions have consequences

---

## Lower Priority (More Complex)

### 8. Deterministic Sanity/Fear/Anger Triggers

Define specific events that affect mental stats:

| Event | Sanity | Fear | Anger |
|-------|--------|------|-------|
| Near-death experience | -10 | +20 | 0 |
| Witnessed death | -15 | +15 | +5 |
| Alone for >4 hours | -5 | +5 | 0 |
| Successfully helped someone | +5 | -5 | -5 |
| Betrayed by companion | -10 | 0 | +25 |
| Found water/shelter | +5 | -10 | 0 |
| Combat (won) | 0 | -5 | -10 |
| Combat (fled) | -5 | +10 | +5 |

### 9. Weather/Environment Effects

Auto-apply environmental effects:

| Condition | Effect |
|-----------|--------|
| Hot (>35°C) | Thirst +3%/hour extra |
| Cold (<10°C) | Stamina -2%/hour extra |
| Rain | Stamina -1%/hour, sanity -1%/hour |
| Night | Fear +5 if alone, sight distance halved |
| Sandstorm | Movement speed halved, sight distance 100m |

---

## Implementation Priority

1. **Stat clamping** - 10 minutes, immediate benefit
2. **Inventory validation** - 30 minutes, prevents item bugs
3. **Auto stat drain/recovery** - 1 hour, consistent survival mechanics
4. **Distance action validation** - 1 hour, fixes navigation issues
5. **Ability stat penalties** - 30 minutes, mechanical depth
6. **Attitude triggers** - 1 hour, consistent relationships
7. **Encumbrance calculation** - 30 minutes, inventory consequences

---

## What Should Remain LLM-Driven

These require creativity and judgment - keep them with the LLM:

- **Narrative generation** - creative writing
- **Dialogue** - character voice and personality
- **Action resolution outcomes** - success/failure determination with context
- **Scene descriptions** - visual and atmospheric details
- **NPC behavior** - non-player character decisions
- **Plot progression** - story arc decisions
- **Discovery descriptions** - how new locations are described
- **Combat narration** - blow-by-blow descriptions (though damage could be deterministic)

---

## Summary

Moving calculations from LLM to deterministic code will:

1. **Improve consistency** - same inputs always produce same outputs
2. **Reduce errors** - no more 150% stamina or teleporting characters
3. **Lower token usage** - fewer instructions needed in prompts
4. **Enable testing** - deterministic code can be unit tested
5. **Increase reliability** - system behavior becomes predictable

The LLM should focus on what it does best: creative narrative, dialogue, and judgment calls. Math and rule enforcement should be code.
