// Behavioral configuration for character stats and attitudes
// This file defines how stat values and attitude levels affect character behavior

// Personality types - baseline behavioral tendencies for characters
// Each character can have multiple personality types that guide their behavior
export const personalityTypes = {
  // Emotional disposition
  positive: { description: 'Optimistic, sees the good in situations, encouraging' },
  negative: { description: 'Pessimistic, focuses on problems and risks, critical' },
  cheerful: { description: 'Happy, lighthearted, tries to lift others\' spirits' },
  depressed: { description: 'Melancholic, low energy, struggles to find hope' },
  stoic: { description: 'Emotionally reserved, endures hardship without complaint' },

  // Social tendencies
  outgoing: { description: 'Socially confident, initiates conversations, gregarious' },
  introvert: { description: 'Prefers solitude or small groups, needs alone time to recharge' },
  extrovert: { description: 'Energized by social interaction, talkative, expressive' },
  flirty: { description: 'Playfully romantic, enjoys flirtation, charming' },

  // Temperament
  peaceful: { description: 'Avoids conflict, seeks harmony, diplomatic' },
  violent: { description: 'Quick to aggression, solves problems with force' },
  fearful: { description: 'Anxious, cautious, easily frightened, avoids danger' },
  brave: { description: 'Courageous, faces danger head-on, protective' },

  // Cognitive style
  logical: { description: 'Analytical, prioritizes reason over emotion, methodical' },
  emotional: { description: 'Led by feelings, empathetic, intuitive' },
  reasonable: { description: 'Fair-minded, willing to compromise, considers all sides' },
  impulsive: { description: 'Acts without thinking, spontaneous, reactive' },

  // Worldview
  spiritual: { description: 'Believes in higher powers or meaning, may pray or meditate' },
  pragmatic: { description: 'Focused on practical solutions, results-oriented' },
  idealistic: { description: 'Driven by principles and ideals, sometimes unrealistic' },
  cynical: { description: 'Distrustful of others\' motives, expects the worst' },

  // Demeanor
  upbeat: { description: 'Energetic, enthusiastic, maintains high spirits' },
  calm: { description: 'Composed, doesn\'t panic easily, steady under pressure' },
  nervous: { description: 'Easily stressed, fidgety, worries frequently' },
  confident: { description: 'Self-assured, believes in own abilities' },

  // Interpersonal
  nurturing: { description: 'Caring, protective of others, maternal/paternal instinct' },
  selfish: { description: 'Prioritizes own needs, reluctant to sacrifice for others' },
  loyal: { description: 'Devoted to allies, values commitment and trust' },
  manipulative: { description: 'Uses others to achieve goals, deceptive when useful' },

  // Leadership
  leader: { description: 'Takes charge, makes decisions for the group, authoritative' },
  follower: { description: 'Prefers to follow others\' lead, supportive role' },
  independent: { description: 'Self-reliant, prefers to work alone, autonomous' }
};

// Get list of valid personality type names
export function getPersonalityTypeNames() {
  return Object.keys(personalityTypes);
}

// Generate personality behavior text for character prompts
export function generatePersonalityText(personalityTypesList) {
  if (!Array.isArray(personalityTypesList) || personalityTypesList.length === 0) {
    return null;
  }

  const lines = personalityTypesList
    .filter(type => personalityTypes[type])
    .map(type => `- ${type.charAt(0).toUpperCase() + type.slice(1)}: ${personalityTypes[type].description}`);

  if (lines.length === 0) return null;
  return lines.join('\n');
}

// Stats behavioral thresholds - affects character's own behavior
// Each stat has thresholds with min/max ranges and behavioral descriptions
export const statsBehavior = {
  stamina: [
    { min: 0, max: 10, label: 'EXHAUSTED', behavior: 'You can barely move, may collapse. Only rest or urgent survival actions. REST TO RECOVER.' },
    { min: 11, max: 30, label: 'Very tired', behavior: 'Avoid physical exertion. Move slowly, take breaks to recover stamina.' }
  ],
  health: [
    { min: 0, max: 20, label: 'CRITICALLY INJURED', behavior: 'Every action is agony. Focus only on survival/medical help.' },
    { min: 21, max: 50, label: 'Wounded', behavior: 'Physical actions are impaired and painful.' }
  ],
  hunger: [
    { min: 70, max: 100, label: 'STARVING', behavior: 'Obsess about food. Difficulty concentrating on anything else.' }
  ],
  thirst: [
    { min: 70, max: 100, label: 'DESPERATE', behavior: 'Desperate for water. This overrides most other concerns.' }
  ],
  sanity: [
    { min: 0, max: 20, label: 'BREAKING DOWN', behavior: 'Hallucinate, talk to yourself, make irrational/paranoid decisions.' },
    { min: 21, max: 40, label: 'Unstable', behavior: 'Erratic behavior, poor judgment, may misinterpret situations.' }
  ],
  anger: [
    { min: 70, max: 100, label: 'FURIOUS', behavior: 'Aggressive, confrontational, may lash out or make rash decisions.' }
  ],
  fear: [
    { min: 70, max: 100, label: 'TERRIFIED', behavior: 'May freeze, flee, refuse dangerous actions, or panic.' }
  ],
  encumbrance: [
    { min: 80, max: 100, label: 'OVERBURDENED', behavior: 'Cannot run, very slow movement, may need to drop items.' }
  ]
};

