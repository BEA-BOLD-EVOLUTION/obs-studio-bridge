import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

type ObsCall = (requestType: string, requestData?: Record<string, unknown>) => Promise<any>;

type RestoreState = {
  sceneName: string;
  muteStates: Map<string, boolean>;
};

const writeAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false
} as const;

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
} as const;

function result(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function getSceneItemId(obsCall: ObsCall, sceneName: string, sourceName: string): Promise<number> {
  const item = await obsCall("GetSceneItemId", { sceneName, sourceName });
  return Number(item.sceneItemId);
}

async function setSourceVisibility(
  obsCall: ObsCall,
  sceneName: string,
  sourceName: string,
  visible: boolean
): Promise<void> {
  const sceneItemId = await getSceneItemId(obsCall, sceneName, sourceName);
  await obsCall("SetSceneItemEnabled", { sceneName, sceneItemId, sceneItemEnabled: visible });
}

async function restartMedia(obsCall: ObsCall, inputName: string): Promise<void> {
  await obsCall("TriggerMediaInputAction", {
    inputName,
    mediaAction: "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART"
  });
}

async function waitForMediaEnd(obsCall: ObsCall, inputName: string, timeoutMs: number): Promise<void> {
  const startedAt = Date.now();
  let observedPlaying = false;

  while (Date.now() - startedAt < timeoutMs) {
    const status = await obsCall("GetMediaInputStatus", { inputName });
    const state = String(status.mediaState ?? "");

    if (state === "OBS_MEDIA_STATE_PLAYING" || state === "OBS_MEDIA_STATE_OPENING" || state === "OBS_MEDIA_STATE_BUFFERING") {
      observedPlaying = true;
    }

    if (observedPlaying && (state === "OBS_MEDIA_STATE_ENDED" || state === "OBS_MEDIA_STATE_STOPPED")) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Timed out waiting for media input '${inputName}' to finish.`);
}

async function captureState(obsCall: ObsCall, inputNames: string[] = []): Promise<RestoreState> {
  const scene = await obsCall("GetCurrentProgramScene");
  const muteStates = new Map<string, boolean>();

  for (const inputName of inputNames) {
    try {
      const mute = await obsCall("GetInputMute", { inputName });
      muteStates.set(inputName, Boolean(mute.inputMuted));
    } catch {
      // Not every OBS input supports audio. Ignore non-audio inputs.
    }
  }

  return {
    sceneName: String(scene.currentProgramSceneName),
    muteStates
  };
}

async function restoreState(obsCall: ObsCall, state: RestoreState): Promise<void> {
  for (const [inputName, inputMuted] of state.muteStates) {
    try {
      await obsCall("SetInputMute", { inputName, inputMuted });
    } catch {
      // Best-effort restoration; scene restoration still takes priority.
    }
  }

  await obsCall("SetCurrentProgramScene", { sceneName: state.sceneName });
}

const workflowStepSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("switch_scene"), sceneName: z.string().min(1) }),
  z.object({
    type: z.literal("set_source_visibility"),
    sceneName: z.string().min(1),
    sourceName: z.string().min(1),
    visible: z.boolean()
  }),
  z.object({ type: z.literal("media_restart"), inputName: z.string().min(1) }),
  z.object({
    type: z.literal("media_restart_and_wait"),
    inputName: z.string().min(1),
    timeoutMs: z.number().int().min(1000).max(600000).default(120000)
  }),
  z.object({ type: z.literal("wait"), durationMs: z.number().int().min(0).max(600000) }),
  z.object({ type: z.literal("set_input_mute"), inputName: z.string().min(1), muted: z.boolean() }),
  z.object({ type: z.literal("set_input_volume"), inputName: z.string().min(1), volumeDb: z.number().min(-100).max(26) })
]);

type WorkflowStep = z.infer<typeof workflowStepSchema>;

async function runStep(obsCall: ObsCall, step: WorkflowStep): Promise<void> {
  switch (step.type) {
    case "switch_scene":
      await obsCall("SetCurrentProgramScene", { sceneName: step.sceneName });
      return;
    case "set_source_visibility":
      await setSourceVisibility(obsCall, step.sceneName, step.sourceName, step.visible);
      return;
    case "media_restart":
      await restartMedia(obsCall, step.inputName);
      return;
    case "media_restart_and_wait":
      await restartMedia(obsCall, step.inputName);
      await waitForMediaEnd(obsCall, step.inputName, step.timeoutMs);
      return;
    case "wait":
      await new Promise((resolve) => setTimeout(resolve, step.durationMs));
      return;
    case "set_input_mute":
      await obsCall("SetInputMute", { inputName: step.inputName, inputMuted: step.muted });
      return;
    case "set_input_volume":
      await obsCall("SetInputVolume", { inputName: step.inputName, inputVolumeDb: step.volumeDb });
      return;
  }
}

async function fitSourceToCanvas(obsCall: ObsCall, sceneName: string, sourceName: string): Promise<void> {
  const sceneItemId = await getSceneItemId(obsCall, sceneName, sourceName);
  const video = await obsCall("GetVideoSettings");
  await obsCall("SetSceneItemTransform", {
    sceneName,
    sceneItemId,
    sceneItemTransform: {
      positionX: 0,
      positionY: 0,
      boundsType: "OBS_BOUNDS_SCALE_INNER",
      boundsWidth: Number(video.baseWidth),
      boundsHeight: Number(video.baseHeight),
      boundsAlignment: 0
    }
  });
}

async function placeCameraPip(
  obsCall: ObsCall,
  sceneName: string,
  cameraSourceName: string,
  scalePercent: number,
  marginPx: number
): Promise<void> {
  const sceneItemId = await getSceneItemId(obsCall, sceneName, cameraSourceName);
  const video = await obsCall("GetVideoSettings");
  const width = Number(video.baseWidth) * scalePercent;
  const height = Number(video.baseHeight) * scalePercent;

  await obsCall("SetSceneItemTransform", {
    sceneName,
    sceneItemId,
    sceneItemTransform: {
      positionX: Number(video.baseWidth) - width - marginPx,
      positionY: Number(video.baseHeight) - height - marginPx,
      boundsType: "OBS_BOUNDS_SCALE_INNER",
      boundsWidth: width,
      boundsHeight: height,
      boundsAlignment: 0
    }
  });
}

export function registerWorkflowTools(server: McpServer, obsCall: ObsCall): void {
  server.registerTool("obs_list_creator_workflows", {
    description: "List the built-in creator-goal workflows supported by this OBS bridge.",
    inputSchema: {},
    annotations: readOnlyAnnotations
  }, async () => result({
    workflows: [
      {
        id: "ai_transition",
        goal: "Run a three-part AI transition and safely return to LIVE.",
        pattern: ["transition-in", "featured AI media", "transition-out", "restore LIVE"]
      },
      {
        id: "screen_share",
        goal: "Share an existing desktop/window capture source fullscreen or with camera picture-in-picture."
      },
      {
        id: "custom",
        goal: "Compose reusable OBS actions into a creator-defined workflow."
      }
    ]
  }));

  server.registerTool("obs_run_workflow", {
    description: "Run a generic creator workflow made of ordered OBS actions, with optional automatic restoration of the prior LIVE scene and touched audio mute states.",
    inputSchema: {
      name: z.string().min(1),
      steps: z.array(workflowStepSchema).min(1).max(100),
      restoreOnComplete: z.boolean().default(false),
      restoreOnFailure: z.boolean().default(true)
    },
    annotations: writeAnnotations
  }, async ({ name, steps, restoreOnComplete, restoreOnFailure }) => {
    const audioInputs = [...new Set(steps.flatMap((step) => step.type === "set_input_mute" ? [step.inputName] : []))];
    const state = await captureState(obsCall, audioInputs);
    const completed: number[] = [];

    try {
      for (let index = 0; index < steps.length; index += 1) {
        const step = steps[index];
        if (!step) continue;
        await runStep(obsCall, step);
        completed.push(index);
      }
      if (restoreOnComplete) await restoreState(obsCall, state);
      return result({ ok: true, name, completedSteps: completed.length, restored: restoreOnComplete, returnScene: state.sceneName });
    } catch (error) {
      if (restoreOnFailure) {
        try { await restoreState(obsCall, state); } catch { /* preserve original error */ }
      }
      return result({ ok: false, name, completedSteps: completed.length, restored: restoreOnFailure, returnScene: state.sceneName, error: errorMessage(error) });
    }
  });

  server.registerTool("obs_run_ai_transition", {
    description: "Run a three-part AI transition: transition-in video, featured AI video, transition-out video, then return to the creator's previous LIVE scene. The same sequence engine can also be used for non-AI media workflows.",
    inputSchema: {
      mediaSceneName: z.string().min(1),
      transitionInInput: z.string().min(1),
      aiVideoInput: z.string().min(1),
      transitionOutInput: z.string().min(1),
      timeoutMsPerClip: z.number().int().min(1000).max(600000).default(120000)
    },
    annotations: writeAnnotations
  }, async ({ mediaSceneName, transitionInInput, aiVideoInput, transitionOutInput, timeoutMsPerClip }) => {
    const inputs = [transitionInInput, aiVideoInput, transitionOutInput];
    const state = await captureState(obsCall, inputs);

    try {
      await obsCall("SetCurrentProgramScene", { sceneName: mediaSceneName });

      for (const current of inputs) {
        for (const sourceName of inputs) {
          await setSourceVisibility(obsCall, mediaSceneName, sourceName, sourceName === current);
        }
        await restartMedia(obsCall, current);
        await waitForMediaEnd(obsCall, current, timeoutMsPerClip);
      }

      for (const sourceName of inputs) {
        await setSourceVisibility(obsCall, mediaSceneName, sourceName, false);
      }

      await restoreState(obsCall, state);
      return result({
        ok: true,
        workflow: "ai_transition",
        sequence: inputs,
        returnedToScene: state.sceneName,
        audioStateRestored: true
      });
    } catch (error) {
      try {
        for (const sourceName of inputs) {
          try { await setSourceVisibility(obsCall, mediaSceneName, sourceName, false); } catch { /* best effort */ }
        }
        await restoreState(obsCall, state);
      } catch {
        // Return the original workflow failure below.
      }
      return result({
        ok: false,
        workflow: "ai_transition",
        returnedToScene: state.sceneName,
        error: errorMessage(error)
      });
    }
  });

  server.registerTool("obs_share_capture_source", {
    description: "Share an existing OBS desktop/window capture source. Supports fullscreen sharing or camera picture-in-picture, and can later be restored by switching back to the previous scene.",
    inputSchema: {
      sceneName: z.string().min(1),
      captureSourceName: z.string().min(1),
      layout: z.enum(["fullscreen", "picture_in_picture"]).default("fullscreen"),
      cameraSourceName: z.string().min(1).optional(),
      cameraScalePercent: z.number().min(0.1).max(0.5).default(0.28),
      marginPx: z.number().int().min(0).max(500).default(32)
    },
    annotations: writeAnnotations
  }, async ({ sceneName, captureSourceName, layout, cameraSourceName, cameraScalePercent, marginPx }) => {
    const state = await captureState(obsCall);

    try {
      await obsCall("SetCurrentProgramScene", { sceneName });
      await setSourceVisibility(obsCall, sceneName, captureSourceName, true);
      await fitSourceToCanvas(obsCall, sceneName, captureSourceName);

      if (layout === "picture_in_picture") {
        if (!cameraSourceName) throw new Error("cameraSourceName is required for picture_in_picture layout.");
        await setSourceVisibility(obsCall, sceneName, cameraSourceName, true);
        await placeCameraPip(obsCall, sceneName, cameraSourceName, cameraScalePercent, marginPx);
      }

      return result({
        ok: true,
        workflow: "screen_share",
        sceneName,
        captureSourceName,
        layout,
        cameraSourceName: cameraSourceName ?? null,
        previousSceneName: state.sceneName,
        stopInstruction: `Switch back to '${state.sceneName}' when screen sharing is finished.`
      });
    } catch (error) {
      try { await restoreState(obsCall, state); } catch { /* preserve original error */ }
      return result({ ok: false, workflow: "screen_share", returnedToScene: state.sceneName, error: errorMessage(error) });
    }
  });
}
