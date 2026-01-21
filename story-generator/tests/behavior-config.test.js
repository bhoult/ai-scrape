import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  personalityTypes,
  getPersonalityTypeNames,
  generatePersonalityText,
  statsBehavior,
  attitudesBehavior,
  dmStatThresholds,
  abilityStats,
  staminaRates,
  hydrationRates,
  generateStatsBehaviorText,
  generateAttitudesBehaviorText,
  getActiveStatEffects,
  generateActiveStatsBehaviorText,
  isInCriticalState,
  getActiveAttitudeEffects,
  generateActiveAttitudesBehaviorText,
  generateDMStatThresholdsText,
  generateAbilityStatsText,
  generateStaminaGuidanceText,
  generateHydrationGuidanceText,
  // New hybrid stat system
  ACTIVITY_LEVELS,
  HYDRATION_EVENTS,
  NUTRITION_EVENTS,
  HEALTH_EVENTS,
  MENTAL_EVENTS,
  calculateStatChanges,
  clampStats,
  getEffectiveAbilityStats,
  calculateEncumbrance,
  validateInventoryChanges,
  generateActivityLevelText,
  generateEventCategoriesText
} from '../src/behavior-config.js';

describe('Personality Types', () => {
  it('should have all expected personality categories', () => {
    const names = getPersonalityTypeNames();

    // Emotional disposition
    assert.ok(names.includes('positive'));
    assert.ok(names.includes('negative'));
    assert.ok(names.includes('cheerful'));
    assert.ok(names.includes('depressed'));
    assert.ok(names.includes('stoic'));

    // Social tendencies
    assert.ok(names.includes('outgoing'));
    assert.ok(names.includes('introvert'));
    assert.ok(names.includes('extrovert'));
    assert.ok(names.includes('flirty'));

    // Temperament
    assert.ok(names.includes('peaceful'));
    assert.ok(names.includes('violent'));
    assert.ok(names.includes('fearful'));
    assert.ok(names.includes('brave'));

    // Cognitive style
    assert.ok(names.includes('logical'));
    assert.ok(names.includes('emotional'));
    assert.ok(names.includes('reasonable'));
    assert.ok(names.includes('impulsive'));

    // Worldview
    assert.ok(names.includes('spiritual'));
    assert.ok(names.includes('pragmatic'));
    assert.ok(names.includes('idealistic'));
    assert.ok(names.includes('cynical'));

    // Demeanor
    assert.ok(names.includes('upbeat'));
    assert.ok(names.includes('calm'));
    assert.ok(names.includes('nervous'));
    assert.ok(names.includes('confident'));

    // Interpersonal
    assert.ok(names.includes('nurturing'));
    assert.ok(names.includes('selfish'));
    assert.ok(names.includes('loyal'));
    assert.ok(names.includes('manipulative'));

    // Leadership
    assert.ok(names.includes('leader'));
    assert.ok(names.includes('follower'));
    assert.ok(names.includes('independent'));
  });

  it('should have descriptions for all personality types', () => {
    for (const [name, type] of Object.entries(personalityTypes)) {
      assert.ok(type.description, `${name} should have a description`);
      assert.ok(type.description.length > 10, `${name} description should be meaningful`);
    }
  });

  it('should generate personality text for valid types', () => {
    const text = generatePersonalityText(['brave', 'logical', 'leader']);

    assert.ok(text.includes('Brave'));
    assert.ok(text.includes('Logical'));
    assert.ok(text.includes('Leader'));
    assert.ok(text.includes('Courageous'));
    assert.ok(text.includes('Analytical'));
  });

  it('should filter out invalid personality types', () => {
    const text = generatePersonalityText(['brave', 'invalid_type', 'fake_type']);

    assert.ok(text.includes('Brave'));
    assert.ok(!text.includes('invalid_type'));
    assert.ok(!text.includes('fake_type'));
  });

  it('should return null for empty arrays', () => {
    assert.strictEqual(generatePersonalityText([]), null);
    assert.strictEqual(generatePersonalityText(null), null);
    assert.strictEqual(generatePersonalityText(undefined), null);
  });

  it('should return null when all types are invalid', () => {
    assert.strictEqual(generatePersonalityText(['fake1', 'fake2']), null);
  });
});

