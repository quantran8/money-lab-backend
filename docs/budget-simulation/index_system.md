Indexes should live in their own file.

# Index System

Two indexes exist.


HI = Health Index
LQI = Life Quality Index


They represent different concepts.

---

# HI

HI measures sustainability.

Weekly formula:


HI_change =

baseline recovery

fun recovery bonus

job drain
± event effects
± stress effects


Then:


HI_new = clamp(HI_current + HI_change)


---

# LQI

LQI measures lifestyle quality.

Weekly formula:


LQI_change =
fun_effect

learning_effect

give_effect

event_effect


---

# LQI States


Stable ≥ 60
Compressed 40–59
Strained < 40


---

# Recovery Efficiency

LQI modifies HI recovery efficiency.


Stable 100%
Compressed 90% / 85%
Strained 80% / 70%