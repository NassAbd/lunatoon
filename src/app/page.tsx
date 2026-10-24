import { StoryWelcome } from "@/components/story-welcome";
import { getModelConfig } from "@/lib/server/ai";
import { isReferenceModelSupported } from "@/lib/art-direction";
export const dynamic = "force-dynamic";
export default function Home() {
  return <StoryWelcome referenceSupported={isReferenceModelSupported(getModelConfig().image)} />;
}
