import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Narrow, app-specific operation: extract lead rows from an uploaded CSV.
// The extraction integration is server-side only, and the schema is fixed here so
// callers cannot steer the extraction.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const { file_url } = await req.json().catch(() => ({}));
    if (!file_url || typeof file_url !== 'string' || !file_url.startsWith('https://')) {
      return Response.json({ error: 'file_url is required' }, { status: 400 });
    }

    const extracted = await base44.asServiceRole.integrations.Core.ExtractDataFromUploadedFile({
      file_url,
      json_schema: {
        type: "array",
        items: {
          type: "object",
          properties: {
            external_id: { type: "string" },
            lead_type: { type: "string" },
            first_name: { type: "string" },
            last_name: { type: "string" },
            phone: { type: "string" },
            email: { type: "string" },
            state: { type: "string" },
            zip_code: { type: "string" },
            utility_bill_amount: { type: "number" }
          }
        }
      }
    });

    if (extracted.status === 'error') {
      console.error('Lead CSV extraction failed:', extracted.details);
      return Response.json({ error: extracted.details || 'Extraction failed' }, { status: 400 });
    }

    return Response.json({ status: 'success', output: extracted.output });
  } catch (error) {
    console.error('importLeadsFromCsv error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});