describe('Stats Behavior', () => {
  it('should have stamina thresholds', () => {
    assert.ok(Array.isArray(statsBehavior.stamina));
    assert.ok(statsBehavior.stamina.length > 0);

    // Check for exhausted threshold
    const exhausted = statsBehavior.stamina.find(t => t.max <= 10);
    assert.ok(exhausted, 'Should have an exhausted threshold');
    assert.ok(exhausted.label.toUpperCase().includes('EXHAUST'));
  });

  it('should have health thresholds', () => {
    assert.ok(Array.isArray(statsBehavior.health));

    const critical = statsBehavior.health.find(t => t.max <= 20);
    assert.ok(critical, 'Should have a critical health threshold');
  });

  it('should have hunger and thirst thresholds', () => {
    assert.ok(Array.isArray(statsBehavior.hunger));
    assert.ok(Array.isArray(statsBehavior.thirst));

    const starving = statsBehavior.hunger.find(t => t.min >= 70);
    assert.ok(starving, 'Should have a starving threshold');

    const desperate = statsBehavior.thirst.find(t => t.min >= 70);
    assert.ok(desperate, 'Should have a desperate thirst threshold');
  });

  it('should have sanity thresholds', () => {
    assert.ok(Array.isArray(statsBehavior.sanity));

    const breakdown = statsBehavior.sanity.find(t => t.max <= 20);
    assert.ok(breakdown, 'Should have a breakdown threshold');
  });

  it('should have anger and fear thresholds', () => {
    assert.ok(Array.isArray(statsBehavior.anger));
    assert.ok(Array.isArray(statsBehavior.fear));
  });

  it('should generate stats behavior text', () => {
    const text = generateStatsBehaviorText();

    assert.ok(text.includes('Stamina'));
    assert.ok(text.includes('Health'));
    assert.ok(text.includes('EXHAUST'));
  });

  it('should generate compact stats behavior text', () => {
    const fullText = generateStatsBehaviorText(statsBehavior, false);
    const compactText = generateStatsBehaviorText(statsBehavior, true);

    // Compact text should be shorter
    assert.ok(compactText.length <= fullText.length);
  });
});

describe('Attitudes Behavior', () => {
  it('should have attraction thresholds with suppression flag', () => {
    assert.ok(Array.isArray(attitudesBehavior.attraction));

    const intenseDesire = attitudesBehavior.attraction.find(t => t.min >= 80);
    assert.ok(intenseDesire, 'Should have intense desire threshold');
    assert.strictEqual(intenseDesire.suppressedWhenDying, true);
  });

  it('should have love thresholds', () => {
    assert.ok(Array.isArray(attitudesBehavior.love));

    const deepLove = attitudesBehavior.love.find(t => t.min >= 70);
    assert.ok(deepLove, 'Should have deep love threshold');
  });

  it('should have anger thresholds', () => {
    assert.ok(Array.isArray(attitudesBehavior.anger));

    const hostile = attitudesBehavior.anger.find(t => t.min >= 70);
    assert.ok(hostile, 'Should have hostile anger threshold');
  });

  it('should have trust thresholds', () => {
    assert.ok(Array.isArray(attitudesBehavior.trust));

    const distrustful = attitudesBehavior.trust.find(t => t.max <= 30);
    assert.ok(distrustful, 'Should have distrustful threshold');

    const trusting = attitudesBehavior.trust.find(t => t.min >= 70);
    assert.ok(trusting, 'Should have trusting threshold');
  });

  it('should have fear thresholds', () => {
    assert.ok(Array.isArray(attitudesBehavior.fear));

    const terrified = attitudesBehavior.fear.find(t => t.min >= 70);
    assert.ok(terrified, 'Should have terrified threshold');
  });

  it('should generate attitudes behavior text', () => {
    const text = generateAttitudesBehaviorText();

    assert.ok(text.includes('ATTRACTION'));
    assert.ok(text.includes('LOVE'));
    assert.ok(text.includes('ANGER'));
    assert.ok(text.includes('TRUST'));
    assert.ok(text.includes('FEAR'));
  });
});

describe('DM Stat Thresholds', () => {
  it('should have more detailed thresholds than player stats', () => {
    // DM thresholds should have collapsed/dead states
    const collapsed = dmStatThresholds.stamina.find(t => t.max === 0);
    assert.ok(collapsed, 'Should have collapsed state');

    const dead = dmStatThresholds.health.find(t => t.max === 0);
    assert.ok(dead, 'Should have dead state');
  });

  it('should generate DM stat thresholds text', () => {
    const text = generateDMStatThresholdsText();

    assert.ok(text.includes('STAMINA'));
    assert.ok(text.includes('HEALTH'));
    assert.ok(text.includes('COLLAPSED') || text.includes('collapsed'));
  });
});

describe('Ability Stats', () => {
  it('should have strength thresholds', () => {
    assert.ok(Array.isArray(abilityStats.strength));

    const high = abilityStats.strength.find(t => t.min >= 70);
    assert.ok(high, 'Should have high strength threshold');

    const low = abilityStats.strength.find(t => t.max <= 30);
    assert.ok(low, 'Should have low strength threshold');
  });

  it('should have dexterity thresholds', () => {
    assert.ok(Array.isArray(abilityStats.dexterity));
  });

  it('should have intelligence thresholds', () => {
    assert.ok(Array.isArray(abilityStats.intelligence));
  });

  it('should generate ability stats text', () => {
    const text = generateAbilityStatsText();

    assert.ok(text.includes('strength'));
    assert.ok(text.includes('dexterity'));
    assert.ok(text.includes('intelligence'));
  });
});