// Attitudes behavioral thresholds - affects interactions with specific characters
// These define how a character behaves toward another based on attitude values
export const attitudesBehavior = {
  attraction: [
    { min: 80, max: 100, label: 'INTENSE DESIRE', behavior: 'Actively try to initiate sex, remove clothing, make suggestive comments, physical touching. Include explicit content.', suppressedWhenDying: true },
    { min: 60, max: 79, label: 'Attracted', behavior: 'Seek physical proximity, flirtatious behavior, protective of them, may act foolishly to impress.', suppressedWhenDying: true },
    { min: 40, max: 59, label: 'Interested', behavior: 'Friendly interest, enjoy their company, notice their appearance.' }
  ],
  love: [
    { min: 70, max: 100, label: 'Deep love', behavior: 'Self-sacrificing, prioritize their wellbeing over your own, deep emotional bond.' },
    { min: 40, max: 69, label: 'Caring', behavior: 'Care about them, willing to help, emotionally invested in their fate.' }
  ],
  anger: [
    { min: 70, max: 100, label: 'Hostile', behavior: 'Hostile, confrontational, refuse cooperation, may attack or sabotage them.' },
    { min: 40, max: 69, label: 'Irritated', behavior: 'Irritated, short-tempered with them, reluctant to help.' }
  ],
  trust: [
    { min: 0, max: 30, label: 'Distrustful', behavior: 'Suspicious, won\'t share resources or information, keep distance, watch them carefully.' },
    { min: 31, max: 60, label: 'Cautious', behavior: 'Cautious, verify before believing, limited cooperation.' },
    { min: 70, max: 100, label: 'Trusting', behavior: 'Confide in them, share resources freely, follow their lead.' }
  ],
  fear: [
    { min: 70, max: 100, label: 'Terrified of them', behavior: 'Avoid them, submissive behavior, may flee, do what they say out of terror.' },
    { min: 40, max: 69, label: 'Afraid', behavior: 'Nervous around them, hesitant to disagree, easily intimidated.' }
  ]
};

// DM resolution stat thresholds - more detailed for game mechanics
export const dmStatThresholds = {
  stamina: [
    { min: 0, max: 0, label: 'COLLAPSED', behavior: 'Character COLLAPSES unconscious. They cannot act until stamina recovers above 10%.' },
    { min: 1, max: 10, label: 'EXHAUSTED', behavior: 'Character can only crawl, speak weakly, or rest. All physical actions FAIL.' },
    { min: 11, max: 30, label: 'Very tired', behavior: 'Running FAILS. Strenuous actions have 50% chance of failure.' },
    { min: 31, max: 50, label: 'Fatigued', behavior: 'Physical actions are slower and less effective.' }
  ],
  health: [
    { min: 0, max: 0, label: 'DEAD', behavior: 'Character DIES (handled separately).' },
    { min: 1, max: 20, label: 'CRITICAL', behavior: 'Character can barely move due to pain. Most actions FAIL. May pass out.' },
    { min: 21, max: 50, label: 'Seriously wounded', behavior: 'Physical actions are impaired. May fail or worsen injury.' }
  ],
  hunger: [
    { min: 80, max: 100, label: 'STARVING', behavior: 'Character is weak, shaky, may faint. -30% to all physical actions.' },
    { min: 60, max: 79, label: 'Very hungry', behavior: 'Distracted by hunger. -15% effectiveness. May eat anything available.' }
  ],
  thirst: [
    { min: 80, max: 100, label: 'SEVERE DEHYDRATION', behavior: 'Confusion, weakness, may collapse. Actions often FAIL.' },
    { min: 60, max: 79, label: 'Very thirsty', behavior: 'Impaired focus. Will prioritize finding water over other goals.' }
  ],
  sanity: [
    { min: 0, max: 20, label: 'PSYCHOTIC BREAK', behavior: 'Character hallucinates, talks to things that aren\'t there, may attack allies or flee from nothing. Their actions may be completely different from what they intended.' },
    { min: 21, max: 40, label: 'Unstable', behavior: 'Paranoid, sees threats everywhere, makes poor decisions. May misinterpret others\' actions.' },
    { min: 41, max: 60, label: 'Stressed', behavior: 'Occasional irrational thoughts, easily startled, poor judgment under pressure.' }
  ],
  anger: [
    { min: 80, max: 100, label: 'ENRAGED', behavior: 'May attack others without provocation. Cannot cooperate. Reckless.' },
    { min: 60, max: 79, label: 'Very angry', behavior: 'Confrontational, aggressive responses, may start fights.' }
  ],
  fear: [
    { min: 80, max: 100, label: 'PARALYZED BY TERROR', behavior: 'Character freezes, cowers, or flees uncontrollably. Cannot perform dangerous actions.' },
    { min: 60, max: 79, label: 'Very frightened', behavior: 'May refuse risky actions, flee at first sign of danger.' }
  ],
  encumbrance: [
    { min: 90, max: 100, label: 'IMMOBILIZED', behavior: 'Cannot move until items are dropped.' },
    { min: 70, max: 89, label: 'Heavily burdened', behavior: 'Cannot run, very slow, may need to drop items to act.' }
  ]
};

