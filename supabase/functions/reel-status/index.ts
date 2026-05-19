// Polls Shotstack for a reel's render status. When done, copies the MP4 into our storage.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SHOTSTACK_API_KEY = Deno.env.get("SHOTSTACK_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SHOTSTACK_HOST = "https://api.shotstack.io/edit/v1";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { reelId } = await req.json() as { reelId: string };
    if (!reelId) return json({ error: "Missing reelId" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: reel, error: e1 } = await admin
      .from("reels")
      .select("id, wedding_id, status, shotstack_render_id, output_storage_path")
      .eq("id", reelId)
      .single();
    if (e1 || !reel) return json({ error: "Reel not found" }, 404);
    if (reel.status === "complete" && reel.output_storage_path) {
      return json({ status: "complete", url: publicUrl(reel.output_storage_path) });
    }
    if (reel.status === "failed") return json({ status: "failed" });

    const r = await fetch(`${SHOTSTACK_HOST}/render/${reel.shotstack_render_id}`, {
      headers: { "x-api-key": SHOTSTACK_API_KEY },
    });
    const j = await r.json();
    if (!r.ok || !j?.success) {
      console.error("Shotstack status error", j);
      return json({ status: "rendering" });
    }
    const status = j.response.status as string; // queued|fetching|rendering|saving|done|failed
    if (status === "failed") {
      const message = j.response.error || j.response.message || "Render failed";
      await admin.from("reels").update({ status: "failed", error_message: message }).eq("id", reelId);
      return json({ status: "failed", error: message });
    }
    if (status !== "done") {
      return json({ status: "rendering", progress: status });
    }

    // Done — fetch MP4 and persist to our bucket.
    const mp4Url = j.response.url as string;
    const dl = await fetch(mp4Url);
    if (!dl.ok) return json({ status: "rendering" });
    const buf = new Uint8Array(await dl.arrayBuffer());
    const path = `${reel.wedding_id}/reels/${reelId}.mp4`;
    const up = await admin.storage.from("wedding-media").upload(path, buf, {
      contentType: "video/mp4", upsert: true,
    });
    if (up.error) {
      console.error("Storage upload error", up.error);
      return json({ status: "rendering" });
    }
    await admin.from("reels").update({ status: "complete", output_storage_path: path }).eq("id", reelId);
    return json({ status: "complete", url: publicUrl(path) });
  } catch (e) {
    console.error("reel-status error", e);
    return json({ error: (e as Error).message }, 500);
  }
});

function publicUrl(path: string) {
  return `${SUPABASE_URL}/storage/v1/object/public/wedding-media/${path}`;
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