describe('Active Stat Effects', () => {
  it('should return empty array for healthy stats', () => {
    const effects = getActiveStatEffects({
      health: 100,
      stamina: 100,
      hunger: 0,
      thirst: 0,
      sanity: 100,
      anger: 0,
      fear: 0
    });

    assert.strictEqual(effects.length, 0);
  });

  it('should detect low stamina', () => {
    const effects = getActiveStatEffects({ stamina: 5 });

    assert.ok(effects.length > 0);
    assert.strictEqual(effects[0].stat, 'Stamina');
    assert.ok(effects[0].label.toUpperCase().includes('EXHAUST'));
  });

  it('should detect critical health', () => {
    const effects = getActiveStatEffects({ health: 15 });

    assert.ok(effects.length > 0);
    assert.strictEqual(effects[0].stat, 'Health');
  });

  it('should detect high hunger', () => {
    const effects = getActiveStatEffects({ hunger: 85 });

    assert.ok(effects.length > 0);
    assert.strictEqual(effects[0].stat, 'Hunger');
    assert.ok(effects[0].label.toUpperCase().includes('STARV'));
  });

  it('should detect high thirst', () => {
    const effects = getActiveStatEffects({ thirst: 90 });

    assert.ok(effects.length > 0);
    assert.strictEqual(effects[0].stat, 'Thirst');
  });

  it('should detect low sanity', () => {
    const effects = getActiveStatEffects({ sanity: 15 });

    assert.ok(effects.length > 0);
    assert.strictEqual(effects[0].stat, 'Sanity');
  });

  it('should detect multiple effects', () => {
    const effects = getActiveStatEffects({
      stamina: 5,
      health: 15,
      hunger: 85
    });

    assert.strictEqual(effects.length, 3);
    const statNames = effects.map(e => e.stat);
    assert.ok(statNames.includes('Stamina'));
    assert.ok(statNames.includes('Health'));
    assert.ok(statNames.includes('Hunger'));
  });

  it('should generate active stats behavior text', () => {
    const text = generateActiveStatsBehaviorText({ stamina: 5, hunger: 80 });

    assert.ok(text);
    assert.ok(text.includes('Stamina'));
    assert.ok(text.includes('Hunger'));
    assert.ok(text.includes('5%'));
    assert.ok(text.includes('80%'));
  });

  it('should return null when no notable effects', () => {
    const text = generateActiveStatsBehaviorText({
      health: 100,
      stamina: 100,
      hunger: 0,
      thirst: 0
    });

    assert.strictEqual(text, null);
  });
});

describe('Critical State Detection', () => {
  it('should detect critical health', () => {
    assert.strictEqual(isInCriticalState({ health: 30 }), true);
    assert.strictEqual(isInCriticalState({ health: 20 }), true);
    assert.strictEqual(isInCriticalState({ health: 10 }), true);
    assert.strictEqual(isInCriticalState({ health: 50 }), false);
    assert.strictEqual(isInCriticalState({ health: 100 }), false);
  });

  it('should detect critical hunger', () => {
    assert.strictEqual(isInCriticalState({ hunger: 70 }), true);
    assert.strictEqual(isInCriticalState({ hunger: 80 }), true);
    assert.strictEqual(isInCriticalState({ hunger: 100 }), true);
    assert.strictEqual(isInCriticalState({ hunger: 60 }), false);
    assert.strictEqual(isInCriticalState({ hunger: 0 }), false);
  });

  it('should detect critical thirst', () => {
    assert.strictEqual(isInCriticalState({ thirst: 70 }), true);
    assert.strictEqual(isInCriticalState({ thirst: 90 }), true);
    assert.strictEqual(isInCriticalState({ thirst: 60 }), false);
    assert.strictEqual(isInCriticalState({ thirst: 0 }), false);
  });

  it('should detect critical stamina', () => {
    assert.strictEqual(isInCriticalState({ stamina: 20 }), true);
    assert.strictEqual(isInCriticalState({ stamina: 10 }), true);
    assert.strictEqual(isInCriticalState({ stamina: 5 }), true);
    assert.strictEqual(isInCriticalState({ stamina: 30 }), false);
    assert.strictEqual(isInCriticalState({ stamina: 100 }), false);
  });

  it('should detect any critical condition', () => {
    // Multiple conditions, only one critical
    assert.strictEqual(isInCriticalState({ health: 100, hunger: 80 }), true);
    assert.strictEqual(isInCriticalState({ health: 10, hunger: 0 }), true);
  });

  it('should return false for healthy state', () => {
    assert.strictEqual(isInCriticalState({
      health: 100,
      hunger: 0,
      thirst: 0,
      stamina: 100
    }), false);
  });

  it('should handle null/undefined stats', () => {
    assert.strictEqual(isInCriticalState(null), false);
    assert.strictEqual(isInCriticalState(undefined), false);
    assert.strictEqual(isInCriticalState({}), false);
  });

  it('should use defaults for missing stats', () => {
    // Missing stats should default to healthy values
    assert.strictEqual(isInCriticalState({ health: 100 }), false);
  });
});

