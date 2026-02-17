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
    
    // Get customer name from Customer entity
    let firstName = '';
    let lastName = '';
    
    const customers = await base44.asServiceRole.entities.Customer.filter({ email });
    if (customers.length > 0) {
      const fullName = customers[0].full_name || '';
      const nameParts = fullName.split(' ');
      firstName = nameParts[0] || '';
      lastName = nameParts.slice(1).join(' ') || '';
    }

    // Step 1: Create or update contact in HubSpot
    let contactId;
    
    // Search for existing contact by email
    console.log('Searching for contact:', email);
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
    
    if (!searchResponse.ok) {
      console.error('Contact search failed:', searchResponse.status, JSON.stringify(searchData));
      throw new Error(`Contact search failed: ${searchData.message || searchResponse.statusText}`);
    }

    if (searchData.results && searchData.results.length > 0) {
      // Contact exists, use it directly without updating
      contactId = searchData.results[0].id;
      console.log('Using existing contact:', contactId);
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

      if (!createResponse.ok) {
        const errorData = await createResponse.json();
        console.error('Contact creation failed:', createResponse.status, errorData);
        throw new Error(`Contact creation failed: ${errorData.message || createResponse.statusText}`);
      }

      const createData = await createResponse.json();
      contactId = createData.id;
      console.log('Created contact:', contactId);
    }

    console.log('Using contact:', contactId);
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