import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (user?.role !== 'admin') {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        // Fetch free zip code data from SimpleMaps
        const response = await fetch('https://simplemaps.com/static/data/us-zips/1.82/basic/simplemaps_uszips_basicv1.82.csv');
        
        if (!response.ok) {
            throw new Error('Failed to fetch zip code data');
        }

        const csvText = await response.text();
        const lines = csvText.split('\n');
        const headers = lines[0].split(',');

        // Find column indices
        const zipIdx = headers.findIndex(h => h.trim() === 'zip');
        const latIdx = headers.findIndex(h => h.trim() === 'lat');
        const lngIdx = headers.findIndex(h => h.trim() === 'lng');
        const cityIdx = headers.findIndex(h => h.trim() === 'city');
        const stateIdx = headers.findIndex(h => h.trim() === 'state_id');

        const zipCodes = [];
        
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            
            const cols = lines[i].split(',');
            const zip = cols[zipIdx]?.trim().replace(/"/g, '');
            const lat = parseFloat(cols[latIdx]?.trim());
            const lng = parseFloat(cols[lngIdx]?.trim());
            const city = cols[cityIdx]?.trim().replace(/"/g, '');
            const state = cols[stateIdx]?.trim().replace(/"/g, '');

            if (zip && !isNaN(lat) && !isNaN(lng)) {
                zipCodes.push({
                    zip_code: zip,
                    latitude: lat,
                    longitude: lng,
                    city: city || '',
                    state: state || ''
                });
            }
        }

        // Insert in batches of 1000
        const batchSize = 1000;
        let inserted = 0;

        for (let i = 0; i < zipCodes.length; i += batchSize) {
            const batch = zipCodes.slice(i, i + batchSize);
            await base44.asServiceRole.entities.ZipCode.bulkCreate(batch);
            inserted += batch.length;
        }

        return Response.json({ 
            success: true, 
            message: `Loaded ${inserted} zip codes successfully` 
        });
    } catch (error) {
        console.error('Error loading zip codes:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});