describe('Active Attitude Effects', () => {
  it('should detect high attraction', () => {
    const attitudes = {
      char_mike: { love: 50, anger: 0, attraction: 90, trust: 50, fear: 0 }
    };
    const effects = getActiveAttitudeEffects(attitudes, { char_mike: 'Mike' });

    assert.ok(effects.length > 0);
    const mikeEffects = effects.find(e => e.target === 'Mike');
    assert.ok(mikeEffects);

    const attraction = mikeEffects.effects.find(e => e.attitude === 'Attraction');
    assert.ok(attraction);
    assert.ok(attraction.label.includes('INTENSE'));
  });

  it('should suppress attraction in critical state', () => {
    const attitudes = {
      char_mike: { love: 50, anger: 0, attraction: 90, trust: 50, fear: 0 }
    };
    const criticalStats = { health: 20, hunger: 0, thirst: 0, stamina: 100 };

    const effects = getActiveAttitudeEffects(attitudes, { char_mike: 'Mike' }, attitudesBehavior, criticalStats);

    const mikeEffects = effects.find(e => e.target === 'Mike');
    const attraction = mikeEffects.effects.find(e => e.attitude === 'Attraction');

    assert.ok(attraction.label.includes('suppressed'));
    assert.ok(attraction.behavior.includes('survival'));
  });

  it('should not suppress attraction when healthy', () => {
    const attitudes = {
      char_mike: { love: 50, anger: 0, attraction: 90, trust: 50, fear: 0 }
    };
    const healthyStats = { health: 100, hunger: 0, thirst: 0, stamina: 100 };

    const effects = getActiveAttitudeEffects(attitudes, { char_mike: 'Mike' }, attitudesBehavior, healthyStats);

    const mikeEffects = effects.find(e => e.target === 'Mike');
    const attraction = mikeEffects.effects.find(e => e.attitude === 'Attraction');

    assert.ok(!attraction.label.includes('suppressed'));
  });

  it('should detect distrust', () => {
    const attitudes = {
      char_stranger: { love: 0, anger: 0, attraction: 0, trust: 20, fear: 0 }
    };

    const effects = getActiveAttitudeEffects(attitudes, { char_stranger: 'Stranger' });

    const strangerEffects = effects.find(e => e.target === 'Stranger');
    const trust = strangerEffects.effects.find(e => e.attitude === 'Trust');

    assert.ok(trust);
    assert.ok(trust.label.includes('Distrust'));
  });

  it('should detect hostility', () => {
    const attitudes = {
      char_enemy: { love: 0, anger: 80, attraction: 0, trust: 10, fear: 0 }
    };

    const effects = getActiveAttitudeEffects(attitudes, { char_enemy: 'Enemy' });

    const enemyEffects = effects.find(e => e.target === 'Enemy');
    const anger = enemyEffects.effects.find(e => e.attitude === 'Anger');

    assert.ok(anger);
    assert.ok(anger.label.includes('Hostile'));
  });

  it('should detect fear of a person', () => {
    const attitudes = {
      char_bully: { love: 0, anger: 0, attraction: 0, trust: 20, fear: 85 }
    };

    const effects = getActiveAttitudeEffects(attitudes, { char_bully: 'Bully' });

    const bullyEffects = effects.find(e => e.target === 'Bully');
    const fear = bullyEffects.effects.find(e => e.attitude === 'Fear');

    assert.ok(fear);
    assert.ok(fear.label.includes('Terrified'));
  });

  it('should return empty array for truly neutral attitudes', () => {
    // Values that don't fall into any threshold ranges:
    // attraction: below 40, love: below 40, anger: below 40, trust: 61-69 (gap), fear: below 40
    const attitudes = {
      char_stranger: { love: 30, anger: 10, attraction: 20, trust: 65, fear: 10 }
    };

    const effects = getActiveAttitudeEffects(attitudes, { char_stranger: 'Stranger' });

    // Should have no notable effects (all values outside defined threshold ranges)
    assert.strictEqual(effects.length, 0);
  });

  it('should handle multiple targets', () => {
    const attitudes = {
      char_friend: { love: 80, anger: 0, attraction: 0, trust: 90, fear: 0 },
      char_enemy: { love: 0, anger: 85, attraction: 0, trust: 10, fear: 0 }
    };

    const effects = getActiveAttitudeEffects(attitudes, {
      char_friend: 'Friend',
      char_enemy: 'Enemy'
    });

    assert.strictEqual(effects.length, 2);

    const friendEffects = effects.find(e => e.target === 'Friend');
    const enemyEffects = effects.find(e => e.target === 'Enemy');

    assert.ok(friendEffects);
    assert.ok(enemyEffects);
  });

  it('should generate active attitudes behavior text', () => {
    const attitudes = {
      char_mike: { love: 50, anger: 0, attraction: 90, trust: 80, fear: 0 }
    };

    const text = generateActiveAttitudesBehaviorText(attitudes, { char_mike: 'Mike' });

    assert.ok(text);
    assert.ok(text.includes('Mike'));
    assert.ok(text.includes('Attraction'));
  });
});

