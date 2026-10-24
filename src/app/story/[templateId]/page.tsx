import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StoryWelcome } from "@/components/story-welcome";
import { getModelConfig } from "@/lib/server/ai";
import { isReferenceModelSupported } from "@/lib/art-direction";
import { getStoryTemplate } from "@/lib/story-templates/server";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ templateId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { templateId } = await params;
  const template = getStoryTemplate(templateId);
  return { title: template ? `${template.title} — Lunatoon` : "Story not found — Lunatoon" };
}

export default async function StoryPage({ params }: Props) {
  const { templateId } = await params;
  const template = getStoryTemplate(templateId);
  if (!template) notFound();
  const assetIds = new Set([template.cover_asset_id, ...template.reference_asset_ids, ...template.opening_beats.map(beat => beat.asset_id)]);
  const assetUrls = Object.fromEntries([...assetIds].map(id => [id, `/api/templates/${encodeURIComponent(template.id)}/assets/${encodeURIComponent(id)}?version=${template.version}`]));
  return <StoryWelcome key={`${template.id}:${template.version}`} template={template} assetUrls={assetUrls} referenceSupported={isReferenceModelSupported(getModelConfig().image)} />;
}
