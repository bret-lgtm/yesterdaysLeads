/**
 * Sync leads from Zapier Tables to your Lead database
 * 
 * Setup Instructions for Zapier Private Integration:
 * 1. Go to https://developer.zapier.com/
 * 2. Click "Start a Zapier Integration" → Create private integration
 * 3. Add authentication (API Key in header)
 * 4. Create a "List Records" action for your table
 * 5. Test and get your integration credentials
 * 6. Set secrets in Dashboard → Settings → Secrets:
 *    - ZAPIER_API_KEY (your integration's API key)
 *    - ZAPIER_TABLE_ID (your table ID from URL)
 * 
 * Alternative: Use Zapier Tables REST API directly
 * - Table ID is in your Zapier Tables URL: tables.zapier.com/app/tables/[TABLE_ID]
 * - API Key from account settings
 * 
 * Usage:
 * - Call manually from admin dashboard
 * - Or schedule to run automatically (e.g., daily)
 */

export default async function syncLeadsFromZapier({ base44 }) {
  try {
    // Get Zapier credentials from secrets
    const apiKey = process.env.ZAPIER_API_KEY;
    const tableId = process.env.ZAPIER_TABLE_ID;

    if (!apiKey || !tableId) {
      return {
        success: false,
        error: 'Missing Zapier credentials. Please set ZAPIER_API_KEY and ZAPIER_TABLE_ID in app secrets.'
      };
    }

    // Fetch leads from Zapier Tables
    const response = await fetch(`https://tables.zapier.com/api/v1/tables/${tableId}/records`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Zapier API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const zapierLeads = data.records || data.results || data;

    // Get existing leads to check for duplicates
    const existingLeads = await base44.entities.Lead.list();
    const existingIds = new Set(existingLeads.map(l => l.external_id));

    // Transform and filter Zapier data
    const newLeads = zapierLeads
      .filter(record => {
        // Skip if external_id already exists
        const externalId = record.external_id || record.id || record.lead_id;
        return externalId && !existingIds.has(externalId);
      })
      .map(record => ({
        // Map Zapier fields to your Lead schema
        // Adjust field names based on your Zapier table structure
        external_id: record.external_id || record.id || record.lead_id,
        lead_type: record.lead_type || record.type || 'auto',
        first_name: record.first_name || record.firstName || '',
        last_name: record.last_name || record.lastName || '',
        phone: record.phone || record.phone_number || '',
        email: record.email || '',
        state: record.state || '',
        zip_code: record.zip_code || record.zipcode || record.zip || '',
        utility_bill_amount: parseFloat(record.utility_bill_amount || record.utility_bill || 0),
        upload_date: record.upload_date || record.date || new Date().toISOString().split('T')[0],
        status: 'available'
      }))
      .filter(lead => lead.external_id && lead.first_name && lead.last_name); // Basic validation

    // Bulk create new leads
    if (newLeads.length > 0) {
      await base44.entities.Lead.bulkCreate(newLeads);
    }

    return {
      success: true,
      total_fetched: zapierLeads.length,
      new_leads: newLeads.length,
      duplicates_skipped: zapierLeads.length - newLeads.length,
      message: `Successfully synced ${newLeads.length} new leads from Zapier`
    };

  } catch (error) {
    console.error('Zapier sync error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}