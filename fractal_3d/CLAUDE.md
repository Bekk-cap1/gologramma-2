# Fractal 3D Reconstruction — Instructions

## Задача
4-слойная ансамблевая система: 2D изображение фрактала → автономное определение
математической природы → геометрически точный 3D объект. Без заготовленных 3D шаблонов.

## Архитектура слоёв
1. `layer1_math/` — box-counting, IFS recovery, Fourier, lacunarity, multifractal
2. `layer2_cnn/`  — CNN-классификатор (переиспользует ../model/best_model.pt, 15 классов)
3. `layer3_fusion/` — weighted voting ensemble
4. `layer4_verify/` — analysis-by-synthesis верификация
   `depth_map/` — depth из уровней рекурсии IFS / smooth escape time
   `mesh/` — chaos game → воксели → marching cubes → OBJ/STL/PLY

## Правила
- Каждый модуль работает независимо и тестируется отдельно.
- Каждая функция возвращает `confidence` (0.0–1.0).
- Промежуточные результаты логируются в `fractal_3d/logs/`.
- Если итоговая уверенность < 0.75 — выставляется `low_confidence_flag`,
  но best-effort 3D всё равно строится.

## Запуск
```bash
# детерминированный конвейер (без LLM)
python -m fractal_3d.pipeline [image.png]

# мульти-агентный режим (Opus+3×Sonnet; локальный fallback без API-ключа)
python -m fractal_3d.main [image.png] [--llm]

# API сервер
python -m fractal_3d.api_server --port 8000

# тесты
python -m pytest fractal_3d/tests -q
```
