import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { leads } = await req.json();

    if (!leads || !Array.isArray(leads)) {
      return Response.json({ success: false, error: 'Invalid leads array' }, { status: 400 });
    }

    // Columns to exclude from CSV
    const excludeColumns = new Set(['id', 'created_date', 'updated_date', 'created_by', 'external_id', 'tier_1', 'tier_2', 'tier_3', 'tier_4', 'tier_5', 'last_name_initial', 'user_email', 'price', 'lead_type', 'lead_name', 'lead_id', 'status']);
    
    // Preferred column order
    const preferredOrder = [
      'age_in_days',
      'first_name',
      'last_name',
      'email',
      'phone',
      'date_of_birth',
      'address',
      'city',
      'state',
      'zip_code',
      'current_coverage',
      'coverage_amount',
      'favorite_hobby',
      'beneficiary'
    ];

    // Get all unique column names from the data
    const allColumns = new Set();
    leads.forEach(lead => {
      Object.keys(lead).forEach(key => {
        if (!excludeColumns.has(key)) {
          allColumns.add(key);
        }
      });
    });

    // Build headers: preferred columns first (if they exist), then remaining columns
    const headers = [];
    preferredOrder.forEach(col => {
      if (allColumns.has(col)) {
        headers.push(col);
      }
    });

    // Add any remaining columns not in preferred order
    allColumns.forEach(col => {
      if (!headers.includes(col)) {
        headers.push(col);
      }
    });

    // Build rows using determined headers
    const rows = leads.map(lead =>
      headers.map(header => lead[header] || '')
    );

    return Response.json({
      success: true,
      headers,
      rows,
      csvContent: [headers, ...rows].map(row => row.join(',')).join('\n')
    });

  } catch (error) {
    console.error('CSV filter error:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});