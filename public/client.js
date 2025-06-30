const fileInput = document.getElementById('file-input');
const fileLabel = document.getElementById('file-label');
const uploadButton = document.getElementById('upload-button');
const statusDiv = document.getElementById('status');
const resultDiv = document.getElementById('result');
const uploadArea = document.querySelector('.upload-area');

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

    const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
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

    } catch (error) {
        console.error('Upload error:', error);
        statusDiv.textContent = `오류: ${error.message}`;
    } finally {
        uploadButton.disabled = false;
    }
}); 