// Ability stat thresholds for DM resolution
export const abilityStats = {
  strength: [
    { min: 70, max: 100, label: 'High', behavior: 'Advantage on physical tasks (lifting, breaking, fighting).' },
    { min: 0, max: 30, label: 'Low', behavior: 'Struggle with physical tasks, may fail.' }
  ],
  dexterity: [
    { min: 70, max: 100, label: 'High', behavior: 'Advantage on agility/precision tasks.' },
    { min: 0, max: 30, label: 'Low', behavior: 'Clumsy, may fumble or fail precise actions.' }
  ],
  intelligence: [
    { min: 70, max: 100, label: 'High', behavior: 'Better problem-solving, notice details, recall knowledge.' },
    { min: 0, max: 30, label: 'Low', behavior: 'Miss obvious solutions, poor planning.' }
  ]
};

// Stamina drain and recovery rates
export const staminaRates = {
  drain: [
    { activity: 'Normal activities', description: 'walking, talking, observing', rate: 'minimal to none' },
    { activity: 'Strenuous activities', description: 'running, fighting, climbing, heavy lifting, swimming', rate: 'significant drain' }
  ],
  recovery: [
    { activity: 'Resting', description: 'sit, lie down, take a break', rate: '10-15% per hour' },
    { activity: 'Sleeping', description: 'full sleep', rate: '15-25% per hour' }
  ]
};

// Stat guidelines for character state verification (more detailed than behavioral thresholds)
export const statGuidelines = {
  health: { description: 'Decrease for injuries, increase slowly with rest/medical care (~1-2% per hour resting)' },
  stamina: {
    description: 'Recovery rates matter',
    rates: [
      { activity: 'Sleeping', rate: '+15-25% per hour (full recovery in ~4-6 hours)' },
      { activity: 'Resting (sitting, lying down)', rate: '+8-12% per hour' },
      { activity: 'Light activity (walking slowly, talking)', rate: '+2-4% per hour' },
      { activity: 'Moderate activity (walking, light work)', rate: '-2-5% per hour' },
      { activity: 'Strenuous activity (running, fighting, climbing)', rate: '-10-20% per hour' }
    ],
    note: 'Characters should NOT become exhausted from normal walking or light tasks'
  },
  hunger: { description: 'Increase ~2-5% per hour of activity, decrease significantly when eating (-30-50% from a meal)' },
  thirst: {
    description: 'Hydration rates',
    rates: [
      { action: 'Drinking water/fluids', rate: '-30-50% thirst immediately (a good drink should nearly eliminate thirst)' },
      { condition: 'Normal conditions', rate: '+2-4% thirst per hour' },
      { condition: 'Hot/desert/exertion', rate: '+5-10% thirst per hour' }
    ],
    note: 'Characters should NOT become severely dehydrated in just a few hours unless in extreme heat. Finding and drinking water is a primary survival activity that should effectively reduce thirst.'
  },
  strength: { description: 'Usually stable, but temporary penalties from injury/exhaustion' },
  dexterity: { description: 'Usually stable, but temporary penalties from injury/exhaustion' },
  intelligence: { description: 'Usually stable, but temporary penalties from injury/exhaustion' },
  encumbrance: { description: 'Based on inventory weight (0=empty hands, 100=overburdened)' },
  sanity: { description: 'Decrease from trauma, horror, isolation, or disturbing events; recover slowly with safety/companionship' },
  anger: { description: 'Increase from frustration, conflict, injustice, or provocation; decrease with time/resolution' },
  fear: { description: 'Increase from danger, threats, or frightening events; decrease with safety or facing fears' }
};

