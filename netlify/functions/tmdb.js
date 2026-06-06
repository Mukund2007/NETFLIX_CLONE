const dns = require('dns');
if (dns && dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}



exports.handler = async function(event, context) {
  // WARNING: This function uses the global fetch API which requires Node 18+.
  if (typeof fetch === 'undefined') {
    return {
      statusCode: 500,
      body: 'Node 18+ required'
    };
  }

  // Extract path and params from query parameters
  const { path, params } = event.queryStringParameters;

  // Basic validation: ensure a path is provided
  if (!path) {
    return {
      statusCode: 400,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: JSON.stringify({ error: 'Missing path parameter' }),
    };
  }

  // Retrieve secure TMDB API key from Netlify environment variables
  const TMDB_API_KEY = process.env.TMDB_API_KEY;
  if (!TMDB_API_KEY) {
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: 'TMDB_API_KEY environment variable is not configured on Netlify' }),
    };
  }

  // Decode and construct the complete TMDB URL
  const decodedPath = decodeURIComponent(path);
  const connector = decodedPath.includes('?') ? '&' : '?';
  let fullUrl = `https://api.themoviedb.org/3${decodedPath}${connector}api_key=${TMDB_API_KEY}`;
  
  if (params) {
    fullUrl += `&${decodeURIComponent(params)}`;
  }

  const maxRetries = 3;
  let response;
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`DEBUG - Fetching TMDB URL (Attempt ${attempt}/${maxRetries}):`, fullUrl);
      response = await fetch(fullUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        }
      });
      if (response.ok) {
        break;
      }
      lastError = new Error(`TMDB API returned HTTP status ${response.status}`);
      if (response.status === 429 || response.status >= 500) {
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, attempt * 150));
          continue;
        }
      }
      break;
    } catch (error) {
      lastError = error;
      console.warn(`DEBUG - Attempt ${attempt} failed with:`, error.message);
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, attempt * 150));
      }
    }
  }

  if (!response || !response.ok) {
    const errStatus = response ? response.status : 500;
    const errMsg = lastError ? lastError.message : 'Unknown error during fetch';
    console.error(`DEBUG - All attempts failed for TMDB fetch. Status: ${errStatus}, Error: ${errMsg}`);
    return {
      statusCode: errStatus,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: errMsg }),
    };
  }

  try {
    const data = await response.json();
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(data),
    };
  } catch (parseError) {
    console.error("DEBUG - Parsing TMDB JSON failed:", parseError);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: 'Failed to parse JSON response from TMDB' }),
    };
  }
};