describe('Stamina and Hydration Rates', () => {
  it('should have stamina drain rates', () => {
    assert.ok(Array.isArray(staminaRates.drain));
    assert.ok(staminaRates.drain.length > 0);

    const normalActivity = staminaRates.drain.find(r => r.activity.toLowerCase().includes('normal'));
    assert.ok(normalActivity);

    const strenuousActivity = staminaRates.drain.find(r => r.activity.toLowerCase().includes('strenuous'));
    assert.ok(strenuousActivity);
  });

  it('should have stamina recovery rates', () => {
    assert.ok(Array.isArray(staminaRates.recovery));

    const resting = staminaRates.recovery.find(r => r.activity.toLowerCase().includes('rest'));
    assert.ok(resting);

    const sleeping = staminaRates.recovery.find(r => r.activity.toLowerCase().includes('sleep'));
    assert.ok(sleeping);
  });

  it('should have hydration recovery rates', () => {
    assert.ok(Array.isArray(hydrationRates.recovery));

    const drinking = hydrationRates.recovery.find(r => r.action.toLowerCase().includes('drink'));
    assert.ok(drinking);
  });

  it('should have hydration drain rates', () => {
    assert.ok(Array.isArray(hydrationRates.drain));

    const normalConditions = hydrationRates.drain.find(r => r.condition.toLowerCase().includes('normal'));
    assert.ok(normalConditions);

    const hotConditions = hydrationRates.drain.find(r => r.condition.toLowerCase().includes('hot'));
    assert.ok(hotConditions);
  });

  it('should generate stamina guidance text', () => {
    const text = generateStaminaGuidanceText();

    assert.ok(text);
    assert.ok(text.includes('rest') || text.includes('Rest'));
    assert.ok(text.includes('sleep') || text.includes('Sleep'));
  });

  it('should generate hydration guidance text', () => {
    const text = generateHydrationGuidanceText();

    assert.ok(text);
    assert.ok(text.includes('water') || text.includes('Water') || text.includes('drink') || text.includes('Drink'));
  });
});

// =============================================================================
// HYBRID STAT CALCULATION SYSTEM TESTS
// =============================================================================

describe('Activity Levels Configuration', () => {
  it('should have all required activity levels', () => {
    assert.ok(ACTIVITY_LEVELS.rest);
    assert.ok(ACTIVITY_LEVELS.light);
    assert.ok(ACTIVITY_LEVELS.moderate);
    assert.ok(ACTIVITY_LEVELS.strenuous);
    assert.ok(ACTIVITY_LEVELS.extreme);
  });

  it('should have correct stamina rates for each level', () => {
    // Rest should recover stamina
    assert.ok(ACTIVITY_LEVELS.rest.staminaRate > 0);
    // Light should recover stamina
    assert.ok(ACTIVITY_LEVELS.light.staminaRate > 0);
    // Moderate should drain stamina slightly
    assert.ok(ACTIVITY_LEVELS.moderate.staminaRate < 0);
    // Strenuous should drain stamina more
    assert.ok(ACTIVITY_LEVELS.strenuous.staminaRate < ACTIVITY_LEVELS.moderate.staminaRate);
    // Extreme should drain stamina the most
    assert.ok(ACTIVITY_LEVELS.extreme.staminaRate < ACTIVITY_LEVELS.strenuous.staminaRate);
  });

  it('should have thirst multipliers increasing with activity', () => {
    assert.ok(ACTIVITY_LEVELS.rest.thirstMultiplier < ACTIVITY_LEVELS.moderate.thirstMultiplier);
    assert.ok(ACTIVITY_LEVELS.moderate.thirstMultiplier < ACTIVITY_LEVELS.extreme.thirstMultiplier);
  });
});

describe('Hydration Events', () => {
  it('should reduce thirst when drinking', () => {
    assert.ok(HYDRATION_EVENTS.drinking < 0);
  });

  it('should increase thirst when dehydrating', () => {
    assert.ok(HYDRATION_EVENTS.dehydrating > 0);
  });
});

describe('Nutrition Events', () => {
  it('should reduce hunger when eating', () => {
    assert.ok(NUTRITION_EVENTS.eating < 0);
  });

  it('should increase hunger when vomiting', () => {
    assert.ok(NUTRITION_EVENTS.vomiting > 0);
  });
});

describe('Health Events', () => {
  it('should have injury severity levels', () => {
    assert.ok(HEALTH_EVENTS.injured.minor < 0);
    assert.ok(HEALTH_EVENTS.injured.moderate < 0);
    assert.ok(HEALTH_EVENTS.injured.severe < 0);
    // More severe = more damage
    assert.ok(HEALTH_EVENTS.injured.severe < HEALTH_EVENTS.injured.moderate);
    assert.ok(HEALTH_EVENTS.injured.moderate < HEALTH_EVENTS.injured.minor);
  });

  it('should have positive healing rate', () => {
    assert.ok(HEALTH_EVENTS.healing > 0);
    assert.ok(HEALTH_EVENTS.resting > 0);
  });
});

describe('Mental Events', () => {
  it('should have effects for each mental event', () => {
    assert.ok(MENTAL_EVENTS.stressed);
    assert.ok(MENTAL_EVENTS.relieved);
    assert.ok(MENTAL_EVENTS.terrified);
    assert.ok(MENTAL_EVENTS.enraged);
    assert.ok(MENTAL_EVENTS.calm);
  });

  it('should have terrified cause high fear increase', () => {
    assert.ok(MENTAL_EVENTS.terrified.fear > 0);
    assert.ok(MENTAL_EVENTS.terrified.fear > MENTAL_EVENTS.stressed.fear);
  });

  it('should have relieved reduce fear', () => {
    assert.ok(MENTAL_EVENTS.relieved.fear < 0);
  });

  it('should have enraged increase anger', () => {
    assert.ok(MENTAL_EVENTS.enraged.anger > 0);
  });
});