// Attitude guidelines for character state verification
export const attitudeGuidelines = {
  love: { description: 'Deep affection, care, emotional bond. Increases with kindness, shared experiences, intimacy.' },
  anger: { description: 'Frustration, resentment towards that person. Increases with conflict, betrayal, insults.' },
  attraction: { description: 'Physical/romantic interest. Increases with flirtation, physical contact, admiration.' },
  trust: { description: 'Reliability, faith in the other person. Increases with honesty, support, kept promises.' },
  fear: { description: 'Fear OF that specific person. Increases with threats, violence, intimidation from them.' }
};

// Thirst/hydration rates
export const hydrationRates = {
  recovery: [
    { action: 'Drinking water/fluids', effect: '-30-50% thirst immediately' },
    { action: 'Adequate hydration', effect: 'thirst near 0%' }
  ],
  drain: [
    { condition: 'Normal conditions', rate: '~2-4% per hour' },
    { condition: 'Hot/desert/heavy exertion', rate: '~5-10% per hour' }
  ]
};

// Generate stats behavior text for character prompts (lists all thresholds)
export function generateStatsBehaviorText(config = statsBehavior, compact = false) {
  const lines = [];
  for (const [stat, thresholds] of Object.entries(config)) {
    for (const t of thresholds) {
      const range = t.min === t.max ? `${t.min}%` : `${t.min}-${t.max}%`;
      const statName = stat.charAt(0).toUpperCase() + stat.slice(1);
      if (compact) {
        lines.push(`- ${statName} ${range}: ${t.label} - ${t.behavior.split('.')[0]}`);
      } else {
        lines.push(`- ${statName} ${range}: ${t.label}. ${t.behavior}`);
      }
    }
  }
  return lines.join('\n');
}

// Generate attitudes behavior text for character prompts (lists all thresholds)
export function generateAttitudesBehaviorText(config = attitudesBehavior, compact = false) {
  const lines = [];
  for (const [attitude, thresholds] of Object.entries(config)) {
    for (const t of thresholds) {
      const range = `${t.min}-${t.max}%`;
      const attName = attitude.toUpperCase();
      if (compact) {
        // For compact mode, only show the most important thresholds
        if (t.min >= 70 || t.max <= 30) {
          lines.push(`- ${attName} ${range}: ${t.label} - ${t.behavior.split('.')[0]}`);
        }
      } else {
        lines.push(`- ${attName} ${range}: ${t.label} - ${t.behavior}`);
      }
    }
  }
  return lines.join('\n');
}

// Generate contextual stats behavior based on actual stat values
// Only returns guidance for stats that are in a notable threshold
export function getActiveStatEffects(stats, config = statsBehavior) {
  const effects = [];
  for (const [stat, thresholds] of Object.entries(config)) {
    const value = stats[stat];
    if (value === undefined || value === null) continue;

    for (const t of thresholds) {
      if (value >= t.min && value <= t.max) {
        const statName = stat.charAt(0).toUpperCase() + stat.slice(1);
        effects.push({
          stat: statName,
          value,
          label: t.label,
          behavior: t.behavior
        });
        break; // Only match the first applicable threshold
      }
    }
  }
  return effects;
}

// Generate contextual behavior text based on character's current stats
export function generateActiveStatsBehaviorText(stats, config = statsBehavior) {
  const effects = getActiveStatEffects(stats, config);
  if (effects.length === 0) {
    return null; // No notable stat effects
  }

  const lines = effects.map(e =>
    `- Your ${e.stat} is ${e.value}% (${e.label}): ${e.behavior}`
  );
  return lines.join('\n');
}

// Check if character is in a dying/critical state where sexual interest is suppressed
export function isInCriticalState(stats) {
  if (!stats) return false;
  const health = stats.health ?? 100;
  const hunger = stats.hunger ?? 0;
  const thirst = stats.thirst ?? 0;
  const stamina = stats.stamina ?? 100;

  // Critical conditions that suppress sexual interest
  return (
    health <= 30 ||      // Near death / critically injured
    hunger >= 70 ||      // Starving
    thirst >= 70 ||      // Dying of thirst
    stamina <= 20        // Completely exhausted
  );
}

