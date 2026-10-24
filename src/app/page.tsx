import { Reader } from "@/components/reader";
import { getModelConfig } from "@/lib/server/ai";
import { isReferenceModelSupported } from "@/lib/art-direction";

export const dynamic = "force-dynamic";

export default function Home() {
  const config = getModelConfig();
  return <Reader configured={Boolean(process.env.OPENAI_API_KEY?.trim())} models={{ story: config.story, image: config.image, quality: config.quality, referenceSupported: isReferenceModelSupported(config.image) }} />;
}
