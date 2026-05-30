/**
 * Netlify Serverless Function: TMDB Proxy
 * Proxies TMDB API requests from the frontend client to TMDB,
 * injecting the secure API key server-side.
 */

exports.handler = async function(event, context) {
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

  try {
    // Perform standard fetch using Node's global fetch API (Node 18+)
    const response = await fetch(fullUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      }
    });

    if (!response.ok) {
      return {
        statusCode: response.status,
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: `TMDB API returned HTTP status ${response.status}` }),
      };
    }
    
    const data = await response.json();
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(data),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: error.message }),
    };
  }
};