// Generate contextual attitudes behavior based on actual attitude values towards specific characters
// stats parameter is optional - if provided, will suppress attraction behaviors when in critical state
export function getActiveAttitudeEffects(attitudes, characterNames = {}, config = attitudesBehavior, stats = null) {
  const effects = [];
  const inCriticalState = stats ? isInCriticalState(stats) : false;

  for (const [targetId, feelings] of Object.entries(attitudes || {})) {
    const targetName = characterNames[targetId] || targetId;
    const targetEffects = [];

    for (const [attitude, thresholds] of Object.entries(config)) {
      const value = feelings[attitude];
      if (value === undefined || value === null) continue;

      for (const t of thresholds) {
        if (value >= t.min && value <= t.max) {
          // Skip attraction behaviors when in critical state
          if (t.suppressedWhenDying && inCriticalState) {
            // Replace with survival-focused behavior
            targetEffects.push({
              attitude: attitude.charAt(0).toUpperCase() + attitude.slice(1),
              value,
              label: t.label + ' (suppressed)',
              behavior: 'Physical survival takes priority over romantic/sexual interest. Focus on immediate needs first.'
            });
          } else {
            targetEffects.push({
              attitude: attitude.charAt(0).toUpperCase() + attitude.slice(1),
              value,
              label: t.label,
              behavior: t.behavior
            });
          }
          break;
        }
      }
    }

    if (targetEffects.length > 0) {
      effects.push({
        target: targetName,
        targetId,
        effects: targetEffects
      });
    }
  }

  return effects;
}

// Generate contextual attitudes text based on character's actual attitudes
// stats parameter is optional - if provided, will suppress attraction behaviors when in critical state
export function generateActiveAttitudesBehaviorText(attitudes, characterNames = {}, config = attitudesBehavior, stats = null) {
  const effects = getActiveAttitudeEffects(attitudes, characterNames, config, stats);
  if (effects.length === 0) {
    return null; // No notable attitude effects
  }

  const lines = [];
  for (const targetEffect of effects) {
    for (const e of targetEffect.effects) {
      lines.push(`- Towards ${targetEffect.target}: ${e.attitude} ${e.value}% (${e.label}) - ${e.behavior}`);
    }
  }
  return lines.join('\n');
}

// Generate DM resolution stat thresholds text
export function generateDMStatThresholdsText(config = dmStatThresholds) {
  const sections = [];
  for (const [stat, thresholds] of Object.entries(config)) {
    const statName = stat.toUpperCase();
    const lines = thresholds.map(t => {
      const range = t.min === t.max ? `${t.min}%` : `${t.min}-${t.max}%`;
      return `- ${range}: ${t.label}. ${t.behavior}`;
    });
    sections.push(`${statName}:\n${lines.join('\n')}`);
  }
  return sections.join('\n\n');
}

// Generate ability stats text for DM resolution
export function generateAbilityStatsText(config = abilityStats) {
  const lines = [];
  for (const [stat, thresholds] of Object.entries(config)) {
    for (const t of thresholds) {
      const range = t.min === 0 ? `<${t.max + 1}` : `${t.min}+`;
      lines.push(`- ${t.label} ${stat} (${range}) = ${t.behavior.toLowerCase()}`);
    }
  }
  return lines.join('\n');
}

// Generate stamina drain/recovery guidance text
export function generateStaminaGuidanceText(config = staminaRates) {
  const lines = [
    'STAMINA DRAIN/RECOVERY (IMPORTANT - don\'t make characters tired too quickly):'
  ];
  lines.push('- Normal activities (walking, talking, observing) should NOT drain stamina significantly');
  lines.push('- Only STRENUOUS activities drain stamina quickly: running, fighting, climbing, heavy lifting, swimming');
  lines.push('- If characters rest (sit, lie down, take a break), their stamina RECOVERS');
  for (const r of config.recovery) {
    lines.push(`- A character ${r.activity.toLowerCase()} should recover ${r.rate} stamina`);
  }
  lines.push('- Don\'t let characters become exhausted from ordinary survival activities like walking or searching');
  return lines.join('\n');
}

// Generate thirst/hydration guidance text
export function generateHydrationGuidanceText(config = hydrationRates) {
  const lines = [
    'THIRST/HYDRATION (IMPORTANT - drinking water should help significantly):'
  ];
  for (const r of config.recovery) {
    lines.push(`- ${r.action} should ${r.effect.startsWith('-') ? 'reduce thirst by' : ''} ${r.effect.replace('-', '')}`);
  }
  for (const d of config.drain) {
    lines.push(`- ${d.condition}: thirst increases ${d.rate}`);
  }
  lines.push('- Characters should NOT become severely dehydrated in just a few hours unless in extreme conditions');
  lines.push('- When characters find water and drink, their thirst should drop significantly');
  return lines.join('\n');
}

