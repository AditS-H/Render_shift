#!/usr/bin/env bash
# Install Node dependencies
npm install

# Install gltfpack globally
npm install -g gltfpack

# Create required directories
mkdir -p models/uploads models/lods

echo "✅ Build complete!"