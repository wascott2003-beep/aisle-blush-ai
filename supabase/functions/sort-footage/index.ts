// Classify wedding media thumbnails into folders using Lovable AI vision.
// Accepts a batch of items and returns a folder label per item.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const DEFAULT_WEDDING_FOLDERS = ['Getting Ready', 'Ceremony', 'Portraits', 'Reception', 'Details', 'Miscellaneous'] as const;

interface InputItem {
  id: string;
  thumbnailUrl: string;
  type: 'photo' | 'video';
}

interface OutputItem {
  id: string;
  folder: string;
}

const WEDDING_PROMPT = `You categorize wedding photos and video thumbnails into one of these folders:
- "Getting Ready": pre-ceremony prep, hair/makeup, dresses on hangers, robes, candid prep moments
- "Ceremony": altar, vows, processional/recessional, officiant, exchanging rings
- "Portraits": posed shots of couple, bridal party, family portraits
- "Reception": dancing, dinner, toasts, cake cutting, party scenes
- "Details": rings, flowers, decor, table settings, invitations, shoes, jewelry close-ups
- "Miscellaneous": anything that doesn't clearly fit the others

Be decisive. When in doubt between two, pick the more specific one.`;

function buildEventPrompt(folders: string[]): string {
  return `You categorize event photo and video thumbnails into one of these folders:
${folders.map((f) => `- "${f}"`).join('\n')}

Use the folder name as your guide. Pick "Miscellaneous" only when nothing else fits. Be decisive.`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return json({ error: 'LOVABLE_API_KEY not configured' }, 500);
    }

    const body = await req.json().catch(() => null);
    const items: InputItem[] = Array.isArray(body?.items) ? body.items : [];
    if (items.length === 0) return json({ results: [] }, 200);
    if (items.length > 12) return json({ error: 'Batch too large (max 12)' }, 400);

    const projectType: 'wedding' | 'event' = body?.projectType === 'event' ? 'event' : 'wedding';
    const requestedFolders: string[] = Array.isArray(body?.folders) && body.folders.length > 0
      ? body.folders.filter((f: unknown): f is string => typeof f === 'string')
      : [...DEFAULT_WEDDING_FOLDERS];
    // Always allow Miscellaneous as a safe fallback
    const folders: string[] = requestedFolders.includes('Miscellaneous')
      ? requestedFolders
      : [...requestedFolders, 'Miscellaneous'];

    const systemPrompt = projectType === 'event' ? buildEventPrompt(folders) : WEDDING_PROMPT;
    const mediaLabel = projectType === 'event' ? 'event' : 'wedding';

    // Build a multimodal user message: numbered images + instruction.
    const userContent: Array<Record<string, unknown>> = [
      {
        type: 'text',
        text: `Classify each of the following ${items.length} ${mediaLabel} media thumbnails. Respond by calling the classify_items tool with one folder per item, in the same order as given. Items:\n${items
          .map((it, i) => `${i + 1}. id=${it.id} (${it.type})`)
          .join('\n')}`,
      },
    ];
    for (const it of items) {
      userContent.push({ type: 'image_url', image_url: { url: it.thumbnailUrl } });
    }

    const tool = {
      type: 'function',
      function: {
        name: 'classify_items',
        description: 'Return a folder label for each item in order.',
        parameters: {
          type: 'object',
          properties: {
            classifications: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  folder: { type: 'string', enum: folders },
                },
                required: ['id', 'folder'],
                additionalProperties: false,
              },
            },
          },
          required: ['classifications'],
          additionalProperties: false,
        },
      },
    };

    const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        tools: [tool],
        tool_choice: { type: 'function', function: { name: 'classify_items' } },
      }),
    });

    if (!aiRes.ok) {
      const text = await aiRes.text();
      console.error('AI gateway error', aiRes.status, text);
      if (aiRes.status === 429) return json({ error: 'Rate limited, try again shortly.' }, 429);
      if (aiRes.status === 402) return json({ error: 'AI credits exhausted.' }, 402);
      return json({ error: 'AI gateway error' }, 500);
    }

    const data = await aiRes.json();
    const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
    const argsRaw = toolCall?.function?.arguments;
    let parsed: { classifications?: OutputItem[] } = {};
    try {
      parsed = typeof argsRaw === 'string' ? JSON.parse(argsRaw) : argsRaw;
    } catch (e) {
      console.error('Failed to parse tool args:', argsRaw, e);
    }

    const classifications = parsed.classifications || [];
    // Build a map keyed by id, falling back to Miscellaneous for any missing.
    const byId = new Map<string, string>();
    const folderSet = new Set(folders);
    for (const c of classifications) {
      if (c?.id && folderSet.has(c.folder)) {
        byId.set(c.id, c.folder);
      }
    }
    const results: OutputItem[] = items.map((it) => ({
      id: it.id,
      folder: byId.get(it.id) || 'Miscellaneous',
    }));

    return json({ results }, 200);
  } catch (err) {
    console.error('sort-footage error:', err);
    return json({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
