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
        
        // Serve static assets from the "public" directory.
        // `env.ASSETS` is automatically configured by Wrangler when you set [site].
        return env.ASSETS.fetch(request);
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

    const uploadedPart = await env.R2_BUCKET.uploadPart(key, uploadId, partNumber, request.body);

    return new Response(JSON.stringify({ etag: uploadedPart.etag }), {
        headers: { 'Content-Type': 'application/json' },
    });
}

async function handleCompleteUpload(request, env) {
    if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
    }

    const { key, uploadId, parts } = await request.json();

    if (!key || !uploadId || !Array.isArray(parts)) {
        return new Response('Missing required fields', { status: 400 });
    }

    const object = await env.R2_BUCKET.completeMultipartUpload(
        key,
        uploadId,
        parts
    );

    // The public URL of your R2 bucket.
    // You should replace this with your actual public URL by setting the R2_PUBLIC_URL environment variable.
    const publicUrl = env.R2_PUBLIC_URL || `https://pub-${env.ACCOUNT_ID}.r2.dev`;
    const location = `${publicUrl}/${object.key}`;

    return new Response(JSON.stringify({ location }), {
        headers: { 'Content-Type': 'application/json' },
    });
} 