// Generate stat guidelines text for state verification
export function generateStatGuidelinesText(config = statGuidelines) {
  const lines = ['STAT GUIDELINES (all values 0-100):'];
  for (const [stat, info] of Object.entries(config)) {
    if (info.rates) {
      lines.push(`- ${stat}: IMPORTANT - ${info.description}:`);
      for (const r of info.rates) {
        if (r.activity) {
          lines.push(`  * ${r.activity}: ${r.rate}`);
        } else if (r.action) {
          lines.push(`  * ${r.action}: ${r.rate}`);
        } else if (r.condition) {
          lines.push(`  * ${r.condition}: ${r.rate}`);
        }
      }
      if (info.note) {
        lines.push(`  * ${info.note}`);
      }
    } else {
      lines.push(`- ${stat}: ${info.description}`);
    }
  }
  return lines.join('\n');
}

// Generate attitude guidelines text for state verification
export function generateAttitudeGuidelinesText(config = attitudeGuidelines) {
  const lines = ['ATTITUDE GUIDELINES (all values 0-100, track feelings towards each OTHER character):'];
  for (const [attitude, info] of Object.entries(config)) {
    lines.push(`- ${attitude}: ${info.description}`);
  }
  return lines.join('\n');
}

// ============================================================================
// HYBRID STAT CALCULATION SYSTEM
// LLM categorizes actions, system calculates actual stat changes
// ============================================================================

// Activity levels and their stamina rates (% per hour)
export const ACTIVITY_LEVELS = {
  rest: { staminaRate: +20, thirstMultiplier: 0.5, hungerRate: 1, description: 'Sleeping, resting, meditating' },
  light: { staminaRate: +5, thirstMultiplier: 0.8, hungerRate: 2, description: 'Sitting, light activity, vehicle travel' },
  moderate: { staminaRate: -3, thirstMultiplier: 1.0, hungerRate: 3, description: 'Walking, searching, light work' },
  strenuous: { staminaRate: -12, thirstMultiplier: 1.5, hungerRate: 5, description: 'Running, fighting, climbing, swimming' },
  extreme: { staminaRate: -25, thirstMultiplier: 2.0, hungerRate: 8, description: 'Sprinting, intense combat, flying, extreme exertion' }
};

// Hydration events
export const HYDRATION_EVENTS = {
  drinking: -35,      // Drinking water reduces thirst significantly
  dehydrating: +20    // Vomiting, bleeding, etc. increases thirst
};

// Nutrition events
export const NUTRITION_EVENTS = {
  eating: -40,        // Eating a meal reduces hunger significantly
  vomiting: +15       // Vomiting increases hunger
};

// Health events and injury severity
export const HEALTH_EVENTS = {
  injured: { minor: -5, moderate: -15, severe: -30 },
  healing: +2,        // Per hour of rest
  resting: +1         // Per hour of light rest
};

// Mental events and their effects
export const MENTAL_EVENTS = {
  stressed: { sanity: -3, fear: +5, anger: +3 },
  relieved: { sanity: +5, fear: -10, anger: -5 },
  terrified: { sanity: -8, fear: +25, anger: 0 },
  enraged: { sanity: -5, fear: -5, anger: +30 },
  calm: { sanity: +3, fear: -3, anger: -3 }
};

// Base thirst rate (% per hour) - modified by temperature and activity
export const BASE_THIRST_RATE = 3;
export const HOT_THIRST_RATE = 5;  // When temperature > 30°C
export const TEMPERATURE_HOT_THRESHOLD = 30;

/**
 * Calculate stat changes based on LLM-provided activity categories
 *
 * @param {Object} character - Character object with current stats
 * @param {Object} update - LLM-provided update with activity categories
 * @param {number} durationMinutes - Duration of the action in minutes
 * @param {Object} environment - Environment info (temperature, etc.)
 * @returns {Object} - Updated stats object
 */
