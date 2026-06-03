"""
Этап 2: Обучение Multi-task CNN.
Классификация (6 типов) + Регрессия (4 параметра).

Запуск:
  python train_cnn.py --dataset ./dataset --epochs 100 --batch 32 --out ./model

Требования:
  pip install torch torchvision pandas pillow tqdm
"""

import argparse, os, math
import pandas as pd
import numpy as np
from PIL import Image

import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader, random_split
import torchvision.transforms as T
from tqdm import tqdm

# ──────────────────────────────────────────────────────────────────────────────
FRACTAL_CLASSES = [
    "mandelbrot", "julia", "burning_ship",
    "sierpinski_triangle", "sierpinski_carpet", "menger_sponge",
    "pythagoras_tree", "koch_snowflake", "barnsley_fern", "dragon_curve",
    "octahedron_3d", "dodecahedron_3d", "icosahedron_3d", "cantor_dust_3d",
    "spiral_julia",
]
CLS2IDX = {c: i for i, c in enumerate(FRACTAL_CLASSES)}
NUM_CLASSES = len(FRACTAL_CLASSES)
NUM_PARAMS  = 4   # c_real, c_imag, zoom, iterations (normalised)

PARAM_MEANS = torch.tensor([0.0, 0.0, 1.0, 200.0])
PARAM_STDS  = torch.tensor([0.7, 0.7, 1.0, 100.0])


# ──────────────────────────────────────────────────────────────────────────────
# Dataset
# ──────────────────────────────────────────────────────────────────────────────

class FractalDataset(Dataset):
    def __init__(self, csv_path: str, img_dir: str, transform=None):
        self.df = pd.read_csv(csv_path)
        self.img_dir = img_dir
        self.transform = transform

    def __len__(self):
        return len(self.df)

    def __getitem__(self, idx):
        row = self.df.iloc[idx]
        img_path = os.path.join(self.img_dir, row["image"])
        img = Image.open(img_path).convert("RGB")
        if self.transform:
            img = self.transform(img)

        label_cls = torch.tensor(CLS2IDX[row["type"]], dtype=torch.long)
        params_raw = torch.tensor(
            [row["c_real"], row["c_imag"], row["zoom"], row["iterations"]],
            dtype=torch.float32
        )
        params_norm = (params_raw - PARAM_MEANS) / PARAM_STDS
        return img, label_cls, params_norm


def get_transforms(train: bool, size: int = 128):
    if train:
        return T.Compose([
            T.Resize((size, size)),
            T.RandomHorizontalFlip(),
            T.RandomVerticalFlip(p=0.3),
            T.ColorJitter(brightness=0.2, contrast=0.2),
            T.GaussianBlur(3, sigma=(0.1, 1.0)),
            T.ToTensor(),
            T.Normalize([0.5, 0.5, 0.5], [0.5, 0.5, 0.5]),
        ])
    return T.Compose([
        T.Resize((size, size)),
        T.ToTensor(),
        T.Normalize([0.5, 0.5, 0.5], [0.5, 0.5, 0.5]),
    ])


# ──────────────────────────────────────────────────────────────────────────────
# Model: Multi-task CNN
# ──────────────────────────────────────────────────────────────────────────────

class ConvBlock(nn.Module):
    def __init__(self, in_ch, out_ch):
        super().__init__()
        self.block = nn.Sequential(
            nn.Conv2d(in_ch, out_ch, 3, padding=1, bias=False),
            nn.BatchNorm2d(out_ch),
            nn.ReLU(inplace=True),
            nn.Conv2d(out_ch, out_ch, 3, padding=1, bias=False),
            nn.BatchNorm2d(out_ch),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2),
        )
    def forward(self, x):
        return self.block(x)


class FractalCNN(nn.Module):
    """
    Input:  (B, 3, 128, 128)
    Output: (class_logits [B, 6], param_pred [B, 4])
    """
    def __init__(self, num_classes=NUM_CLASSES, num_params=NUM_PARAMS):
        super().__init__()
        # Shared backbone
        self.backbone = nn.Sequential(
            ConvBlock(3,   32),   # → (B, 32, 64, 64)
            ConvBlock(32,  64),   # → (B, 64, 32, 32)
            ConvBlock(64,  128),  # → (B, 128, 16, 16)
            ConvBlock(128, 256),  # → (B, 256, 8, 8)
            nn.AdaptiveAvgPool2d(1),  # → (B, 256, 1, 1)
        )
        self.feature_dim = 256

        # Classification head
        self.cls_head = nn.Sequential(
            nn.Linear(self.feature_dim, 256),
            nn.ReLU(inplace=True),
            nn.Dropout(0.4),
            nn.Linear(256, num_classes),
        )

        # Regression head
        self.reg_head = nn.Sequential(
            nn.Linear(self.feature_dim, 256),
            nn.ReLU(inplace=True),
            nn.Dropout(0.3),
            nn.Linear(256, num_params),
        )

        # Weight init
        for m in self.modules():
            if isinstance(m, nn.Conv2d):
                nn.init.kaiming_normal_(m.weight, mode="fan_out", nonlinearity="relu")
            elif isinstance(m, nn.Linear):
                nn.init.xavier_uniform_(m.weight)

    def forward(self, x):
        feat = self.backbone(x).flatten(1)
        return self.cls_head(feat), self.reg_head(feat)


# ──────────────────────────────────────────────────────────────────────────────
# Training loop
# ──────────────────────────────────────────────────────────────────────────────

