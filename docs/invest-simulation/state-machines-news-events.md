# State Machines, News & Events — Cách vận hành

## Mục lục

1. [Thuật ngữ](#1-thuật-ngữ)
2. [Tổng quan hệ thống](#2-tổng-quan-hệ-thống)
3. [State Machines chi tiết](#3-state-machines-chi-tiết)
   - [3.1 Asset Spotlight](#31-asset-spotlight)
   - [3.2 World Arc](#32-world-arc)
   - [3.3 Policy Thread](#33-policy-thread)
4. [News Generation](#4-news-generation)
5. [Price Generation](#5-price-generation)
6. [Ví dụ mô phỏng đầy đủ](#6-ví-dụ-mô-phỏng-đầy-đủ)
7. [Bảng dữ liệu](#7-bảng-dữ-liệu)
8. [Instance lifecycle](#8-instance-lifecycle)

---

## 1. Thuật ngữ

### FSM (Finite State Machine — Máy trạng thái hữu hạn)

Một mô hình có tập trạng thái cố định và quy tắc chuyển đổi giữa chúng. Tại mỗi thời điểm, FSM chỉ ở đúng 1 trạng thái. Trong hệ thống này có 3 FSM: Spotlight, Arc, Policy.

### Tick

Đơn vị thời gian của simulation. 1 tick = 1 ngày trong thế giới mô phỏng. Cứ mỗi tick, hệ thống advance tất cả state machines, sinh news, tính giá mới.

### MIN_DWELL (Thời gian ở tối thiểu)

Số tick bắt buộc phải ở yên tại một trạng thái trước khi được phép xét chuyển. Trong thời gian dwell, FSM **không bao giờ** chuyển trạng thái, bất kể gì.

### TRANSITION_PROB (Xác suất chuyển trạng thái)

Sau khi đã ở đủ MIN_DWELL, mỗi tick hệ thống "roll xúc xắc" (deterministic random). Nếu kết quả < TRANSITION_PROB thì chuyển, nếu không thì ở yên thêm 1 tick nữa.

### ticks_in_current_state (Bộ đếm tick)

Đếm số tick đã ở trạng thái hiện tại. Reset về 0 khi chuyển sang state mới. Dùng để so sánh với MIN_DWELL.

### Deterministic Random (Ngẫu nhiên có thể tái tạo)

Hàm random nhận 1 chuỗi seed cố định (vd: `"spotlight:1:5"`) và luôn trả về cùng kết quả cho cùng seed. Đảm bảo cùng input → cùng output, có thể replay lại simulation.

### Seed

Chuỗi đầu vào cho deterministic random, được tạo từ: `type:instanceId:tickIndex`. Ví dụ: `"arc:2:10"` = arc instance #2 tại tick #10.

### Spawn / Spawned externally

Tạo mới một instance. Trong hệ thống hiện tại, instance được tạo qua seed SQL trước khi simulation chạy, không tự động spawn trong runtime.

### Terminal state (Trạng thái kết thúc)

Trạng thái cuối cùng của FSM, không chuyển tiếp nữa. Ví dụ: `absorbed` (Arc), `resolution` (Policy), `dormant` (Spotlight — quay về nghỉ).

### Impact (Tác động giá)

Giá trị thập phân biểu thị % thay đổi giá. Ví dụ: impact = 0.05 nghĩa là +5%. Impact = -0.03 nghĩa là -3%.

### Sector

Nhóm phân loại asset. Ví dụ: Tech, Crypto, Real Estate, Commodities. Một sector chứa nhiều asset.

### Category

Phân loại con trong sector. Ví dụ: sector = Crypto có các category: layer1, meme, defi, stable, utility.

---

## 2. Tổng quan hệ thống

Mỗi tick, hệ thống thực hiện theo thứ tự:

```
┌─────────────────────────────────────────────────────────────────┐
│                        1 TICK = 1 NGÀY                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Step 1: Advance State Machines                                 │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐            │
│  │  Spotlight    │ │  World Arc   │ │   Policy     │            │
│  │  (per-asset)  │ │  (per-sector)│ │  (global)    │            │
│  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘            │
│         │                │                │                     │
│         ▼                ▼                ▼                     │
│  Step 2: Transition Events                                      │
│         │                │                                      │
│         ▼                ▼                                      │
│  Step 3: Generate News (title, body, tone, impacts)             │
│         │                                                       │
│         ▼                                                       │
│  Step 4: Generate Prices                                        │
│    newPrice = prevPrice × (1 + sector + spotlight               │
│                             + arc + policy + noise)             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

Tất cả xảy ra trong **1 database transaction**.

---

## 3. State Machines chi tiết

### 3.1 Asset Spotlight

**Phạm vi:** 1 asset cụ thể (vd: Teslah, Doggo Inu)

**Mô tả:** Đại diện cho sự chú ý (attention) của thị trường lên 1 asset. Giống như 1 cổ phiếu trending trên mạng xã hội — từ từ được chú ý, được hype, lên đỉnh, rồi hạ nhiệt.

**6 trạng thái:**

```
dormant → emerging → hype → peak → decline → recovery → dormant
 (nghỉ)   (manh nha)  (hype)  (đỉnh)  (giảm)   (hồi phục)  (nghỉ)
```

**Cấu hình:**

| State     | MIN_DWELL | TRANSITION_PROB | Price Impact | Tone        |
|-----------|-----------|-----------------|--------------|-------------|
| dormant   | -         | 0 (không tự chuyển) | 0%      | -           |
| emerging  | 3 tick    | 25%             | +2%          | speculative |
| hype      | 2 tick    | 30%             | +5%          | excited     |
| peak      | 1 tick    | 50%             | +8%          | intense     |
| decline   | 2 tick    | 30%             | -4%          | cautious    |
| recovery  | 3 tick    | 35%             | -1%          | neutral     |

**Giải thích:**
- `peak` có MIN_DWELL thấp nhất (1) và TRANSITION_PROB cao nhất (50%) → đỉnh đến nhanh, rời nhanh
- `emerging` và `recovery` có MIN_DWELL cao nhất (3) → giai đoạn chuyển tiếp diễn ra chậm hơn
- Price impact tích cực ở nửa đầu (emerging→peak), tiêu cực ở nửa sau (decline→recovery)

**Khi hoàn thành (quay về dormant):**
- `isActive` = false
- Cooldown 10 tick trước khi asset này có thể được spotlight lại

---

### 3.2 World Arc

**Phạm vi:** Toàn thị trường, ảnh hưởng nhiều sector/asset cùng lúc

**Mô tả:** Đại diện cho xu hướng kinh tế vĩ mô. Ví dụ: "Cuộc cách mạng AI" làm tăng cổ phiếu tech, "Tăng lãi suất" làm giảm tất cả, "Quy định crypto" ảnh hưởng riêng crypto.

**5 trạng thái:**

```
background → spark → expansion → integration → absorbed
  (nền)     (mầm)   (lan rộng)    (hấp thụ)    (kết thúc)
```

**Cấu hình:**

| State       | MIN_DWELL | TRANSITION_PROB | Magnitude | Tone      |
|-------------|-----------|-----------------|-----------|-----------|
| background  | -         | 0 (spawn only)  | 0         | -         |
| spark       | 2 tick    | 20%             | 0.01      | curious   |
| expansion   | 4 tick    | 15%             | 0.03      | optimistic|
| integration | 3 tick    | 25%             | 0.02      | measured  |
| absorbed    | -         | 0 (terminal)    | 0         | neutral   |

**Cách tính impact per asset:**

Arc không tác động trực tiếp lên giá. Nó dùng bảng `WorldArcSectorImpact` để xác định weight cho từng sector/category:

```
Impact cho 1 asset = magnitude(state) × weight(sector/category của asset)
```

**Quy tắc ưu tiên weight:**
- Nếu có weight riêng cho category (vd: sector=Crypto, category=meme) → dùng weight đó
- Nếu không → fallback về weight chung của sector (vd: sector=Crypto, category=null)
- Nếu không có weight nào → impact = 0

**Ví dụ bảng weight cho arc "Crypto Regulation Wave":**

| Sector     | Category | Weight | Nghĩa                              |
|------------|----------|--------|-------------------------------------|
| Crypto     | null     | -0.30  | Giảm 30% × magnitude cho toàn crypto |
| Crypto     | meme     | -0.60  | Meme coin bị ảnh hưởng nặng hơn    |
| Crypto     | stable   | +0.20  | Stablecoin hưởng lợi                |
| Tech       | null     | -0.05  | Tech bị ảnh hưởng nhẹ              |

Khi arc ở state `expansion` (magnitude = 0.03):
- Doggo Inu (crypto, meme): impact = 0.03 × (-0.60) = **-0.018** (-1.8%)
- Stable-ish (crypto, stable): impact = 0.03 × (+0.20) = **+0.006** (+0.6%)
- BitzCoin (crypto, layer1): impact = 0.03 × (-0.30) = **-0.009** (-0.9%) — dùng sector-wide weight vì không có weight riêng cho layer1

**Tracking progress:**

Arc có thêm field `progress` (0.0 → 1.0) để theo dõi tiến trình tổng thể qua lifecycle. Tính bằng nội suy giữa các state base:

| State       | Progress base |
|-------------|---------------|
| background  | 0.0           |
| spark       | 0.1           |
| expansion   | 0.35          |
| integration | 0.7           |
| absorbed    | 1.0           |

---

### 3.3 Policy Thread

**Phạm vi:** Global — ảnh hưởng đều lên tất cả asset

**Mô tả:** Đại diện cho các chính sách kinh tế (thuế, quy định, lãi suất). Policy tạo ra sự bất ổn khi đang triển khai và trở về bình thường khi hoàn thành.

**6 trạng thái:**

```
undeclared → declared_path → action_1 → action_2 → action_3 → resolution
 (chưa công bố)  (đã tuyên bố)  (hành động 1)  (hành động 2)  (hành động 3)  (kết thúc)
```

**Cấu hình:**

| State         | MIN_DWELL | TRANSITION_PROB | Price Impact |
|---------------|-----------|-----------------|--------------|
| undeclared    | -         | 0 (spawn only)  | 0            |
| declared_path | 2 tick    | 30%             | +1%          |
| action_1      | 3 tick    | 25%             | -1%          |
| action_2      | 3 tick    | 25%             | -2%          |
| action_3      | 3 tick    | 30%             | +1%          |
| resolution    | -         | 0 (terminal)    | 0            |

**Đặc điểm riêng:**
- Policy impact là **global** — tất cả asset bị ảnh hưởng giá trị giống nhau
- Có thêm field `actionsCompleted` đếm số action đã qua
- `declared_path` tạo impact dương nhẹ (thị trường phản ứng tích cực với sự rõ ràng)
- `action_1`, `action_2` tạo impact âm (bất ổn khi triển khai)
- `action_3` tạo impact dương nhẹ (gần hoàn thành, thị trường lạc quan trở lại)

---

## 4. News Generation

News được **sinh ra từ state machine transitions**, không phải input.

### Khi nào sinh news?

Chỉ khi một FSM **chuyển trạng thái** (`transitioned = true`). Nếu tất cả FSM ở yên → không có news nào.

### Luồng

```
SpotlightTransitionEvent ──┐
                            ├──→ generateNewsFromTransitions() ──→ GeneratedNewsItem[]
ArcTransitionEvent ─────────┘
```

### Mỗi news item chứa:

| Field         | Mô tả                                | Ví dụ                                |
|---------------|---------------------------------------|--------------------------------------|
| title         | Tiêu đề, chọn từ template theo seed  | "Teslah reaches center stage in market discourse" |
| body          | Nội dung chi tiết                     | "Sector: tech. The spotlight on Teslah moves to peak phase." |
| tone          | Tâm trạng bài viết                   | "intense"                            |
| intensity     | Cường độ sự kiện (0–1)               | 0.9                                  |
| narrativeTag  | Tag phân loại                         | "spotlight:peak"                     |
| assetImpacts  | Impact % lên từng asset              | { "10005": 0.06 }                    |
| sectorImpacts | Impact % lên từng sector             | { "tech": 0.018 }                    |

### Quy tắc news

- News **chỉ mô tả** (descriptive), không bao giờ khuyên mua/bán
- Tiêu đề chọn từ danh sách template cố định, deterministic theo seed
- Spotlight news tạo cả asset impact VÀ sector impact (sector impact = asset impact × 0.3)
- Arc news hiện chỉ tạo tiêu đề/body, không tạo impact trực tiếp qua news (impact đã được tính riêng qua sector weights)

### Headline templates

**Spotlight:**
- emerging: "Whispers surround {asset} as sector attention grows"
- hype: "{asset} attracts heightened market attention"
- peak: "Peak attention: {asset} dominates financial discussion"
- decline: "Interest in {asset} begins to cool"
- recovery: "{asset} enters stabilization phase after turbulent period"

**Arc:**
- spark: "Early signals of {arc} emerge in global markets"
- expansion: "{arc} gains momentum across multiple sectors"
- integration: "Markets begin to absorb implications of {arc}"
- absorbed: "The era of {arc} concludes as markets find new equilibrium"

---

## 5. Price Generation

### Công thức

```
newPrice = prevPrice × (1 + combinedImpact)
```

Trong đó:

```
combinedImpact = sectorImpact + spotlightImpact + arcImpact + policyImpact + noise
```

| Thành phần      | Nguồn                              | Phạm vi        |
|-----------------|-------------------------------------|-----------------|
| sectorImpact    | News generation (aggregated)        | Per-sector      |
| spotlightImpact | spotlightPriceMultiplier(state)     | Per-asset       |
| arcImpact       | magnitude(state) × weight           | Per-asset       |
| policyImpact    | policyPriceMultiplier(state)        | Global          |
| noise           | Deterministic random                | Per-asset       |

### Noise (nhiễu)

Dao động ngẫu nhiên nhỏ, biên độ tùy volatility profile của asset:

| Volatility Profile | Noise range       |
|--------------------|-------------------|
| low                | ±1%               |
| medium             | ±2%               |
| high               | ±4%               |
| extreme            | ±6%               |

### Guardrails (giới hạn an toàn)

- Giá không giảm quá **-20%** / không tăng quá **+30%** mỗi tick
- Giá tối thiểu (floor) = **1 cent**

---

## 6. Ví dụ mô phỏng đầy đủ

### Setup ban đầu

- **Spotlight** trên Teslah (asset 10005, sector tech) — state: `emerging`, ticks_in_current_state: 0
- **Arc** "AI Revolution" — state: `spark`, ticks_in_current_state: 0
  - Sector weights: tech=+0.50, crypto=+0.15
- **Policy** "AI Industry Regulation" — state: `declared_path`, ticks_in_current_state: 0
- Teslah prevPrice: 10000 (= $100.00), volatility profile: `high`

---

### Tick 1

**Spotlight:** ticks=0, MIN_DWELL(emerging)=3 → 0 < 3 → ở yên
- ticks_in_current_state → 1

**Arc:** ticks=0, MIN_DWELL(spark)=2 → 0 < 2 → ở yên
- ticks_in_current_state → 1

**Policy:** ticks=0, MIN_DWELL(declared_path)=2 → 0 < 2 → ở yên
- ticks_in_current_state → 1

**News:** không có transition → **0 news items**

**Giá Teslah:**
- spotlightImpact = spotlightPriceMultiplier(emerging) = +0.02
- arcImpact = magnitude(spark) × weight(tech) = 0.01 × 0.50 = +0.005
- policyImpact = policyPriceMultiplier(declared_path) = +0.01
- sectorImpact = 0 (không có news)
- noise = giả sử +0.012 (random, biên độ ±0.04 vì high volatility)
- combinedImpact = 0 + 0.02 + 0.005 + 0.01 + 0.012 = **+0.047**
- newPrice = 10000 × 1.047 = **10470** ($104.70, +4.7%)

---

### Tick 2

**Spotlight:** ticks=1, MIN_DWELL=3 → ở yên, ticks → 2

**Arc:** ticks=1, MIN_DWELL=2 → ở yên, ticks → 2

**Policy:** ticks=1, MIN_DWELL=2 → ở yên, ticks → 2

**News:** 0 news items

**Giá Teslah:** tương tự, chỉ khác noise

---

### Tick 3

**Spotlight:** ticks=2, MIN_DWELL=3 → ở yên, ticks → 3

**Arc:** ticks=2, MIN_DWELL=2 → đủ rồi! Roll seed `"arc:1:3"`
- Giả sử roll = 0.85, TRANSITION_PROB(spark) = 0.20 → 0.85 > 0.20 → **không chuyển**
- ticks → 3

**Policy:** ticks=2, MIN_DWELL=2 → đủ! Roll seed `"policy:1:3"`
- Giả sử roll = 0.15, TRANSITION_PROB(declared_path) = 0.30 → 0.15 < 0.30 → **chuyển!**
- State: `declared_path` → `action_1`
- ticks_in_current_state → 0
- actionsCompleted → 1

**News:** Policy transition không sinh news (chỉ Spotlight và Arc sinh news)

**Giá Teslah:**
- policyImpact thay đổi = policyPriceMultiplier(action_1) = **-0.01** (từ +0.01 xuống -0.01)

---

### Tick 4

**Spotlight:** ticks=3, MIN_DWELL=3 → đủ! Roll seed `"spotlight:1:4"`
- Giả sử roll = 0.10, TRANSITION_PROB(emerging) = 0.25 → 0.10 < 0.25 → **chuyển!**
- State: `emerging` → `hype`
- ticks_in_current_state → 0

**Arc:** ticks=3, roll = 0.05 < 0.20 → **chuyển!**
- State: `spark` → `expansion`
- ticks_in_current_state → 0

**Policy:** ticks=0, MIN_DWELL(action_1)=3 → ở yên, ticks → 1

**News: 2 items sinh ra!**

1. Spotlight news:
   - Title: "Teslah attracts heightened market attention" (template cho `hype`)
   - Tone: "excited"
   - Intensity: 0.6
   - narrativeTag: "spotlight:hype"
   - assetImpacts: { "10005": 0.04 }
   - sectorImpacts: { "tech": 0.012 }

2. Arc news:
   - Title: "AI Revolution gains momentum across multiple sectors"
   - Tone: "optimistic"
   - Intensity: 0.5
   - narrativeTag: "arc:expansion"

**Giá Teslah:**
- sectorImpact = 0.012 (từ spotlight news)
- spotlightImpact = spotlightPriceMultiplier(hype) = +0.05 (tăng từ +0.02)
- arcImpact = magnitude(expansion) × weight(tech) = 0.03 × 0.50 = +0.015 (tăng từ +0.005)
- policyImpact = -0.01
- noise = giả sử -0.02
- combinedImpact = 0.012 + 0.05 + 0.015 + (-0.01) + (-0.02) = **+0.047**
- newPrice = prevPrice × 1.047

→ Giá tiếp tục tăng mạnh nhờ spotlight lên hype + arc mở rộng.

---

### Tick 8 (nhảy tới — spotlight đã chuyển qua peak → decline)

**Spotlight:** state = `decline`
- spotlightPriceMultiplier = **-0.04** (âm!)

**Arc:** state = `expansion` (vẫn giữ)
- arcImpact = 0.03 × 0.50 = +0.015

**Policy:** state = `action_2`
- policyImpact = **-0.02**

**Giá Teslah:**
- combinedImpact = sectorImpact + (-0.04) + 0.015 + (-0.02) + noise
- Tổng âm → **giá giảm** mặc dù arc vẫn bullish, vì spotlight decline + policy action_2 kéo xuống

→ Đây là lúc user thấy rõ sự xung đột giữa các lực: arc đẩy lên nhưng spotlight + policy kéo xuống.

---

## 7. Bảng dữ liệu

### State Machine — Template tables (config tĩnh, ít thay đổi)

| Bảng DB                      | Model Prisma            | Vai trò                        |
|-------------------------------|-------------------------|---------------------------------|
| `asset_spotlight_templates`   | AssetSpotlightTemplate  | Định nghĩa loại spotlight      |
| `world_arc_types`             | WorldArcType            | Định nghĩa loại arc            |
| `world_arc_sector_impacts`    | WorldArcSectorImpact    | Weight per sector/category per arc type |
| `arc_spotlight_templates`     | ArcSpotlightTemplate    | Arc → spotlight template mapping (weight) |
| `arc_asset_affinities`        | ArcAssetAffinity        | Arc → asset affinity (0.0–1.0)  |
| `policy_thread_templates`     | PolicyThreadTemplate    | Định nghĩa loại policy         |

### State Machine — Instance tables (state thay đổi mỗi tick)

| Bảng DB                       | Model Prisma             | Cột quan trọng                                 |
|--------------------------------|--------------------------|-------------------------------------------------|
| `asset_spotlight_instances`    | AssetSpotlightInstance   | state, ticksInCurrentState, assetId, isActive, cooldownUntilTick |
| `world_arc_instances`          | WorldArcInstance         | state, ticksInCurrentState, progress, isActive  |
| `policy_thread_instances`      | PolicyThreadInstance     | state, ticksInCurrentState, actionsCompleted, isActive |

### News tables (append-only, thêm mới mỗi tick)

| Bảng DB                    | Model Prisma          | Vai trò                          |
|-----------------------------|-----------------------|----------------------------------|
| `sim_news_items`            | SimNewsItem           | Bài viết news (title, body, tone)|
| `sim_news_asset_impacts`    | SimNewsAssetImpact    | Impact % lên từng asset          |
| `sim_news_sector_impacts`   | SimNewsSectorImpact   | Impact % lên từng sector         |

---

## 8. Instance lifecycle

### Instances được tạo khi nào?

**Hai cách:**

1. **Seed SQL** — tạo batch ban đầu trước khi simulation chạy
2. **Auto-spawn** — `InvestSpawnService` tạo mới trong runtime khi cần

Seed data tạo instances ở trạng thái active đầu tiên (bỏ qua trạng thái nghỉ):

| FSM       | Trạng thái nghỉ | Trạng thái seed | Số lượng ban đầu |
|-----------|------------------|------------------|-------------------|
| Spotlight | dormant          | emerging         | 8                 |
| Arc       | background       | spark            | 3                 |
| Policy    | undeclared       | declared_path    | 3                 |

### Auto-spawn (runtime)

**Arc-driven spotlight spawn:**
- Khi arc transition vào `expansion` hoặc `integration`
- Chọn assets theo `ArcAssetAffinity` (affinity cao = ưu tiên)
- Chọn template theo `ArcSpotlightTemplate` (weight cao = ưu tiên, sentiment khớp arc)
- Tối đa 2 spotlights per arc transition
- Asset phải không có active spotlight VÀ hết cooldown

**Arc respawn:**
- Khi active arcs < MAX_ACTIVE_ARCS (3)
- Chọn arc type chưa có active instance, hết cooldown (20 ticks)
- Bắt đầu ở `spark`

**Policy respawn:**
- Khi active policies < MAX_ACTIVE_POLICIES (2)
- Ưu tiên template align với active arc sectors
- Cooldown 15 ticks, bắt đầu ở `declared_path`

### Khi instance kết thúc

```
Instance chạy → advance mỗi tick → state chuyển dần → terminal state
                                                          │
                                                    isActive = false
                                                          │
                                        SpawnService kiểm tra active count
                                                          │
                                          count < max? → spawn instance mới
```

→ Thị trường luôn sống vì auto-spawn đảm bảo luôn có đủ state machines đang chạy.
