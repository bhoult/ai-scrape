export class WorldState {
  constructor() {
    this.turnNumber = 0;
    this.summary = '';
    this.currentLocation = null;
    this.locations = new Map();
    this.items = new Map();
    this.npcs = new Map();
    this.characters = [];
    this.flags = new Map();
    this.history = [];
    this.time = { day: 1, hour: 8, minute: 0 };
    this.environment = {           // Current environment conditions
      type: '',                    // desert, jungle, forest, cave, building, city, etc.
      terrain: '',                 // sandy dunes, dense undergrowth, etc.
      lighting: '',                // bright sunlight, dim, dark, torchlit, etc.
      weather: '',                 // clear, cloudy, raining, storming, etc.
      temperature: ''              // hot, warm, mild, cold, freezing
    };
    // Narrative arc tracking for long-term coherence
    this.storyGoal = '';           // The ultimate objective characters are working toward
    this.narrativeArc = '';        // Current phase/direction of the story
    this.majorEvents = [];         // Significant events that shape the story
    this.tensions = [];            // Unresolved conflicts or challenges
  }

  initialize(dmResponse) {
    this.currentLocation = dmResponse.location;
    this.locations.set(dmResponse.location.id, dmResponse.location);
    this.characters = dmResponse.characters;
    this.summary = dmResponse.worldSummary;
    this.history.push(dmResponse.narrative);
    if (dmResponse.time) {
      this.time = dmResponse.time;
    }
    if (dmResponse.environment) {
      this.environment = { ...this.environment, ...dmResponse.environment };
    }
    if (dmResponse.storyGoal) {
      this.storyGoal = dmResponse.storyGoal;
    }
    if (dmResponse.narrativeArc) {
      this.narrativeArc = dmResponse.narrativeArc;
    }
    if (Array.isArray(dmResponse.majorEvents)) {
      this.majorEvents = dmResponse.majorEvents;
    }
    if (Array.isArray(dmResponse.tensions)) {
      this.tensions = dmResponse.tensions;
    }
  }

  applyChanges(changes) {
    if (!changes) return;

    if (changes.locationUpdates && this.currentLocation) {
      if (Array.isArray(changes.locationUpdates.items)) {
        this.currentLocation.items = changes.locationUpdates.items;
      }
      if (typeof changes.locationUpdates.description === 'string' && changes.locationUpdates.description) {
        this.currentLocation.description = changes.locationUpdates.description;
      }
    }

    if (Array.isArray(changes.characterUpdates)) {
      for (const update of changes.characterUpdates) {
        if (!update || !update.id) continue;
        const character = this.characters.find(c => c.id === update.id);
        if (character) {
          if (Array.isArray(update.inventoryAdd)) {
            character.inventory.push(...update.inventoryAdd);
          }
          if (Array.isArray(update.inventoryRemove)) {
            character.inventory = character.inventory.filter(
              item => !update.inventoryRemove.includes(item)
            );
          }
          if (typeof update.statusChange === 'string' && update.statusChange) {
            character.status = update.statusChange;
          }
          if (typeof update.clothingChange === 'string' && update.clothingChange) {
            character.clothing = update.clothingChange;
          }
          if (update.statsChange && typeof update.statsChange === 'object') {
            if (!character.stats) {
              character.stats = { health: 100, stamina: 100, hunger: 0, thirst: 0, strength: 50, dexterity: 50, encumbrance: 0, sanity: 100, anger: 0, fear: 0 };
            }
            for (const [stat, value] of Object.entries(update.statsChange)) {
              if (typeof value === 'number' && value >= 0 && value <= 100) {
                character.stats[stat] = value;
              }
            }
          }
        }
      }
    }

    // Only set newLocation if it's a valid location object with required fields
    if (changes.newLocation &&
        typeof changes.newLocation === 'object' &&
        changes.newLocation.id &&
        changes.newLocation.name) {
      this.currentLocation = {
        ...changes.newLocation,
        items: Array.isArray(changes.newLocation.items) ? changes.newLocation.items : [],
        exits: Array.isArray(changes.newLocation.exits) ? changes.newLocation.exits : [],
        npcs: Array.isArray(changes.newLocation.npcs) ? changes.newLocation.npcs : []
      };
      if (!this.locations.has(changes.newLocation.id)) {
        this.locations.set(changes.newLocation.id, this.currentLocation);
      }
    }

    if (changes.time && typeof changes.time === 'object') {
      // Validate time doesn't go backwards
      const newTime = changes.time;
      const currentMinutes = (this.time.day * 24 * 60) + (this.time.hour * 60) + this.time.minute;
      const newMinutes = (newTime.day * 24 * 60) + (newTime.hour * 60) + newTime.minute;

      if (newMinutes > currentMinutes) {
        this.time = newTime;
      } else {
        // Time went backwards, advance by 15 minutes instead
        console.warn('Time went backwards, auto-advancing by 15 minutes');
        let minute = this.time.minute + 15;
        let hour = this.time.hour;
        let day = this.time.day;
        if (minute >= 60) {
          minute -= 60;
          hour++;
        }
        if (hour >= 24) {
          hour -= 24;
          day++;
        }
        this.time = { day, hour, minute };
      }
    }

    if (changes.environmentUpdate && typeof changes.environmentUpdate === 'object') {
      for (const [key, value] of Object.entries(changes.environmentUpdate)) {
        if (typeof value === 'string' && value && value !== 'null') {
          this.environment[key] = value;
        }
      }
    }
  }

  advanceTurn(narrative, summary, time, arcUpdates = null) {
    this.turnNumber++;
    this.history.push(narrative);
    this.summary = summary;
    if (time) {
      this.time = time;
    }
    if (arcUpdates) {
      if (typeof arcUpdates.narrativeArc === 'string') {
        this.narrativeArc = arcUpdates.narrativeArc;
      }
      if (Array.isArray(arcUpdates.newMajorEvents)) {
        this.majorEvents.push(...arcUpdates.newMajorEvents);
      }
      if (Array.isArray(arcUpdates.tensions)) {
        this.tensions = arcUpdates.tensions;
      }
      if (typeof arcUpdates.storyGoal === 'string') {
        this.storyGoal = arcUpdates.storyGoal;
      }
    }
  }

  getRecentHistory(count = 5) {
    return this.history.slice(-count);
  }

  getStateSnapshot() {
    // Deep copy to prevent reference mutations affecting snapshots
    return JSON.parse(JSON.stringify({
      turnNumber: this.turnNumber,
      summary: this.summary,
      currentLocation: this.currentLocation,
      characters: this.characters,
      history: this.history,
      time: this.time,
      environment: this.environment,
      storyGoal: this.storyGoal,
      narrativeArc: this.narrativeArc,
      majorEvents: this.majorEvents,
      tensions: this.tensions
    }));
  }

  getTimeString() {
    const hour = this.time.hour.toString().padStart(2, '0');
    const minute = this.time.minute.toString().padStart(2, '0');
    return `Day ${this.time.day}, ${hour}:${minute}`;
  }
}
