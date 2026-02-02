import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (user?.role !== 'admin') {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        // Fetch free zip code data from US Census via GitHub Gist
        const response = await fetch('https://gist.githubusercontent.com/steinbring/c0cdb3c72ad58e63c95d9c9b6b2851cb/raw/f0afd97cc5e77f163a33e746c244b69d27905bcc/zipCodeToLatLong.csv');
        
        if (!response.ok) {
            throw new Error('Failed to fetch zip code data');
        }

        const csvText = await response.text();
        const lines = csvText.split('\n');

        const zipCodes = [];
        
        // Format: zip,latitude,longitude (skip header row)
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            
            const [zip, lat, lng] = lines[i].split(',').map(s => s.trim());

            if (zip && lat && lng) {
                zipCodes.push({
                    zip_code: zip,
                    latitude: parseFloat(lat),
                    longitude: parseFloat(lng),
                    city: '',
                    state: ''
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