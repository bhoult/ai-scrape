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
  generateHydrationGuidanceText
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