export function calculateStatChanges(character, update, durationMinutes, environment = {}) {
  const hours = durationMinutes / 60;
  const stats = { ...character.stats };

  // Get activity level (default to moderate if not specified)
  const activityLevel = update.activityLevel || 'moderate';
  const activity = ACTIVITY_LEVELS[activityLevel] || ACTIVITY_LEVELS.moderate;

  // STAMINA - based on activity level
  stats.stamina = (stats.stamina ?? 50) + (activity.staminaRate * hours);

  // THIRST - base rate + environment + activity modifier
  const isHot = (environment.temperature ?? 25) > TEMPERATURE_HOT_THRESHOLD;
  const baseThirstRate = isHot ? HOT_THIRST_RATE : BASE_THIRST_RATE;
  stats.thirst = (stats.thirst ?? 0) + (baseThirstRate * activity.thirstMultiplier * hours);

  // Hydration events (drinking/dehydrating)
  if (update.hydrationEvent && HYDRATION_EVENTS[update.hydrationEvent] !== undefined) {
    stats.thirst += HYDRATION_EVENTS[update.hydrationEvent];
  }

  // HUNGER - slower, based on activity
  stats.hunger = (stats.hunger ?? 0) + (activity.hungerRate * hours);

  // Nutrition events (eating/vomiting)
  if (update.nutritionEvent && NUTRITION_EVENTS[update.nutritionEvent] !== undefined) {
    stats.hunger += NUTRITION_EVENTS[update.nutritionEvent];
  }

  // HEALTH - injuries and healing
  if (update.healthEvent) {
    if (update.healthEvent === 'injured') {
      const severity = update.injurySeverity || 'moderate';
      const damage = HEALTH_EVENTS.injured[severity] || HEALTH_EVENTS.injured.moderate;
      stats.health = (stats.health ?? 100) + damage;
    } else if (update.healthEvent === 'healing') {
      stats.health = (stats.health ?? 100) + (HEALTH_EVENTS.healing * hours);
    } else if (update.healthEvent === 'resting') {
      stats.health = (stats.health ?? 100) + (HEALTH_EVENTS.resting * hours);
    }
  }

  // MENTAL STATS - based on events
  if (update.mentalEvent && MENTAL_EVENTS[update.mentalEvent]) {
    const effects = MENTAL_EVENTS[update.mentalEvent];
    stats.sanity = (stats.sanity ?? 100) + effects.sanity;
    stats.fear = (stats.fear ?? 0) + effects.fear;
    stats.anger = (stats.anger ?? 0) + effects.anger;
  }

  // Clamp all stats to valid range
  return clampStats(stats);
}

/**
 * Clamp all stats to valid 0-100 range
 *
 * @param {Object} stats - Stats object to clamp
 * @returns {Object} - Stats with values clamped to 0-100
 */
export function clampStats(stats) {
  const clampedStats = { ...stats };
  const STAT_NAMES = ['health', 'stamina', 'hunger', 'thirst', 'sanity', 'anger', 'fear', 'encumbrance'];

  for (const stat of STAT_NAMES) {
    if (clampedStats[stat] !== undefined) {
      clampedStats[stat] = Math.max(0, Math.min(100, Math.round(clampedStats[stat])));
    }
  }

  return clampedStats;
}

/**
 * Calculate effective ability stats with penalties from condition
 *
 * @param {Object} character - Character object with stats
 * @returns {Object} - Effective strength, dexterity, intelligence
 */
export function getEffectiveAbilityStats(character) {
  const stats = character.stats || {};
  const health = stats.health ?? 100;
  const stamina = stats.stamina ?? 100;
  const hunger = stats.hunger ?? 0;
  const thirst = stats.thirst ?? 0;

  let strength = stats.strength ?? 50;
  let dexterity = stats.dexterity ?? 50;
  let intelligence = stats.intelligence ?? 50;

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

  return {
    strength: Math.round(strength),
    dexterity: Math.round(dexterity),
    intelligence: Math.round(intelligence)
  };
}

/**
 * Calculate encumbrance from inventory
 *
 * @param {Array} inventory - Array of item names
 * @returns {number} - Encumbrance value 0-100
 */
export function calculateEncumbrance(inventory) {
  if (!Array.isArray(inventory) || inventory.length === 0) {
    return 0;
  }

  const LIGHT_ITEMS = ['knife', 'lighter', 'matches', 'compass', 'map', 'bandage', 'key', 'note', 'photo'];
  const HEAVY_ITEMS = ['tent', 'axe', 'rifle', 'pack', 'toolbox', 'generator', 'battery', 'tank', 'barrel'];

  let encumbrance = 0;
  for (const item of inventory) {
    const itemLower = item.toLowerCase();
    if (LIGHT_ITEMS.some(w => itemLower.includes(w))) {
      encumbrance += 2;
    } else if (HEAVY_ITEMS.some(w => itemLower.includes(w))) {
      encumbrance += 15;
    } else {
      encumbrance += 5;  // default medium weight
    }
  }

  return Math.min(100, encumbrance);
}

/**
 * Validate inventory changes against world state
 *
 * @param {Object} changes - Inventory changes (inventoryAdd, inventoryRemove)
 * @param {Object} worldState - Current world state
 * @param {Object} character - Character making the changes
 * @returns {Object} - Validated changes with invalid items removed
 */
// Maximum distance (meters) a character can be from an object to pick it up
const PICKUP_RANGE = 50;

// Calculate distance between two positions
function getDistance(pos1, pos2) {
  if (!pos1 || !pos2) return Infinity;
  const dx = (pos1.x || 0) - (pos2.x || 0);
  const dy = (pos1.y || 0) - (pos2.y || 0);
  return Math.sqrt(dx * dx + dy * dy);
}

