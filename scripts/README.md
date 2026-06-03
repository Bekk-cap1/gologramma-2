# 🧠 Fractal CNN — Пайплайн «2D картинка → 3D фрактал»

Система определяет тип фрактала по 2D-изображению и строит соответствующую 3D-модель.
**15 классов фракталов · точность 99.9% · RTX 4060.**

---

## 📊 Общая схема

```
┌─────────────┐   ┌──────────────┐   ┌─────────────┐   ┌──────────────┐   ┌────────────┐
│  2D Картинка │ → │ Препроцессинг │ → │  CNN модель  │ → │ Классификация │ → │ 3D Генерация│
│  PNG/JPG     │   │ 128×128, норм.│   │ Conv2D × 4   │   │  softmax      │   │  Three.js   │
└─────────────┘   └──────────────┘   └─────────────┘   └──────────────┘   └────────────┘
```

---

## ШАГ 1 — Генерация датасета  (`generate_dataset.py`)

Создаём 45 000 синтетических картинок (по 3000 на класс).

| Что | Как |
|---|---|
| 2D-фракталы | escape-time (Mandelbrot, Julia), IFS (папоротник), L-системы (дракон) |
| 3D-рендеры | chaos-game point cloud + изометрическая проекция с тенями |
| Аугментации | 8 стилей: толщина линий, размытие, повороты, фон, инверсия, шум |

**Команда:**
```bash
python scripts/generate_dataset.py --n 45000 --size 128 --out ./dataset
```

**Результат:** `dataset/images/*.png` + `dataset/labels.csv`

---

## ШАГ 2 — Обучение CNN  (`train_cnn.py`)

### Архитектура (Multi-task CNN)

```
Вход (3 × 128 × 128)
  │
  ├─ ConvBlock(32)  → 64×64    Conv2D → BatchNorm → ReLU → MaxPool
  ├─ ConvBlock(64)  → 32×32
  ├─ ConvBlock(128) → 16×16
  ├─ ConvBlock(256) → 8×8
  ├─ AdaptiveAvgPool → вектор ℝ²⁵⁶
  │
  └─ Classification Head → Dense(256) → Dense(15) → Softmax
```

### Функция потерь
```
L = CrossEntropy(class)          (режим --cls-only, λ=0)
```

### Гиперпараметры
| Параметр | Значение |
|---|---|
| Optimizer | Adam, lr 1e-3 → 0 (cosine) |
| Batch | 64 |
| Эпохи | 100 |
| Split | 80% train / 20% val |

**Команда:**
```bash
python scripts/train_cnn.py --epochs 100 --batch 64 --cls-only
```

**Результат:** `model/best_model.pt` (99.9% val accuracy)

---

## ШАГ 3 — API сервер  (`api_server.py`)

FastAPI принимает изображение, возвращает тип + параметры.

```
POST http://localhost:8000/predict
  body: { "image": "<base64>" }

  ответ: {
    "type": "dodecahedron_3d",
    "type_3d": "Dodecahedron Fractal",
    "confidence": 99.8,
    "all_scores": { ... 15 классов ... }
  }
```

**Команда:**
```bash
python scripts/api_server.py --model ./model/best_model.pt --port 8000
```

---

## ШАГ 4 — Фронтенд  (`components/tabs/FractalCNN.tsx`)

1. Пользователь грузит картинку → кнопка **🧠 CNN Анализ**
2. Браузер отправляет base64 на `localhost:8000/predict`
3. Получает тип фрактала → **🔮 Применить к 3D**
4. Three.js строит 3D-модель соответствующим генератором

---

## 📋 15 классов фракталов

| # | Класс | Природа | 3D-модель |
|---|---|---|---|
| 1 | Mandelbrot | escape-time | Mandelbulb |
| 2 | Julia | escape-time | Julia 3D |
| 3 | Burning Ship | escape-time | Voxel |
| 4 | Spiral Julia | escape-time (deep zoom) | Julia 3D |
| 5 | Sierpinski △ | рекурсия | Sierpinski Tetrahedron |
| 6 | Ковёр Серпинского | рекурсия | Menger Sponge |
| 7 | Губка Менгера | 3D рекурсия | Menger Sponge |
| 8 | Дерево Пифагора | L-система | 3D Pythagoras Tree |
| 9 | Снежинка Коха | рекурсия | Koch Surface |
| 10 | Папоротник Барнсли | IFS | 3D ветвление |
| 11 | Кривая дракона | L-система | Voxel |
| 12 | Октаэдр-фрактал | IFS chaos game | Sierpinski Octahedron |
| 13 | Додекаэдр-фрактал | IFS chaos game | Dodecahedron Fractal |
| 14 | Икосаэдр-фрактал | IFS chaos game | Icosahedron Fractal |
| 15 | Пыль Кантора | 3D рекурсия | Cantor Dust |

---

## 🔢 Формулы 3D-генерации

| Тип | Формула |
|---|---|
| Sierpinski | `P → ½(P + Vᵢ)`, i=1..4 |
| Menger | удаление центральных кубов, 20ⁿ частей |
| Mandelbulb | `z → z⁸ + c` (сферические координаты) |
| Pythagoras | ветвь → 2 ветви ·cos(45°) |
| IFS (chaos game) | `p → p + (Vᵢ − p)·r`, V — вершины многогранника |
| Cantor dust | куб → 8 угловых под-кубов |

---

## ⚡ Полный запуск (с нуля)

```bash
# 1. зависимости
pip install torch torchvision pandas pillow tqdm fastapi uvicorn

# 2. датасет (~7 мин)
python scripts/generate_dataset.py --n 45000 --size 128 --out ./dataset

# 3. обучение (~90 мин на RTX 4060)
python scripts/train_cnn.py --epochs 100 --batch 64 --cls-only

# 4. сервер
python scripts/api_server.py --model ./model/best_model.pt --port 8000

# 5. фронтенд
npm run dev    # → вкладка «2D → 3D»
```
