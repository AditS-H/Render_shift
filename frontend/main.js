// Configuration
const API_URL = 'http://localhost:5000';

// Three.js setup
let scene, camera, renderer, controls;
let currentModel = null;
let currentLOD = -1;
let loadStartTime = null;
let meshoptDecoder = null;
let availableLODPaths = []; // Store current model's LOD paths
let isManualSelection = false; // Track if user manually selected quality

// Initialize Meshopt Decoder
async function initMeshoptDecoder() {
    if (typeof MeshoptDecoder !== 'undefined') {
        meshoptDecoder = MeshoptDecoder;
        await MeshoptDecoder.ready;
        console.log('✓ Meshopt decoder initialized');
    } else {
        console.warn('Meshopt decoder not available - compressed models may fail');
    }
}

// Initialize Three.js scene
function initScene() {
    const container = document.getElementById('viewer');
    
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    
    // Camera
    camera = new THREE.PerspectiveCamera(
        75,
        container.clientWidth / container.clientHeight,
        0.1,
        1000
    );
    camera.position.set(5, 5, 5);
    
    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);
    
    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 10, 10);
    directionalLight.castShadow = true;
    scene.add(directionalLight);
    
    const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.5);
    scene.add(hemisphereLight);
    
    // Controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 2;
    controls.maxDistance = 50;
    
    // Grid helper
    const gridHelper = new THREE.GridHelper(20, 20, 0x666666, 0x333333);
    scene.add(gridHelper);
    
    // Handle window resize
    window.addEventListener('resize', onWindowResize);
    
    // Animation loop
    animate();
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

function onWindowResize() {
    const container = document.getElementById('viewer');
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
}

// Progressive model loading
async function loadModelProgressive(lodPaths) {
    showLoadingOverlay(true);
    loadStartTime = Date.now();
    currentLOD = -1;
    
    const qualityLabels = ['240p', '360p', '720p', '1080p'];
    
    for (let i = 0; i < lodPaths.length; i++) {
        updateLODStatus(i, 'loading');
        
        try {
            await loadLOD(lodPaths[i], i);
            updateLODStatus(i, 'active');
            updateQualityIndicator(qualityLabels[i]);
            
            if (i === 0) {
                showLoadingOverlay(false);
                const loadTime = ((Date.now() - loadStartTime) / 1000).toFixed(2);
                document.getElementById('loadTime').textContent = `${loadTime}s (first view)`;
            }
            
            // Small delay between LODs for smooth transition
            if (i < lodPaths.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
        } catch (error) {
            console.error(`Failed to load LOD ${i}:`, error);
            updateLODStatus(i, 'error');
        }
    }
    
    const totalLoadTime = ((Date.now() - loadStartTime) / 1000).toFixed(2);
    document.getElementById('loadTime').textContent = `${totalLoadTime}s (full quality)`;
}

function loadLOD(path, lodIndex) {
    return new Promise((resolve, reject) => {
        const loader = new THREE.GLTFLoader();
        
        // Set Meshopt decoder if available
        if (meshoptDecoder) {
            loader.setMeshoptDecoder(meshoptDecoder);
        }
        
        loader.load(
            API_URL + path,
            (gltf) => {
                // Remove previous model
                if (currentModel) {
                    scene.remove(currentModel);
                }
                
                currentModel = gltf.scene;
                scene.add(currentModel);
                
                // Center and scale model
                centerAndScaleModel(currentModel);
                
                // Update stats
                updateModelStats(gltf);
                
                currentLOD = lodIndex;
                resolve();
            },
            (progress) => {
                // Loading progress
                const percent = (progress.loaded / progress.total) * 100;
                console.log(`LOD ${lodIndex}: ${percent.toFixed(0)}% loaded`);
            },
            (error) => {
                reject(error);
            }
        );
    });
}

function centerAndScaleModel(model) {
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    
    // Center model
    model.position.sub(center);
    
    // Scale to fit view
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = 5 / maxDim;
    model.scale.setScalar(scale);
    
    // Adjust camera
    camera.position.set(5, 5, 5);
    camera.lookAt(0, 0, 0);
}

function updateModelStats(gltf) {
    let triangles = 0;
    gltf.scene.traverse((node) => {
        if (node.isMesh) {
            const geometry = node.geometry;
            if (geometry.index) {
                triangles += geometry.index.count / 3;
            } else {
                triangles += geometry.attributes.position.count / 3;
            }
        }
    });
    
    document.getElementById('polyCount').textContent = 
        triangles.toLocaleString() + ' tris';
}

function updateQualityIndicator(quality) {
    document.getElementById('currentQuality').textContent = quality;
}

function updateLODStatus(lodIndex, status) {
    const lodItems = document.querySelectorAll('.lod-item');
    
    lodItems.forEach((item, index) => {
        item.classList.remove('active', 'loading');
        if (index === lodIndex) {
            if (status === 'loading') {
                item.classList.add('loading');
            } else if (status === 'active') {
                item.classList.add('active');
            }
        } else if (index < lodIndex && status === 'active') {
            item.classList.add('active');
        }
    });
}

function showLoadingOverlay(show) {
    document.getElementById('loadingOverlay').style.display = 
        show ? 'flex' : 'none';
}

// File upload handling
document.getElementById('fileInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const sizeInMB = (file.size / (1024 * 1024)).toFixed(2);
        document.getElementById('fileName').textContent = 
            `${file.name} (${sizeInMB} MB)`;
        document.getElementById('fileSize').textContent = `${sizeInMB} MB`;
    }
});

