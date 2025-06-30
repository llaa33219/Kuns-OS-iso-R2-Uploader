export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        // API routes
        if (url.pathname.startsWith('/api/')) {
            try {
                switch (url.pathname) {
                    case '/api/start-upload':
                        return await handleStartUpload(request, env);
                    case '/api/upload-part':
                        return await handleUploadPart(request, env);
                    case '/api/complete-upload':
                        return await handleCompleteUpload(request, env);
                    default:
                        return new Response('API endpoint not found', { status: 404 });
                }
            } catch (e) {
                console.error(e);
                return new Response(e.message || 'Something went wrong with the API', { status: 500 });
            }
        }
        
        // Fallback to serving static assets
        if (env.ASSETS) {
            try {
                 return await env.ASSETS.fetch(request);
            } catch (e) {
                // When a requested asset is not found, `env.ASSETS.fetch` throws an exception.
                // We can generate a 404 response instead.
                 const pathname = new URL(request.url).pathname;
                 return new Response(`Asset not found: ${pathname}`, { status: 404 });
            }
        } else {
            return new Response('Static asset serving is not configured. Check [site] in wrangler.toml.', { status: 500 });
        }
    },
};

async function handleStartUpload(request, env) {
    if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
    }

    const { name } = await request.json();
    if (!name) {
        return new Response('File name is required', { status: 400 });
    }
    
    // Sanitize file name to prevent path traversal
    const sanitizedName = name.replace(/[^a-zA-Z0-9._-]/g, '');
    const key = `${Date.now()}-${sanitizedName}`;

    const multipartUpload = await env.R2_BUCKET.createMultipartUpload(key);

    return new Response(JSON.stringify({
        key: multipartUpload.key,
        uploadId: multipartUpload.uploadId,
    }), {
        headers: { 'Content-Type': 'application/json' },
    });
}

async function handleUploadPart(request, env) {
    if (request.method !== 'PUT') {
        return new Response('Method Not Allowed', { status: 405 });
    }

    const url = new URL(request.url);
    const key = url.searchParams.get('key');
    const uploadId = url.searchParams.get('uploadId');
    const partNumber = parseInt(url.searchParams.get('partNumber'), 10);

    if (!key || !uploadId || !partNumber) {
        return new Response('Missing required query parameters', { status: 400 });
    }

    const multipartUpload = env.R2_BUCKET.resumeMultipartUpload(key, uploadId);
    const uploadedPart = await multipartUpload.uploadPart(partNumber, request.body);

    return new Response(JSON.stringify({ etag: uploadedPart.etag }), {
        headers: { 'Content-Type': 'application/json' },
    });
}

async function handleCompleteUpload(request, env) {
    if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
    }

    try {
        const { key, uploadId, parts } = await request.json();

        if (!key || !uploadId || !Array.isArray(parts)) {
            return new Response('Request body missing key, uploadId, or parts', { status: 400 });
        }

        const multipartUpload = env.R2_BUCKET.resumeMultipartUpload(key, uploadId);
        const object = await multipartUpload.complete(parts);

        const publicUrl = env.R2_PUBLIC_URL || `https://pub-${env.ACCOUNT_ID}.r2.dev`;
        const location = `${publicUrl}/${object.key}`;

        return new Response(JSON.stringify({ location }), {
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error) {
        console.error('Error completing multipart upload:', error.message);
        return new Response(`Failed to complete upload: ${error.message}`, { status: 500 });
    }
} 