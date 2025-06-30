const fileInput = document.getElementById('file-input');
const fileLabel = document.getElementById('file-label');
const uploadButton = document.getElementById('upload-button');
const statusDiv = document.getElementById('status');
const resultDiv = document.getElementById('result');
const uploadArea = document.querySelector('.upload-area');
const refreshButton = document.getElementById('refresh-button');
const fileListBody = document.getElementById('file-list');

let selectedFile = null;

fileInput.addEventListener('change', (event) => {
    selectedFile = event.target.files[0];
    if (selectedFile) {
        fileLabel.textContent = selectedFile.name;
        uploadButton.disabled = false;
    }
});

uploadArea.addEventListener('dragover', (event) => {
    event.preventDefault();
    uploadArea.classList.add('dragover');
});

uploadArea.addEventListener('dragleave', (event) => {
    event.preventDefault();
    uploadArea.classList.remove('dragover');
});

uploadArea.addEventListener('drop', (event) => {
    event.preventDefault();
    uploadArea.classList.remove('dragover');
    selectedFile = event.dataTransfer.files[0];
    if (selectedFile) {
        fileLabel.textContent = selectedFile.name;
        uploadButton.disabled = false;
    }
});

uploadButton.addEventListener('click', async () => {
    if (!selectedFile) {
        statusDiv.textContent = '먼저 파일을 선택해주세요.';
        return;
    }

    uploadButton.disabled = true;
    statusDiv.textContent = '업로드 초기화 중...';
    resultDiv.innerHTML = '';

    const CHUNK_SIZE = 50 * 1024 * 1024; // 50MB for fewer parts
    const totalChunks = Math.ceil(selectedFile.size / CHUNK_SIZE);
    const fileName = selectedFile.name;

    try {
        // 1. Start multipart upload
        const startResponse = await fetch('/api/start-upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: fileName }),
        });
        if (!startResponse.ok) throw new Error('업로드 시작에 실패했습니다.');
        const { key, uploadId } = await startResponse.json();
        statusDiv.textContent = '업로드를 시작합니다...';

        // 2. Upload parts
        const uploadedParts = [];
        for (let i = 0; i < totalChunks; i++) {
            const start = i * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, selectedFile.size);
            const chunk = selectedFile.slice(start, end);
            const partNumber = i + 1;

            statusDiv.textContent = `청크 ${partNumber}/${totalChunks} 업로드 중...`;

            const uploadPartResponse = await fetch(`/api/upload-part?key=${key}&uploadId=${uploadId}&partNumber=${partNumber}`, {
                method: 'PUT',
                body: chunk
            });
            
            if (!uploadPartResponse.ok) {
                 const errorBody = await uploadPartResponse.text();
                 throw new Error(`청크 ${partNumber}/${totalChunks} 업로드 실패: ${uploadPartResponse.status} ${errorBody}`);
            }

            const uploadedPart = await uploadPartResponse.json();
            uploadedParts.push(uploadedPart);
        }

        // 3. Complete multipart upload
        statusDiv.textContent = '업로드 완료 중...';
        const completeResponse = await fetch('/api/complete-upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key, uploadId, parts: uploadedParts }),
        });

        if (!completeResponse.ok) throw new Error('업로드 완료에 실패했습니다.');

        const { location } = await completeResponse.json();

        statusDiv.textContent = '업로드 성공!';
        resultDiv.innerHTML = `파일 링크: <a href="${location}" target="_blank">${location}</a>`;

        // Refresh file list after successful upload
        await fetchAndRenderFiles();

    } catch (error) {
        console.error('Upload error:', error);
        statusDiv.textContent = `오류: ${error.message}`;
    } finally {
        uploadButton.disabled = false;
    }
});

function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

async function fetchAndRenderFiles() {
    try {
        fileListBody.innerHTML = '<tr><td colspan="3">Loading...</td></tr>';
        const response = await fetch('/api/list-files');
        if (!response.ok) {
            throw new Error(`Failed to fetch file list: ${response.statusText}`);
        }
        const files = await response.json();
        
        fileListBody.innerHTML = ''; // Clear list

        if (files.length === 0) {
            fileListBody.innerHTML = '<tr><td colspan="3">No files found.</td></tr>';
        } else {
            files.sort((a, b) => new Date(b.uploaded) - new Date(a.uploaded)); // Sort by newest first
            files.forEach(file => {
                const row = fileListBody.insertRow();
                
                const nameCell = row.insertCell(0);
                const sizeCell = row.insertCell(1);
                const dateCell = row.insertCell(2);

                const link = document.createElement('a');
                link.href = file.url;
                link.textContent = file.name;
                link.target = '_blank';
                
                nameCell.appendChild(link);
                sizeCell.textContent = formatBytes(file.size);
                dateCell.textContent = new Date(file.uploaded).toLocaleString();
            });
        }
    } catch (error) {
        console.error('Error fetching file list:', error);
        fileListBody.innerHTML = `<tr><td colspan="3">Error loading files: ${error.message}</td></tr>`;
    }
}

// Event listener for the refresh button
refreshButton.addEventListener('click', fetchAndRenderFiles);

// Initial load of the file list when the page loads
fetchAndRenderFiles(); 