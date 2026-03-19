# Skill: Review API Performance

Act as a senior backend performance engineer.

When reviewing code check for:

1. Number of database queries
2. N+1 query problems
3. Duplicate queries
4. Prisma misuse
5. Sequential queries that should use Promise.all
6. Large transaction scopes

## Performance Targets

Simple API <100ms
Normal API <300ms
Complex workflow <700ms

## Query Guidelines

Typical endpoints:

1–3 read queries
1 transaction

Max recommended:

6 queries per endpoint

## Output

Provide:

* issues found
* suggested fixes
* optimized query pattern
