/**
 * Search leads in Zapier Tables and optionally mark as sold
 * 
 * Returns leads matching the filters from Zapier
 */

export default async function searchZapierLeads({ base44, filters = {}, markAsSold = null }) {
  try {
    const apiKey = process.env.ZAPIER_API_KEY;
    const tableId = process.env.ZAPIER_TABLE_ID;

    if (!apiKey || !tableId) {
      return {
        success: false,
        error: 'Zapier not configured. Set ZAPIER_API_KEY and ZAPIER_TABLE_ID in app secrets.',
        leads: []
      };
    }

    // If marking as sold, update the record in Zapier
    if (markAsSold) {
      const updateResponse = await fetch(
        `https://tables.zapier.com/api/v1/tables/${tableId}/records/${markAsSold.zapier_record_id}`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            status: 'sold'
          })
        }
      );

      if (!updateResponse.ok) {
        throw new Error(`Failed to mark lead as sold in Zapier: ${updateResponse.status}`);
      }

      return { success: true, message: 'Lead marked as sold in Zapier' };
    }

    // Search leads from Zapier
    const response = await fetch(
      `https://tables.zapier.com/api/v1/tables/${tableId}/records`,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Zapier API error: ${response.status}`);
    }

    const data = await response.json();
    let zapierLeads = data.records || data.results || data;

    // Transform Zapier records to match Lead schema
    zapierLeads = zapierLeads
      .filter(record => record.status === 'available') // Only available leads
      .map(record => ({
        id: `zapier_${record.id}`, // Prefix to distinguish from local leads
        zapier_record_id: record.id, // Store original Zapier ID
        source: 'zapier',
        external_id: record.external_id || record.id,
        lead_type: record.lead_type || record.type || 'auto',
        first_name: record.first_name || record.firstName || '',
        last_name: record.last_name || record.lastName || '',
        phone: record.phone || record.phone_number || '',
        email: record.email || '',
        state: record.state || '',
        zip_code: record.zip_code || record.zipcode || record.zip || '',
        utility_bill_amount: parseFloat(record.utility_bill_amount || record.utility_bill || 0),
        upload_date: record.upload_date || record.date || record.created_at,
        status: 'available'
      }));

    // Apply filters
    if (filters.lead_type && filters.lead_type !== 'all') {
      zapierLeads = zapierLeads.filter(l => l.lead_type === filters.lead_type);
    }
    if (filters.state && filters.state !== 'all') {
      zapierLeads = zapierLeads.filter(l => l.state === filters.state);
    }
    if (filters.zip_code) {
      zapierLeads = zapierLeads.filter(l => l.zip_code?.startsWith(filters.zip_code));
    }

    return {
      success: true,
      leads: zapierLeads
    };

  } catch (error) {
    console.error('Zapier search error:', error);
    return {
      success: false,
      error: error.message,
      leads: []
    };
  }
}