export function validateInventoryChanges(changes, worldState, character) {
  const validated = {
    inventoryAdd: [],
    inventoryRemove: [],
    warnings: []
  };

  const charPos = character.position || { x: 0, y: 0 };

  // Build list of valid sources for items (with proximity check)
  const validSources = new Set();
  // Track items that exist but are too far away
  const tooFarItems = new Map(); // name -> distance

  // Add discovered objects (only if within pickup range)
  if (worldState.discoveredObjects) {
    for (const obj of worldState.discoveredObjects) {
      if (obj.name) {
        const distance = getDistance(charPos, obj.position);
        if (distance <= PICKUP_RANGE) {
          validSources.add(obj.name.toLowerCase());
        } else if (obj.position) {
          tooFarItems.set(obj.name.toLowerCase(), Math.round(distance));
        }
      }
    }
  }

  // Add location items (assumed to be at current location, so always in range)
  if (worldState.currentLocation?.items) {
    for (const item of worldState.currentLocation.items) {
      validSources.add(item.toLowerCase());
    }
  }

  // Add items from nearby characters (for trading/taking - must be within communication range)
  if (worldState.characters) {
    for (const char of worldState.characters) {
      if (char.id !== character.id && char.inventory) {
        const distance = getDistance(charPos, char.position);
        if (distance <= PICKUP_RANGE) {
          for (const item of char.inventory) {
            validSources.add(item.toLowerCase());
          }
        }
      }
    }
  }

  // Add items from map features within range
  if (worldState.mapFeatures) {
    for (const feature of worldState.mapFeatures) {
      if (feature.items) {
        const distance = getDistance(charPos, feature.position);
        if (distance <= PICKUP_RANGE) {
          for (const item of feature.items) {
            validSources.add(item.toLowerCase());
          }
        } else if (feature.position) {
          for (const item of feature.items) {
            tooFarItems.set(item.toLowerCase(), Math.round(distance));
          }
        }
      }
    }
  }

  // Validate items to add
  for (const item of (changes.inventoryAdd || [])) {
    const itemLower = item.toLowerCase();
    if (validSources.has(itemLower)) {
      validated.inventoryAdd.push(item);
    } else if (tooFarItems.has(itemLower)) {
      validated.warnings.push(`Rejected "${item}" - too far away (${tooFarItems.get(itemLower)}m, max ${PICKUP_RANGE}m)`);
    } else {
      validated.warnings.push(`Rejected invalid item add: "${item}" - not found in world`);
    }
  }

  // Validate items to remove (must be in character's inventory)
  const characterInventory = new Set((character.inventory || []).map(i => i.toLowerCase()));
  for (const item of (changes.inventoryRemove || [])) {
    if (characterInventory.has(item.toLowerCase())) {
      validated.inventoryRemove.push(item);
    } else {
      validated.warnings.push(`Rejected invalid item remove: "${item}" - not in inventory`);
    }
  }

  return validated;
}

/**
 * Generate activity level descriptions for DM prompt
 *
 * @returns {string} - Formatted text describing activity levels
 */
export function generateActivityLevelText() {
  const lines = ['ACTIVITY LEVELS (choose one based on the character\'s actions):'];
  for (const [level, info] of Object.entries(ACTIVITY_LEVELS)) {
    lines.push(`- ${level}: ${info.description}`);
  }
  return lines.join('\n');
}

/**
 * Generate event categories text for DM prompt
 *
 * @returns {string} - Formatted text describing event categories
 */
export function generateEventCategoriesText() {
  const lines = [
    'EVENT CATEGORIES (set to appropriate value if event occurred, null otherwise):',
    '',
    'hydrationEvent: "drinking" | "dehydrating" | null',
    '  - drinking: Character drank water or other fluids',
    '  - dehydrating: Character lost fluids (vomiting, bleeding heavily)',
    '',
    'nutritionEvent: "eating" | "vomiting" | null',
    '  - eating: Character ate food',
    '  - vomiting: Character vomited',
    '',
    'healthEvent: "injured" | "healing" | "resting" | null (if injured, also set injurySeverity: "minor" | "moderate" | "severe")',
    '  - injured: Character was hurt (set injurySeverity too)',
    '  - healing: Character received medical treatment',
    '  - resting: Character is resting and recovering naturally',
    '',
    'mentalEvent: "stressed" | "relieved" | "terrified" | "enraged" | "calm" | null',
    '  - stressed: Stressful situation, minor anxiety',
    '  - relieved: Danger passed, good news, safety found',
    '  - terrified: Extreme fear, horror, mortal danger',
    '  - enraged: Extreme anger, fury',
    '  - calm: Peaceful situation, meditation, relaxation'
  ];
  return lines.join('\n');
}