def train_epoch(model, loader, optimizer, cls_loss_fn, reg_loss_fn, device, lam=0.5):
    model.train()
    total_loss, correct, total = 0.0, 0, 0
    for imgs, labels, params in tqdm(loader, desc="Train", leave=False):
        imgs, labels, params = imgs.to(device), labels.to(device), params.to(device)
        logits, pred_params = model(imgs)
        loss_cls = cls_loss_fn(logits, labels)
        loss_reg = reg_loss_fn(pred_params, params)
        loss = loss_cls + lam * loss_reg
        optimizer.zero_grad()
        loss.backward()
        nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        total_loss += loss.item() * imgs.size(0)
        correct += (logits.argmax(1) == labels).sum().item()
        total += imgs.size(0)
    return total_loss / total, correct / total


@torch.no_grad()
def eval_epoch(model, loader, cls_loss_fn, reg_loss_fn, device, lam=0.5):
    model.eval()
    total_loss, correct, total = 0.0, 0, 0
    mae_sum = torch.zeros(NUM_PARAMS).to(device)
    for imgs, labels, params in tqdm(loader, desc="Val ", leave=False):
        imgs, labels, params = imgs.to(device), labels.to(device), params.to(device)
        logits, pred_params = model(imgs)
        loss = cls_loss_fn(logits, labels) + lam * reg_loss_fn(pred_params, params)
        total_loss += loss.item() * imgs.size(0)
        correct += (logits.argmax(1) == labels).sum().item()
        mae_sum += (pred_params - params).abs().sum(0)
        total += imgs.size(0)
    mae = (mae_sum / total) * PARAM_STDS.to(device)  # un-normalise
    return total_loss / total, correct / total, mae.cpu().tolist()


# ──────────────────────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", default="./dataset")
    parser.add_argument("--out",     default="./model")
    parser.add_argument("--epochs",  type=int,   default=100)
    parser.add_argument("--batch",   type=int,   default=32)
    parser.add_argument("--lr",      type=float, default=1e-3)
    parser.add_argument("--lam",     type=float, default=0.5)
    parser.add_argument("--size",    type=int,   default=128)
    parser.add_argument("--val",     type=float, default=0.2)
    parser.add_argument("--cls-only", action="store_true",
                        help="Classification only (lam=0): regression head stops fighting → higher accuracy")
    args = parser.parse_args()

    # Classification-only mode: zero out regression loss so it can't destabilise training
    if args.cls_only:
        args.lam = 0.0
        print("[MODE] Classification-only (lam=0) — regression disabled for max accuracy")

    os.makedirs(args.out, exist_ok=True)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Device: {device}")

    csv_path = os.path.join(args.dataset, "labels.csv")
    img_dir  = os.path.join(args.dataset, "images")

    full_ds = FractalDataset(csv_path, img_dir, transform=get_transforms(True, args.size))
    n_val   = int(len(full_ds) * args.val)
    n_train = len(full_ds) - n_val
    train_ds, val_ds = random_split(full_ds, [n_train, n_val],
                                    generator=torch.Generator().manual_seed(42))
    val_ds.dataset = FractalDataset(csv_path, img_dir, transform=get_transforms(False, args.size))

    pin = device.type == "cuda"
    # On Windows, multiprocessing DataLoader can be slow — use num_workers=0 if on CPU
    nw = 4 if pin else 0
    train_loader = DataLoader(train_ds, batch_size=args.batch, shuffle=True,  num_workers=nw, pin_memory=pin)
    val_loader   = DataLoader(val_ds,   batch_size=args.batch, shuffle=False, num_workers=nw, pin_memory=pin)

    model = FractalCNN().to(device)
    optimizer = optim.Adam(model.parameters(), lr=args.lr, weight_decay=1e-4)
    scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs)
    cls_loss = nn.CrossEntropyLoss()
    reg_loss = nn.SmoothL1Loss()

    best_acc = 0.0
    history = []

    print(f"\nTraining {n_train} / val {n_val} samples  |  {args.epochs} epochs\n")
    for epoch in range(1, args.epochs + 1):
        tr_loss, tr_acc = train_epoch(model, train_loader, optimizer, cls_loss, reg_loss, device, args.lam)
        vl_loss, vl_acc, mae = eval_epoch(model, val_loader, cls_loss, reg_loss, device, args.lam)
        scheduler.step()

        lr = scheduler.get_last_lr()[0]
        mae_str = " | ".join(f"{v:.3f}" for v in mae)
        print(f"Ep {epoch:03d}/{args.epochs}  "
              f"tr_loss {tr_loss:.4f}  tr_acc {tr_acc:.3f}  "
              f"vl_loss {vl_loss:.4f}  vl_acc {vl_acc:.3f}  "
              f"MAE [{mae_str}]  lr {lr:.2e}")

        history.append({"epoch": epoch, "tr_acc": tr_acc, "vl_acc": vl_acc, "vl_loss": vl_loss})

        if vl_acc > best_acc:
            best_acc = vl_acc
            ckpt = {"epoch": epoch, "acc": vl_acc, "state_dict": model.state_dict(),
                    "classes": FRACTAL_CLASSES, "param_means": PARAM_MEANS.tolist(),
                    "param_stds": PARAM_STDS.tolist()}
            torch.save(ckpt, os.path.join(args.out, "best_model.pt"))
            print(f"  [BEST] saved  acc={vl_acc:.4f}")

    # Save final
    torch.save(model.state_dict(), os.path.join(args.out, "final_model.pt"))
    print(f"\nBest val accuracy: {best_acc:.4f}")
    print(f"Model saved to {args.out}/")


if __name__ == "__main__":
    main()
