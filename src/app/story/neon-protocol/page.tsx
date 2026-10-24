import type { Metadata } from "next";
import { StoryWelcome } from "@/components/story-welcome";
import { getModelConfig } from "@/lib/server/ai";
import { isReferenceModelSupported } from "@/lib/art-direction";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Neon Protocol — Lunatoon" };
export default function NeonProtocolPage() {
  return <StoryWelcome referenceSupported={isReferenceModelSupported(getModelConfig().image)} />;
}
