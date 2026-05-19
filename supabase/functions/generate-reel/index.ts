// Generates an AI-planned highlight reel and submits it to Shotstack for rendering.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SHOTSTACK_API_KEY = Deno.env.get("SHOTSTACK_API_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Shotstack sandbox endpoint (free, watermarked). Swap host for production.
const SHOTSTACK_HOST = "https://api.shotstack.io/edit/stage";

type Mood = "Romantic" | "Fun & Upbeat" | "Cinematic" | "Emotional";

interface ClipChoice {
  mediaId: string;
  trimStart: number; // seconds into the clip
  length: number; // seconds on screen
  reason: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { weddingId, mood, length, musicStoragePath } = await req.json() as {
      weddingId: string; mood: Mood; length: 15 | 30 | 60; musicStoragePath?: string | null;
    };
    if (!weddingId || !mood || !length) {
      return json({ error: "Missing weddingId, mood, or length" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Fetch all sorted videos for this wedding (i.e., not in Unsorted, fully uploaded).
    const { data: media, error: mediaErr } = await admin
      .from("media_items")
      .select("id, storage_path, preview_storage_path, folder, duration, upload_status")
      .eq("wedding_id", weddingId)
      .eq("type", "video")
      .eq("upload_status", "complete")
      .neq("folder", "Unsorted");
    if (mediaErr) throw mediaErr;
    const videos = (media || []).filter((v) => v.storage_path && v.preview_storage_path);
    if (videos.length < 2) {
      return json({ error: "Need at least 2 sorted, uploaded videos to build a reel." }, 400);
    }

    // Ask the AI to score & select clips.
    const candidateList = videos.map((v) => ({
      id: v.id, folder: v.folder, duration: v.duration ?? null,
      thumbnail: publicUrl(v.preview_storage_path!),
    }));

    const prompt = `You are an expert wedding/event highlight reel editor.
Pick the best clips from the list to build a ${length}-second reel with a "${mood}" mood.
Rules:
- Total trimmed length must sum to ~${length} seconds (±2s).
- Use variety across folders when possible.
- Per-clip on-screen length 1.5–5 seconds (shorter for upbeat moods, longer for cinematic/emotional).
- Choose clips whose thumbnail best matches the mood.
- Use 6–14 clips total depending on length and pacing.
Return JSON only: {"clips":[{"mediaId":"<id>","trimStart":0,"length":2.5,"reason":"..."}]}
Available clips (with folder + thumbnail URL):
${candidateList.map((c) => `- ${c.id} [${c.folder}] dur=${c.duration ?? "?"}s thumb=${c.thumbnail}`).join("\n")}`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      }),
    });
    if (!aiResp.ok) {
      const txt = await aiResp.text();
      console.error("AI gateway error", aiResp.status, txt);
      // Fallback: pick first N videos with even slicing.
      const perClip = length / Math.min(videos.length, 8);
      const fallback: ClipChoice[] = videos.slice(0, 8).map((v) => ({
        mediaId: v.id, trimStart: 0, length: perClip, reason: "fallback",
      }));
      return await submitToShotstack(admin, weddingId, mood, length, musicStoragePath, fallback, videos);
    }
    const aiJson = await aiResp.json();
    const content = aiJson.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);
    const clips: ClipChoice[] = Array.isArray(parsed.clips) ? parsed.clips : [];
    if (clips.length === 0) {
      return json({ error: "AI did not return any clips. Try again." }, 502);
    }

    return await submitToShotstack(admin, weddingId, mood, length, musicStoragePath, clips, videos);
  } catch (e) {
    console.error("generate-reel error", e);
    return json({ error: (e as Error).message }, 500);
  }
});

async function submitToShotstack(
  admin: ReturnType<typeof createClient>,
  weddingId: string,
  mood: Mood,
  length: number,
  musicStoragePath: string | null | undefined,
  clips: ClipChoice[],
  videos: Array<{ id: string; storage_path: string; duration: number | null }>,
) {
  const videoMap = new Map(videos.map((v) => [v.id, v]));
  const transitionsByMood: Record<Mood, string> = {
    "Romantic": "fade", "Cinematic": "fade", "Emotional": "fade", "Fun & Upbeat": "wipeRight",
  };
  const transition = transitionsByMood[mood] || "fade";

  let cursor = 0;
  const shotstackClips = clips
    .map((c) => {
      const v = videoMap.get(c.mediaId);
      if (!v) return null;
      const clipLen = Math.max(1, Math.min(c.length || 2.5, 6));
      const start = cursor;
      cursor += clipLen;
      return {
        asset: { type: "video", src: publicUrl(v.storage_path), trim: Math.max(0, c.trimStart || 0) },
        start, length: clipLen,
        transition: { in: transition, out: transition },
      };
    })
    .filter(Boolean) as object[];

  if (shotstackClips.length === 0) {
    return json({ error: "No valid clips after mapping." }, 500);
  }

  const tracks: object[] = [{ clips: shotstackClips }];
  if (musicStoragePath) {
    tracks.push({
      clips: [{
        asset: { type: "audio", src: publicUrl(musicStoragePath) },
        start: 0, length: cursor,
      }],
    });
  }

  const payload = {
    timeline: { background: "#000000", tracks },
    output: { format: "mp4", resolution: "hd", aspectRatio: "9:16" },
  };

  const shot = await fetch(`${SHOTSTACK_HOST}/render`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": SHOTSTACK_API_KEY },
    body: JSON.stringify(payload),
  });
  const shotJson = await shot.json();
  if (!shot.ok || !shotJson?.success) {
    console.error("Shotstack error", shot.status, shotJson);
    return json({ error: "Render service rejected request", detail: shotJson }, 502);
  }
  const renderId = shotJson.response.id as string;

  const { data: reelRow, error: insErr } = await admin
    .from("reels")
    .insert({
      wedding_id: weddingId, mood, length_seconds: length,
      status: "rendering", timeline: { clips, transition },
      music_storage_path: musicStoragePath || null,
      shotstack_render_id: renderId,
    })
    .select("id")
    .single();
  if (insErr) throw insErr;

  return json({ reelId: reelRow.id, renderId, clipCount: shotstackClips.length });
}

function publicUrl(path: string) {
  return `${SUPABASE_URL}/storage/v1/object/public/wedding-media/${path}`;
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
