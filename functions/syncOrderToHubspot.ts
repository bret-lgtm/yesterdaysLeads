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
    
    // Try to get first and last name from lead_data_snapshot
    let firstName = '';
    let lastName = '';
    if (orderData.lead_data_snapshot && orderData.lead_data_snapshot.length > 0) {
      const firstLead = orderData.lead_data_snapshot[0];
      firstName = firstLead.first_name || '';
      lastName = firstLead.last_name || '';
    }

    // Step 1: Create or update contact in HubSpot
    let contactId;
    
    // Search for existing contact by email
    const searchResponse = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        filterGroups: [{
          filters: [{
            propertyName: 'email',
            operator: 'EQ',
            value: email
          }]
        }]
      })
    });

    const searchData = await searchResponse.json();

    if (searchData.results && searchData.results.length > 0) {
      // Contact exists, update it
      contactId = searchData.results[0].id;
      
      const updatePayload = { properties: { email } };
      if (firstName) updatePayload.properties.firstname = firstName;
      if (lastName) updatePayload.properties.lastname = lastName;

      await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${contactId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updatePayload)
      });
    } else {
      // Create new contact
      const createPayload = { properties: { email } };
      if (firstName) createPayload.properties.firstname = firstName;
      if (lastName) createPayload.properties.lastname = lastName;

      const createResponse = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(createPayload)
      });

      const createData = await createResponse.json();
      contactId = createData.id;
    }

    // Step 2: Get the "Cody Aksins" pipeline and find closedwon stage
    const pipelinesResponse = await fetch('https://api.hubapi.com/crm/v3/pipelines/deals', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    const pipelinesData = await pipelinesResponse.json();
    const codyPipeline = pipelinesData.results.find(p => p.label === 'Cody Aksins');
    
    if (!codyPipeline) {
      throw new Error('Cody Aksins pipeline not found');
    }
    
    const closedWonStage = codyPipeline.stages.find(s => s.label.toLowerCase().includes('closed won') || s.label.toLowerCase() === 'closedwon');
    
    if (!closedWonStage) {
      throw new Error('Closed Won stage not found in Cody Aksins pipeline');
    }

    // Step 3: Create a deal
    const dealName = `Yesterday's Leads - ${leadCount} Lead${leadCount !== 1 ? 's' : ''}`;
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
          dealstage: closedWonStage.id,
          pipeline: codyPipeline.id
        }
      })
    });

    const dealData = await dealResponse.json();
    const dealId = dealData.id;

    // Step 4: Associate contact with deal
    await fetch(`https://api.hubapi.com/crm/v3/objects/deals/${dealId}/associations/contacts/${contactId}/3`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    return Response.json({ 
      success: true, 
      contactId, 
      dealId,
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