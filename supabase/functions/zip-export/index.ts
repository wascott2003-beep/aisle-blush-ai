// Streams a ZIP of all media for a wedding, organized by folder.
// Uses client-streaming archive via fflate for low memory footprint.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { Zip, ZipPassThrough } from "https://esm.sh/fflate@0.8.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const FOLDER_ORDER = [
  "Getting Ready",
  "Ceremony",
  "Portraits",
  "Reception",
  "Details",
  "Miscellaneous",
  "Unsorted",
];

function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, "_").trim() || "wedding";
}

function extFromPath(path: string, fallback = "bin"): string {
  const m = path.match(/\.([a-zA-Z0-9]+)$/);
  return m ? m[1] : fallback;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const weddingId = url.searchParams.get("weddingId");
    if (!weddingId) {
      return new Response(JSON.stringify({ error: "weddingId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify the user owns this wedding
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: wedding, error: wedErr } = await admin
      .from("weddings")
      .select("id, name, user_id")
      .eq("id", weddingId)
      .single();

    if (wedErr || !wedding || wedding.user_id !== userData.user.id) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: items, error: itemsErr } = await admin
      .from("media_items")
      .select("id, type, folder, storage_path")
      .eq("wedding_id", weddingId)
      .eq("upload_status", "complete");

    if (itemsErr) {
      return new Response(JSON.stringify({ error: itemsErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Group by folder using known order, then any extras at end
    const grouped = new Map<string, typeof items>();
    for (const it of items || []) {
      const f = it.folder || "Unsorted";
      if (!grouped.has(f)) grouped.set(f, []);
      grouped.get(f)!.push(it);
    }
    const orderedFolders = [
      ...FOLDER_ORDER.filter((f) => grouped.has(f)),
      ...[...grouped.keys()].filter((f) => !FOLDER_ORDER.includes(f)),
    ];

    // Build streaming ZIP
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const zip = new Zip((err, chunk, final) => {
          if (err) {
            controller.error(err);
            return;
          }
          if (chunk && chunk.length) controller.enqueue(chunk);
          if (final) controller.close();
        });

        (async () => {
          try {
            const counters: Record<string, number> = {};
            for (const folder of orderedFolders) {
              const folderItems = grouped.get(folder) || [];
              for (const item of folderItems) {
                const ext = extFromPath(
                  item.storage_path,
                  item.type === "video" ? "mp4" : "jpg",
                );
                counters[folder] = (counters[folder] || 0) + 1;
                const idx = String(counters[folder]).padStart(4, "0");
                const entryName = `${sanitize(wedding.name)}/${folder}/${idx}.${ext}`;

                const { data: signed, error: signErr } = await admin.storage
                  .from("wedding-media")
                  .createSignedUrl(item.storage_path, 60 * 10);
                if (signErr || !signed?.signedUrl) {
                  console.error("sign error", item.id, signErr);
                  continue;
                }

                const resp = await fetch(signed.signedUrl);
                if (!resp.ok || !resp.body) {
                  console.error("fetch error", item.id, resp.status);
                  continue;
                }

                const file = new ZipPassThrough(entryName);
                zip.add(file);
                const reader = resp.body.getReader();
                while (true) {
                  const { value, done } = await reader.read();
                  if (done) break;
                  if (value) file.push(value, false);
                }
                file.push(new Uint8Array(0), true);
              }
            }
            zip.end();
          } catch (e) {
            console.error("zip build error", e);
            controller.error(e);
          }
        })();
      },
    });

    const filename = `${sanitize(wedding.name)}.zip`;
    return new Response(stream, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("zip-export fatal", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
