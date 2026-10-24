import type { StoryFoundation } from "../story-engine/contracts";

export function updateFoundationChoice(foundation: StoryFoundation, choiceId: string, label: string): StoryFoundation {
  const selected = foundation.initial_decision.options.find(option => option.id === choiceId);
  if (!selected || selected.label === label) return foundation;
  return {
    ...foundation,
    // This effect was inferred from the old action. The edited choice keeps its
    // identity, but must not silently force the previous action's outcome.
    choice_effects: foundation.choice_effects.filter(effect => effect.choice_id !== choiceId),
    initial_decision: {
      ...foundation.initial_decision,
      options: foundation.initial_decision.options.map(option => option.id === choiceId ? { ...option, label } : option),
    },
  };
}