describe('calculateStatChanges', () => {
  it('should calculate stamina drain for strenuous activity', () => {
    const character = {
      stats: { health: 100, stamina: 100, hunger: 0, thirst: 0, sanity: 100, fear: 0, anger: 0 }
    };
    const update = { activityLevel: 'strenuous' };
    const result = calculateStatChanges(character, update, 60); // 1 hour

    assert.ok(result.stamina < 100);
    // Should drain ~12% per hour
    assert.ok(result.stamina >= 85 && result.stamina <= 92);
  });

  it('should calculate stamina recovery for resting', () => {
    const character = {
      stats: { health: 100, stamina: 50, hunger: 0, thirst: 0, sanity: 100, fear: 0, anger: 0 }
    };
    const update = { activityLevel: 'rest' };
    const result = calculateStatChanges(character, update, 60); // 1 hour

    assert.ok(result.stamina > 50);
    // Should recover ~20% per hour
    assert.ok(result.stamina >= 65 && result.stamina <= 75);
  });

  it('should apply hydration event when drinking', () => {
    const character = {
      stats: { health: 100, stamina: 100, hunger: 0, thirst: 50, sanity: 100, fear: 0, anger: 0 }
    };
    const update = { activityLevel: 'moderate', hydrationEvent: 'drinking' };
    const result = calculateStatChanges(character, update, 15);

    // Thirst should decrease significantly
    assert.ok(result.thirst < 50);
    assert.ok(result.thirst <= 20); // Should be around 15 (50 - 35 = 15)
  });

  it('should apply nutrition event when eating', () => {
    const character = {
      stats: { health: 100, stamina: 100, hunger: 60, thirst: 0, sanity: 100, fear: 0, anger: 0 }
    };
    const update = { activityLevel: 'moderate', nutritionEvent: 'eating' };
    const result = calculateStatChanges(character, update, 15);

    // Hunger should decrease significantly
    assert.ok(result.hunger < 60);
    assert.ok(result.hunger <= 25); // Should be around 21 (60 - 40 + small increase)
  });

  it('should apply injury damage', () => {
    const character = {
      stats: { health: 100, stamina: 100, hunger: 0, thirst: 0, sanity: 100, fear: 0, anger: 0 }
    };
    const update = { activityLevel: 'moderate', healthEvent: 'injured', injurySeverity: 'moderate' };
    const result = calculateStatChanges(character, update, 15);

    assert.ok(result.health < 100);
    assert.strictEqual(result.health, 85); // -15 for moderate injury
  });

  it('should apply severe injury damage', () => {
    const character = {
      stats: { health: 100, stamina: 100, hunger: 0, thirst: 0, sanity: 100, fear: 0, anger: 0 }
    };
    const update = { activityLevel: 'moderate', healthEvent: 'injured', injurySeverity: 'severe' };
    const result = calculateStatChanges(character, update, 15);

    assert.strictEqual(result.health, 70); // -30 for severe injury
  });

  it('should apply mental event effects', () => {
    const character = {
      stats: { health: 100, stamina: 100, hunger: 0, thirst: 0, sanity: 100, fear: 0, anger: 0 }
    };
    const update = { activityLevel: 'moderate', mentalEvent: 'terrified' };
    const result = calculateStatChanges(character, update, 15);

    assert.ok(result.fear > 0);
    assert.ok(result.sanity < 100);
    assert.strictEqual(result.fear, 25);
    assert.strictEqual(result.sanity, 92);
  });

  it('should increase thirst faster in hot environment', () => {
    const character = {
      stats: { health: 100, stamina: 100, hunger: 0, thirst: 0, sanity: 100, fear: 0, anger: 0 }
    };
    const update = { activityLevel: 'moderate' };

    const normalResult = calculateStatChanges(character, update, 60, { temperature: 25 });
    const hotResult = calculateStatChanges(character, update, 60, { temperature: 35 });

    assert.ok(hotResult.thirst > normalResult.thirst);
  });

  it('should clamp all stats to 0-100', () => {
    const character = {
      stats: { health: 10, stamina: 5, hunger: 95, thirst: 95, sanity: 100, fear: 0, anger: 0 }
    };
    const update = {
      activityLevel: 'extreme',
      healthEvent: 'injured',
      injurySeverity: 'severe',
      hydrationEvent: 'dehydrating'
    };
    const result = calculateStatChanges(character, update, 120); // 2 hours of extreme activity

    // All stats should be clamped
    assert.ok(result.stamina >= 0 && result.stamina <= 100);
    assert.ok(result.hunger >= 0 && result.hunger <= 100);
    assert.ok(result.thirst >= 0 && result.thirst <= 100);
    assert.ok(result.health >= 0 && result.health <= 100);
  });

  it('should default to moderate activity if not specified', () => {
    const character = {
      stats: { health: 100, stamina: 100, hunger: 0, thirst: 0, sanity: 100, fear: 0, anger: 0 }
    };
    const update = {}; // No activity level
    const result = calculateStatChanges(character, update, 60);

    // Should use moderate rates
    assert.ok(result.stamina < 100); // Moderate drains stamina
  });
});

