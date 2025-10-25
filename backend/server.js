const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');

const execPromise = promisify(exec);
const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS for frontend communication
app.use(cors());
app.use(express.json());

// Serve static files (models and frontend)
app.use('/models', express.static(path.join(__dirname, '../models')));
app.use(express.static(path.join(__dirname, '../frontend')));

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../models/uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure Multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 600 * 1024 * 1024 }, // 600MB limit
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.glb' || ext === '.gltf') {
      cb(null, true);
    } else {
      cb(new Error('Only .glb and .gltf files are allowed'));
    }
  }
});

// Function to generate LOD versions using gltfpack
async function generateLODs(inputPath, baseName) {
  const lodDir = path.join(__dirname, '../models/lods', baseName);
  
  // Create LOD directory
  if (!fs.existsSync(lodDir)) {
    fs.mkdirSync(lodDir, { recursive: true });
  }

  const lodConfigs = [
    { name: 'LOD0', scale: 0.25 },  // Lowest quality (fastest load)
    { name: 'LOD1', scale: 0.5 },   // Medium-low quality
    { name: 'LOD2', scale: 0.75 },  // Medium-high quality
    { name: 'LOD3', scale: 1.0 }    // Original quality
  ];

  const lodPaths = [];

  console.log(`Starting LOD generation for ${baseName}...`);

  for (const config of lodConfigs) {
    const outputPath = path.join(lodDir, `${config.name}.glb`);
    // Removed -cc flag to disable Meshopt compression (use standard glTF)
    const command = `gltfpack -i "${inputPath}" -o "${outputPath}" -kn -si ${config.scale}`;
    
    try {
      console.log(`Generating ${config.name} (scale: ${config.scale})...`);
      await execPromise(command);
      lodPaths.push(`/models/lods/${baseName}/${config.name}.glb`);
      console.log(`✓ ${config.name} generated successfully`);
    } catch (error) {
      console.error(`Error generating ${config.name}:`, error.message);
      // If gltfpack fails, copy original file as fallback
      fs.copyFileSync(inputPath, outputPath);
      lodPaths.push(`/models/lods/${baseName}/${config.name}.glb`);
    }
  }

  return lodPaths;
}

// Upload endpoint
app.post('/upload', upload.single('model'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log('File uploaded:', req.file.filename);

    const inputPath = req.file.path;
    const baseName = path.parse(req.file.filename).name;

    // Generate LOD versions
    const lodPaths = await generateLODs(inputPath, baseName);

    res.json({
      success: true,
      message: 'Model uploaded and LODs generated',
      modelId: baseName,
      lodPaths: lodPaths
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get available models
app.get('/models/list', (req, res) => {
  const lodsDir = path.join(__dirname, '../models/lods');
  
  if (!fs.existsSync(lodsDir)) {
    return res.json({ models: [] });
  }

  const models = fs.readdirSync(lodsDir).map(modelName => ({
    id: modelName,
    lodPaths: [
      `/models/lods/${modelName}/LOD0.glb`,
      `/models/lods/${modelName}/LOD1.glb`,
      `/models/lods/${modelName}/LOD2.glb`,
      `/models/lods/${modelName}/LOD3.glb`
    ]
  }));

  res.json({ models });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📁 Upload endpoint: http://localhost:${PORT}/upload`);
});