document.getElementById('uploadForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const fileInput = document.getElementById('fileInput');
    const file = fileInput.files[0];
    
    if (!file) {
        alert('Please select a file');
        return;
    }
    
    const formData = new FormData();
    formData.append('model', file);
    
    const uploadBtn = document.getElementById('uploadBtn');
    const progressDiv = document.getElementById('uploadProgress');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    
    uploadBtn.disabled = true;
    progressDiv.style.display = 'block';
    
    try {
        const xhr = new XMLHttpRequest();
        
        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const percent = (e.loaded / e.total) * 100;
                progressFill.style.width = percent + '%';
                progressText.textContent = `Uploading: ${percent.toFixed(0)}%`;
            }
        });
        
        xhr.addEventListener('load', async () => {
            if (xhr.status === 200) {
                const response = JSON.parse(xhr.responseText);
                progressText.textContent = 'Processing LODs...';
                
                // Wait a bit for LOD generation
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                progressText.textContent = 'Upload complete! ✓';
                
                // Refresh model list
                await loadModelList();
                
                // Load the new model
                loadModelProgressive(response.lodPaths);
                
                setTimeout(() => {
                    progressDiv.style.display = 'none';
                    progressFill.style.width = '0%';
                    uploadBtn.disabled = false;
                }, 2000);
            } else {
                throw new Error('Upload failed');
            }
        });
        
        xhr.addEventListener('error', () => {
            progressText.textContent = 'Upload failed ✗';
            uploadBtn.disabled = false;
        });
        
        xhr.open('POST', `${API_URL}/upload`);
        xhr.send(formData);
        
    } catch (error) {
        console.error('Upload error:', error);
        alert('Upload failed: ' + error.message);
        uploadBtn.disabled = false;
        progressDiv.style.display = 'none';
    }
});

// Load available models
async function loadModelList() {
    try {
        const response = await fetch(`${API_URL}/models/list`);
        const data = await response.json();
        
        const modelList = document.getElementById('modelList');
        const modelSelector = document.getElementById('modelSelector');
        
        modelList.innerHTML = '<option value="">Choose a model...</option>';
        
        if (data.models.length > 0) {
            modelSelector.style.display = 'flex';
            
            data.models.forEach(model => {
                const option = document.createElement('option');
                option.value = JSON.stringify(model.lodPaths);
                option.textContent = model.id;
                modelList.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Failed to load model list:', error);
    }
}

// Model selection
document.getElementById('modelList').addEventListener('change', (e) => {
    if (e.target.value) {
        const lodPaths = JSON.parse(e.target.value);
        loadModelProgressive(lodPaths);
    }
});

// Initialize on page load
window.addEventListener('DOMContentLoaded', async () => {
    await initMeshoptDecoder();
    initScene();
    loadModelList();
});