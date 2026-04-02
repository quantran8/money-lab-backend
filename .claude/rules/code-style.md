# NestJS Coding Style Rules

## 1. Naming Conventions

### 1.1 Functions & Methods

* Use **clear, descriptive names**
* Must describe **what the function does**
* Use **verb + noun**

✅ Good:

* `getUserById`
* `createOrder`
* `validateEmail`

❌ Bad:

* `handle`
* `processData`
* `doStuff`

---

### 1.2 Variables

* Use **meaningful and specific names**
* Avoid abbreviations unless common (`id`, `url`, `dto`)
* Boolean variables must read like a statement

✅ Good:

* `isUserActive`
* `orderTotalAmount`
* `userList`

❌ Bad:

* `flag`
* `data`
* `x`

---

### 1.3 Constants

* Use **UPPER_SNAKE_CASE**
* Name must explain purpose

✅ Good:

* `MAX_RETRY_COUNT`
* `DEFAULT_PAGE_SIZE`

---

## 2. No Magic Numbers / Strings

* Never hardcode unexplained values
* Always extract to named constants

❌ Bad:

```ts
if (retryCount > 3) {}
```

✅ Good:

```ts
const MAX_RETRY_COUNT = 3;

if (retryCount > MAX_RETRY_COUNT) {}
```

---

## 3. Function Design

* Keep functions **small and focused**
* One function = **one responsibility**
* Max ~20–30 lines recommended

---

## 4. DTO & Types

* Always use DTOs for input validation
* Never use `any`
* Define explicit return types

❌ Bad:

```ts
function getUser(): any {}
```

✅ Good:

```ts
function getUser(): Promise<UserDto> {}
```

---

## 5. Error Handling

* Use NestJS exceptions (`HttpException`, `BadRequestException`, etc.)
* Never return raw error messages

---

## 6. Logging

* Use NestJS `Logger`
* Log meaningful context

✅ Good:

```ts
this.logger.error(`Failed to create user`, error.stack);
```

---

## 7. Structure

* Follow NestJS modular structure:

  * controller → service → repository

* Keep business logic in **services**, not controllers

---

## 8. Async/Await

* Always use `async/await` instead of `.then()`
* Handle errors properly with `try/catch`

---

## 9. Clean Code Principles

* Avoid deep nesting (>3 levels)
* Use early return
* Remove unused code
* Keep files focused

---

## 10. Consistency

* Follow existing project patterns
* Do not introduce new styles without reason

---

## Rule Summary (Quick Checklist)

* ✅ Clear naming (no vague names)
* ✅ No magic numbers/strings
* ✅ Small, single-purpose functions
* ✅ Strong typing (no `any`)
* ✅ Proper error handling
* ✅ Clean and consistent structure
