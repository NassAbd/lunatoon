import type { VisualReference } from "./story-engine/contracts";
import { EngineError } from "./story-engine/errors";

const priority: Record<VisualReference["role"], number> = { protagonist: 0, character: 1, environment: 2, style: 3, unspecified: 4 };

/** Uses only saved explicit roles. An image's position, filename or caption is not consent to reinterpret it. */
export function orderedVisualReferences(referenceIds: readonly string[], roles: readonly VisualReference[] = []): VisualReference[] {
  if (referenceIds.length > 3 || roles.length > 3 || new Set(referenceIds).size !== referenceIds.length || new Set(roles.map(item => item.asset_id)).size !== roles.length || roles.some(item => !referenceIds.includes(item.asset_id) || !(item.role in priority)) || roles.filter(item => item.role === "protagonist").length > 1) {
    throw new EngineError("invalid_visual_references", "Visual reference roles must name unique selected story references and at most one protagonist reference.", 400);
  }
  const assigned = new Map(roles.map(item => [item.asset_id, item.role]));
  // Modern JS sorting is stable: preserve saved input order within each role.
  return referenceIds.map(asset_id => ({ asset_id, role: assigned.get(asset_id) ?? "unspecified" as const })).sort((left, right) => priority[left.role] - priority[right.role]);
}

export function visualReferenceInstructions(selection: readonly VisualReference[], protagonistName: string): string {
  if (!selection.length) return "No input reference images are attached. Follow the saved written character bible; do not invent a visual reference.";
  const roles: Record<VisualReference["role"], string> = {
    protagonist: `canonical protagonist identity for ${protagonistName}; preserve the recognizable face, established skin tone, age and characteristic hair whenever this character appears`,
    character: "additional character reference; do not transfer another character's identity onto the protagonist",
    environment: "environment reference; use its setting details, not its people's identity",
    style: "visual style reference; use its linework, palette and shading, not its people's identity",
    unspecified: "unassigned story reference; its subject is not confirmed as the protagonist, so do not infer or replace the protagonist's identity from it",
  };
  return `${selection.map((item, index) => `Reference ${index + 1}: ${roles[item.role]}.`).join("\n")}\n${selection.some(item => item.role === "protagonist") ? "Reference priority: canonical protagonist identity, other characters, environment, then style. Lower-priority references must not change the protagonist's identity." : "No canonical protagonist image has been designated. The saved written character bible is the identity authority; do not assume the first reference depicts the protagonist."} Apply only recorded appearance and object changes; do not copy old injuries, clothing condition or possession over the current state.`;
}
