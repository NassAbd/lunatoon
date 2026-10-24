import type { ImageResponse, ScriptPanel, StoryRequest, StoryResponse } from "./contracts";

type Transport = {
  story: (request: StoryRequest) => Promise<StoryResponse>;
  image: (panel: ScriptPanel) => Promise<ImageResponse>;
};
type Handlers = {
  script: (response: StoryResponse) => Promise<void>;
  image: (response: ImageResponse) => void;
  imageError: (panelId: string, error: unknown) => void;
};

export async function runContinuation(request: StoryRequest, transport: Transport, handlers: Handlers): Promise<void> {
  const response = await transport.story(request);
  // The UI commits the script before either independent image request starts.
  await handlers.script(response);
  await Promise.all(response.script.panels.map(async (panel) => {
    try {
      const image = await transport.image(panel);
      if (image.panel_id !== panel.panel_id) throw new Error("Image response did not match its panel.");
      handlers.image(image);
    } catch (error: unknown) {
      handlers.imageError(panel.panel_id, error);
    }
  }));
}
