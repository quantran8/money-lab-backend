This explains the concepts, not the database.

# Domain Model

This document explains the conceptual entities used in Module 2.

---

# Player Run

A run represents a single simulation session.


Run
└ 6 Months
└ 4 Weeks each


A run contains:

- selected job
- commitment structure
- jar balances
- index states
- event history

---

# Job

A job defines:

- base monthly income
- income stability
- energy load (HI pressure)

Optional progression:


Learning XP → Job Level → Higher income + higher energy load


---

# Commitments

Commitments are fixed monthly obligations chosen by the player.

Examples:

- Housing
- Transport
- Phone/Internet

Properties:

- auto-deducted each month
- cannot change mid-month
- may be changed for the next month only

---

# Bills

Bills represent variable monthly expenses.

Each month has:


Estimated Bills
Actual Bills


Variance between them is the main volatility driver.

---

# Bill Reserve

A structural protection amount.

Player chooses coverage level:


0%
50%
75%
100%


Reserve is automatically maintained.

---

# Flexible Income

Money remaining after structural deductions.


income

commitments

estimated bills

bill reserve
= flexible income


---

# Jars

Jars represent **lifestyle intent**.

Allocatable jars:


Fun
Learning
Give
Future You


Non-allocatable:


Locked commitments
Bills
Bill reserve


Neutral liquidity:


Free Cash


---

# HI (Health Index)

Represents sustainability.

Main drivers:


baseline recovery

fun recovery

job energy drain
± event effects
± stress effects


---

# LQI (Life Quality Index)

Represents lifestyle livability.

Drivers:


Fun
Learning
Give
Events


LQI influences:

- recovery efficiency
- event pool bias