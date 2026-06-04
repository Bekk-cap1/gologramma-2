"""Fractal 2D -> 3D autonomous reconstruction system.

4-layer ensemble:
  layer1_math   - mathematical descriptors (box-counting, IFS, Fourier, lacunarity, multifractal)
  layer2_cnn    - CNN feature extractor / classifier (reuses trained model/best_model.pt)
  layer3_fusion - weighted voting ensemble
  layer4_verify - analysis by synthesis verification
  depth_map     - depth estimation (IFS recursion level / escape time)
  mesh          - 3D mesh generation (point cloud + marching cubes + export)
"""

__version__ = "1.0.0"
