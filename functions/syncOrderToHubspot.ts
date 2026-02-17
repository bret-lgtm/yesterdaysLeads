import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Parse request body
    const { orderData } = await req.json();

    if (!orderData || !orderData.customer_email) {
      return Response.json({ error: 'Missing order data' }, { status: 400 });
    }

    // Get HubSpot access token using service role
    console.log('Getting HubSpot access token...');
    const accessToken = await base44.asServiceRole.connectors.getAccessToken('hubspot');
    console.log('Access token obtained');

    // Extract customer info from order
    const email = orderData.customer_email;
    const leadCount = orderData.lead_count;

    // Step 1: Get or create contact in HubSpot by email
    console.log('Looking up contact:', email);
    let contactId;
    
    const searchResponse = await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${encodeURIComponent(email)}?idProperty=email`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (searchResponse.ok) {
      const contactData = await searchResponse.json();
      contactId = contactData.id;
      console.log('Found existing contact:', contactId);
    } else if (searchResponse.status === 404) {
      // Create new contact
      console.log('Creating new contact');
      const createResponse = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          properties: { email }
        })
      });

      if (!createResponse.ok) {
        const errorData = await createResponse.json();
        console.error('Contact creation failed:', errorData);
        throw new Error(`Contact creation failed: ${errorData.message}`);
      }

      const createData = await createResponse.json();
      contactId = createData.id;
      console.log('Created contact:', contactId);
    } else {
      const errorData = await searchResponse.json();
      throw new Error(`Contact lookup failed: ${errorData.message}`);
    }

    // Use the Cody Aksins pipeline with closedwon stage
    const pipelineId = '1076939';
    const closedWonStageId = '160837376'; // closedwon stage ID from HubSpot

    // Step 2: Create a deal
    const dealName = `Yesterday's Leads - ${leadCount} Lead${leadCount !== 1 ? 's' : ''}`;
    console.log('Creating deal:', dealName);
    const dealResponse = await fetch('https://api.hubapi.com/crm/v3/objects/deals', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        properties: {
          dealname: dealName,
          amount: orderData.total_price,
          dealstage: closedWonStageId,
          pipeline: pipelineId
        }
      })
    });

    if (!dealResponse.ok) {
      const errorData = await dealResponse.json();
      console.error('Deal creation failed:', dealResponse.status, errorData);
      throw new Error(`Deal creation failed: ${errorData.message || dealResponse.statusText}`);
    }

    const dealData = await dealResponse.json();
    const dealId = dealData.id;
    console.log('Created deal:', dealId, 'for contact:', contactId);

    // Step 3: Associate contact with deal
    console.log('Associating contact', contactId, 'with deal', dealId);
    const assocResponse = await fetch(`https://api.hubapi.com/crm/v3/objects/deals/${dealId}/associations/contacts/${contactId}/3`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!assocResponse.ok) {
      console.error('Association failed:', assocResponse.status);
    } else {
      console.log('Association successful');
    }

    return Response.json({ 
      success: true, 
      contactId, 
      dealId: dealId || null,
      dealName 
    });

  } catch (error) {
    console.error('HubSpot sync error:', error);
    return Response.json({ 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
});