describe('clampStats', () => {
  it('should clamp values above 100', () => {
    const stats = { health: 150, stamina: 200, hunger: 999 };
    const result = clampStats(stats);

    assert.strictEqual(result.health, 100);
    assert.strictEqual(result.stamina, 100);
    assert.strictEqual(result.hunger, 100);
  });

  it('should clamp values below 0', () => {
    const stats = { health: -50, stamina: -10, hunger: -999 };
    const result = clampStats(stats);

    assert.strictEqual(result.health, 0);
    assert.strictEqual(result.stamina, 0);
    assert.strictEqual(result.hunger, 0);
  });

  it('should round decimal values', () => {
    const stats = { health: 75.7, stamina: 33.3 };
    const result = clampStats(stats);

    assert.strictEqual(result.health, 76);
    assert.strictEqual(result.stamina, 33);
  });

  it('should preserve values within range', () => {
    const stats = { health: 50, stamina: 75, hunger: 25 };
    const result = clampStats(stats);

    assert.strictEqual(result.health, 50);
    assert.strictEqual(result.stamina, 75);
    assert.strictEqual(result.hunger, 25);
  });

  it('should handle missing stats', () => {
    const stats = { health: 50 };
    const result = clampStats(stats);

    assert.strictEqual(result.health, 50);
    assert.strictEqual(result.stamina, undefined);
  });
});

describe('getEffectiveAbilityStats', () => {
  it('should return full stats when healthy', () => {
    const character = {
      stats: { health: 100, stamina: 100, hunger: 0, thirst: 0, strength: 70, dexterity: 60, intelligence: 80 }
    };
    const result = getEffectiveAbilityStats(character);

    assert.strictEqual(result.strength, 70);
    assert.strictEqual(result.dexterity, 60);
    assert.strictEqual(result.intelligence, 80);
  });

  it('should apply health penalties when critically injured', () => {
    const character = {
      stats: { health: 20, stamina: 100, hunger: 0, thirst: 0, strength: 100, dexterity: 100, intelligence: 100 }
    };
    const result = getEffectiveAbilityStats(character);

    // Critical health (<30) = 50% penalty to strength and dexterity
    assert.strictEqual(result.strength, 50);
    assert.strictEqual(result.dexterity, 50);
    assert.strictEqual(result.intelligence, 100); // Not affected by health
  });

  it('should apply stamina penalties when exhausted', () => {
    const character = {
      stats: { health: 100, stamina: 10, hunger: 0, thirst: 0, strength: 100, dexterity: 100, intelligence: 100 }
    };
    const result = getEffectiveAbilityStats(character);

    // Critical stamina (<20) = 50% strength, 60% dexterity
    assert.strictEqual(result.strength, 50);
    assert.strictEqual(result.dexterity, 60);
  });

  it('should apply hunger/thirst penalties', () => {
    const character = {
      stats: { health: 100, stamina: 100, hunger: 90, thirst: 0, strength: 100, dexterity: 100, intelligence: 100 }
    };
    const result = getEffectiveAbilityStats(character);

    // High hunger/thirst = 70% intelligence, 80% strength
    assert.strictEqual(result.intelligence, 70);
    assert.strictEqual(result.strength, 80);
    assert.strictEqual(result.dexterity, 100); // Not affected
  });

  it('should stack penalties', () => {
    const character = {
      stats: { health: 20, stamina: 10, hunger: 90, thirst: 90, strength: 100, dexterity: 100, intelligence: 100 }
    };
    const result = getEffectiveAbilityStats(character);

    // All penalties stacked
    // Strength: 100 * 0.5 (health) * 0.5 (stamina) * 0.8 (hunger) = 20
    assert.strictEqual(result.strength, 20);
    assert.strictEqual(result.intelligence, 70);
  });

  it('should use defaults for missing stats', () => {
    const character = { stats: {} };
    const result = getEffectiveAbilityStats(character);

    assert.strictEqual(result.strength, 50);
    assert.strictEqual(result.dexterity, 50);
    assert.strictEqual(result.intelligence, 50);
  });
});

describe('calculateEncumbrance', () => {
  it('should return 0 for empty inventory', () => {
    assert.strictEqual(calculateEncumbrance([]), 0);
    assert.strictEqual(calculateEncumbrance(null), 0);
    assert.strictEqual(calculateEncumbrance(undefined), 0);
  });

  it('should calculate light items as 2 each', () => {
    const inventory = ['knife', 'lighter', 'compass'];
    const result = calculateEncumbrance(inventory);

    assert.strictEqual(result, 6); // 3 * 2
  });

  it('should calculate heavy items as 15 each', () => {
    const inventory = ['rifle', 'tent'];
    const result = calculateEncumbrance(inventory);

    assert.strictEqual(result, 30); // 2 * 15
  });

  it('should calculate default items as 5 each', () => {
    const inventory = ['canteen', 'rope', 'food'];
    const result = calculateEncumbrance(inventory);

    assert.strictEqual(result, 15); // 3 * 5
  });

  it('should handle mixed inventory', () => {
    const inventory = ['knife', 'rifle', 'canteen'];
    const result = calculateEncumbrance(inventory);

    // knife=2, rifle=15, canteen=5
    assert.strictEqual(result, 22);
  });

  it('should cap encumbrance at 100', () => {
    const inventory = Array(10).fill('rifle'); // 10 * 15 = 150
    const result = calculateEncumbrance(inventory);

    assert.strictEqual(result, 100);
  });

  it('should be case-insensitive', () => {
    const inventory = ['KNIFE', 'Lighter', 'RIFLE'];
    const result = calculateEncumbrance(inventory);

    // knife=2, lighter=2, rifle=15
    assert.strictEqual(result, 19);
  });
});

