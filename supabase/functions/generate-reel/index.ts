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

// Shotstack production endpoint. The configured key belongs to Production.
const SHOTSTACK_HOST = "https://api.shotstack.io/edit/v1";

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
    const videos = (media || []).filter((v) => !!v.storage_path);
    if (videos.length < 2) {
      // Help the user understand WHY (uploads still pending vs nothing sorted).
      const { count: pendingCount } = await admin
        .from("media_items").select("id", { count: "exact", head: true })
        .eq("wedding_id", weddingId).eq("type", "video").eq("upload_status", "pending");
      const msg = (pendingCount || 0) > 0
        ? `Your videos are still uploading in the background (${pendingCount} pending). Wait for the upload indicator to finish, then try again.`
        : "Need at least 2 sorted, uploaded videos in folders other than Unsorted.";
      return json({ error: msg }, 400);
    }

    // Only clips with a preview thumbnail can be scored by the vision AI.
    const withPreview = videos.filter((v) => !!v.preview_storage_path);
    const candidateList = withPreview.map((v) => ({
      id: v.id, folder: v.folder, duration: v.duration ?? null,
      thumbnail: publicUrl(v.preview_storage_path!),
    }));

    // If no previews exist, skip AI picking entirely and use folder-spread fallback.
    if (candidateList.length === 0) {
      const targetCount = getTargetClipCount(length, videos.length);
      const perClip = length / Math.min(videos.length, targetCount);
      const fallback: ClipChoice[] = spreadAcrossFolders(videos, targetCount).map((v) => ({
        mediaId: v.id, trimStart: 0, length: perClip, reason: "no-preview fallback",
      }));
      return await submitToShotstack(admin, weddingId, mood, length, musicStoragePath, fallback, videos);
    }

    const prompt = `You are an expert wedding/event highlight reel editor.
Build a ${length}-second highlight reel with a "${mood}" mood.

CLIP PRIORITIZATION (in this order):
1. MOVEMENT FIRST: Prefer clips that show motion — camera pans, dancing, walking down the aisle, action, gestures. Static or shaky still shots are last resort.
2. FACES & EMOTION: Then prioritize clips showing faces and emotional moments — smiles, tears, laughter, hugs, close-ups of people reacting.
3. STORY VARIETY: Spread picks across different folders so the reel tells a chronological story from start to finish (e.g. getting-ready → ceremony → reception). Order returned clips in story sequence.
4. AVOID REPETITION: Never pick two near-identical clips back-to-back. Vary subject, angle, and folder between consecutive picks.

Rules:
- Total trimmed length must sum to ~${length} seconds (±2s).
- Per-clip on-screen length 1.5–5 seconds (shorter for upbeat moods, longer for cinematic/emotional).
- Use 6–14 clips total depending on length and pacing.
- Return clips in the exact order they should play.

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
      const targetCount = getTargetClipCount(length, videos.length);
      const perClip = length / targetCount;
      const fallback: ClipChoice[] = spreadAcrossFolders(videos, targetCount).map((v) => ({
        mediaId: v.id, trimStart: 0, length: perClip, reason: "fallback",
      }));
      return await submitToShotstack(admin, weddingId, mood, length, musicStoragePath, fallback, videos);
    }
    const aiJson = await aiResp.json();
    const content = aiJson.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);
    const clips: ClipChoice[] = Array.isArray(parsed.clips) ? parsed.clips.slice(0, getTargetClipCount(length, videos.length)) : [];
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
  // Smooth 0.5s cross-fade dissolves between every clip (subtle + elegant).
  // Shotstack's "fadeFast" applies a ~0.5s fade. Setting in+out on each clip
  // means the tail of clip N overlaps the head of clip N+1 as a crossfade.
  const transitionName = "fadeFast";

  let cursor = 0;
  const shotstackClips = clips
    .map((c) => {
      const v = videoMap.get(c.mediaId);
      if (!v) return null;
      const clipLen = Math.max(1.5, Math.min(c.length || 2.5, 6));
      const start = cursor;
      cursor += clipLen;
      return {
        asset: {
          type: "video",
          src: publicUrl(v.storage_path),
          trim: Math.max(0, c.trimStart || 0),
          volume: 0, // mute the original camera audio
        },
        start,
        length: clipLen,
        transition: { in: transitionName, out: transitionName },
      };
    })
    .filter(Boolean) as object[];

  if (shotstackClips.length === 0) {
    return json({ error: "No valid clips after mapping." }, 500);
  }

  // Pick a royalty-free background track to match the mood. Users can still
  // override by passing their own musicStoragePath (uploaded music).
  const moodMusic: Record<Mood, string> = {
    "Romantic": "https://shotstack-assets.s3-ap-southeast-2.amazonaws.com/music/unminus/palmtrees.mp3",
    "Fun & Upbeat": "https://shotstack-assets.s3-ap-southeast-2.amazonaws.com/music/unminus/lit.mp3",
    "Cinematic": "https://shotstack-assets.s3-ap-southeast-2.amazonaws.com/music/unminus/gladiator.mp3",
    "Emotional": "https://shotstack-assets.s3-ap-southeast-2.amazonaws.com/music/unminus/sunrise.mp3",
  };
  const musicSrc = musicStoragePath ? publicUrl(musicStoragePath) : moodMusic[mood];

  const tracks: object[] = [
    { clips: shotstackClips },
  ];

  const payload = {
    timeline: {
      background: "#000000",
      soundtrack: { src: musicSrc, effect: "fadeInFadeOut", volume: 0.9 },
      tracks,
    },
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
      status: "rendering", timeline: { clips, transition: transitionName },
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

function getTargetClipCount(length: number, available: number): number {
  const target = length <= 15 ? 5 : length <= 30 ? 6 : 10;
  return Math.min(available, target);
}

function spreadAcrossFolders<T extends { folder: string }>(items: T[], targetCount: number): T[] {
  const byFolder = new Map<string, T[]>();
  for (const it of items) {
    if (!byFolder.has(it.folder)) byFolder.set(it.folder, []);
    byFolder.get(it.folder)!.push(it);
  }
  const out: T[] = [];
  const folders = [...byFolder.keys()];
  let i = 0;
  while (out.length < targetCount && folders.some((f) => byFolder.get(f)!.length > 0)) {
    const bucket = byFolder.get(folders[i % folders.length])!;
    if (bucket.length > 0) out.push(bucket.shift()!);
    i++;
  }
  return out;
}
