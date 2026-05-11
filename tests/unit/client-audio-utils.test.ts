import { describe, expect, test, vi, afterEach } from "vitest";
import {
  decodePCM16ToFloat32,
  createAudioPlaybackContext,
} from "../../client/replit_integrations/audio/audio-utils";

describe("client/replit_integrations/audio/audio-utils", () => {
  describe("decodePCM16ToFloat32", () => {
    test("decodes PCM16 buffer into normalized floats", () => {
      const pcm16 = new Int16Array([0, 32_767, -32_768]);
      const buf = pcm16.buffer.slice(
        pcm16.byteOffset,
        pcm16.byteOffset + pcm16.byteLength,
      );
      const b64 = Buffer.from(buf).toString("base64");

      const floats = decodePCM16ToFloat32(b64);

      expect(floats).toHaveLength(3);
      expect(floats[0]).toBeCloseTo(0, 8);
      expect(floats[1]).toBeCloseTo(32767 / 32768, 8);
      expect(floats[2]).toBeCloseTo(-32768 / 32768, 8);
    });
  });

  describe("createAudioPlaybackContext", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    test("registers playback worklet and connects destination", async () => {
      const connect = vi.fn(function connect(this: unknown) {
        return this as unknown as AudioWorkletNode;
      });

      /** Must be usable with `new` (Vitest mocks are not constructors by default). */
      function FakeAudioWorkletNode() {
        return { connect };
      }

      vi.stubGlobal("AudioWorkletNode", FakeAudioWorkletNode);

      vi.stubGlobal(
        "AudioContext",
        class {
          readonly destination = {};

          readonly audioWorklet = {
            addModule: vi.fn(async (path: string) => path),
          };

          readonly sampleRate: number;

          constructor(opts?: { sampleRate?: number }) {
            this.sampleRate = opts?.sampleRate ?? 48_000;
          }

          decodeAudioData() {
            return Promise.reject(new Error("unused"));
          }
        } as unknown as typeof AudioContext,
      );

      const { ctx, worklet } = await createAudioPlaybackContext(
        "/worklet/path.js",
        24_000,
      );

      expect(ctx.audioWorklet.addModule).toHaveBeenCalledWith("/worklet/path.js");
      expect(worklet).toEqual({ connect });
    });
  });
});