describe('validateInventoryChanges', () => {
  const mockWorldState = {
    discoveredObjects: [
      { name: 'water bottle' },
      { name: 'rusty key' }
    ],
    currentLocation: {
      items: ['rock', 'stick']
    },
    characters: [
      { id: 'sarah', inventory: ['knife', 'rope'] },
      { id: 'mike', inventory: ['flashlight'] }
    ],
    mapFeatures: [
      { items: ['first aid kit'] }
    ]
  };

  const mockCharacter = {
    id: 'sarah',
    inventory: ['knife', 'rope']
  };

  it('should validate items that exist in discovered objects', () => {
    const changes = { inventoryAdd: ['water bottle'], inventoryRemove: [] };
    const result = validateInventoryChanges(changes, mockWorldState, mockCharacter);

    assert.strictEqual(result.inventoryAdd.length, 1);
    assert.strictEqual(result.inventoryAdd[0], 'water bottle');
    assert.strictEqual(result.warnings.length, 0);
  });

  it('should validate items that exist in location', () => {
    const changes = { inventoryAdd: ['rock'], inventoryRemove: [] };
    const result = validateInventoryChanges(changes, mockWorldState, mockCharacter);

    assert.strictEqual(result.inventoryAdd.length, 1);
    assert.strictEqual(result.inventoryAdd[0], 'rock');
  });

  it('should reject items that do not exist anywhere', () => {
    const changes = { inventoryAdd: ['magic sword'], inventoryRemove: [] };
    const result = validateInventoryChanges(changes, mockWorldState, mockCharacter);

    assert.strictEqual(result.inventoryAdd.length, 0);
    assert.strictEqual(result.warnings.length, 1);
    assert.ok(result.warnings[0].includes('magic sword'));
  });

  it('should validate removal of items in inventory', () => {
    const changes = { inventoryAdd: [], inventoryRemove: ['knife'] };
    const result = validateInventoryChanges(changes, mockWorldState, mockCharacter);

    assert.strictEqual(result.inventoryRemove.length, 1);
    assert.strictEqual(result.inventoryRemove[0], 'knife');
  });

  it('should reject removal of items not in inventory', () => {
    const changes = { inventoryAdd: [], inventoryRemove: ['flashlight'] }; // flashlight is mike's
    const result = validateInventoryChanges(changes, mockWorldState, mockCharacter);

    assert.strictEqual(result.inventoryRemove.length, 0);
    assert.strictEqual(result.warnings.length, 1);
    assert.ok(result.warnings[0].includes('flashlight'));
  });

  it('should handle case-insensitive matching', () => {
    const changes = { inventoryAdd: ['WATER BOTTLE'], inventoryRemove: ['KNIFE'] };
    const result = validateInventoryChanges(changes, mockWorldState, mockCharacter);

    assert.strictEqual(result.inventoryAdd.length, 1);
    assert.strictEqual(result.inventoryRemove.length, 1);
  });

  it('should allow items from other characters (trading)', () => {
    const changes = { inventoryAdd: ['flashlight'], inventoryRemove: [] }; // flashlight is mike's
    const result = validateInventoryChanges(changes, mockWorldState, mockCharacter);

    assert.strictEqual(result.inventoryAdd.length, 1);
    assert.strictEqual(result.inventoryAdd[0], 'flashlight');
  });

  it('should allow items from map features', () => {
    const changes = { inventoryAdd: ['first aid kit'], inventoryRemove: [] };
    const result = validateInventoryChanges(changes, mockWorldState, mockCharacter);

    assert.strictEqual(result.inventoryAdd.length, 1);
  });
});

describe('generateActivityLevelText', () => {
  it('should generate text with all activity levels', () => {
    const text = generateActivityLevelText();

    assert.ok(text.includes('rest'));
    assert.ok(text.includes('light'));
    assert.ok(text.includes('moderate'));
    assert.ok(text.includes('strenuous'));
    assert.ok(text.includes('extreme'));
  });

  it('should include descriptions for each level', () => {
    const text = generateActivityLevelText();

    assert.ok(text.includes('Sleeping'));
    assert.ok(text.includes('Walking'));
    assert.ok(text.includes('Running'));
  });
});

describe('generateEventCategoriesText', () => {
  it('should generate text with all event categories', () => {
    const text = generateEventCategoriesText();

    assert.ok(text.includes('hydrationEvent'));
    assert.ok(text.includes('nutritionEvent'));
    assert.ok(text.includes('healthEvent'));
    assert.ok(text.includes('mentalEvent'));
  });

  it('should include event options', () => {
    const text = generateEventCategoriesText();

    assert.ok(text.includes('drinking'));
    assert.ok(text.includes('eating'));
    assert.ok(text.includes('injured'));
    assert.ok(text.includes('terrified'));
  });
});
